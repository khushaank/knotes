import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

try {
    const config = await import('./supabaseConfig.js');
    SUPABASE_URL = config.SUPABASE_URL;
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
} catch (e) {
    console.warn('Supabase configuration file (supabaseConfig.js) not found or failed to load. Please ensure it is present in assets/js/.', e);
}

export const supabase = (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL')
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// =============================================
// CACHING UTILITIES
// =============================================
const CACHE_PREFIX = 'kn-cache-';
const DEFAULT_TTL = 1000 * 60 * 5; // 5 minutes

export async function generateUniqueUsername(email) {
    if (!supabase) return email.split('@')[0];
    
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let username = base;
    let attempts = 0;
    
    while (attempts < 5) {
        const { data } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .maybeSingle();
            
        if (!data) return username;
        
        // If exists, add a random number (user requested "in front")
        const rand = Math.floor(Math.random() * 10000);
        username = `${rand}${base}`;
        attempts++;
    }
    return `${Math.floor(Math.random() * 100000)}${base}`;
}

export async function getEmailByUsername(username) {
    if (!supabase) return null;
    
    // Check if it's already an email
    if (username.includes('@')) return username;
    
    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
        
    if (error || !data) return null;
    
    // Since we can't directly get email from auth.users via public client easily,
    // we assume the user might need to be looked up or we store email in profile.
    // However, Supabase Auth signIn only takes email.
    // If we want to support username login, we either need a mapping table or 
    // we need to have the email in the profiles table.
    
    // Let's check if 'profiles' has email. Looking at existing code, it doesn't seem to.
    // I will add 'email' to the profiles table in the SQL setup.
    const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('username', username)
        .maybeSingle();
        
    return profile?.email || null;
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
    // Fallback: Escape HTML characters if DOMPurify is missing
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

        // Use RPC to safely decrement
        await supabase.rpc('decrement_blog_likes', { blog_id: storyId });

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

    // Use RPC to safely increment
    await supabase.rpc('increment_blog_likes', { blog_id: storyId });

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

    const { data: { session } } = await supabase.auth.getSession();
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

    const { data: { session } } = await supabase.auth.getSession();
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
        const { data: { session } } = await supabase.auth.getSession();
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

export async function incrementCommentCount(blogId) {
    if (!supabase) return;
    await supabase.rpc('increment_blog_comments', { blog_id: blogId });
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

export async function toggleFollow(targetUserId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login to follow users' };

    const myId = session.user.id;

    const { data: existing, error: checkErr } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', myId)
        .eq('following_id', targetUserId)
        .maybeSingle();

    if (checkErr) return { error: checkErr.message };

    if (existing) {
        const { error } = await supabase.from('follows').delete().eq('id', existing.id);
        if (error) return { error: error.message };
        return { success: true, action: 'unfollowed' };
    } else {
        const { error } = await supabase.from('follows').insert([{
            follower_id: myId,
            following_id: targetUserId
        }]);
        if (error) {
            if (error.code === '23505') return { success: true, action: 'followed' };
            return { error: error.message };
        }
        return { success: true, action: 'followed' };
    }
}

export async function isFollowing(targetUserId) {
    if (!supabase) return false;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', session.user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();

    return !error && !!data;
}

export async function getFollowerCount(userId) {
    if (!supabase) return 0;

    const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

    if (error) return 0;
    return count || 0;
}

export async function getFollowingCount(userId) {
    if (!supabase) return 0;

    const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

    if (error) return 0;
    return count || 0;
}

export async function getFollowingList(userId) {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('follows')
        .select(`
            following_id,
            profiles!following_id (id, username, avatar_url, about)
        `)
        .eq('follower_id', userId);

    if (error) return [];
    return data.map(d => d.profiles);
}

export async function getFollowersList(userId) {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('follows')
        .select(`
            follower_id,
            profiles!follower_id (id, username, avatar_url, about)
        `)
        .eq('following_id', userId);

    if (error) return [];
    return data.map(d => d.profiles);
}

export async function getProfileViews(username) {
    if (!supabase) return 0;
    const { data, error } = await supabase
        .from('blogs')
        .select('clicks_count')
        .eq('author', username);
    if (error || !data) return 0;
    return data.reduce((sum, b) => sum + (b.clicks_count || 0), 0);
}

export async function getUserSavedCount(userId) {
    if (!supabase) return 0;
    const { count, error } = await supabase
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (error) return 0;
    return count || 0;
}

export async function getLeaderboard(limit = 20) {
    if (!supabase) return [];

    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, created_at')
        .eq('is_public', true);

    if (pErr || !profiles) return [];

    const results = [];
    for (const p of profiles) {
        const count = await getFollowerCount(p.id);
        const views = await getProfileViews(p.username);
        const saved = await getUserSavedCount(p.id);
        results.push({ ...p, followers: count, views, saved });
    }

    results.sort((a, b) => b.followers - a.followers);
    return results.slice(0, limit);
}

export async function uploadAvatar(file) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const userId = session.user.id;
    const ext = file.name.split('.').pop();
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
        .select('author_id')
        .eq('id', storyId)
        .single();

    if (fetchError || !blog) return { error: 'Story not found' };

    if (blog.author_id !== session.user.id) {
        // Also check if admin
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).single();
        if (!profile?.is_admin) return { error: 'Unauthorized' };
    }

    const { error } = await supabase
        .from('blogs')
        .delete()
        .eq('id', storyId);

    if (error) return { error: error.message };
    return { success: true };
}

export async function uploadMediaFile(file) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const userId = session.user.id;
    const safeName = file.name.replace(/\s+/g, '_').replace(/[^\w\.-]/g, '');
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

    await supabase.rpc('decrement_blog_comments', { blog_id: blogId });

    return { success: true };
}

