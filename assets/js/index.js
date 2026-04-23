import { supabase, calculateTimeAgo, upvoteStory, trackClick, calculateTrendingScore } from './supabaseClient.js';

let currentFilter = 'trending';

async function fetchStories(searchQuery = '', filter = 'trending') {
    if (!supabase) {
        console.warn('Supabase is not configured yet.');
        return [];
    }

    let query = supabase
        .from('blogs')
        .select('*')
        .eq('status', 'published');

    if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
    }

    // Default sorting based on filter
    if (filter === 'new') {
        query = query.order('published_at', { ascending: false });
    } else if (filter === 'relevant') {
        // Simple weighted score sorting (if we had a score column, we'd use it)
        // For now we'll fetch and sort in JS
    } else {
        // Trending: will sort in JS after fetching
    }

    const { data: stories, error } = await query.limit(100);

    if (error) {
        console.error('Error fetching blogs:', error);
        return [];
    }

    if (filter === 'relevant') {
        return stories.sort((a, b) => {
            const scoreA = (a.likes_count || 0) * 0.75 + (a.clicks_count || 0) * 0.25;
            const scoreB = (b.likes_count || 0) * 0.75 + (b.clicks_count || 0) * 0.25;
            return scoreB - scoreA;
        }).slice(0, 30);
    }

    if (filter === 'trending') {
        return stories.sort((a, b) => {
            return calculateTrendingScore(b) - calculateTrendingScore(a);
        }).slice(0, 30);
    }

    return stories.slice(0, 30);
}

async function renderStories(searchQuery = '', filter = 'trending') {
    const tbody = document.querySelector('main table tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading stories...</td></tr>';

    const stories = await fetchStories(searchQuery, filter);

    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No stories found.</td></tr>';
        return;
    }

    let html = '';
    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        const domain = story.url ? new URL(story.url).hostname.replace('www.', '') : null;
        
        html += `
            <tr class="story-row" data-id="${story.id}">
                <td class="text-right align-top w-5 pr-1 text-hn-grey text-[10pt]">${index + 1}.</td>
                <td class="align-top w-4 pt-[2px] text-center">
                    <div class="hn-arrow" title="upvote" data-id="${story.id}"></div>
                </td>
                <td class="story-title align-top">
                    <a href="${story.url || `viewer.html?id=${story.id}`}" class="story-link" data-id="${story.id}" ${story.url ? 'target="_blank"' : ''}>${story.title}</a>
                    ${domain ? `<span class="domain-text"> (<a href="${story.url}" target="_blank">${domain}</a>)</span>` : (story.category ? `<span class="domain-text"> (<a href="#">${story.category}</a>)</span>` : '')}
                </td>
            </tr>
            <tr class="story-meta-row" data-id="${story.id}">
                <td colspan="2"></td>
                <td class="story-meta">
                    ${story.likes_count || 0} points by <a href="profile.html?user=${story.author}" class="hover:underline">${story.author || 'anonymous'}</a> 
                    <a href="viewer.html?id=${story.id}">${timeAgo}</a> | 
                    <a href="#" class="hide-link" data-id="${story.id}">hide</a> | 
                    <a href="viewer.html?id=${story.id}">${story.comments_count || 0} comments</a>
                </td>
            </tr>
            <tr class="h-[5px] story-spacer" data-id="${story.id}"></tr>
        `;
    });

    html += `
        <tr class="h-[20px]">
            <td colspan="2"></td>
            <td class="font-title-md text-title-md text-black">
                <a class="hover:underline" href="#">More</a>
            </td>
        </tr>
    `;

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
                if (term) logSearchTerm(term);
                renderStories(term, currentFilter);
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
                const searchInput = document.getElementById('footer-search-input');
                renderStories(searchInput?.value.trim() || '', currentFilter);
            }
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