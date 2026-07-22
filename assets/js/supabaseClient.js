let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let createClient = null;
const SUPABASE_TIMEOUT_MS = 8000;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const HIDDEN_STORIES_KEY = 'kn-hidden-stories';
const AVATAR_TYPES = new Map([
    ['jpg', ['image/jpeg']],
    ['jpeg', ['image/jpeg']],
    ['png', ['image/png']],
    ['webp', ['image/webp']],
    ['gif', ['image/gif']]
]);
const MEDIA_TYPES = new Map([
    ...AVATAR_TYPES,
    ['pdf', ['application/pdf']],
    ['txt', ['text/plain']],
    ['csv', ['text/csv', 'application/csv', 'application/vnd.ms-excel']],
    ['doc', ['application/msword', 'application/octet-stream']],
    ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
    ['xls', ['application/vnd.ms-excel', 'application/octet-stream']],
    ['xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
    ['ppt', ['application/vnd.ms-powerpoint', 'application/octet-stream']],
    ['pptx', ['application/vnd.openxmlformats-officedocument.presentationml.presentation']]
]);

function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function createTimeoutFetch(timeoutMs = SUPABASE_TIMEOUT_MS) {
    return async (input, init = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const externalSignal = init.signal;

        if (externalSignal) {
            if (externalSignal.aborted) controller.abort();
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        try {
            return await fetch(input, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    };
}

try {
    const supabaseModule = await withTimeout(
        import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/+esm'),
        SUPABASE_TIMEOUT_MS,
        'Supabase client'
    );
    createClient = supabaseModule.createClient;
} catch (e) {
    console.warn('Supabase client library could not be loaded. Pages will show fallback content instead of staying on loading.', e);
}

try {
    const config = await import('./supabaseConfig.js');
    SUPABASE_URL = config.SUPABASE_URL;
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
} catch (e) {
    console.warn('Supabase configuration file (supabaseConfig.js) not found or failed to load. Please ensure it is present in assets/js/.', e);
}

export const supabase = (createClient && SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL')
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            fetch: createTimeoutFetch()
        }
    })
    : null;

let currentSessionPromise = null;

export async function getCurrentSession() {
    if (!supabase) return null;
    if (!currentSessionPromise) {
        currentSessionPromise = supabase.auth
            .getSession()
            .then(({ data }) => data?.session || null)
            .catch(() => null);
    }
    return currentSessionPromise;
}

if (supabase) {
    supabase.auth.onAuthStateChange(() => {
        currentSessionPromise = null;
    });
}

function getFileExtension(file) {
    return (file?.name || '').split('.').pop()?.toLowerCase() || '';
}

function validateUploadFile(file, allowedTypes, maxBytes) {
    if (!file) return 'No file selected';
    if (file.size > maxBytes) return `File must be under ${Math.floor(maxBytes / (1024 * 1024))}MB`;

    const ext = getFileExtension(file);
    const expectedTypes = allowedTypes.get(ext);
    if (!expectedTypes) return 'This file type is not allowed';

    if (file.type && !expectedTypes.includes(file.type)) {
        if (file.type === 'application/octet-stream' && allowedTypes === MEDIA_TYPES) return null;
        return 'File type does not match the selected file';
    }

    return null;
}

// =============================================
// CACHING UTILITIES
// =============================================
const CACHE_PREFIX = 'kn-cache-';
const DEFAULT_TTL = 1000 * 60 * 5; // 5 minutes

export async function generateUniqueUsername(email) {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 27) || 'member';
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function getEmailByUsername(username) {
    if (typeof username === 'string' && username.includes('@')) return username;
    return null;
}

export function setCache(key, data, ttl = DEFAULT_TTL) {
    const cacheData = {
        data,
        expiry: Date.now() + ttl
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheData));
}

export function getCache(key) {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;
    try {
        const { data, expiry } = JSON.parse(cached);
        if (Date.now() > expiry) {
            return { data, stale: true };
        }
        return { data, stale: false };
    } catch {
        return null;
    }
}

export function calculateTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;

    const diffInDays = Math.floor(diffInSeconds / 86400);
    if (diffInDays < 30) return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;

    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
}

export function sanitize(text) {
    if (typeof text !== 'string') return text;
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(text, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
            ALLOWED_ATTR: ['href', 'title', 'target']
        });
    }
    // Fail securely if DOMPurify is not loaded
    console.error('DOMPurify not loaded. Sanitization failed.');
    return '[Content blocked for security: Sanitizer not available]';
}

