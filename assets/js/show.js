import { supabase, calculateTimeAgo, upvoteStory } from './supabaseClient.js';

async function fetchShowStories(searchQuery = '') {
    if (!supabase) return [];

    let query = supabase
        .from('blogs')
        .select('*')
        .eq('status', 'published')
        .eq('category', 'show')
        .order('published_at', { ascending: false })
        .limit(30);

    if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
    }

    const { data: stories, error } = await query;
    if (error) {
        console.error('Error fetching show stories:', error);
        return [];
    }
    return stories;
}

async function renderStories(searchQuery = '') {
    const tbody = document.querySelector('main table tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading show stories...</td></tr>';

    const stories = await fetchShowStories(searchQuery);

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No show stories found. Show your work to the community!</td></tr>';
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
                    <a href="${story.url || `viewer.html?id=${story.id}`}" class="story-link" ${story.url ? 'target="_blank"' : ''}>${story.title}</a>
                    ${story.url ? `<span class="domain-text"> (<a href="${story.url}" target="_blank">${new URL(story.url).hostname.replace('www.', '')}</a>)</span>` : ''}
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
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');

    renderStories(searchParam || '');

    const searchForm = document.getElementById('footer-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('footer-search-input');
            if (searchInput) {
                renderStories(searchInput.value.trim());
            }
        });
    }

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
