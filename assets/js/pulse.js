import { supabase, calculateTimeAgo, upvoteStory, trackClick, sanitize } from './supabaseClient.js';

const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('id');
const slugParam = urlParams.get('s');

// Also try to get slug from path (for pretty URLs if the server supports it)
// e.g., /pulse/some-slug -> path parts: ["", "pulse", "some-slug"]
const pathParts = window.location.pathname.split('/').filter(p => p);
const slugFromPath = pathParts.length > 1 && pathParts[0] === 'pulse' ? pathParts[1] : null;

const activeSlug = slugParam || slugFromPath;

async function fetchStory() {
    if (!supabase) return null;

    let query = supabase.from('blogs').select('*');

    if (storyId) {
        query = query.eq('id', storyId);
    } else if (activeSlug) {
        query = query.eq('slug', activeSlug);
    } else {
        return null;
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
        return null;
    }
    return data;
}

async function fetchComments(blogId) {
    if (!blogId) return [];
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('blog_id', blogId)
        .order('created_at', { ascending: false });

    if (error) {
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
                            <a class="hover:underline text-black" href="../profile.html?user=${comment.user_name}">${sanitize(comment.user_name) || 'anonymous'}</a>
                            <a class="hover:underline ml-1" href="#">${timeAgo}</a>
                            <span class="ml-1 cursor-pointer hover:underline collapse-toggle text-hn-grey">[–]</span>
                        </div>
                        <div class="text-black mb-1 text-[10pt] leading-snug comment-body pr-4">
                            <p>${sanitize(comment.comment_text)}</p>
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
    const story = await fetchStory();
    if (!story) {
        document.querySelector('main').innerHTML = '<div class="p-4">Pulse not found. <a href="../index.html" class="underline">Go home</a></div>';
        return;
    }

    trackClick(story.id);

    // Update SEO Meta Tags
    const cleanTitle = sanitize(story.title);
    const cleanExcerpt = sanitize(story.excerpt || story.content || '').substring(0, 160);
    const storyUrl = window.location.href;

    document.title = `${cleanTitle} | K. Notes`;
    
    document.querySelector('meta[name="description"]')?.setAttribute('content', cleanExcerpt);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', cleanTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', cleanExcerpt);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', storyUrl);
    document.querySelector('meta[property="twitter:title"]')?.setAttribute('content', cleanTitle);
    document.querySelector('meta[property="twitter:description"]')?.setAttribute('content', cleanExcerpt);

    // Add JSON-LD Structured Data
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": cleanTitle,
        "description": cleanExcerpt,
        "author": {
            "@type": "Person",
            "name": sanitize(story.author) || 'anonymous'
        },
        "datePublished": story.published_at,
        "dateModified": story.updated_at || story.published_at,
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": storyUrl
        }
    };

    let script = document.getElementById('json-ld');
    if (!script) {
        script = document.createElement('script');
        script.id = 'json-ld';
        script.type = 'application/ld+json';
        document.head.appendChild(script);
    }
    script.text = JSON.stringify(jsonLd);

    // Update story header with h1 for better SEO
    const timeAgo = calculateTimeAgo(story.published_at);
    document.querySelector('article').innerHTML = `
        <div class="flex items-start gap-1">
            <div class="hn-arrow mt-[6px]" data-id="${story.id}"></div>
            <div>
                <h1 class="story-title text-lg font-bold leading-tight">
                    <a class="hover:underline" href="${story.url || '#'}">${cleanTitle}</a>
                </h1>
                ${story.url ? `<span class="domain-text text-sm"> (<a href="${story.url}" target="_blank">${sanitize(new URL(story.url).hostname.replace('www.', ''))}</a>)</span>` : (story.category ? `<span class="domain-text text-sm"> (${sanitize(story.category)})</span>` : '')}
                <div class="story-meta mt-1 flex items-center gap-1 text-xs">
                    <span>${story.likes_count || 0} points</span>
                    <span>by</span>
                    <a class="hover:underline" href="../profile.html?user=${story.author}">${sanitize(story.author) || 'anonymous'}</a>
                    <a class="hover:underline" href="#">${timeAgo}</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">hide</a>
                    <span>|</span>
                    <a class="hover:underline" href="#">favorite</a>
                    <span>|</span>
                    <a class="hover:underline" href="index.html?s=${story.slug}">discuss</a>
                </div>
            </div>
        </div>
        ${story.content ? `
        <div class="text-black mt-4 ml-[17px] max-w-prose leading-relaxed text-[10pt] story-content">
            <p>${sanitize(story.content)}</p>
        </div>` : ''}
    `;

    const commentsContainer = document.getElementById('comments-container');
    const comments = await fetchComments(story.id);
    commentsContainer.innerHTML = renderCommentList(comments);

    // Set storyId for the add comment logic
    window.currentStoryId = story.id;
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
                        Please <a href="../login.html" class="underline font-bold">login</a> to add a comment.
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
            if (!content || !window.currentStoryId) return;

            if (!supabase) {
                alert('Supabase is not configured yet!');
                return;
            }

            const { error } = await supabase
                .from('comments')
                .insert([
                    {
                        blog_id: window.currentStoryId,
                        comment_text: content,
                        user_name: user.email.split('@')[0],
                        user_id: user.id
                    }
                ]);

            if (error) {
                alert('Failed to add comment.');
                return;
            }

            textarea.value = '';
            renderPage();
        });
        checkAuth();
    }

    document.addEventListener('click', (e) => {
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

        if (e.target.classList.contains('reply-btn')) {
            e.preventDefault();
            if (textarea) textarea.focus();
        }

        if (e.target.classList.contains('hn-arrow')) {
            const id = e.target.getAttribute('data-id');
            if (!id) return;

            upvoteStory(id).then(result => {
                if (result.error) alert(result.error);
                else renderPage();
            });
        }
    });
});
