import { supabase, calculateTimeAgo, upvoteStory, trackClick, sanitize, toggleBookmark, getUserBookmarks, incrementCommentCount, sharePost, toggleFollow } from './supabaseClient.js';
import { renderMarkdown, setupLinkPreviews } from './contentRenderer.js';

const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('id');
const slugParam = urlParams.get('s');

// Also try to get slug from path (for pretty URLs if the server supports it)
// e.g., /pulse/some-slug -> path parts: ["", "pulse", "some-slug"]
const pathParts = window.location.pathname.split('/').filter(p => p);
const slugFromPath = pathParts.length > 1 && pathParts[0] === 'pulse' ? pathParts[1] : null;

const activeSlug = slugParam || slugFromPath;
let userBookmarks = [];

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
                    <div class="cursor-default text-secondary mt-[2px]">
                        <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
                    </div>
                    <div class="w-full">
                        <div class="story-meta mb-1">
                            <a class="hover:underline text-black" href="../profile.html?user=${comment.user_name}">${sanitize(comment.user_name) || 'anonymous'}</a>
                            <a class="hover:underline ml-1" href="#" onclick="alert('Posted on ' + new Date('${comment.created_at}').toLocaleString() + ' by ${sanitize(comment.user_name) || 'anonymous'}'); return false;">${timeAgo}</a>
                            <span class="ml-1 cursor-pointer hover:underline collapse-toggle text-hn-grey">[–]</span>
                        </div>
                        <div class="text-black mb-1 text-[10pt] leading-snug comment-body pr-4" style="white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word;">
                            ${renderMarkdown(comment.comment_text)}
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

    // Load user bookmarks
    userBookmarks = await getUserBookmarks();
    const isBookmarked = userBookmarks.includes(story.id);

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
                <div class="story-meta mt-1 opacity-70">
                    <span class="text-xs">
                        by <a class="hover:underline" href="../profile.html?user=${story.author}">${sanitize(story.author) || 'anonymous'}</a> ${timeAgo} | 
                        <a class="hover:underline" href="#">hide</a> | 
                        <span class="bookmark-container inline-flex items-center">
                            <select class="folder-picker" data-id="${story.id}">
                                <option value="" disabled selected>+</option>
                                <option value="To Learn">To Learn</option>
                                <option value="Inspiration">Inspiration</option>
                                <option value="Archive">Archive</option>
                                <option value="Reading List">Reading List</option>
                            </select> 
                            <a class="hover:underline bookmark-btn" href="#" data-id="${story.id}">${isBookmarked ? 'saved' : 'save'}</a>
                        </span> | 
                        <a class="hover:underline share-btn" href="#" data-title="${cleanTitle}" data-url="${storyUrl}">share</a> | 
                        <a class="hover:underline" href="index.html?s=${story.slug}">${story.comments_count || 0} comments</a> | 
                        <a href="#add-comment" class="hover:underline">add</a>
                    </span>
                </div>
            </div>
        </div>
        ${story.content ? `
        <div class="text-gray-500 text-[10px] mt-2 ml-[17px] flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:12px;">menu_book</span> ${Math.max(1, Math.ceil((story.content.split(/\s+/).length) / 200))} min read &middot; ${story.clicks_count || 0} views
        </div>
        <div class="text-black mt-2 ml-[17px] max-w-prose leading-relaxed text-[10pt] story-content" style="white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word;">
            ${renderMarkdown(story.content)}
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
    setupLinkPreviews();

    const addBtn = document.getElementById('add-comment-btn');
    const textarea = document.getElementById('comment-input');
    const previewContainer = document.getElementById('markdown-preview');
    const previewContent = document.getElementById('preview-content');
    const commentInputContainer = textarea?.parentElement;

    // Real-time Preview logic
    if (textarea && previewContainer && previewContent) {
        textarea.addEventListener('input', () => {
            const val = textarea.value.trim();
            if (val) {
                previewContainer.classList.remove('hidden');
                previewContent.innerHTML = renderMarkdown(val);
            } else {
                previewContainer.classList.add('hidden');
            }
        });
    }

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

            addBtn.disabled = true;
            addBtn.textContent = 'posting...';

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
                addBtn.disabled = false;
                addBtn.textContent = 'add comment';
                return;
            }

            // Sync comment count on the blog
            await incrementCommentCount(window.currentStoryId);

            textarea.value = '';
            if (previewContainer) previewContainer.classList.add('hidden');
            addBtn.disabled = false;
            addBtn.textContent = 'add comment';
            renderPage();
        });
        checkAuth();
    }

    document.addEventListener('click', async (e) => {
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

        // Upvote
        if (e.target.classList.contains('hn-arrow')) {
            const id = e.target.getAttribute('data-id');
            if (!id) return;

            e.target.style.opacity = '0.3';
            e.target.style.pointerEvents = 'none';
            const result = await upvoteStory(id);
            e.target.style.pointerEvents = 'auto';

            if (result.error) {
                e.target.style.opacity = '1';
                // Show a subtle message next to arrow
                const tip = document.createElement('span');
                tip.textContent = result.error;
                tip.style.cssText = 'font-size:10px;color:#888;margin-left:4px;';
                e.target.parentElement.appendChild(tip);
                setTimeout(() => tip.remove(), 2000);
            } else {
                const metaRow = document.querySelector('.story-meta');
                if (metaRow) {
                    const currentText = metaRow.innerHTML;
                    const pointsMatch = currentText.match(/(\d+)\s+points/);
                    if (pointsMatch) {
                        let pts = parseInt(pointsMatch[1], 10);
                        if (result.action === 'added') pts++;
                        else if (result.action === 'removed') pts = Math.max(0, pts - 1);
                        metaRow.innerHTML = currentText.replace(/(\d+)\s+points/, `${pts} points`);
                    }
                }
                
                if (result.action === 'removed') {
                    const tip = document.createElement('span');
                    tip.textContent = 'Vote removed';
                    tip.style.cssText = 'font-size:10px;color:#888;margin-left:4px;';
                    e.target.parentElement.appendChild(tip);
                    setTimeout(() => tip.remove(), 2000);
                    e.target.style.visibility = 'visible';
                    e.target.style.opacity = '1';
                } else {
                    e.target.style.visibility = 'hidden';
                }
            }
        }
        
        // Folder Picker Change
        if (e.target.classList.contains('folder-picker')) {
            const select = e.target;
            const storyId = select.getAttribute('data-id');
            const folderName = select.value;
            if (!storyId || !folderName) return;

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                alert('Please login to save to folders');
                select.value = '';
                return;
            }

            // 1. Ensure it's bookmarked in Supabase
            const result = await toggleBookmark(parseInt(storyId));
            if (result.action === 'removed') {
                // Toggle back to added
                await toggleBookmark(parseInt(storyId));
            }

            // 2. Save folder mapping to localStorage
            const key = `kn-folders-${session.user.id}`;
            const mapping = JSON.parse(localStorage.getItem(key) || '{}');
            mapping[storyId] = folderName;
            localStorage.setItem(key, JSON.stringify(mapping));

            // 3. Update UI
            const bookmarkBtn = select.parentElement.querySelector('.bookmark-btn');
            if (bookmarkBtn) bookmarkBtn.textContent = 'saved';
            
            // Show subtle feedback
            const tip = document.createElement('span');
            tip.textContent = `Saved to ${folderName}`;
            tip.style.cssText = 'font-size:10px;color:#ff6600;margin-left:4px;';
            select.parentElement.appendChild(tip);
            setTimeout(() => tip.remove(), 2000);
            
            select.value = '';
        }

        // Bookmark
        if (e.target.classList.contains('bookmark-btn')) {
            e.preventDefault();
            const id = e.target.getAttribute('data-id');
            if (!id) return;

            const result = await toggleBookmark(parseInt(id));
            if (result.error) {
                const tip = document.createElement('span');
                tip.textContent = result.error;
                tip.style.cssText = 'font-size:10px;color:#888;margin-left:4px;';
                e.target.parentElement.appendChild(tip);
                setTimeout(() => tip.remove(), 2000);
            } else {
                e.target.textContent = result.action === 'added' ? 'saved' : 'save';
            }
        }

        // Share
        if (e.target.classList.contains('share-btn')) {
            e.preventDefault();
            const title = e.target.getAttribute('data-title');
            const url = e.target.getAttribute('data-url');
            const result = await sharePost(title, url);
            if (result.copied) {
                const origText = e.target.textContent;
                e.target.textContent = 'link copied!';
                setTimeout(() => { e.target.textContent = origText; }, 2000);
            }
        }

        // Boost karma from viewer
        if (e.target.classList.contains('boost-karma-pulse-btn')) {
            e.preventDefault();
            const btn = e.target;
            const author = btn.getAttribute('data-author');
            if (!author) return;

            btn.disabled = true;
            btn.style.opacity = '0.5';

            // Lookup author id
            const { data: profile } = await supabase.from('profiles').select('id').eq('username', author).maybeSingle();
            if (!profile) {
                alert('User not found.');
                btn.disabled = false;
                btn.style.opacity = '1';
                return;
            }

            const result = await toggleFollow(profile.id);
            if (result.error) {
                alert(result.error);
                btn.disabled = false;
                btn.style.opacity = '1';
            } else {
                if (result.action === 'followed') {
                    btn.classList.replace('text-gray-500', 'text-[#ff6600]');
                    btn.title = "Decrease karma";
                    btn.textContent = "[decrease karma]";
                } else {
                    btn.classList.replace('text-[#ff6600]', 'text-gray-500');
                    btn.title = "Increase karma";
                    btn.textContent = "[increase karma]";
                }
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }
    });
});
