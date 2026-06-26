import { supabase, calculateTimeAgo, upvoteStory, sanitize, toggleBookmark, getUserBookmarks, getUserLikes } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

const STORIES_PER_PAGE = 10;
let userBookmarks = [];
let userLikes = [];

function profileHref(username) {
    return `profile?user=${encodeURIComponent(username || '')}`;
}

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
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading show stories...</td></tr>';

        const [{ stories, count }] = await Promise.all([
            fetchShowStories(page),
            loadUserStats()
        ]);

        if (!stories || stories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No show stories found. <a href="submit" class="underline">Show your work</a> to the community!</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        const startIndex = (page - 1) * STORIES_PER_PAGE;

        const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        const rawFolders = session ? JSON.parse(localStorage.getItem(`kn-folders-${session.user.id}`) || '{}') : {};
        const folderMapping = new Map(Object.entries(rawFolders));

        stories.forEach((story, index) => {
            const timeAgo = calculateTimeAgo(story.published_at);
            const isBookmarked = userBookmarks.includes(story.id);
            const isUpvoted = userLikes.includes(story.id);
            const currentFolder = folderMapping.get(String(story.id));

            const tr1 = document.createElement('tr');
            tr1.className = 'story-row';
            tr1.setAttribute('data-id', story.id);

            const tdIndex = document.createElement('td');
            tdIndex.className = 'text-right align-top w-5 pr-1 text-hn-grey text-[10pt]';
            tdIndex.textContent = `${startIndex + index + 1}.`;
            tr1.appendChild(tdIndex);

            const tdUpvote = document.createElement('td');
            tdUpvote.className = 'align-top w-4 pt-[2px] text-center';
            const upvoteDiv = document.createElement('div');
            upvoteDiv.className = `knotes-upvote-triangle ${isUpvoted ? 'upvoted' : ''}`;
            upvoteDiv.title = 'upvote';
            upvoteDiv.setAttribute('data-id', story.id);
            tdUpvote.appendChild(upvoteDiv);
            tr1.appendChild(tdUpvote);

            const tdTitle = document.createElement('td');
            tdTitle.className = 'story-title align-top';
            const link = document.createElement('a');
            link.href = story.url || `pulse/home?s=${encodeURIComponent(story.slug || '')}`;
            link.className = 'story-link';
            link.setAttribute('data-id', story.id);
            if (story.url) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }
            link.textContent = story.title;
            tdTitle.appendChild(link);

            if (story.url) {
                const domainSpan = document.createElement('span');
                domainSpan.className = 'domain-text';
                domainSpan.appendChild(document.createTextNode(' ('));
                const domainLink = document.createElement('a');
                domainLink.href = story.url;
                domainLink.setAttribute('target', '_blank');
                domainLink.setAttribute('rel', 'noopener noreferrer');
                try {
                    domainLink.textContent = new URL(story.url).hostname.replace('www.', '');
                } catch {
                    domainLink.textContent = story.url;
                }
                domainSpan.appendChild(domainLink);
                domainSpan.appendChild(document.createTextNode(')'));
                tdTitle.appendChild(domainSpan);
            }
            tr1.appendChild(tdTitle);

            const tr2 = document.createElement('tr');
            tr2.className = 'story-meta-row';
            tr2.setAttribute('data-id', story.id);

            const tdEmpty = document.createElement('td');
            tdEmpty.setAttribute('colspan', '2');
            tr2.appendChild(tdEmpty);

            const tdMeta = document.createElement('td');
            tdMeta.className = 'story-meta';

            const pointsSpan = document.createElement('span');
            pointsSpan.className = 'points-count';
            pointsSpan.textContent = `${story.likes_count || 0} points`;
            tdMeta.appendChild(pointsSpan);

            tdMeta.appendChild(document.createTextNode(' by '));
            const authorLink = document.createElement('a');
            authorLink.href = profileHref(story.author);
            authorLink.className = 'hover:underline';
            authorLink.textContent = story.author || 'anonymous';
            tdMeta.appendChild(authorLink);

            tdMeta.appendChild(document.createTextNode(` | ${timeAgo} | `));

            const hideLink = document.createElement('a');
            hideLink.href = '#';
            hideLink.className = 'hide-link hover:underline';
            hideLink.setAttribute('data-id', story.id);
            hideLink.textContent = 'hide';
            tdMeta.appendChild(hideLink);
            tdMeta.appendChild(document.createTextNode(' | '));

            const bookmarkContainer = document.createElement('span');
            bookmarkContainer.className = 'bookmark-container';
            const dropdownSpan = document.createElement('span');
            dropdownSpan.className = 'knotes-dropdown inline-block';
            dropdownSpan.setAttribute('data-id', story.id);

            const btn = document.createElement('button');
            btn.className = `knotes-dropdown-trigger ${isBookmarked ? 'saved' : ''}`;
            btn.title = isBookmarked ? `Saved to ${currentFolder || 'list'}` : 'Add to list';
            btn.textContent = isBookmarked ? 'saved' : '+';
            dropdownSpan.appendChild(btn);

            const menu = document.createElement('div');
            menu.className = 'knotes-dropdown-menu hidden';

            ['To Learn', 'Inspiration', 'Archive', 'Reading List'].forEach(f => {
                const item = document.createElement('div');
                item.className = `dropdown-item ${currentFolder === f ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}`;
                item.setAttribute('data-folder', f);
                item.textContent = f;
                menu.appendChild(item);
            });

            if (isBookmarked) {
                const divider = document.createElement('div');
                divider.className = 'dropdown-divider border-t border-gray-100 my-1';
                menu.appendChild(divider);

                const unsave = document.createElement('div');
                unsave.className = 'dropdown-item text-red-500 font-medium';
                unsave.setAttribute('data-folder', 'unsave');
                unsave.textContent = 'Unsave';
                menu.appendChild(unsave);
            }
            dropdownSpan.appendChild(menu);
            bookmarkContainer.appendChild(dropdownSpan);
            tdMeta.appendChild(bookmarkContainer);

            tdMeta.appendChild(document.createTextNode(' | '));

            const commentLink = document.createElement('a');
            commentLink.href = `pulse/home?s=${encodeURIComponent(story.slug || '')}`;
            commentLink.className = 'hover:underline';
            commentLink.textContent = `${story.comments_count || 0} comments`;
            tdMeta.appendChild(commentLink);

            tdMeta.appendChild(document.createTextNode(' | '));

            const shareLink = document.createElement('a');
            shareLink.href = '#';
            shareLink.className = 'share-link hover:underline';
            shareLink.setAttribute('data-title', story.title || '');
            shareLink.setAttribute('data-url', story.url || (window.location.origin + '/pulse/home?s=' + (story.slug || '')));
            shareLink.textContent = 'share';
            tdMeta.appendChild(shareLink);

            tr2.appendChild(tdMeta);

            const tr3 = document.createElement('tr');
            tr3.className = 'h-[2px] story-spacer';
            tr3.setAttribute('data-id', story.id);

            fragment.appendChild(tr1);
            fragment.appendChild(tr2);
            fragment.appendChild(tr3);
        });

        if (count > page * STORIES_PER_PAGE) {
            const trMore = document.createElement('tr');
            trMore.className = 'h-[20px]';
            const tdCol = document.createElement('td');
            tdCol.setAttribute('colspan', '2');
            trMore.appendChild(tdCol);

            const tdMore = document.createElement('td');
            tdMore.className = 'font-title-md text-title-md text-black pt-4';
            const aMore = document.createElement('a');
            aMore.href = `show?p=${page + 1}`;
            aMore.className = 'hover:underline text-black font-bold';
            aMore.textContent = 'More';
            tdMore.appendChild(aMore);
            trMore.appendChild(tdMore);

            fragment.appendChild(trMore);
        }

        tbody.replaceChildren(fragment);
    } catch (error) {
        console.error('Failed to render show stories:', error);
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Could not load show stories right now. Please refresh in a moment.</td></tr>';
    }
}

