import { supabase, calculateTimeAgo, upvoteStory, sanitize, toggleBookmark, getUserBookmarks } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

const STORIES_PER_PAGE = 10;
let userBookmarks = [];

async function fetchAskStories(page = 1) {
    if (!supabase) return { stories: [], count: 0 };

    const start = (page - 1) * STORIES_PER_PAGE;
    const end = start + STORIES_PER_PAGE - 1;

    const { data: stories, error, count } = await supabase
        .from('blogs')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .eq('category', 'ask')
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
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading stories...</td></tr>';

    const [{ stories, count }] = await Promise.all([
        fetchAskStories(page),
        loadUserBookmarks()
    ]);

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No questions found. Be the first to <a href="submit.html" class="underline">ask</a>!</td></tr>';
        return;
    }

    let html = '';
    const startIndex = (page - 1) * STORIES_PER_PAGE;

    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        const isBookmarked = userBookmarks.includes(story.id);
        html += `
            <tr class="story-row" data-id="${story.id}">
                <td class="text-right align-top w-5 pr-1 text-hn-grey text-[10pt]">${startIndex + index + 1}.</td>
                <td class="align-top w-4 pt-[2px] text-center">
                    <div class="hn-arrow" title="upvote" data-id="${story.id}"></div>
                </td>
                <td class="story-title align-top">
                    <a href="pulse/index.html?s=${story.slug}" class="story-link" data-id="${story.id}">${sanitize(story.title)}</a>
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    ${story.likes_count || 0} points by <a href="profile.html?user=${story.author}" class="hover:underline">${sanitize(story.author) || 'anonymous'}</a> 
                    <a href="pulse/index.html?s=${story.slug}">${timeAgo}</a> | 
                    <a href="#" class="hide-link" data-id="${story.id}">hide</a> | 
                    <a href="#" class="bookmark-link" data-id="${story.id}">${isBookmarked ? 'saved ★' : 'save'}</a> | 
                    <a href="pulse/index.html?s=${story.slug}">${story.comments_count || 0} comments</a>
                </td>
            </tr>
            <tr class="h-[5px] story-spacer" data-id="${story.id}"></tr>
        `;
    });

    if (count > page * STORIES_PER_PAGE) {
        const nextUrl = `ask.html?p=${page + 1}`;
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

async function loadUserBookmarks() {
    userBookmarks = await getUserBookmarks();
}

document.addEventListener('DOMContentLoaded', () => {
    document.title = "Ask | K. Notes";
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

    // Event delegation
    document.addEventListener('click', async (e) => {
        // Upvote
        if (e.target.classList.contains('hn-arrow')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            e.target.style.opacity = '0.3';
            const result = await upvoteStory(storyId);

            if (result.error) {
                showTip(e.target, result.error);
                e.target.style.opacity = '1';
            } else {
                const metaRow = document.querySelector(`.story-meta-row[data-id="${storyId}"]`);
                if (metaRow) {
                    const metaTextNodes = metaRow.querySelector('.story-meta');
                    if (metaTextNodes) {
                        const currentText = metaTextNodes.innerHTML;
                        const pointsMatch = currentText.match(/(\d+)\s+points/);
                        if (pointsMatch) {
                            let pts = parseInt(pointsMatch[1], 10);
                            if (result.action === 'added') pts++;
                            else if (result.action === 'removed') pts = Math.max(0, pts - 1);
                            metaTextNodes.innerHTML = currentText.replace(/(\d+)\s+points/, `${pts} points`);
                        }
                    }
                }
                
                if (result.action === 'removed') {
                    showTip(e.target, 'Vote removed');
                    e.target.style.visibility = 'visible';
                    e.target.style.opacity = '1';
                } else {
                    e.target.style.visibility = 'hidden';
                }
            }
        }

        // Bookmark
        if (e.target.classList.contains('bookmark-link')) {
            e.preventDefault();
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            const result = await toggleBookmark(parseInt(storyId));
            if (result.error) {
                showTip(e.target, result.error);
            } else {
                if (result.action === 'added') {
                    e.target.textContent = 'saved ★';
                    userBookmarks.push(parseInt(storyId));
                } else {
                    e.target.textContent = 'save';
                    userBookmarks = userBookmarks.filter(id => id !== parseInt(storyId));
                }
            }
        }

        // Hide
        if (e.target.classList.contains('hide-link')) {
            e.preventDefault();
            const storyId = e.target.getAttribute('data-id');
            const rows = document.querySelectorAll(`[data-id="${storyId}"]`);
            rows.forEach(row => {
                row.style.transition = 'opacity 0.3s';
                row.style.opacity = '0';
                setTimeout(() => row.classList.add('hidden'), 300);
            });
        }
    });
});

function showTip(anchor, msg) {
    const tip = document.createElement('span');
    tip.textContent = msg;
    tip.style.cssText = 'position:absolute;background:#333;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;white-space:nowrap;z-index:100;pointer-events:none;';
    const parent = anchor.parentElement;
    parent.style.position = 'relative';
    parent.appendChild(tip);
    setTimeout(() => { tip.style.transition = 'opacity 0.3s'; tip.style.opacity = '0'; setTimeout(() => tip.remove(), 300); }, 1500);
}
