import { supabase, calculateTimeAgo, upvoteStory, trackClick } from './supabaseClient.js';

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
            <div class="mb-4 comment-node">
                <div class="flex items-start gap-1">
                    <div class="hn-arrow mt-[4px]" data-id="${comment.id}"></div>
                    <div class="w-full">
                        <div class="story-meta mb-1">
                            <a class="hover:underline text-black" href="profile.html?user=${comment.user_name}">${comment.user_name || 'anonymous'}</a>
                            <a class="hover:underline ml-1" href="#">${timeAgo}</a>
                            <span class="ml-1 cursor-pointer hover:underline collapse-toggle text-hn-grey">[–]</span>
                        </div>
                        <div class="text-black mb-1 text-[10pt] leading-snug comment-body pr-4">
                            <p>${comment.comment_text}</p>
                        </div>
                        <div class="story-meta mb-3 comment-footer">
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

    trackClick(story.id); // Track view as a click

    // Update story header
    const timeAgo = calculateTimeAgo(story.published_at);
    document.querySelector('article').innerHTML = `
        <div class="flex items-start gap-1">
            <div class="hn-arrow mt-[6px]" data-id="${story.id}"></div>
            <div>
                <span class="story-title">
                    <a class="hover:underline" href="${story.url || '#'}">${story.title}</a>
                </span>
                ${story.url ? `<span class="domain-text"> (<a href="${story.url}" target="_blank">${new URL(story.url).hostname.replace('www.', '')}</a>)</span>` : (story.category ? `<span class="domain-text"> (${story.category})</span>` : '')}
                <div class="story-meta mt-1 flex items-center gap-1">
                    <span>${story.likes_count || 0} points</span>
                    <span>by</span>
                    <a class="hover:underline" href="profile.html?user=${story.author}">${story.author || 'anonymous'}</a>
                    <a class="hover:underline" href="#">${timeAgo}</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">hide</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">favorite</a>
                    <span>|</span>
                    <a class="hover:underline" href="viewer.html?id=${story.id}">discuss</a>
                </div>
            </div>
        </div>
        ${story.content ? `
        <div class="text-black mt-4 ml-[17px] max-w-prose leading-relaxed text-[10pt]">
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
    const commentInputContainer = textarea?.parentElement;

    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            if (commentInputContainer) {
                commentInputContainer.innerHTML = `
                    <div class="p-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded">
                        Please <a href="login.html" class="underline font-bold">login</a> to add a comment.
                    </div>
                `;
            }
            return null;
        }
        return session.user;
    }

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const user = await checkAuth();
            if (!user) return;

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
                        user_name: user.email.split('@')[0]
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
        checkAuth(); // Check initial auth state
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

        // Upvote handling
        if (e.target.classList.contains('hn-arrow')) {
            const storyId = e.target.getAttribute('data-id');
            if (!storyId) return;

            upvoteStory(storyId).then(result => {
                if (result.error) {
                    alert(result.error);
                } else {
                    renderPage();
                }
            });
        }
    });
});