export async function upvoteStory(storyId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login to upvote' };

    const userId = session.user.id;

    const { data: existingLike, error: checkError } = await supabase
        .from('likes')
        .select('*')
        .eq('blog_id', storyId)
        .eq('user_id', userId)
        .maybeSingle();

    if (checkError) return { error: checkError.message };

    if (existingLike) {
        const { error: deleteError } = await supabase
            .from('likes')
            .delete()
            .eq('blog_id', storyId)
            .eq('user_id', userId);

        if (deleteError) return { error: deleteError.message };

        return { success: true, action: 'removed' };
    }

    const { error: likeError } = await supabase
        .from('likes')
        .insert([{ blog_id: storyId, user_id: userId }]);

    if (likeError) {
        if (likeError.code === '23505') {
            return { success: true, action: 'added' };
        }
        return { error: likeError.message };
    }

    return { success: true, action: 'added' };
}

export async function trackClick(storyId) {
    if (!supabase) return;
    await supabase.rpc('increment_blog_clicks', { blog_id: storyId });
}

export async function toggleBookmark(storyId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login to save posts' };

    const userId = session.user.id;

    const { data: existing, error: checkErr } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('blog_id', storyId)
        .eq('user_id', userId)
        .maybeSingle();

    if (checkErr) return { error: checkErr.message };

    if (existing) {
        const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id);
        if (error) return { error: error.message };
        return { success: true, action: 'removed' };
    } else {
        const { error } = await supabase.from('bookmarks').insert([{ blog_id: storyId, user_id: userId }]);
        if (error) {
            if (error.code === '23505') return { success: true, action: 'added' };
            return { error: error.message };
        }
        return { success: true, action: 'added' };
    }
}

export async function getUserBookmarks() {
    if (!supabase) return [];

    const session = await getCurrentSession();
    if (!session) return [];

    const { data, error } = await supabase
        .from('bookmarks')
        .select('blog_id')
        .eq('user_id', session.user.id);

    if (error) return [];
    return data.map(b => b.blog_id);
}

export async function getUserLikes() {
    if (!supabase) return [];

    const session = await getCurrentSession();
    if (!session) return [];

    const { data, error } = await supabase
        .from('likes')
        .select('blog_id')
        .eq('user_id', session.user.id);

    if (error) return [];
    return data.map(b => b.blog_id);
}

export async function getBookmarkedPosts(userId = null) {
    if (!supabase) return [];

    let targetId = userId;
    if (!targetId) {
        const session = await getCurrentSession();
        if (!session) return [];
        targetId = session.user.id;
    }

    const { data: bookmarks, error: bErr } = await supabase
        .from('bookmarks')
        .select('blog_id')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false });

    if (bErr || !bookmarks || bookmarks.length === 0) return [];

    const ids = bookmarks.map(b => b.blog_id);
    const { data: posts, error: pErr } = await supabase
        .from('blogs')
        .select('id, title, slug, url, published_at, likes_count, author')
        .in('id', ids);

    if (pErr) return [];
    return posts;
}

export async function sharePost(title, url) {
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            return { success: true };
        } catch (e) {
            return { cancelled: true };
        }
    } else {
        try {
            await navigator.clipboard.writeText(url);
            return { success: true, copied: true };
        } catch (e) {
            return { error: 'Could not copy link' };
        }
    }
}

export async function uploadAvatar(file) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const validationError = validateUploadFile(file, AVATAR_TYPES, AVATAR_MAX_BYTES);
    if (validationError) return { error: validationError };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const userId = session.user.id;
    const ext = getFileExtension(file);
    const filePath = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

    if (uploadError) return { error: uploadError.message };

    const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + '?t=' + Date.now();
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

    if (updateError) return { error: updateError.message };

    return { success: true, url: publicUrl };
}

export async function deleteAvatar() {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const userId = session.user.id;
    const { data: files } = await supabase.storage
        .from('avatars')
        .list(userId);

    if (files && files.length > 0) {
        const paths = files.map(f => `${userId}/${f.name}`);
        await supabase.storage.from('avatars').remove(paths);
    }

    const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

    if (error) return { error: error.message };
    return { success: true };
}

export async function deleteStory(storyId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    // The RLS policy will handle the actual security, 
    // but we can check here to provide a better UI message.
    const { data: blog, error: fetchError } = await supabase
        .from('blogs')
        .select('author_id, author')
        .eq('id', storyId)
        .single();

    if (fetchError || !blog) return { error: 'Story not found' };

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, username')
        .eq('id', session.user.id)
        .maybeSingle();

    const ownsById = blog.author_id === session.user.id;
    const ownsByUsername = profile?.username &&
        blog.author &&
        blog.author.toLowerCase() === profile.username.toLowerCase();

    if (!ownsById && !ownsByUsername && !profile?.is_admin) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('blogs')
        .delete()
        .eq('id', storyId);

    if (error) return { error: error.message };
    return { success: true };
}

