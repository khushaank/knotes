import { supabase, calculateTimeAgo, sanitize } from './supabaseClient.js';

const RESULTS_PER_PAGE = 10;

async function performSearch(query) {
    if (!query) return;

    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('p')) || 1;
    const offset = (page - 1) * RESULTS_PER_PAGE;

    const container = document.getElementById('search-results-container');
    const status = document.getElementById('search-status');
    
    container.innerHTML = '<div class="p-8 text-center text-gray-600">Searching...</div>';
    status.textContent = `Searching for "${query}"...`;

    // Fetch blogs matching the query via the new paginated RPC
    const { data: blogs, error: blogError } = await supabase.rpc('search_all_content', { 
        search_query: query,
        page_limit: RESULTS_PER_PAGE,
        page_offset: offset
    });

    if (blogError) {
        container.innerHTML = '<div class="p-8 text-center text-red-500">An error occurred while searching.</div>';
        return;
    }

    if (!blogs || blogs.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray-600">No results found for "' + query + '".</div>';
        status.textContent = 'Found 0 results.';
        return;
    }

    const totalCount = blogs[0].total_count;
    const blogIds = blogs.map(b => b.id);

    // Fetch all related comments in a single batch query
    const { data: allComments, error: commentError } = await supabase
        .from('comments')
        .select('blog_id, comment_text, user_name')
        .in('blog_id', blogIds);

    if (commentError) {
    }

    // Map comments to their respective blogs
    const results = blogs.map(blog => ({
        ...blog,
        comments: (allComments || []).filter(c => c.blog_id === blog.id)
    }));

    status.textContent = `Found ${totalCount} results for "${query}". Showing page ${page}.`;
    renderResults(results, query, totalCount, page);
}

function highlight(text, query) {
    if (!text || !query) return text || '';
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 text-black px-0.5 rounded-sm">$1</mark>');
}

function renderResults(results, query, totalCount, page) {
    const container = document.getElementById('search-results-container');
    let html = '';

    results.forEach((item, index) => {
        const occurrences = [];
        // ... (rest of occurrences logic stays same)
        if (item.title?.toLowerCase().includes(query.toLowerCase())) occurrences.push('title');
        if (item.content?.toLowerCase().includes(query.toLowerCase())) occurrences.push('content');
        if (item.author?.toLowerCase().includes(query.toLowerCase())) occurrences.push('author');
        if (item.category?.toLowerCase().includes(query.toLowerCase())) occurrences.push('tag/category');
        if (item.url?.toLowerCase().includes(query.toLowerCase())) occurrences.push('link');
        if (item.published_at?.toLowerCase().includes(query.toLowerCase())) occurrences.push('date');
        
        const matchingComments = item.comments.filter(c => 
            c.comment_text?.toLowerCase().includes(query.toLowerCase()) || 
            c.user_name?.toLowerCase().includes(query.toLowerCase())
        );
        if (matchingComments.length > 0) occurrences.push(`comment (${matchingComments.length})`);

        const timeAgo = calculateTimeAgo(item.published_at);
        const domain = item.url ? new URL(item.url).hostname.replace('www.', '') : null;

        html += `
            <div class="bg-white p-4 border border-gray-200 rounded-sm shadow-sm hover:shadow-md transition-shadow mb-4">
                <div class="flex items-start justify-between mb-1">
                    <h2 class="text-base font-bold">
                        <a href="${item.url || `pulse/index.html?s=${item.slug}`}" class="text-black hover:underline" ${item.url ? 'target="_blank"' : ''}>
                            ${highlight(sanitize(item.title), query)}
                        </a>
                        ${domain ? `<span class="text-xs text-gray-500 font-normal"> (${sanitize(domain)})</span>` : ''}
                    </h2>
                    <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                        ${highlight(sanitize(item.category), query)}
                    </span>
                </div>
                
                <div class="text-xs text-gray-500 mb-2">
                    ${item.likes_count || 0} points by ${highlight(sanitize(item.author) || 'anonymous', query)} | ${timeAgo} | ${item.comments.length} comments
                </div>

                <div class="text-xs text-gray-700 italic mb-3">
                    Found in: <span class="font-bold text-[#ff6600]">${occurrences.map(o => sanitize(o)).join(', ')}</span>
                </div>

                ${item.excerpt ? `
                    <div class="text-sm text-gray-600 line-clamp-2 mb-2">
                        ${highlight(sanitize(item.excerpt), query)}
                    </div>
                ` : ''}

                ${matchingComments.length > 0 ? `
                    <div class="mt-3 pl-3 border-l-2 border-[#ff6600] bg-gray-50 p-2 text-xs">
                        <div class="font-bold text-gray-500 mb-1">Matching Comment Snippet:</div>
                        <div class="text-gray-700">
                            "${highlight(sanitize(matchingComments[0].comment_text).substring(0, 150), query)}..."
                        </div>
                    </div>
                ` : ''}
                
                <div class="mt-3">
                    <a href="pulse/index.html?s=${item.slug}" class="text-xs text-[#ff6600] font-bold hover:underline">View Discussion →</a>
                </div>
            </div>
        `;
    });

    if (totalCount > page * RESULTS_PER_PAGE) {
        const nextUrl = `search.html?search=${encodeURIComponent(query)}&p=${page + 1}`;
        html += `
            <div class="flex justify-center p-6">
                <a href="${nextUrl}" class="bg-[#ff6600] text-white px-6 py-2 rounded-sm font-bold hover:bg-[#e65c00] transition-colors">
                    Show More Results
                </a>
            </div>
        `;
    }

    container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    const mainSearchInput = document.getElementById('main-search-input');
    const searchButton = document.getElementById('search-button');

    if (searchParam) {
        mainSearchInput.value = searchParam;
        performSearch(searchParam);
    }

    const triggerSearch = () => {
        const query = mainSearchInput.value.trim();
        if (query) {
            // Update URL without reload if possible, or just reload with new param
            window.location.href = `search.html?search=${encodeURIComponent(query)}`;
        }
    };

    searchButton.addEventListener('click', triggerSearch);
    mainSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSearch();
    });
});
