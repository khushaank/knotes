import { supabase, calculateTimeAgo } from './supabaseClient.js';

const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('id');

async function fetchStory() {
    if (!storyId) return null;
    if (!supabase) return getDummyStory(storyId);

    const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();
    
    if (error) {
        console.error('Error fetching story:', error);
        return getDummyStory(storyId);
    }
    return data;
}

async function fetchComments() {
    if (!storyId) return [];
    if (!supabase) return getDummyComments(storyId);

    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Error fetching comments:', error);
        return getDummyComments(storyId);
    }
    return data;
}

function getDummyStory(id) {
    return {
        id,
        title: "Show HN: A minimalist design system for content-heavy sites",
        domain: "github.com/example",
        points: 245,
        author: "designnerd",
        created_at: new Date(Date.now() - 3600 * 3000).toISOString(),
        comment_count: 102,
        content: "I've been working on a design system inspired by early web aesthetics, focusing purely on typography, tight grids, and information density. It strips away modern conventions like heavy shadows, large border radii, and excessive white space.<br><br>The goal is to create high-trust environments for power users where content is the absolute priority. Would love to hear your thoughts on functionalist vs decorative design in modern web applications."
    };
}

function getDummyComments(id) {
    return [
        {
            id: 1,
            story_id: id,
            parent_id: null,
            author: "ui_critic",
            content: "This is refreshing. We've swung so far towards 'clean' design with massive padding that we've lost the ability to show a dense list of information without scrolling forever.",
            created_at: new Date(Date.now() - 3600 * 2000).toISOString()
        },
        {
            id: 2,
            story_id: id,
            parent_id: 1,
            author: "designnerd",
            content: "Exactly! Information density doesn't have to mean cluttered if the typography hierarchy is strict.",
            created_at: new Date(Date.now() - 3600 * 1000).toISOString()
        },
        {
            id: 3,
            story_id: id,
            parent_id: null,
            author: "data_fan",
            content: "How does this handle mobile viewports? The rigid grid seems like it might break down on smaller screens if you enforce strict minimum widths.",
            created_at: new Date(Date.now() - 3600 * 500).toISOString()
        }
    ];
}

function renderCommentTree(comments, parentId = null, depth = 0) {
    const children = comments.filter(c => c.parent_id === parentId);
    if (children.length === 0) return '';
    
    let html = '';
    const marginLeft = depth > 0 ? 'ml-[20px]' : '';
    
    children.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        html += `
            <div class="${marginLeft} mb-item-gap comment-node">
                <div class="flex items-start gap-1">
                    <div class="cursor-pointer text-secondary mt-[2px]">
                        <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
                    </div>
                    <div class="w-full">
                        <div class="font-meta-sm text-meta-sm text-secondary mb-1">
                            <a class="hover:underline text-on-background" href="#">${comment.author || 'anonymous'}</a>
                            <a class="hover:underline ml-1" href="#">${timeAgo}</a>
                            <span class="ml-1 cursor-pointer hover:underline collapse-toggle">[–]</span>
                        </div>
                        <div class="text-on-background mb-1 comment-body pr-4">
                            <p>${comment.content}</p>
                        </div>
                        <div class="font-meta-sm text-meta-sm text-secondary mb-3 comment-footer">
                            <a class="hover:underline reply-btn" href="javascript:void(0)" data-comment-id="${comment.id}">reply</a>
                        </div>
                    </div>
                </div>
                ${renderCommentTree(comments, comment.id, depth + 1)}
            </div>
        `;
    });
    
    return html;
}

async function renderPage() {
    if (!storyId) {
        document.querySelector('main').innerHTML = '<div class="p-4">Story not found. Try accessing from the index page.</div>';
        return;
    }

    const story = await fetchStory();
    if (!story) {
        document.querySelector('main').innerHTML = '<div class="p-4">Story not found.</div>';
        return;
    }

    // Update story header
    const timeAgo = calculateTimeAgo(story.created_at);
    document.querySelector('article').innerHTML = `
        <div class="flex items-start gap-1">
            <div class="cursor-pointer text-secondary mt-[2px]">
                <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
            </div>
            <div>
                <h1 class="font-title-md text-title-md inline">
                    <a class="text-on-background visited:text-secondary hover:underline" href="${story.url || '#'}">${story.title}</a>
                </h1>
                ${story.domain ? `<span class="font-meta-sm text-meta-sm text-secondary hover:underline cursor-pointer ml-1">(${story.domain})</span>` : ''}
                <div class="font-meta-sm text-meta-sm text-secondary mt-item-gap flex items-center gap-1">
                    <span>${story.points || 0} points</span>
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
                    <span>${story.comment_count || 0} comments</span>
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
    
    if (comments.length === 0) {
        commentsContainer.innerHTML = '<div class="mt-4 text-secondary">No comments yet.</div>';
    } else {
        commentsContainer.innerHTML = renderCommentTree(comments);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderPage();
    
    const addBtn = document.getElementById('add-comment-btn');
    const textarea = document.getElementById('comment-input');

    addBtn.addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (!content || !storyId) return;

        if (!supabase) {
            alert('Supabase is not configured yet. This is just a dummy preview!');
            return;
        }

        // Add comment to supabase
        const { data, error } = await supabase
            .from('comments')
            .insert([
                { 
                    story_id: storyId, 
                    content: content, 
                    author: 'test_user', // Hardcoded for now
                    parent_id: null 
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

    // Global click listener for delegation
    document.addEventListener('click', (e) => {
        // Handle Collapse Toggle
        if (e.target.classList.contains('collapse-toggle')) {
            const toggle = e.target;
            const commentRoot = toggle.closest('.flex.items-start').parentElement;
            const body = commentRoot.querySelector('.comment-body');
            const footer = commentRoot.querySelector('.comment-footer');
            const children = Array.from(commentRoot.children).filter(el => el.classList.contains('ml-[20px]') || el.classList.contains('comment-node'));
            
            if (toggle.innerText === '[–]') {
                toggle.innerText = '[+]';
                if (body) body.style.display = 'none';
                if (footer) footer.style.display = 'none';
                children.forEach(c => {
                    if (c !== commentRoot.querySelector('.flex.items-start')) {
                         c.style.display = 'none';
                    }
                });
            } else {
                toggle.innerText = '[–]';
                if (body) body.style.display = 'block';
                if (footer) footer.style.display = 'block';
                children.forEach(c => {
                    if (c !== commentRoot.querySelector('.flex.items-start')) {
                         c.style.display = 'block';
                    }
                });
            }
        }

        if (e.target.classList.contains('reply-btn') || e.target.innerText === 'reply') {
            e.preventDefault();
            textarea.focus();
        }
    });
});