export async function uploadMediaFile(file) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const validationError = validateUploadFile(file, MEDIA_TYPES, MEDIA_MAX_BYTES);
    if (validationError) return { error: validationError };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const userId = session.user.id;
    const ext = getFileExtension(file);
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_').replace(/[^\w.-]/g, '').substring(0, 80) || 'upload';
    const safeName = `${baseName}.${ext}`;
    const filePath = `${userId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, { upsert: true });

    if (uploadError) return { error: uploadError.message };

    const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

    return { success: true, url: urlData.publicUrl, name: safeName };
}

export async function listUserMedia() {
    if (!supabase) return [];

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const userId = session.user.id;

    const { data: files, error } = await supabase.storage
        .from('media')
        .list(userId, {
            limit: 100,
            sortBy: { column: 'created_at', order: 'desc' }
        });

    if (error || !files) return [];

    return files
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => {
            const { data } = supabase.storage.from('media').getPublicUrl(`${userId}/${f.name}`);
            return {
                name: f.name,
                url: data.publicUrl,
                created_at: f.created_at
            };
        });
}

export async function getUserComments(userId) {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('comments')
        .select(`
            id,
            comment_text,
            created_at,
            blog_id,
            blogs (title, slug)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) return [];
    return data;
}

export async function updateComment(commentId, newText) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const { error } = await supabase
        .from('comments')
        .update({ comment_text: sanitize(newText) })
        .eq('id', commentId)
        .eq('user_id', session.user.id); // Extra safety, though RLS handles it

    if (error) return { error: error.message };
    return { success: true };
}

export async function deleteComment(commentId, blogId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    // Check if user is admin (admins can delete any comment)
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

    let query = supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

    // Non-admins can only delete their own comments (defense-in-depth with RLS)
    if (!profile?.is_admin) {
        query = query.eq('user_id', session.user.id);
    }

    const { error } = await query;

    if (error) return { error: error.message };

    return { success: true };
}

export function getLocalHiddenStoryIds() {
    try {
        const ids = JSON.parse(localStorage.getItem(HIDDEN_STORIES_KEY) || '[]');
        return Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
    } catch {
        return [];
    }
}

function storeLocalHiddenStoryIds(ids) {
    localStorage.setItem(HIDDEN_STORIES_KEY, JSON.stringify([...new Set(ids.map(String))]));
}

export async function getHiddenStoryIds() {
    const localIds = getLocalHiddenStoryIds();
    const session = await getCurrentSession();
    if (!supabase || !session) return localIds;

    const { data, error } = await supabase
        .from('hidden_stories')
        .select('blog_id')
        .eq('user_id', session.user.id);

    // Keep hiding functional before the optional database hardening SQL is run.
    if (error) return localIds;

    const merged = [...new Set([...localIds, ...(data || []).map(row => String(row.blog_id))])];
    storeLocalHiddenStoryIds(merged);

    const missingRemoteIds = localIds.filter(id => !(data || []).some(row => String(row.blog_id) === id));
    if (missingRemoteIds.length) {
        await supabase.from('hidden_stories').upsert(
            missingRemoteIds.map(id => ({ user_id: session.user.id, blog_id: Number(id) })),
            { onConflict: 'user_id,blog_id', ignoreDuplicates: true }
        );
    }

    return merged;
}

export async function hideStory(storyId) {
    const id = String(storyId);
    storeLocalHiddenStoryIds([...getLocalHiddenStoryIds(), id]);

    const session = await getCurrentSession();
    if (!supabase || !session) return { success: true, persisted: false };

    const { error } = await supabase.from('hidden_stories').upsert(
        { user_id: session.user.id, blog_id: Number(id) },
        { onConflict: 'user_id,blog_id', ignoreDuplicates: true }
    );

    return error ? { success: true, persisted: false, error: error.message } : { success: true, persisted: true };
}

export async function unhideStory(storyId) {
    const id = String(storyId);
    storeLocalHiddenStoryIds(getLocalHiddenStoryIds().filter(hiddenId => hiddenId !== id));

    const session = await getCurrentSession();
    if (!supabase || !session) return { success: true, persisted: false };

    const { error } = await supabase
        .from('hidden_stories')
        .delete()
        .eq('user_id', session.user.id)
        .eq('blog_id', Number(id));

    return error ? { success: true, persisted: false, error: error.message } : { success: true, persisted: true };
}

export async function getHiddenPosts() {
    if (!supabase) return [];
    const ids = await getHiddenStoryIds();
    if (!ids.length) return [];

    const { data, error } = await supabase
        .from('blogs')
        .select('id, title, slug, url, published_at, author')
        .in('id', ids.map(Number));

    if (error) return [];
    const order = new Map(ids.map((id, index) => [String(id), index]));
    return (data || []).sort((a, b) => order.get(String(a.id)) - order.get(String(b.id)));
}

