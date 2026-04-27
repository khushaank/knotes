import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

// Initialize the Supabase client only if keys are provided (to prevent crashes before setup)
export const supabase = (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL')
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export function calculateTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
}

export function sanitize(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export async function upvoteStory(storyId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login to upvote' };

    const userId = session.user.id;

    // 1. Check if already upvoted
    const { data: existingLike, error: checkError } = await supabase
        .from('likes')
        .select('*')
        .eq('blog_id', storyId)
        .eq('user_id', userId)
        .maybeSingle();

    if (checkError) return { error: checkError.message };

    // If already upvoted, remove the upvote (undo)
    if (existingLike) {
        const { error: deleteError } = await supabase
            .from('likes')
            .delete()
            .eq('blog_id', storyId)
            .eq('user_id', userId);

        if (deleteError) return { error: deleteError.message };

        // Decrement likes_count
        const { data: blog } = await supabase
            .from('blogs')
            .select('likes_count')
            .eq('id', storyId)
            .single();

        if (blog) {
            await supabase
                .from('blogs')
                .update({ likes_count: Math.max(0, (blog.likes_count || 1) - 1) })
                .eq('id', storyId);
        }

        return { success: true, action: 'removed' };
    }

    // 2. Insert into likes table
    const { error: likeError } = await supabase
        .from('likes')
        .insert([{ blog_id: storyId, user_id: userId }]);

    if (likeError) return { error: likeError.message };

    // 3. Increment likes_count in blogs table
    const { data: blog, error: fetchError } = await supabase
        .from('blogs')
        .select('likes_count')
        .eq('id', storyId)
        .single();

    if (fetchError) return { error: fetchError.message };

    const { error: updateError } = await supabase
        .from('blogs')
        .update({ likes_count: (blog.likes_count || 0) + 1 })
        .eq('id', storyId);

    if (updateError) return { error: updateError.message };

    return { success: true, action: 'added' };
}

export async function trackClick(storyId) {
    if (!supabase) return;

    const { data: blog, error: fetchError } = await supabase
        .from('blogs')
        .select('clicks_count')
        .eq('id', storyId)
        .single();

    if (fetchError) return;

    await supabase
        .from('blogs')
        .update({ clicks_count: (blog.clicks_count || 0) + 1 })
        .eq('id', storyId);
}

// ---- Bookmarks / Favorites ---- //
export async function toggleBookmark(storyId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login to save posts' };

    const userId = session.user.id;

    // Check existing
    const { data: existing, error: checkErr } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('blog_id', storyId)
        .eq('user_id', userId)
        .maybeSingle();

    if (checkErr) return { error: checkErr.message };

    if (existing) {
        // Remove bookmark
        const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id);
        if (error) return { error: error.message };
        return { success: true, action: 'removed' };
    } else {
        // Add bookmark
        const { error } = await supabase.from('bookmarks').insert([{ blog_id: storyId, user_id: userId }]);
        if (error) return { error: error.message };
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

export async function getBookmarkedPosts() {
    if (!supabase) return [];

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const { data: bookmarks, error: bErr } = await supabase
        .from('bookmarks')
        .select('blog_id')
        .eq('user_id', session.user.id)
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

// ---- Comment Count Sync ---- //
export async function incrementCommentCount(blogId) {
    if (!supabase) return;

    const { data: blog } = await supabase
        .from('blogs')
        .select('comments_count')
        .eq('id', blogId)
        .single();

    if (blog) {
        await supabase
            .from('blogs')
            .update({ comments_count: (blog.comments_count || 0) + 1 })
            .eq('id', blogId);
    }
}

// ---- Share Helpers ---- //
export async function sharePost(title, url) {
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            return { success: true };
        } catch (e) {
            // User cancelled share
            return { cancelled: true };
        }
    } else {
        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(url);
            return { success: true, copied: true };
        } catch (e) {
            return { error: 'Could not copy link' };
        }
    }
}
