import { supabase, calculateTimeAgo, sanitize } from './supabaseClient.js';

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

function renderAllComments(comments) {
    if (!comments || comments.length === 0) return '<div class="p-4 text-center text-gray-600">No comments found.</div>';

    let html = '';
    comments.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        const blogTitle = comment.blogs?.title || 'Unknown Post';
        const blogSlug = comment.blogs?.slug || '';

        html += `
            <div class="mb-3 comment-node">
                <div class="flex items-start gap-2">
                    <div class="pt-[3px]">
                        <div class="hn-arrow" title="upvote"></div>
                    </div>
                    <div class="flex-1">
                        <div class="story-meta opacity-70">
                            <a class="hover:underline text-black font-medium" href="profile.html?user=${comment.user_name}">${sanitize(comment.user_name) || 'anonymous'}</a>
                            <span class="mx-0.5">${timeAgo}</span> | 
                            on: <a class="hover:underline italic" href="pulse/index.html?s=${blogSlug}">${sanitize(blogTitle)}</a>
                        </div>
                        <div class="comment-body pr-4 text-[13px] leading-tight text-black">
                            ${sanitize(comment.comment_text)}
                        </div>
                        <div class="story-meta opacity-60 text-[10px] mt-1">
                            <a class="hover:underline" href="pulse/index.html?s=${blogSlug}">context</a>
                            <span class="mx-1">|</span>
                            <a class="hover:underline" href="pulse/index.html?s=${blogSlug}">parent</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    return html;
}

async function init() {
    const container = document.getElementById('comments-container');
    container.innerHTML = '<div class="p-4 text-center text-gray-600">Loading comments...</div>';
    
    const comments = await fetchAllComments();
    container.innerHTML = renderAllComments(comments);

    // Show comment count in page
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

document.addEventListener('DOMContentLoaded', () => {
    document.title = "New Comments | K. Notes";
    init();
});
