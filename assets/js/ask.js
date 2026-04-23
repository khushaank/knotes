import { supabase, calculateTimeAgo, upvoteStory } from './supabaseClient.js';

async function fetchAskStories() {
    if (!supabase) return [];

    let query = supabase
        .from('blogs')
        .select('*')
        .eq('status', 'published')
        .eq('category', 'ask')
        .order('published_at', { ascending: false })
        .limit(30);

    const { data: stories, error } = await query;

    if (error) {
        console.error('Error fetching ask blogs:', error);
        return [];
    }
    return stories;
}

async function renderStories() {
    const tbody = document.querySelector('main table tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading stories...</td></tr>';

    const stories = await fetchAskStories();

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No questions found. Be the first to <a href="submit.html" class="underline">ask</a>!</td></tr>';
        return;
    }

    let html = '';
    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        html += `
            <tr class="story-row" data-id="${story.id}">
                <td class="text-right align-top w-5 pr-1 text-hn-grey text-[10pt]">${index + 1}.</td>
                <td class="align-top w-4 pt-[2px] text-center">
                    <div class="hn-arrow" title="upvote" data-id="${story.id}"></div>
                </td>
                <td class="story-title align-top">
                    <a href="viewer.html?id=${story.id}" class="story-link">${story.title}</a>
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    ${story.likes_count || 0} points by <a href="profile.html?user=${story.author}" class="hover:underline">${story.author || 'anonymous'}</a> 
                    <a href="viewer.html?id=${story.id}">${timeAgo}</a> | 
                    <a href="#" class="hide-link" data-id="${story.id}">hide</a> | 
                    <a href="viewer.html?id=${story.id}">discuss</a>
                </td>
            </tr>
            <tr class="h-[5px] story-spacer" data-id="${story.id}"></tr>
        `;
    });

    tbody.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    renderStories();

    // Upvote delegation
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('hn-arrow')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            const result = await upvoteStory(storyId);
            if (result.error) {
                alert(result.error);
            } else {
                renderStories();
            }
        }
    });
});
