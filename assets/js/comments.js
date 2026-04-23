import { supabase, calculateTimeAgo } from './supabaseClient.js';

async function fetchAllComments() {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('comments')
        .select(`
            *,
            blogs (
                title,
                id
            )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error fetching all comments:', error);
        return [];
    }
    return data;
}

function renderAllComments(comments) {
    if (comments.length === 0) return '<div class="p-4 text-secondary">No comments found.</div>';

    let html = '';
    comments.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        const blogTitle = comment.blogs?.title || 'Unknown Post';
        const blogId = comment.blogs?.id || '#';

        html += `
            <div class="mb-6 comment-node">
                <div class="flex items-start gap-1">
                    <div class="cursor-pointer text-secondary mt-[2px]">
                        <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
                    </div>
                    <div class="w-full">
                        <div class="font-meta-sm text-meta-sm text-secondary mb-1">
                            <a class="hover:underline text-on-background font-bold" href="#">${comment.user_name || 'anonymous'}</a>
                            <span class="mx-1">${timeAgo}</span>
                            <span>|</span>
                            <span class="ml-1">on:</span>
                            <a class="hover:underline text-black italic ml-1" href="viewer.html?id=${blogId}">${blogTitle}</a>
                        </div>
                        <div class="text-on-background mb-1 comment-body pr-4 text-sm leading-relaxed">
                            <p>${comment.comment_text}</p>
                        </div>
                        <div class="font-meta-sm text-meta-sm text-secondary mb-2">
                            <a class="hover:underline" href="viewer.html?id=${blogId}">context</a>
                            <span class="mx-1">|</span>
                            <a class="hover:underline" href="viewer.html?id=${blogId}">parent</a>
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
}

document.addEventListener('DOMContentLoaded', init);