async function loadUserStats() {
    [userBookmarks, userLikes] = await Promise.all([
        getUserBookmarks(),
        getUserLikes()
    ]);
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
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
                    window.location.href = `search?search=${encodeURIComponent(term)}`;
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
                    const pointsSpan = metaRow.querySelector('.points-count');
                    if (pointsSpan) {
                        let pts = parseInt(pointsSpan.textContent, 10) || 0;
                        if (result.action === 'added') pts++;
                        else if (result.action === 'removed') pts = Math.max(0, pts - 1);
                        pointsSpan.textContent = `${pts} points`;
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
            const storyId = parseInt(dropdown.getAttribute('data-id'));
            const trigger = dropdown.querySelector('.knotes-dropdown-trigger');
            const menu = dropdown.querySelector('.knotes-dropdown-menu');

            if (!storyId || !folderName) return;

            menu.classList.add('hidden');

            if (folderName === 'unsave') {
                trigger.textContent = '+';
                trigger.classList.remove('saved');
                showTip(trigger, 'Removed');

                const unsaveOpt = menu.querySelector('[data-folder="unsave"]');
                if (unsaveOpt) unsaveOpt.remove();
                const divider = menu.querySelector('.dropdown-divider');
                if (divider) divider.remove();

                menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold'));

                const idx = userBookmarks.indexOf(storyId);
                if (idx > -1) userBookmarks.splice(idx, 1);

                const userId = supabase ? (await supabase.auth.getSession()).data.session?.user?.id : null;
                if (userId) {
                    const key = `kn-folders-${userId}`;
                    const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                    delete mapping[storyId];
                    localStorage.setItem(key, JSON.stringify(mapping));
                }

                toggleBookmark(storyId).catch(err => {
                    console.error('Failed to unsave:', err);
                });
            } else {
                trigger.textContent = 'saved';
                trigger.classList.add('saved');
                showTip(trigger, `Added to ${folderName}`);

                if (!userBookmarks.includes(storyId)) {
                    userBookmarks.push(storyId);
                }

                const userId = supabase ? (await supabase.auth.getSession()).data.session?.user?.id : null;
                if (userId) {
                    const key = `kn-folders-${userId}`;
                    const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                    mapping[storyId] = folderName;
                    localStorage.setItem(key, JSON.stringify(mapping));
                }

                toggleBookmark(storyId).catch(err => {
                    console.error('Failed to save:', err);
                });

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

                menu.querySelectorAll('.dropdown-item').forEach(i => {
                    if (i.getAttribute('data-folder') === folderName) {
                        i.classList.add('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    } else {
                        i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    }
                });
            }
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
