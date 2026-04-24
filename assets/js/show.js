import { supabase, calculateTimeAgo, upvoteStory, sanitize } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

let storiesToShow = 10;
const STORIES_PER_PAGE = 10;

async function fetchShowStories(page = 1) {
    if (!supabase) return { stories: [], count: 0 };

    const start = (page - 1) * STORIES_PER_PAGE;
    const end = start + STORIES_PER_PAGE - 1;

    const { data: stories, error, count } = await supabase
        .from('blogs')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .eq('category', 'show')
        .order('published_at', { ascending: false })
        .range(start, end);

    if (error) {
        return { stories: [], count: 0 };
    }
    return { stories: sortStories(stories, 'trending'), count };
}

async function renderStories() {
    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('p')) || 1;

    const tbody = document.querySelector('main table tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading show stories...</td></tr>';

    const { stories, count } = await fetchShowStories(page);
    
    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No show stories found. Show your work to the community!</td></tr>';
        return;
    }

    let html = '';
    const startIndex = (page - 1) * STORIES_PER_PAGE;

    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        html += `
            <tr class="story-row" data-id="${story.id}">
                <td class="text-right align-top w-5 pr-1 text-hn-grey text-[10pt]">${startIndex + index + 1}.</td>
                <td class="align-top w-4 pt-[2px] text-center">
                    <div class="hn-arrow" title="upvote" data-id="${story.id}"></div>
                </td>
                <td class="story-title align-top">
                    <a href="${story.url || `pulse/index.html?s=${story.slug}`}" class="story-link" ${story.url ? 'target="_blank"' : ''}>${sanitize(story.title)}</a>
                    ${story.url ? `<span class="domain-text"> (<a href="${story.url}" target="_blank">${sanitize(new URL(story.url).hostname.replace('www.', ''))}</a>)</span>` : ''}
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    ${story.likes_count || 0} points by <a href="profile.html?user=${story.author}" class="hover:underline">${sanitize(story.author) || 'anonymous'}</a> 
                    <a href="pulse/index.html?s=${story.slug}">${timeAgo}</a> | 
                    <a href="#" class="hide-link" data-id="${story.id}">hide</a> | 
                    <a href="pulse/index.html?s=${story.slug}">discuss</a>
                </td>
            </tr>
            <tr class="h-[5px] story-spacer" data-id="${story.id}"></tr>
        `;
    });

    if (count > page * STORIES_PER_PAGE) {
        const nextUrl = `show.html?p=${page + 1}`;
        html += `
            <tr class="h-[20px]">
                <td colspan="2"></td>
                <td class="font-title-md text-title-md text-black pt-4">
                    <a href="${nextUrl}" class="hover:underline text-black font-bold">More</a>
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    document.title = "Show | K. Notes";
    renderStories();

    const searchForm = document.getElementById('footer-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('footer-search-input');
            if (searchInput) {
                const term = searchInput.value.trim();
                if (term) {
                    window.location.href = `search.html?search=${encodeURIComponent(term)}`;
                }
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

        if (e.target.id === 'more-btn') {
            e.preventDefault();
            storiesToShow += STORIES_PER_PAGE;
            renderStories();
        }
    });
});
