import { supabase, calculateTimeAgo, upvoteStory, trackClick, sanitize } from './supabaseClient.js';
import { sortStories } from './algorithm.js';

let currentFilter = 'trending';
const storyCache = {}; // Simple cache for filters
const STORIES_PER_PAGE = 10;

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

    const { stories, count } = await fetchStories(searchQuery, filter, page);
    tbody.style.opacity = '1';

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No stories found.</td></tr>';
        if (statsSummary) statsSummary.textContent = '0 results';
        return;
    }

    if (statsSummary) {
        statsSummary.textContent = `Showing ${stories.length} ${filter} stories (Page ${page})`;
    }

    let html = '';
    const startIndex = (page - 1) * STORIES_PER_PAGE;

    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        const domain = story.url ? new URL(story.url).hostname.replace('www.', '') : null;
        
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
                    <a href="pulse/index.html?s=${story.slug}">${timeAgo}</a> | 
                    <a href="#" class="hide-link" data-id="${story.id}">hide</a> | 
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

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');

    renderStories(searchParam || '', currentFilter);

    if (searchParam) {
        const searchInput = document.getElementById('footer-search-input');
        if (searchInput) searchInput.value = searchParam;
    }

    // Refresh trending
    const refreshBtn = document.getElementById('refresh-trending');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
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

    // Upvote, Hide, and Click Tracking delegation
    document.addEventListener('click', async (e) => {
        // Upvote
        if (e.target.classList.contains('hn-arrow')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            const result = await upvoteStory(storyId);
            if (result.error) {
                alert(result.error);
            } else {
                // Clear cache on upvote to ensure fresh data
                const cacheKey = `${currentFilter}-`;
                delete storyCache[cacheKey];
                
                const searchInput = document.getElementById('footer-search-input');
                renderStories(searchInput?.value.trim() || '', currentFilter);
            }
        }

        // More Button (now handled by <a> link, but we handle click for potential smooth transition)
        if (e.target.id === 'more-btn') {
            // Let the default link behavior happen or handle it via pushState
        }

        // Hide
        if (e.target.classList.contains('hide-link')) {
            e.preventDefault();
            const storyId = e.target.getAttribute('data-id');
            const rows = document.querySelectorAll(`[data-id="${storyId}"]`);
            rows.forEach(row => row.classList.add('hidden'));
        }

        // Click Tracking
        if (e.target.classList.contains('story-link')) {
            const storyId = e.target.getAttribute('data-id');
            if (storyId) {
                trackClick(storyId);
            }
        }
    });

});