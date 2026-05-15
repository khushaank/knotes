import { supabase, calculateTimeAgo, upvoteStory, sanitize, toggleBookmark, getUserBookmarks, getUserLikes } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

const STORIES_PER_PAGE = 10;
let userBookmarks = [];
let userLikes = [];

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
        loadUserStats()
    ]);

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No questions found. Be the first to <a href="submit.html" class="underline">ask</a>!</td></tr>';
        return;
    }

    let html = '';
    const startIndex = (page - 1) * STORIES_PER_PAGE;

    const { data: { session } } = await supabase.auth.getSession();
    const folderMapping = session ? JSON.parse(localStorage.getItem(`kn-folders-${session.user.id}`) || '{}') : {};

    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        const isBookmarked = userBookmarks.includes(story.id);
        const isUpvoted = userLikes.includes(story.id);
        const currentFolder = folderMapping[story.id];

        html += `
            <tr class="story-row" data-id="${story.id}">
                <td class="text-right align-top w-5 pr-1 text-hn-grey text-[10pt]">${startIndex + index + 1}.</td>
                <td class="align-top w-4 pt-[2px] text-center">
                    <div class="knotes-upvote-triangle ${isUpvoted ? 'upvoted' : ''}" title="upvote" data-id="${story.id}"></div>
                </td>
                <td class="story-title align-top">
                    <a href="pulse/index.html?s=${story.slug}" class="story-link" data-id="${story.id}">${sanitize(story.title)}</a>
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    by <a href="profile.html?user=${story.author}" class="hover:underline">${sanitize(story.author) || 'anonymous'}</a> | 
                    ${timeAgo} | 
                    <a href="#" class="hide-link hover:underline" data-id="${story.id}">hide</a> | 
                    <span class="bookmark-container">
                        <span class="knotes-dropdown inline-block" data-id="${story.id}">
                            <button class="knotes-dropdown-trigger ${isBookmarked ? 'saved' : ''}" title="${isBookmarked ? `Saved to ${currentFolder || 'list'}` : 'Add to list'}">
                                ${isBookmarked ? 'saved' : '+'}
                            </button>
                            <div class="knotes-dropdown-menu hidden">
                                <div class="dropdown-item ${currentFolder === 'To Learn' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="To Learn">To Learn</div>
                                <div class="dropdown-item ${currentFolder === 'Inspiration' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="Inspiration">Inspiration</div>
                                <div class="dropdown-item ${currentFolder === 'Archive' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="Archive">Archive</div>
                                <div class="dropdown-item ${currentFolder === 'Reading List' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="Reading List">Reading List</div>
                                ${isBookmarked ? '<div class="dropdown-divider border-t border-gray-100 my-1"></div><div class="dropdown-item text-red-500 font-medium" data-folder="unsave">Unsave</div>' : ''}
                            </div>
                        </span>
                    </span> | 
                    <a href="pulse/index.html?s=${story.slug}" class="hover:underline">${story.comments_count || 0} comments</a> | 
                    <a href="#" class="share-link hover:underline" data-title="${sanitize(story.title)}" data-url="${story.url || window.location.origin + '/pulse/index.html?s=' + story.slug}">share</a>
                </td>
            </tr>
            <tr class="h-[2px] story-spacer" data-id="${story.id}"></tr>
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

async function loadUserStats() {
    [userBookmarks, userLikes] = await Promise.all([
        getUserBookmarks(),
        getUserLikes()
    ]);
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

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('knotes-upvote-triangle')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            e.target.style.opacity = '0.3';
            e.target.style.pointerEvents = 'none';
            const result = await upvoteStory(storyId);
            e.target.style.pointerEvents = 'auto';

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
                    e.target.classList.remove('upvoted');
                    e.target.style.opacity = '1';
                } else {
                    e.target.classList.add('upvoted');
                    e.target.style.opacity = '1';
                }
            }
        }

        if (e.target.classList.contains('knotes-dropdown-trigger')) {
            e.preventDefault();
            const dropdown = e.target.closest('.knotes-dropdown');
            const menu = dropdown.querySelector('.knotes-dropdown-menu');
            document.querySelectorAll('.knotes-dropdown-menu').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
            return;
        }

        if (e.target.classList.contains('dropdown-item')) {
            const item = e.target;
            const folderName = item.getAttribute('data-folder');
            const dropdown = item.closest('.knotes-dropdown');
            const storyId = dropdown.getAttribute('data-id');
            const trigger = dropdown.querySelector('.knotes-dropdown-trigger');
            const menu = dropdown.querySelector('.knotes-dropdown-menu');

            if (!storyId || !folderName) return;

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showTip(trigger, 'Please login');
                menu.classList.add('hidden');
                return;
            }

            if (folderName === 'unsave') {
                await toggleBookmark(parseInt(storyId));
                const key = `kn-folders-${session.user.id}`;
                const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                delete mapping[storyId];
                localStorage.setItem(key, JSON.stringify(mapping));

                trigger.textContent = '+';
                trigger.classList.remove('saved');
                item.remove();
                showTip(trigger, 'Removed');
                const idx = userBookmarks.indexOf(parseInt(storyId));
                if (idx > -1) userBookmarks.splice(idx, 1);
            } else {
                if (!userBookmarks.includes(parseInt(storyId))) {
                    await toggleBookmark(parseInt(storyId));
                    userBookmarks.push(parseInt(storyId));
                }

                const key = `kn-folders-${session.user.id}`;
                const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                mapping[storyId] = folderName;
                localStorage.setItem(key, JSON.stringify(mapping));

                trigger.textContent = 'saved';
                trigger.classList.add('saved');
                
                // Add Unsave option if not present
                if (!menu.querySelector('[data-folder="unsave"]')) {
                    const divider = document.createElement('div');
                    divider.className = 'dropdown-divider border-t border-gray-100 my-1';
                    menu.appendChild(divider);
                    
                    const opt = document.createElement('div');
                    opt.className = 'dropdown-item text-red-500 font-medium';
                    opt.setAttribute('data-folder', 'unsave');
                    opt.textContent = 'Unsave';
                    menu.appendChild(opt);
                }
                
                // Highlight selected folder
                menu.querySelectorAll('.dropdown-item').forEach(i => {
                    if (i.getAttribute('data-folder') === folderName) {
                        i.classList.add('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    } else {
                        i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    }
                });

                showTip(trigger, `Added to ${folderName}`);
            }
            menu.classList.add('hidden');
            return;
        }

        if (!e.target.closest('.knotes-dropdown')) {
            document.querySelectorAll('.knotes-dropdown-menu').forEach(m => m.classList.add('hidden'));
        }
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

        if (e.target.classList.contains('share-link')) {
            e.preventDefault();
            const btn = e.target;
            const title = btn.getAttribute('data-title');
            const url = btn.getAttribute('data-url');
            if (navigator.share) {
                navigator.share({ title, url }).catch(() => { });
            } else {
                navigator.clipboard.writeText(url);
                const oldText = btn.textContent;
                btn.textContent = 'copied!';
                setTimeout(() => btn.textContent = oldText, 2000);
            }
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
