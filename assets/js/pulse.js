import { supabase, calculateTimeAgo, upvoteStory, trackClick, sanitize, toggleBookmark, getUserBookmarks, getUserLikes, incrementCommentCount, sharePost, toggleFollow, getCache, setCache } from './supabaseClient.js';
import { renderMarkdown } from './contentRenderer.js';

const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('id');
const slugParam = urlParams.get('s');

const pathParts = window.location.pathname.split('/').filter(p => p);
const slugFromPath = pathParts.length > 1 && pathParts[0] === 'pulse' ? pathParts[1] : null;

const activeSlug = slugParam || slugFromPath;
let userBookmarks = [];
let userLikes = [];

async function fetchStory() {
    if (!supabase) return null;

    const cacheKey = activeSlug ? `pulse-${activeSlug}` : `pulse-${storyId}`;
    const cached = getCache(cacheKey);

    if (cached && !cached.stale) {
        return cached.data;
    }

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

    if (data) {
        setCache(cacheKey, data, 1000 * 60 * 10);
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
    const visibleCount = 2;

    comments.forEach((comment, index) => {
        const timeAgo = calculateTimeAgo(comment.created_at);

        if (index === visibleCount) {
            html += `<div id="extra-comments" class="hidden">`;
        }

        html += `
            <div class="mb-2 comment-node">
                <div class="flex items-start gap-1">
                    <div class="cursor-default text-secondary mt-[2px]">
                        <span class="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary"></span>
                    </div>
                    <div class="w-full">
                        <div class="story-meta opacity-70">
                            <a class="hover:underline text-black font-medium" href="../profile.html?user=${comment.user_name}">${sanitize(comment.user_name) || 'anonymous'}</a>
                            <a class="hover:underline mx-0.5 comment-time-link" href="#" data-created="${comment.created_at}" data-user="${sanitize(comment.user_name) || 'anonymous'}">${timeAgo}</a>
                            <span class="cursor-pointer hover:underline collapse-toggle text-hn-grey">[–]</span>
                        </div>
                        <div class="text-black mt-0.5 text-[10pt] leading-snug comment-body pr-4" style="white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word;">${renderMarkdown(comment.comment_text).trim()}</div>
                        <div class="story-meta mt-1 comment-footer opacity-60 text-[10px]">
                            <a class="hover:underline reply-btn" href="javascript:void(0)">reply</a>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (index >= visibleCount && index === comments.length - 1) {
            html += `</div>`;
        }
    });

    if (comments.length > visibleCount) {
        html += `
            <div class="mt-8 mb-4 flex items-center gap-4">
                <div class="flex-1 h-[1px] bg-gray-200"></div>
                <button id="show-more-comments" class="group flex items-center gap-2 px-6 py-2 rounded-full border border-gray-300 bg-white text-gray-500 hover:text-[#ff6600] hover:border-[#ff6600] hover:bg-[#fffbf0] text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer shadow-sm hover:shadow-md outline-none" data-more="${comments.length - visibleCount}" data-total="${comments.length}">
                    <span class="material-symbols-outlined transition-transform duration-200" id="expand-icon" style="font-size: 18px;">expand_more</span>
                    <span>View all ${comments.length} comments</span>
                </button>
                <div class="flex-1 h-[1px] bg-gray-200"></div>
            </div>
        `;
    }

    return html;
}


async function renderPage() {
    const cacheKey = activeSlug ? `pulse-${activeSlug}` : `pulse-${storyId}`;
    const cached = getCache(cacheKey);

    if (cached) {
        renderStoryDetails(cached.data);
        if (!cached.stale) {
            // Fetch fresh comments even if story is fresh
            const comments = await fetchComments(cached.data.id);
            renderCommentsSection(comments, cached.data.id);
            loadUserStats(); // Background refresh
            return;
        }
    }

    const story = await fetchStory();
    if (!story) {
        document.querySelector('main').innerHTML = '<div class="p-4">Pulse not found. <a href="../index.html" class="underline">Go home</a></div>';
        return;
    }

    renderStoryDetails(story);

    const [comments] = await Promise.all([
        fetchComments(story.id),
        loadUserStats()
    ]);

    renderCommentsSection(comments, story.id);
}

async function loadUserStats() {
    [userBookmarks, userLikes] = await Promise.all([
        getUserBookmarks(),
        getUserLikes()
    ]);
}

function renderStoryDetails(story) {
    trackClick(story.id);

    const cleanTitle = sanitize(story.title);
    const cleanExcerpt = sanitize(story.excerpt || story.content || '').substring(0, 160);
    const storyUrl = window.location.href;

    document.title = `${cleanTitle} | K. Notes`;

    // SEO updates
    document.querySelector('meta[name="description"]')?.setAttribute('content', cleanExcerpt);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', cleanTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', cleanExcerpt);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', storyUrl);
    document.querySelector('meta[property="twitter:title"]')?.setAttribute('content', cleanTitle);
    document.querySelector('meta[property="twitter:description"]')?.setAttribute('content', cleanExcerpt);

    // JSON-LD
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

    const isBookmarked = userBookmarks.includes(story.id);
    const isUpvoted = userLikes.includes(story.id);
    const timeAgo = calculateTimeAgo(story.published_at);

    const articleEl = document.querySelector('article');
    if (!articleEl) return;

    articleEl.innerHTML = `
        <div class="flex items-start gap-1">
            <div class="knotes-upvote-triangle ${isUpvoted ? 'upvoted' : ''} mt-[6px]" data-id="${story.id}"></div>
            <div>
                <h1 class="story-title text-lg font-bold leading-tight">
                    <a class="hover:underline" href="${story.url || '#'}">${cleanTitle}</a>
                </h1>
                ${story.url ? `<span class="domain-text text-sm"> (<a href="${story.url}" target="_blank">${sanitize(new URL(story.url).hostname.replace('www.', ''))}</a>)</span>` : (story.category ? `<span class="domain-text text-sm"> (${sanitize(story.category)})</span>` : '')}
                <div class="story-meta mt-1">
                    <span class="text-xs">
                        by <a class="hover:underline" href="../profile.html?user=${story.author}">${sanitize(story.author) || 'anonymous'}</a> | 
                        ${timeAgo} | 
                        <a class="hover:underline" href="#">hide</a> | 
                        <span class="bookmark-container inline-block">
                            <span class="knotes-dropdown inline-block" data-id="${story.id}">
                                <button class="knotes-dropdown-trigger ${isBookmarked ? 'saved' : ''}" title="${isBookmarked ? 'Saved to list' : 'Add to list'}">
                                    ${isBookmarked ? 'saved' : '+'}
                                </button>
                                <div class="knotes-dropdown-menu hidden">
                                    <div class="dropdown-item" data-folder="To Learn">To Learn</div>
                                    <div class="dropdown-item" data-folder="Inspiration">Inspiration</div>
                                    <div class="dropdown-item" data-folder="Archive">Archive</div>
                                    <div class="dropdown-item" data-folder="Reading List">Reading List</div>
                                    ${isBookmarked ? '<div class="dropdown-divider border-t border-gray-100 my-1"></div><div class="dropdown-item text-red-500 font-medium" data-folder="unsave">Unsave</div>' : ''}
                                </div>
                            </span>
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
        <div class="text-black mt-2 ml-[17px] max-w-prose leading-relaxed text-[10pt] story-content" style="white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word;">${renderMarkdown(story.content).trim()}</div>` : ''}
    `;

    window.currentStoryId = story.id;
}

function renderCommentsSection(comments, blogId) {
    const commentsListEl = document.getElementById('comments-container');
    if (commentsListEl) {
        commentsListEl.innerHTML = renderCommentList(comments);
    }
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

            addBtn.disabled = true;
            addBtn.textContent = 'posting...';

            try {
                const { data: comment, error } = await supabase
                    .from('comments')
                    .insert({
                        blog_id: window.currentStoryId,
                        comment_text: content,
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .maybeSingle();

                if (error) {
                    alert('Failed to post comment: ' + error.message);
                    addBtn.disabled = false;
                    addBtn.textContent = 'add comment';
                    return;
                }

                await incrementCommentCount(window.currentStoryId);

                textarea.value = '';
                addBtn.disabled = false;
                addBtn.textContent = 'add comment';
                renderPage();
            } catch (err) {
                alert('An unexpected error occurred. Please try again.');
                addBtn.disabled = false;
                addBtn.textContent = 'add comment';
            }
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

        if (e.target.classList.contains('comment-time-link')) {
            e.preventDefault();
            const created = e.target.getAttribute('data-created');
            const user = e.target.getAttribute('data-user');
            if (created) {
                alert('Posted on ' + new Date(created).toLocaleString() + ' by ' + (user || 'anonymous'));
            }
        }

        if (e.target.classList.contains('knotes-upvote-triangle')) {
            const id = e.target.getAttribute('data-id');
            if (!id) return;

            e.target.style.opacity = '0.3';
            e.target.style.pointerEvents = 'none';
            const result = await upvoteStory(id);
            e.target.style.pointerEvents = 'auto';

            if (result.error) {
                e.target.style.opacity = '1';
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
                    e.target.classList.remove('upvoted');
                    e.target.style.opacity = '1';
                } else {
                    e.target.classList.add('upvoted');
                    e.target.style.opacity = '1';
                }
            }
        }

        if (e.target.classList.contains('knotes-dropdown-trigger')) {
            e.preventDefault();
            const dropdown = e.target.closest('.knotes-dropdown');
            const menu = dropdown.querySelector('.knotes-dropdown-menu');
            document.querySelectorAll('.knotes-dropdown-menu').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
            return;
        }

        if (e.target.classList.contains('dropdown-item')) {
            const item = e.target;
            const folderName = item.getAttribute('data-folder');
            const dropdown = item.closest('.knotes-dropdown');
            const storyId = dropdown.getAttribute('data-id');
            const trigger = dropdown.querySelector('.knotes-dropdown-trigger');
            const menu = dropdown.querySelector('.knotes-dropdown-menu');

            if (!storyId || !folderName) return;

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showInlineMsg(trigger, 'Please login');
                menu.classList.add('hidden');
                return;
            }

            if (folderName === 'unsave') {
                await toggleBookmark(parseInt(storyId));
                const key = `kn-folders-${session.user.id}`;
                const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                delete mapping[storyId];
                localStorage.setItem(key, JSON.stringify(mapping));

                trigger.textContent = '+';
                trigger.classList.remove('saved');
                item.remove();
                showInlineMsg(trigger, 'Removed');
                const idx = userBookmarks.indexOf(parseInt(storyId));
                if (idx > -1) userBookmarks.splice(idx, 1);
            } else {
                if (!userBookmarks.includes(parseInt(storyId))) {
                    await toggleBookmark(parseInt(storyId));
                    userBookmarks.push(parseInt(storyId));
                }

                const key = `kn-folders-${session.user.id}`;
                const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                mapping[storyId] = folderName;
                localStorage.setItem(key, JSON.stringify(mapping));

                trigger.textContent = 'saved';
                trigger.classList.add('saved');

                // Add Unsave option if not present
                if (!menu.querySelector('[data-folder="unsave"]')) {
                    const divider = document.createElement('div');
                    divider.className = 'dropdown-divider border-t border-gray-100 my-1';
                    menu.appendChild(divider);

                    const opt = document.createElement('div');
                    opt.className = 'dropdown-item text-red-500 font-medium';
                    opt.setAttribute('data-folder', 'unsave');
                    opt.textContent = 'Unsave';
                    menu.appendChild(opt);
                }

                // Highlight selected folder
                menu.querySelectorAll('.dropdown-item').forEach(i => {
                    if (i.getAttribute('data-folder') === folderName) {
                        i.classList.add('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    } else {
                        i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    }
                });

                showInlineMsg(trigger, `Added to ${folderName}`);
            }
            menu.classList.add('hidden');
            return;
        }

        if (!e.target.closest('.knotes-dropdown')) {
            document.querySelectorAll('.knotes-dropdown-menu').forEach(m => m.classList.add('hidden'));
        }
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

        if (e.target.closest('#show-more-comments')) {
            const btn = e.target.closest('#show-more-comments');
            const extraComments = document.getElementById('extra-comments');
            const icon = btn.querySelector('#expand-icon');
            const text = btn.querySelector('span:not(.material-symbols-outlined)');
            const totalCount = btn.getAttribute('data-total');

            if (extraComments.classList.contains('hidden')) {
                extraComments.classList.remove('hidden');
                icon.style.transform = 'rotate(180deg)';
                text.textContent = 'Hide comments';
            } else {
                extraComments.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
                text.textContent = `View all ${totalCount} comments`;
            }
        }

        if (e.target.classList.contains('boost-karma-pulse-btn')) {
            e.preventDefault();
            const btn = e.target;
            const author = btn.getAttribute('data-author');
            if (!author) return;

            btn.disabled = true;
            btn.style.opacity = '0.5';

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
