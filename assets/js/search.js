import { supabase, calculateTimeAgo, sanitize } from './supabaseClient.js';

const RESULTS_PER_PAGE = 10;

async function performSearch(query) {
    if (!query) return;

    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('p')) || 1;
    const offset = (page - 1) * RESULTS_PER_PAGE;

    const container = document.getElementById('search-results-container');
    const status = document.getElementById('search-status');

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'p-8 text-center text-gray-600';
    loadingDiv.textContent = 'Searching...';
    container.replaceChildren(loadingDiv);
    status.textContent = `Searching for "${query}"...`;

    supabase.rpc('increment_search_count', { search_term: query.toLowerCase().trim() }).catch(() => { });

    const { data: blogs, error: blogError } = await supabase.rpc('search_all_content', {
        search_query: query,
        page_limit: RESULTS_PER_PAGE,
        page_offset: offset
    });

    if (blogError) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'p-8 text-center text-red-500';
        errorDiv.textContent = 'An error occurred while searching.';
        container.replaceChildren(errorDiv);
        return;
    }

    if (!blogs || blogs.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-8 text-center text-gray-600';
        emptyDiv.textContent = `No results found for "${query}".`;
        container.replaceChildren(emptyDiv);
        status.textContent = 'Found 0 results.';
        return;
    }

    const totalCount = blogs[0].total_count;

    status.textContent = `Found ${totalCount} results for "${query}". Showing page ${page}.`;
    renderResults(blogs, query, totalCount, page);
}

function applyHighlight(element, text, query) {
    if (!text) return;
    if (!query) {
        element.textContent = text;
        return;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let i = 0;

    while (i < text.length) {
        const index = lowerText.indexOf(lowerQuery, i);
        if (index === -1) {
            element.appendChild(document.createTextNode(text.substring(i)));
            break;
        }

        if (index > i) {
            element.appendChild(document.createTextNode(text.substring(i, index)));
        }

        const mark = document.createElement('mark');
        mark.className = 'bg-yellow-200 text-black px-0.5 rounded-sm';
        mark.textContent = text.substring(index, index + query.length);
        element.appendChild(mark);

        i = index + query.length;
    }
}

function renderResults(results, query, totalCount, page) {
    const container = document.getElementById('search-results-container');
    const fragment = document.createDocumentFragment();

    results.forEach((item) => {
        const occurrences = [];
        if (item.title?.toLowerCase().includes(query.toLowerCase())) occurrences.push('title');
        if (item.content?.toLowerCase().includes(query.toLowerCase())) occurrences.push('content');
        if (item.author?.toLowerCase().includes(query.toLowerCase())) occurrences.push('author');
        if (item.category?.toLowerCase().includes(query.toLowerCase())) occurrences.push('tag/category');
        if (item.url?.toLowerCase().includes(query.toLowerCase())) occurrences.push('link');
        if (item.published_at?.toLowerCase().includes(query.toLowerCase())) occurrences.push('date');

        const timeAgo = calculateTimeAgo(item.published_at);
        const domain = item.url ? new URL(item.url).hostname.replace('www.', '') : null;

        const cardDiv = document.createElement('div');
        cardDiv.className = 'bg-white p-4 border border-gray-200 rounded-sm shadow-sm hover:shadow-md transition-shadow mb-4';

        const headerFlex = document.createElement('div');
        headerFlex.className = 'flex items-start justify-between mb-1';

        const h2 = document.createElement('h2');
        h2.className = 'text-base font-bold';

        const titleLink = document.createElement('a');
        titleLink.href = item.url || `pulse/home?s=${encodeURIComponent(item.slug || '')}`;
        titleLink.className = 'text-black hover:underline';
        if (item.url) {
            titleLink.setAttribute('target', '_blank');
            titleLink.setAttribute('rel', 'noopener noreferrer');
        }
        applyHighlight(titleLink, item.title, query);
        h2.appendChild(titleLink);

        if (domain) {
            const domainSpan = document.createElement('span');
            domainSpan.className = 'text-xs text-gray-500 font-normal';
            domainSpan.textContent = ` (${domain})`;
            h2.appendChild(domainSpan);
        }

        headerFlex.appendChild(h2);

        const catSpan = document.createElement('span');
        catSpan.className = 'text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200';
        applyHighlight(catSpan, item.category, query);
        headerFlex.appendChild(catSpan);

        cardDiv.appendChild(headerFlex);

        const metaDiv = document.createElement('div');
        metaDiv.className = 'text-xs text-gray-500 mb-2';
        metaDiv.appendChild(document.createTextNode(`${item.likes_count || 0} points by `));
        const authorSpan = document.createElement('span');
        applyHighlight(authorSpan, item.author || 'anonymous', query);
        metaDiv.appendChild(authorSpan);
        metaDiv.appendChild(document.createTextNode(` | ${timeAgo} | ${item.comments_count || 0} comments`));
        cardDiv.appendChild(metaDiv);

        const occDiv = document.createElement('div');
        occDiv.className = 'text-xs text-gray-700 italic mb-3';
        occDiv.appendChild(document.createTextNode('Found in: '));
        const occSpan = document.createElement('span');
        occSpan.className = 'font-bold text-[#ff6600]';
        occSpan.textContent = occurrences.join(', ');
        occDiv.appendChild(occSpan);
        cardDiv.appendChild(occDiv);

        if (item.excerpt) {
            const excDiv = document.createElement('div');
            excDiv.className = 'text-sm text-gray-600 line-clamp-2 mb-2';
            applyHighlight(excDiv, item.excerpt, query);
            cardDiv.appendChild(excDiv);
        }

        const linkDiv = document.createElement('div');
        linkDiv.className = 'mt-3';
        const discLink = document.createElement('a');
        discLink.href = `pulse/home?s=${encodeURIComponent(item.slug || '')}`;
        discLink.className = 'text-xs text-[#ff6600] font-bold hover:underline';
        discLink.textContent = 'View Discussion →';
        linkDiv.appendChild(discLink);
        cardDiv.appendChild(linkDiv);

        fragment.appendChild(cardDiv);
    });

    if (totalCount > page * RESULTS_PER_PAGE) {
        const nextUrl = `search?search=${encodeURIComponent(query)}&p=${page + 1}`;
        const moreDiv = document.createElement('div');
        moreDiv.className = 'flex justify-center p-6';

        const moreLink = document.createElement('a');
        moreLink.href = nextUrl;
        moreLink.className = 'bg-[#ff6600] text-white px-6 py-2 rounded-sm font-bold hover:bg-[#e65c00] transition-colors';
        moreLink.textContent = 'Show More Results';
        moreDiv.appendChild(moreLink);

        fragment.appendChild(moreDiv);
    }

    container.replaceChildren(fragment);
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
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
            window.location.href = `search?search=${encodeURIComponent(query)}`;
        }
    };

    searchButton.addEventListener('click', triggerSearch);
    mainSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSearch();
    });
});
