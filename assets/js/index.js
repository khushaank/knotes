import { supabase, calculateTimeAgo, upvoteStory, trackClick, sanitize, toggleBookmark, getUserBookmarks, getUserLikes, toggleFollow, getCache, setCache } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

let currentFilter = 'trending';
const STORIES_PER_PAGE = 10;
let userBookmarks = [];
let userLikes = [];

// Escape special PostgREST filter characters to prevent filter injection
function sanitizeSearchInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/\./g, '\\.')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/%/g, '\\%')
        .substring(0, 200); // Limit length
}

function getHiddenStories() {
    try {
        return JSON.parse(localStorage.getItem('kn-hidden-stories') || '[]');
    } catch { return []; }
}
function hideStory(id) {
    const hidden = getHiddenStories();
    if (!hidden.includes(id)) {
        hidden.push(id);
        localStorage.setItem('kn-hidden-stories', JSON.stringify(hidden));
    }
}

async function fetchStories(searchQuery = '', filter = 'trending', page = 1) {
    if (!supabase) {
        return { stories: [], count: 0 };
    }

    let query = supabase
        .from('blogs')
        .select('*', { count: 'exact' })
        .eq('status', 'published');

    if (filter === 'new') {
        query = query.order('published_at', { ascending: false });
    } else {
        query = query.order('likes_count', { ascending: false });
    }

    if (searchQuery) {
        const safeQuery = sanitizeSearchInput(searchQuery);
        query = query.or(`title.ilike.%${safeQuery}%,author.ilike.%${safeQuery}%,category.ilike.%${safeQuery}%`);
    }

    const start = (page - 1) * STORIES_PER_PAGE;
    const end = start + STORIES_PER_PAGE - 1;

    const { data: stories, error, count } = await query.range(start, end);

    if (error) {
        return { stories: [], count: 0 };
    }

    const result = sortStories(stories, filter);

    const finalResult = { stories: result, count: count || 0 };

    return finalResult;
}

async function renderStories(searchQuery = '', filter = 'trending') {
    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('p')) || 1;

    const tbody = document.querySelector('main table tbody');
    const statsSummary = document.getElementById('stats-summary');
    const cacheKey = `stories-${filter}-${page}-${searchQuery}`;
    const cached = getCache(cacheKey);

    await loadUserStats();

    if (cached) {
        await renderHtml(cached.data.stories, cached.data.count, page, filter, searchQuery);
        if (!cached.stale) {
            if (tbody) tbody.style.opacity = '1';
            return;
        }
    }

    if (tbody) tbody.style.opacity = '0.5';
    if (statsSummary) statsSummary.textContent = 'Updating...';

    const storiesResult = await fetchStories(searchQuery, filter, page);

    const { stories, count } = storiesResult;
    setCache(cacheKey, { stories, count });

    await renderHtml(stories, count, page, filter, searchQuery);
}

async function renderHtml(stories, count, page, filter, searchQuery) {
    const tbody = document.querySelector('main table tbody');
    const statsSummary = document.getElementById('stats-summary');
    tbody.style.opacity = '1';

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No stories found.</td></tr>';
        if (statsSummary) statsSummary.textContent = '0 results';
        return;
    }

    if (statsSummary) {
        statsSummary.textContent = `Showing ${stories.length} ${filter} stories (Page ${page})`;
    }

    const hiddenIds = getHiddenStories();
    const visibleStories = stories.filter(s => !hiddenIds.includes(String(s.id)));

    const { data: { session } } = await supabase.auth.getSession();
    const folderMapping = session ? JSON.parse(localStorage.getItem(`kn-folders-${session.user.id}`) || '{}') : {};

    let html = '';
    const startIndex = (page - 1) * STORIES_PER_PAGE;

    visibleStories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        const domain = story.url ? new URL(story.url).hostname.replace('www.', '') : null;
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
                    <a href="${story.url || `pulse/index.html?s=${story.slug}`}" class="story-link" data-id="${story.id}" ${story.url ? 'target="_blank"' : ''}>${sanitize(story.title)}</a>
                    ${domain ? `<span class="domain-text"> (<a href="${story.url}" target="_blank">${sanitize(domain)}</a>)</span>` : (story.category ? `<span class="domain-text"> (<a href="#">${sanitize(story.category)}</a>)</span>` : '')}
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    by <a href="@${story.author}" class="hover:underline">${sanitize(story.author) || 'anonymous'}</a> | 
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
        const nextUrl = `index.html?p=${page + 1}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}${filter !== 'trending' ? `&filter=${filter}` : ''}`;
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
    setupPrefetching();
}

function setupPrefetching() {
    const storyLinks = document.querySelectorAll('.story-link');
    storyLinks.forEach(link => {
        link.addEventListener('mouseenter', () => {
            const id = link.getAttribute('data-id');
            const href = link.getAttribute('href');
            if (href && href.includes('pulse/index.html')) {
                const slug = new URLSearchParams(href.split('?')[1]).get('s');
                if (slug) prefetchPulseData(slug);
            }
        }, { once: true });
    });
}

