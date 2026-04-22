import { supabase, calculateTimeAgo } from './supabaseClient.js';

async function fetchStories(searchQuery = '') {
    if (!supabase) {
        console.warn('Supabase is not configured yet.');
        return [];
    }

    let query = supabase
        .from('blogs')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(30);

    if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
    }

    const { data: stories, error } = await query;
    
    if (error) {
        console.error('Error fetching blogs:', error);
        return [];
    }
    return stories;
}

async function renderStories(searchQuery = '') {
    const tbody = document.querySelector('main table tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading stories...</td></tr>';

    const stories = await fetchStories(searchQuery);
    
    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No stories found. Create some in your Supabase dashboard!</td></tr>';
        return;
    }

    let html = '';
    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.published_at);
        html += `
            <tr class="h-[22px]">
                <td class="text-right align-top w-5 pr-1 text-[#828282] font-meta-sm text-meta-sm">${index + 1}.</td>
                <td class="align-top w-3 pt-[3px]"><center><div class="hn-arrow" title="upvote"></div></center></td>
                <td class="font-title-md text-title-md text-black align-top">
                    <a href="viewer.html?id=${story.id}" class="text-black hover:underline">${story.title}</a>
                    ${story.category ? `<span class="text-[#828282] font-meta-sm text-meta-sm hover:underline">(<a href="#">${story.category}</a>)</span>` : ''}
                </td>
            </tr>
            <tr>
                <td colspan="2"></td>
                <td class="font-meta-sm text-meta-sm text-[#828282]">
                    ${story.likes_count || 0} points by <a href="#" class="hover:underline">${story.author || 'anonymous'}</a> <a href="viewer.html?id=${story.id}" class="hover:underline">${timeAgo}</a> | <a href="#" class="hover:underline">hide</a> | <a href="viewer.html?id=${story.id}" class="hover:underline">discuss</a>
                </td>
            </tr>
            <tr class="h-[5px]"></tr>
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
    renderStories();

    const searchForm = document.getElementById('search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                renderStories(searchInput.value.trim());
            }
        });
    }
});
