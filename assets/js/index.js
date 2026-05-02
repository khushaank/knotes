import { supabase, calculateTimeAgo, upvoteStory, trackClick, sanitize, toggleBookmark, getUserBookmarks, toggleFollow } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

let currentFilter = 'trending';
const storyCache = {}; // Simple cache for filters
const STORIES_PER_PAGE = 10;
let userBookmarks = [];

// ---- Hidden Stories (localStorage) ---- //
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

    const start = (page - 1) * STORIES_PER_PAGE;
    const end = start + STORIES_PER_PAGE - 1;


    // Check cache
    const cacheKey = `${filter}-${searchQuery}-${page}`;
    if (storyCache[cacheKey] && (Date.now() - storyCache[cacheKey].timestamp < 30000)) {
        return storyCache[cacheKey].data;
    }

    const { data: stories, error, count } = await query.range(start, end);

    if (error) {
        return [];
    }

    const result = sortStories(stories, filter);
    
    // Save to cache
    storyCache[cacheKey] = {
        data: result,
        count: count,
        timestamp: Date.now()
    };

    return { stories: result, count };
}

async function renderStories(searchQuery = '', filter = 'trending') {
    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('p')) || 1;

    const tbody = document.querySelector('main table tbody');
    const statsSummary = document.getElementById('stats-summary');
    
    // Better loading state
    tbody.style.opacity = '0.5';
    if (statsSummary) statsSummary.textContent = 'Updating...';

    // Load bookmarks in parallel with stories
    const [storiesResult] = await Promise.all([
        fetchStories(searchQuery, filter, page),
        loadUserBookmarks()
    ]);

    const { stories, count } = storiesResult;
    tbody.style.opacity = '1';

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No stories found.</td></tr>';
        if (statsSummary) statsSummary.textContent = '0 results';
        return;
    }

    if (statsSummary) {
        statsSummary.textContent = `Showing ${stories.length} ${filter} stories (Page ${page})`;
    }

    // Filter out hidden stories
    const hiddenIds = getHiddenStories();
    const visibleStories = stories.filter(s => !hiddenIds.includes(String(s.id)));

    let html = '';
    const startIndex = (page - 1) * STORIES_PER_PAGE;

    visibleStories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        const domain = story.url ? new URL(story.url).hostname.replace('www.', '') : null;
        const isBookmarked = userBookmarks.includes(story.id);
        
        html += `
            <tr class="story-row" data-id="${story.id}">
                <td class="text-right align-top w-5 pr-1 text-hn-grey text-[10pt]">${startIndex + index + 1}.</td>
                <td class="align-top w-4 pt-[2px] text-center">
                    <div class="hn-arrow" title="upvote" data-id="${story.id}"></div>
                </td>
                <td class="story-title align-top">
                    <a href="${story.url || `pulse/index.html?s=${story.slug}`}" class="story-link" data-id="${story.id}" ${story.url ? 'target="_blank"' : ''}>${sanitize(story.title)}</a>
                    ${domain ? `<span class="domain-text"> (<a href="${story.url}" target="_blank">${sanitize(domain)}</a>)</span>` : (story.category ? `<span class="domain-text"> (<a href="#">${sanitize(story.category)}</a>)</span>` : '')}
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    ${story.likes_count || 0} points by <a href="profile.html?user=${story.author}" class="hover:underline">${sanitize(story.author) || 'anonymous'}</a> 
                    <button class="boost-karma-index-btn text-gray-500 hover:text-[#ff6600] text-[10px] mx-1 focus:outline-none" data-author="${story.author}">[increase karma]</button>
                    <a href="pulse/index.html?s=${story.slug}" onclick="alert('Posted on ' + new Date('${story.published_at}').toLocaleString() + ' by ${sanitize(story.author) || 'anonymous'}'); return false;">${timeAgo}</a> | 
                    <a href="#" class="hide-link" data-id="${story.id}">hide</a> | 
                    <a href="#" class="bookmark-link" data-id="${story.id}">${isBookmarked ? 'saved' : 'save'}</a> | 
                    <a href="pulse/index.html?s=${story.slug}">${story.comments_count || 0} comments</a>
                </td>
            </tr>
            <tr class="h-[5px] story-spacer" data-id="${story.id}"></tr>
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
}

async function loadUserBookmarks() {
    userBookmarks = await getUserBookmarks();
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

    // Refresh trending
    const refreshBtn = document.getElementById('refresh-trending');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // Clear cache on manual refresh
            Object.keys(storyCache).forEach(k => delete storyCache[k]);
            const searchInput = document.getElementById('footer-search-input');
            renderStories(searchInput?.value.trim() || '', currentFilter);
        });
    }

    // Filter links
    document.querySelectorAll('.filter-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = e.target.getAttribute('data-filter');
            
            // Update UI
            document.querySelectorAll('.filter-link').forEach(l => {
                l.classList.remove('font-bold', 'text-black');
            });
            e.target.classList.add('font-bold', 'text-black');
            
            const searchInput = document.getElementById('footer-search-input');
            renderStories(searchInput?.value.trim() || '', currentFilter, true); // Reset pagination on filter change
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
        
        // Try to increment existing or insert new
        const { data, error } = await supabase.rpc('increment_search_count', { search_term: term });
        
        if (error) {
            // Fallback if RPC isn't available
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

    // ---- Keyboard Shortcuts ---- //
    let focusedStoryIndex = -1;

    document.addEventListener('keydown', (e) => {
        // Don't trigger if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const storyRows = document.querySelectorAll('.story-row');
        if (storyRows.length === 0) return;

        if (e.key === 'j') {
            // Move focus down
            focusedStoryIndex = Math.min(focusedStoryIndex + 1, storyRows.length - 1);
            highlightFocusedStory(storyRows);
        } else if (e.key === 'k') {
            // Move focus up
            focusedStoryIndex = Math.max(focusedStoryIndex - 1, 0);
            highlightFocusedStory(storyRows);
        } else if (e.key === 'o' || e.key === 'Enter') {
            // Open focused story
            if (focusedStoryIndex >= 0 && storyRows[focusedStoryIndex]) {
                const link = storyRows[focusedStoryIndex].querySelector('.story-link');
                if (link) link.click();
            }
        } else if (e.key === 'u') {
            // Upvote focused story
            if (focusedStoryIndex >= 0 && storyRows[focusedStoryIndex]) {
                const arrow = storyRows[focusedStoryIndex].querySelector('.hn-arrow');
                if (arrow) arrow.click();
            }
        } else if (e.key === '?') {
            // Show keyboard shortcuts help
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
        // Don't create duplicate
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

    // Upvote, Hide, Bookmark, and Click Tracking delegation
    document.addEventListener('click', async (e) => {
        // Upvote
        if (e.target.classList.contains('hn-arrow')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            // Visual feedback immediately
            e.target.style.opacity = '0.3';
            e.target.style.pointerEvents = 'none';

            const result = await upvoteStory(storyId);
            
            e.target.style.opacity = '1';
            e.target.style.pointerEvents = 'auto';

            if (result.error) {
                // Show inline tooltip instead of alert
                showInlineMsg(e.target, result.error);
            } else {
                // Local DOM update instead of full render
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
                    e.target.style.visibility = 'visible'; // show arrow again
                } else {
                    e.target.style.visibility = 'hidden'; // HN style hides upvoted arrow
                }
                // Clear cache so next page load has fresh data
                Object.keys(storyCache).forEach(k => delete storyCache[k]);
            }
        }

        // Bookmark / Save
        if (e.target.classList.contains('bookmark-link')) {
            e.preventDefault();
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            const result = await toggleBookmark(parseInt(storyId));
            if (result.error) {
                showInlineMsg(e.target, result.error);
            } else {
                if (result.action === 'added') {
                    e.target.textContent = 'saved';
                    userBookmarks.push(parseInt(storyId));
                } else {
                    e.target.textContent = 'save';
                    userBookmarks = userBookmarks.filter(id => id !== parseInt(storyId));
                }
            }
        }

        // Hide — persist to localStorage and remove completely
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

        // Click Tracking
        if (e.target.classList.contains('story-link')) {
            const storyId = e.target.getAttribute('data-id');
            if (storyId) {
                trackClick(storyId);
            }
        }

        // Boost Karma
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

    // Inline message tooltip
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

});