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
    if (existingLike) return { error: 'Already upvoted' };

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

    return { success: true };
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

