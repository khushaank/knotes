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
    
    const diffInDays = Math.floor(diffInSeconds / 86400);
    if (diffInDays < 30) return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
    
    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
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

    if (likeError) {
        if (likeError.code === '23505') {
            // Unique violation (409). Already liked concurrently.
            return { success: true, action: 'added' };
        }
        return { error: likeError.message };
    }

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

// ---- Follow System ---- //
// Requires `follows` table: id (int8 PK), follower_id (uuid), following_id (uuid), created_at (timestamptz)

export async function toggleFollow(targetUserId) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login to follow users' };

    const myId = session.user.id;

    // Check existing follow
    const { data: existing, error: checkErr } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', myId)
        .eq('following_id', targetUserId)
        .maybeSingle();

    if (checkErr) return { error: checkErr.message };

    if (existing) {
        // Unfollow
        const { error } = await supabase.from('follows').delete().eq('id', existing.id);
        if (error) return { error: error.message };
        return { success: true, action: 'unfollowed' };
    } else {
        // Follow
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

// ---- Stats Helpers ---- //
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

// ---- Leaderboard ---- //
export async function getLeaderboard(limit = 20) {
    if (!supabase) return [];

    // Get all public profiles
    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, created_at')
        .eq('is_public', true);

    if (pErr || !profiles) return [];

    // For each profile, count followers, views, and saved items
    const results = [];
    for (const p of profiles) {
        const count = await getFollowerCount(p.id);
        const views = await getProfileViews(p.username);
        const saved = await getUserSavedCount(p.id);
        results.push({ ...p, followers: count, views, saved });
    }

    // Sort by followers desc, take top N
    results.sort((a, b) => b.followers - a.followers);
    return results.slice(0, limit);
}

// ---- Avatar Upload ---- //
// Requires Supabase Storage bucket named "avatars" (public)

export async function uploadAvatar(file) {
    if (!supabase) return { error: 'Supabase not initialized' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please login' };

    const userId = session.user.id;
    const ext = file.name.split('.').pop();
    const filePath = `${userId}/avatar.${ext}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

    if (uploadError) return { error: uploadError.message };

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // cache bust

    // Save URL to profile
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

    // List files in user's folder and remove all
    const { data: files } = await supabase.storage
        .from('avatars')
        .list(userId);

    if (files && files.length > 0) {
        const paths = files.map(f => `${userId}/${f.name}`);
        await supabase.storage.from('avatars').remove(paths);
    }

    // Clear URL from profile
    const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

    if (error) return { error: error.message };
    return { success: true };
}