async function prefetchPulseData(slug) {
    if (getCache(`pulse-${slug}`)) return;

    const { data } = await supabase
        .from('blogs')
        .select('*')
        .eq('slug', slug)
        .single();

    if (data) {
        setCache(`pulse-${slug}`, data, 1000 * 60 * 10); // 10 min cache
    }
}

async function loadUserStats() {
    [userBookmarks, userLikes] = await Promise.all([
        getUserBookmarks(),
        getUserLikes()
    ]);
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    const filterParam = urlParams.get('filter');

    if (filterParam) {
        currentFilter = filterParam;
        document.querySelectorAll('.filter-link').forEach(l => {
            l.classList.remove('font-bold', 'text-black');
            if (l.getAttribute('data-filter') === filterParam) {
                l.classList.add('font-bold', 'text-black');
            }
        });
    }

    renderStories(searchParam || '', currentFilter);

    if (searchParam) {
        const searchInput = document.getElementById('footer-search-input');
        if (searchInput) searchInput.value = searchParam;
    }

    const refreshBtn = document.getElementById('refresh-trending');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const searchInput = document.getElementById('footer-search-input');
            renderStories(searchInput?.value.trim() || '', currentFilter);
        });
    }

    document.querySelectorAll('.filter-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = e.target.getAttribute('data-filter');

            document.querySelectorAll('.filter-link').forEach(l => {
                l.classList.remove('font-bold', 'text-black');
            });
            e.target.classList.add('font-bold', 'text-black');

            const searchInput = document.getElementById('footer-search-input');
            if (window.location.search.includes('p=')) {
                const newUrl = window.location.pathname + `?filter=${currentFilter}${searchInput?.value.trim() ? `&search=${encodeURIComponent(searchInput.value.trim())}` : ''}`;
                window.history.pushState({}, '', newUrl);
            }
            renderStories(searchInput?.value.trim() || '', currentFilter);
        });
    });

    const searchForm = document.getElementById('footer-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('footer-search-input');
            if (searchInput) {
                const term = searchInput.value.trim();
                if (term) {
                    logSearchTerm(term);
                    window.location.href = `search.html?search=${encodeURIComponent(term)}`;
                }
            }
        });
    }

    async function logSearchTerm(term) {
        if (!supabase) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return; // Backend now requires auth for search stats

        const { data, error } = await supabase.rpc('increment_search_count', { search_term: term });

        if (error) {
            const { data: existing } = await supabase
                .from('search_stats')
                .select('id, count')
                .eq('term', term)
                .maybeSingle();

            if (existing) {
                await supabase.from('search_stats').update({ count: existing.count + 1 }).eq('id', existing.id);
            } else {
                await supabase.from('search_stats').insert([{ term, count: 1 }]);
            }
        }
    }

    async function fetchTrendingSearches() {
        if (!supabase) return;
        const { data, error } = await supabase
            .from('search_stats')
            .select('term')
            .order('count', { ascending: false })
            .limit(5);

        if (data && data.length > 0) {
            const container = document.getElementById('trending-searches');
            if (container) {
                container.innerHTML = 'Trending: ' + data.map(s => `<a href="index.html?search=${s.term}" class="hover:underline">${s.term}</a>`).join(', ');
            }
        }
    }

    fetchTrendingSearches();

    let focusedStoryIndex = -1;

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const storyRows = document.querySelectorAll('.story-row');
        if (storyRows.length === 0) return;

        if (e.key === 'j') {
            focusedStoryIndex = Math.min(focusedStoryIndex + 1, storyRows.length - 1);
            highlightFocusedStory(storyRows);
        } else if (e.key === 'k') {
            focusedStoryIndex = Math.max(focusedStoryIndex - 1, 0);
            highlightFocusedStory(storyRows);
        } else if (e.key === 'o' || e.key === 'Enter') {
            if (focusedStoryIndex >= 0 && storyRows[focusedStoryIndex]) {
                const link = storyRows[focusedStoryIndex].querySelector('.story-link');
                if (link) link.click();
            }
        } else if (e.key === 'u') {
            if (focusedStoryIndex >= 0 && storyRows[focusedStoryIndex]) {
                const arrow = storyRows[focusedStoryIndex].querySelector('.knotes-upvote-triangle');
                if (arrow) arrow.click();
            }
        } else if (e.key === '?') {
            showShortcutsHelp();
        }
    });

    function highlightFocusedStory(rows) {
        rows.forEach(r => r.style.background = '');
        if (focusedStoryIndex >= 0 && rows[focusedStoryIndex]) {
            rows[focusedStoryIndex].style.background = '#fff3e0';
            rows[focusedStoryIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function showShortcutsHelp() {
        if (document.getElementById('shortcuts-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'shortcuts-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:8px;padding:24px 32px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <b style="font-size:15px;">Keyboard Shortcuts</b>
                    <span id="close-shortcuts" style="cursor:pointer;font-size:18px;color:#888;">✕</span>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 12px 6px 0;color:#888;">j</td><td style="padding:6px 0;">Next story</td></tr>
                    <tr><td style="padding:6px 12px 6px 0;color:#888;">k</td><td style="padding:6px 0;">Previous story</td></tr>
                    <tr><td style="padding:6px 12px 6px 0;color:#888;">o / Enter</td><td style="padding:6px 0;">Open story</td></tr>
                    <tr><td style="padding:6px 12px 6px 0;color:#888;">u</td><td style="padding:6px 0;">Upvote story</td></tr>
                    <tr><td style="padding:6px 12px 6px 0;color:#888;">?</td><td style="padding:6px 0;">Show this help</td></tr>
                </table>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (ev) => {
            if (ev.target === modal || ev.target.id === 'close-shortcuts') modal.remove();
        });
    }

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('knotes-upvote-triangle')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;
            e.target.style.opacity = '0.3';
            e.target.style.pointerEvents = 'none';

            const result = await upvoteStory(storyId);

            e.target.style.opacity = '1';
            e.target.style.pointerEvents = 'auto';

            if (result.error) {
                showInlineMsg(e.target, result.error);
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
                    showInlineMsg(e.target, 'Vote removed');
                    e.target.classList.remove('upvoted');
                } else {
                    e.target.classList.add('upvoted');
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
                showInlineMsg(trigger, 'Removed');

                const unsaveOpt = menu.querySelector('[data-folder="unsave"]');
                if (unsaveOpt) unsaveOpt.remove();
                const divider = menu.querySelector('.dropdown-divider');
                if (divider) divider.remove();
                
                menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold'));

                const idx = userBookmarks.indexOf(storyId);
                if (idx > -1) userBookmarks.splice(idx, 1);

                const userId = (await supabase.auth.getSession()).data.session?.user?.id;
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
                showInlineMsg(trigger, `Added to ${folderName}`);

                if (!userBookmarks.includes(storyId)) {
                    userBookmarks.push(storyId);
                }

                const userId = (await supabase.auth.getSession()).data.session?.user?.id;
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
            hideStory(storyId);
            const rows = document.querySelectorAll(`[data-id="${storyId}"]`);
            rows.forEach(row => {
                row.style.transition = 'opacity 0.25s ease-out';
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 250);
            });
        }

        if (e.target.classList.contains('story-link')) {
            const storyId = e.target.getAttribute('data-id');
            if (storyId) {
                trackClick(storyId);
            }
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

        if (e.target.classList.contains('boost-karma-index-btn')) {
            e.preventDefault();
            const btn = e.target;
            const author = btn.getAttribute('data-author');
            if (!author) return;

            btn.disabled = true;
            btn.style.opacity = '0.5';

            const { data: profile } = await supabase.from('profiles').select('id').eq('username', author).maybeSingle();
            if (!profile) {
                alert('User not found.');
                btn.disabled = false;
                btn.style.opacity = '1';
                return;
            }

            const result = await toggleFollow(profile.id);
            if (result.error) {
                showInlineMsg(btn, result.error);
                btn.disabled = false;
                btn.style.opacity = '1';
            } else {
                if (result.action === 'followed') {
                    btn.classList.add('text-[#ff6600]');
                    btn.classList.remove('text-gray-500');
                    btn.textContent = "[decrease karma]";
                } else {
                    btn.classList.add('text-gray-500');
                    btn.classList.remove('text-[#ff6600]');
                    btn.textContent = "[increase karma]";
                }
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }
    });

    function showInlineMsg(anchor, msg) {
        const tip = document.createElement('span');
        tip.textContent = msg;
        tip.style.cssText = 'position:absolute;background:#333;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;white-space:nowrap;z-index:100;pointer-events:none;';

        anchor.style.position = 'relative';
        const parent = anchor.parentElement;
        parent.style.position = 'relative';
        parent.appendChild(tip);

        setTimeout(() => {
            tip.style.transition = 'opacity 0.3s';
            tip.style.opacity = '0';
            setTimeout(() => tip.remove(), 300);
        }, 1500);
    }

    async function loadBroadcast() {
        if (!supabase) return;
        const banner = document.getElementById('broadcast-banner');
        if (!banner) return;

        const { data } = await supabase
            .from('site_settings')
            .select('value')
            .eq('id', 'broadcast_message')
            .maybeSingle();

        if (data && data.value && data.value.trim() !== '') {
            const cleanHtml = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(data.value) : data.value;
            banner.innerHTML = cleanHtml;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    loadBroadcast();

});