import { supabase, calculateTimeAgo } from './supabaseClient.js';

const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('id');

async function fetchStory() {
    if (!storyId) return null;
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('id', storyId)
        .single();

    if (error) {
        console.error('Error fetching blog:', error);
        return null;
    }
    return data;
}

async function fetchComments() {
    if (!storyId) return [];
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('blog_id', storyId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching comments:', error);
        return [];
    }
    return data;
}

function renderCommentList(comments) {
    if (comments.length === 0) return '<div class="mt-4 text-secondary">No comments yet.</div>';

    let html = '';
    comments.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        html += `
            <div class="mb-item-gap comment-node">
                <div class="flex items-start gap-1">
                    <div class="cursor-pointer text-secondary mt-[2px]">
                        <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
                    </div>
                    <div class="w-full">
                        <div class="font-meta-sm text-meta-sm text-secondary mb-1">
                            <a class="hover:underline text-on-background" href="#">${comment.user_name || 'anonymous'}</a>
                            <a class="hover:underline ml-1" href="#">${timeAgo}</a>
                            <span class="ml-1 cursor-pointer hover:underline collapse-toggle">[–]</span>
                        </div>
                        <div class="text-on-background mb-1 comment-body pr-4">
                            <p>${comment.comment_text}</p>
                        </div>
                        <div class="font-meta-sm text-meta-sm text-secondary mb-3 comment-footer">
                            <a class="hover:underline reply-btn" href="javascript:void(0)">reply</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    return html;
}

async function renderPage() {
    if (!storyId) {
        document.querySelector('main').innerHTML = '<div class="p-4">Blog not found. Try accessing from the index page.</div>';
        return;
    }

    const story = await fetchStory();
    if (!story) {
        document.querySelector('main').innerHTML = '<div class="p-4">Blog not found.</div>';
        return;
    }

    // Update story header
    const timeAgo = calculateTimeAgo(story.published_at);
    document.querySelector('article').innerHTML = `
        <div class="flex items-start gap-1">
            <div class="cursor-pointer text-secondary mt-[2px]">
                <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
            </div>
            <div>
                <h1 class="font-title-md text-title-md inline">
                    <a class="text-on-background visited:text-secondary hover:underline" href="#">${story.title}</a>
                </h1>
                ${story.category ? `<span class="font-meta-sm text-meta-sm text-secondary hover:underline cursor-pointer ml-1">(${story.category})</span>` : ''}
                <div class="font-meta-sm text-meta-sm text-secondary mt-item-gap flex items-center gap-1">
                    <span>${story.likes_count || 0} points</span>
                    <span>by</span>
                    <a class="hover:underline" href="#">${story.author || 'anonymous'}</a>
                    <a class="hover:underline" href="#">${timeAgo}</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">hide</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">past</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">favorite</a>
                    <span>|</span>
                    <span>discuss</span>
                </div>
            </div>
        </div>
        ${story.content ? `
        <div class="font-body-md text-body-md text-on-background mt-4 ml-[17px] max-w-prose leading-relaxed">
            <p>${story.content}</p>
        </div>` : ''}
    `;

    const commentsContainer = document.getElementById('comments-container');
    const comments = await fetchComments();
    commentsContainer.innerHTML = renderCommentList(comments);
}

document.addEventListener('DOMContentLoaded', () => {
    renderPage();

    const addBtn = document.getElementById('add-comment-btn');
    const textarea = document.getElementById('comment-input');

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content || !storyId) return;

            if (!supabase) {
                alert('Supabase is not configured yet!');
                return;
            }

            // Add comment to supabase
            const { data, error } = await supabase
                .from('comments')
                .insert([
                    {
                        blog_id: storyId,
                        comment_text: content,
                        user_name: 'test_user' // Hardcoded for now
                    }
                ])
                .select();

            if (error) {
                console.error('Error adding comment:', error);
                alert('Failed to add comment.');
                return;
            }

            // Refresh
            textarea.value = '';
            renderPage();
        });
    }

    // Global click listener for delegation
    document.addEventListener('click', (e) => {
        // Handle Collapse Toggle
        if (e.target.classList.contains('collapse-toggle')) {
            const toggle = e.target;
            const commentRoot = toggle.closest('.flex.items-start').parentElement;
            const body = commentRoot.querySelector('.comment-body');
            const footer = commentRoot.querySelector('.comment-footer');
            
            if (toggle.innerText === '[–]') {
                toggle.innerText = '[+]';
                if (body) body.style.display = 'none';
                if (footer) footer.style.display = 'none';
            } else {
                toggle.innerText = '[–]';
                if (body) body.style.display = 'block';
                if (footer) footer.style.display = 'block';
            }
        }

        if (e.target.classList.contains('reply-btn') || e.target.innerText === 'reply') {
            e.preventDefault();
            if (textarea) textarea.focus();
        }
    });
});
