import { supabase, calculateTimeAgo, sanitize } from './supabaseClient.js';

function profileHref(username) {
    return `profile.html?user=${encodeURIComponent(username || '')}`;
}

async function fetchAllComments() {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('comments')
        .select(`
            *,
            blogs (
                title,
                id,
                slug
            )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        return [];
    }
    return data;
}

function renderAllComments(comments, container) {
    if (!comments || comments.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-4 text-center text-gray-600';
        emptyDiv.textContent = 'No comments found.';
        container.replaceChildren(emptyDiv);
        return;
    }

    const fragment = document.createDocumentFragment();

    comments.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        const blogTitle = comment.blogs?.title || 'Unknown Post';
        const blogSlug = comment.blogs?.slug || '';

        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'mb-2 comment-node';

        const flexDiv = document.createElement('div');
        flexDiv.className = 'flex items-start gap-2';

        const upvoteWrapper = document.createElement('div');
        upvoteWrapper.className = 'pt-[3px]';
        const upvoteTriangle = document.createElement('div');
        upvoteTriangle.className = 'knotes-upvote-triangle';
        upvoteTriangle.title = 'upvote';
        upvoteWrapper.appendChild(upvoteTriangle);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'flex-1';

        const metaDiv1 = document.createElement('div');
        metaDiv1.className = 'story-meta opacity-70';

        const authorLink = document.createElement('a');
        authorLink.className = 'hover:underline text-black font-medium';
        authorLink.href = profileHref(comment.user_name);
        authorLink.textContent = comment.user_name || 'anonymous';
        metaDiv1.appendChild(authorLink);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'mx-0.5';
        timeSpan.textContent = ` ${timeAgo} `;
        metaDiv1.appendChild(timeSpan);
        metaDiv1.appendChild(document.createTextNode(' | on: '));

        const postLink = document.createElement('a');
        postLink.className = 'hover:underline italic';
        postLink.href = `pulse/index.html?s=${encodeURIComponent(blogSlug)}`;
        postLink.textContent = blogTitle;
        metaDiv1.appendChild(postLink);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'comment-body pr-4 text-[13px] leading-tight text-black';
        bodyDiv.textContent = comment.comment_text;

        const metaDiv2 = document.createElement('div');
        metaDiv2.className = 'story-meta opacity-60 text-[10px] mt-1';

        const contextLink = document.createElement('a');
        contextLink.className = 'hover:underline';
        contextLink.href = `pulse/index.html?s=${encodeURIComponent(blogSlug)}`;
        contextLink.textContent = 'context';
        metaDiv2.appendChild(contextLink);

        const sepSpan = document.createElement('span');
        sepSpan.className = 'mx-1';
        sepSpan.textContent = '|';
        metaDiv2.appendChild(sepSpan);

        const parentLink = document.createElement('a');
        parentLink.className = 'hover:underline';
        parentLink.href = `pulse/index.html?s=${encodeURIComponent(blogSlug)}`;
        parentLink.textContent = 'parent';
        metaDiv2.appendChild(parentLink);

        contentDiv.appendChild(metaDiv1);
        contentDiv.appendChild(bodyDiv);
        contentDiv.appendChild(metaDiv2);

        flexDiv.appendChild(upvoteWrapper);
        flexDiv.appendChild(contentDiv);
        nodeDiv.appendChild(flexDiv);

        fragment.appendChild(nodeDiv);
    });

    container.replaceChildren(fragment);
}

async function init() {
    const container = document.getElementById('comments-container');

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'p-4 text-center text-gray-600';
    loadingDiv.textContent = 'Loading comments...';
    container.replaceChildren(loadingDiv);

    const comments = await fetchAllComments();
    renderAllComments(comments, container);

    const countEl = document.getElementById('comment-count');
    if (countEl) countEl.textContent = `${comments.length} recent comments`;

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
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
    document.title = "New Comments | K. Notes";
    init();
});
