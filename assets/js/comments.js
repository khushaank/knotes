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
            <div class="mb-6 comment-node">
                <div class="flex items-start gap-1">
                    <div class="cursor-pointer text-secondary mt-[2px]">
                        <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
                    </div>
                    <div class="w-full">
                        <div class="font-meta-sm text-meta-sm text-secondary mb-1">
                            <a class="hover:underline text-on-background font-bold" href="#">${sanitize(comment.user_name) || 'anonymous'}</a>
                            <span class="mx-1">${timeAgo}</span>
                            <span>|</span>
                            <span class="ml-1">on:</span>
                            <a class="hover:underline text-black italic ml-1" href="pulse/index.html?s=${blogSlug}">${sanitize(blogTitle)}</a>
                        </div>
                        <div class="text-on-background mb-1 comment-body pr-4 text-sm leading-relaxed text-black">
                            <p>${sanitize(comment.comment_text)}</p>
                        </div>
                        <div class="font-meta-sm text-meta-sm text-secondary mb-2">
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
    const comments = await fetchAllComments();
    container.innerHTML = renderAllComments(comments);

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
