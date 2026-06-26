import { supabase, calculateTimeAgo, upvoteStory, sanitize, toggleBookmark, getUserBookmarks, getUserLikes } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

const STORIES_PER_PAGE = 10;
let userBookmarks = [];
let userLikes = [];

function profileHref(username) {
    return `profile?user=${encodeURIComponent(username || '')}`;
}

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
    if (!tbody) return;

    try {
        const loadingTr = document.createElement('tr');
        const loadingTd = document.createElement('td');
        loadingTd.colSpan = 3;
        loadingTd.className = 'p-4 text-center';
        loadingTd.textContent = 'Loading stories...';
        loadingTr.appendChild(loadingTd);
        tbody.replaceChildren(loadingTr);

        const [{ stories, count }] = await Promise.all([
            fetchAskStories(page),
            loadUserStats()
        ]);

        if (!stories || stories.length === 0) {
            const emptyTr = document.createElement('tr');
            const emptyTd = document.createElement('td');
            emptyTd.colSpan = 3;
            emptyTd.className = 'p-4 text-center';

            const txt1 = document.createTextNode('No questions found. Be the first to ');
            const a = document.createElement('a');
            a.href = 'submit';
            a.className = 'underline';
            a.textContent = 'ask';
            const txt2 = document.createTextNode('!');

            emptyTd.appendChild(txt1);
            emptyTd.appendChild(a);
            emptyTd.appendChild(txt2);
            emptyTr.appendChild(emptyTd);
            tbody.replaceChildren(emptyTr);
            return;
        }

        const fragment = document.createDocumentFragment();
        const startIndex = (page - 1) * STORIES_PER_PAGE;

        const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        const parsedFolders = session ? JSON.parse(localStorage.getItem(`kn-folders-${session.user.id}`) || '{}') : {};
        const folderMapping = new Map(Object.entries(parsedFolders));

        stories.forEach((story, index) => {
            const timeAgo = calculateTimeAgo(story.published_at);
            const isBookmarked = userBookmarks.includes(story.id);
            const isUpvoted = userLikes.includes(story.id);
            const currentFolder = folderMapping.get(String(story.id));

            const tr1 = document.createElement('tr');
            tr1.className = 'story-row';
            tr1.setAttribute('data-id', story.id);

            const td1_1 = document.createElement('td');
            td1_1.className = 'text-right align-top w-5 pr-1 text-hn-grey text-[10pt]';
            td1_1.textContent = `${startIndex + index + 1}.`;

            const td1_2 = document.createElement('td');
            td1_2.className = 'align-top w-4 pt-[2px] text-center';

            const upvoteDiv = document.createElement('div');
            upvoteDiv.className = `knotes-upvote-triangle ${isUpvoted ? 'upvoted' : ''}`;
            upvoteDiv.title = 'upvote';
            upvoteDiv.setAttribute('data-id', story.id);
            td1_2.appendChild(upvoteDiv);

            const td1_3 = document.createElement('td');
            td1_3.className = 'story-title align-top';

            const titleLink = document.createElement('a');
            titleLink.href = `pulse/home?s=${encodeURIComponent(story.slug || '')}`;
            titleLink.className = 'story-link';
            titleLink.setAttribute('data-id', story.id);
            titleLink.textContent = story.title;
            td1_3.appendChild(titleLink);

            tr1.appendChild(td1_1);
            tr1.appendChild(td1_2);
            tr1.appendChild(td1_3);

            const tr2 = document.createElement('tr');
            tr2.className = 'story-meta-row';
            tr2.setAttribute('data-id', story.id);

            const td2_1 = document.createElement('td');
            td2_1.colSpan = 2;

            const td2_2 = document.createElement('td');
            td2_2.className = 'story-meta';

            td2_2.appendChild(document.createTextNode('by '));
            const authorLink = document.createElement('a');
            authorLink.href = profileHref(story.author);
            authorLink.className = 'hover:underline';
            authorLink.textContent = story.author || 'anonymous';
            td2_2.appendChild(authorLink);

            td2_2.appendChild(document.createTextNode(` | ${timeAgo} | `));

            const hideLink = document.createElement('a');
            hideLink.href = '#';
            hideLink.className = 'hide-link hover:underline';
            hideLink.setAttribute('data-id', story.id);
            hideLink.textContent = 'hide';
            td2_2.appendChild(hideLink);
            td2_2.appendChild(document.createTextNode(' | '));

            const bookmarkSpan = document.createElement('span');
            bookmarkSpan.className = 'bookmark-container';

            const dropdownSpan = document.createElement('span');
            dropdownSpan.className = 'knotes-dropdown inline-block';
            dropdownSpan.setAttribute('data-id', story.id);

            const dropTrigger = document.createElement('button');
            dropTrigger.className = `knotes-dropdown-trigger ${isBookmarked ? 'saved' : ''}`;
            dropTrigger.title = isBookmarked ? `Saved to ${currentFolder || 'list'}` : 'Add to list';
            dropTrigger.textContent = isBookmarked ? 'saved' : '+';
            dropdownSpan.appendChild(dropTrigger);

            const dropMenu = document.createElement('div');
            dropMenu.className = 'knotes-dropdown-menu hidden';

            const folders = ['To Learn', 'Inspiration', 'Archive', 'Reading List'];
            folders.forEach(f => {
                const fItem = document.createElement('div');
                fItem.className = `dropdown-item ${currentFolder === f ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}`;
                fItem.setAttribute('data-folder', f);
                fItem.textContent = f;
                dropMenu.appendChild(fItem);
            });

            if (isBookmarked) {
                const divider = document.createElement('div');
                divider.className = 'dropdown-divider border-t border-gray-100 my-1';
                dropMenu.appendChild(divider);

                const unsaveItem = document.createElement('div');
                unsaveItem.className = 'dropdown-item text-red-500 font-medium';
                unsaveItem.setAttribute('data-folder', 'unsave');
                unsaveItem.textContent = 'Unsave';
                dropMenu.appendChild(unsaveItem);
            }

            dropdownSpan.appendChild(dropMenu);
            bookmarkSpan.appendChild(dropdownSpan);
            td2_2.appendChild(bookmarkSpan);

            td2_2.appendChild(document.createTextNode(' | '));

            const commentsLink = document.createElement('a');
            commentsLink.href = `pulse/home?s=${encodeURIComponent(story.slug || '')}`;
            commentsLink.className = 'hover:underline';
            commentsLink.textContent = `${story.comments_count || 0} comments`;
            td2_2.appendChild(commentsLink);

            td2_2.appendChild(document.createTextNode(' | '));

            const shareLink = document.createElement('a');
            shareLink.href = '#';
            shareLink.className = 'share-link hover:underline';
            shareLink.setAttribute('data-title', story.title);
            shareLink.setAttribute('data-url', story.url || window.location.origin + '/pulse/home?s=' + encodeURIComponent(story.slug || ''));
            shareLink.textContent = 'share';
            td2_2.appendChild(shareLink);

            tr2.appendChild(td2_1);
            tr2.appendChild(td2_2);

            const tr3 = document.createElement('tr');
            tr3.className = 'h-[2px] story-spacer';
            tr3.setAttribute('data-id', story.id);

            fragment.appendChild(tr1);
            fragment.appendChild(tr2);
            fragment.appendChild(tr3);
        });

        if (count > page * STORIES_PER_PAGE) {
            const nextUrl = `ask?p=${page + 1}`;
            const moreTr = document.createElement('tr');
            moreTr.className = 'h-[20px]';

            const moreTd1 = document.createElement('td');
            moreTd1.colSpan = 2;

            const moreTd2 = document.createElement('td');
            moreTd2.className = 'font-title-md text-title-md text-black pt-4';

            const moreLink = document.createElement('a');
            moreLink.href = nextUrl;
            moreLink.className = 'hover:underline text-black font-bold';
            moreLink.textContent = 'More';

            moreTd2.appendChild(moreLink);
            moreTr.appendChild(moreTd1);
            moreTr.appendChild(moreTd2);

            fragment.appendChild(moreTr);
        }

        tbody.replaceChildren(fragment);
    } catch (error) {
        console.error('Failed to render ask stories:', error);
        const errTr = document.createElement('tr');
        const errTd = document.createElement('td');
        errTd.colSpan = 3;
        errTd.className = 'p-4 text-center';
        errTd.textContent = 'Could not load questions right now. Please refresh in a moment.';
        errTr.appendChild(errTd);
        tbody.replaceChildren(errTr);
    }
}

async function loadUserStats() {
    [userBookmarks, userLikes] = await Promise.all([
        getUserBookmarks(),
        getUserLikes()
    ]);
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
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
