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

function profileHref(username) {
    return `../profile?user=${encodeURIComponent(username || '')}`;
}

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
    const fragment = document.createDocumentFragment();

    if (comments.length === 0) {
        const div = document.createElement('div');
        div.className = 'mt-4 text-secondary';
        div.textContent = 'No comments yet.';
        fragment.appendChild(div);
        return fragment;
    }

    const visibleCount = 2;
    let extraCommentsDiv = null;

    comments.forEach((comment, index) => {
        const timeAgo = calculateTimeAgo(comment.created_at);

        if (index === visibleCount) {
            extraCommentsDiv = document.createElement('div');
            extraCommentsDiv.id = 'extra-comments';
            extraCommentsDiv.className = 'hidden';
            fragment.appendChild(extraCommentsDiv);
        }

        const node = document.createElement('div');
        node.className = 'mb-2 comment-node';

        const flexDiv = document.createElement('div');
        flexDiv.className = 'flex items-start gap-1';

        const arrowDiv = document.createElement('div');
        arrowDiv.className = 'cursor-default text-secondary mt-[2px]';
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-secondary';
        arrowDiv.appendChild(arrowSpan);
        flexDiv.appendChild(arrowDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'w-full';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'story-meta opacity-70';
        
        const authorLink = document.createElement('a');
        authorLink.className = 'hover:underline text-black font-medium';
        authorLink.href = profileHref(comment.user_name);
        authorLink.textContent = comment.user_name || 'anonymous';
        metaDiv.appendChild(authorLink);

        const timeLink = document.createElement('a');
        timeLink.className = 'hover:underline mx-0.5 comment-time-link';
        timeLink.href = '#';
        timeLink.setAttribute('data-created', comment.created_at);
        timeLink.setAttribute('data-user', comment.user_name || 'anonymous');
        timeLink.textContent = timeAgo;
        metaDiv.appendChild(timeLink);

        const collapseSpan = document.createElement('span');
        collapseSpan.className = 'cursor-pointer hover:underline collapse-toggle text-hn-grey';
        collapseSpan.textContent = '[–]';
        metaDiv.appendChild(collapseSpan);

        contentDiv.appendChild(metaDiv);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'text-black mt-0.5 text-[10pt] leading-snug comment-body pr-4';
        bodyDiv.style.cssText = 'white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word;';
        bodyDiv.innerHTML = renderMarkdown(comment.comment_text).trim(); 
        contentDiv.appendChild(bodyDiv);

        const footerDiv = document.createElement('div');
        footerDiv.className = 'story-meta mt-1 comment-footer opacity-60 text-[10px]';
        const replyLink = document.createElement('a');
        replyLink.className = 'hover:underline reply-btn';
        replyLink.href = 'javascript:void(0)';
        replyLink.textContent = 'reply';
        footerDiv.appendChild(replyLink);
        contentDiv.appendChild(footerDiv);

        flexDiv.appendChild(contentDiv);
        node.appendChild(flexDiv);

        if (extraCommentsDiv) {
            extraCommentsDiv.appendChild(node);
        } else {
            fragment.appendChild(node);
        }
    });

    if (comments.length > visibleCount) {
        const moreDiv = document.createElement('div');
        moreDiv.className = 'mt-8 mb-4 flex items-center gap-4';

        const line1 = document.createElement('div');
        line1.className = 'flex-1 h-[1px] bg-gray-200';
        moreDiv.appendChild(line1);

        const btn = document.createElement('button');
        btn.id = 'show-more-comments';
        btn.className = 'group flex items-center gap-2 px-6 py-2 rounded-full border border-gray-300 bg-white text-gray-500 hover:text-[#ff6600] hover:border-[#ff6600] hover:bg-[#fffbf0] text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer shadow-sm hover:shadow-md outline-none';
        btn.setAttribute('data-more', comments.length - visibleCount);
        btn.setAttribute('data-total', comments.length);

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined transition-transform duration-200';
        icon.id = 'expand-icon';
        icon.style.fontSize = '18px';
        icon.textContent = 'expand_more';
        btn.appendChild(icon);

        const spanText = document.createElement('span');
        spanText.textContent = `View all ${comments.length} comments`;
        btn.appendChild(spanText);

        moreDiv.appendChild(btn);

        const line2 = document.createElement('div');
        line2.className = 'flex-1 h-[1px] bg-gray-200';
        moreDiv.appendChild(line2);

        fragment.appendChild(moreDiv);
    }

    return fragment;
}


async function renderPage() {
    const cacheKey = activeSlug ? `pulse-${activeSlug}` : `pulse-${storyId}`;
    const cached = getCache(cacheKey);

    // ALWAYS load user stats first so upvotes/bookmarks show up correctly
    await loadUserStats();

    if (cached) {
        renderStoryDetails(cached.data);
        if (!cached.stale) {
            // Fetch fresh comments even if story is fresh
            const comments = await fetchComments(cached.data.id);
            renderCommentsSection(comments, cached.data.id);
            document.getElementById('comment-box')?.classList.remove('hidden');
            return;
        }
    }

    const story = await fetchStory();
    if (!story) {
        const errDiv = document.createElement('div');
        errDiv.className = 'p-4';
        errDiv.appendChild(document.createTextNode('Pulse not found. '));
        const goHome = document.createElement('a');
        goHome.href = '../home';
        goHome.className = 'underline';
        goHome.textContent = 'Go home';
        errDiv.appendChild(goHome);
        const mainEl = document.querySelector('main');
        if (mainEl) mainEl.replaceChildren(errDiv);
        return;
    }

    renderStoryDetails(story);

    const comments = await fetchComments(story.id);

    renderCommentsSection(comments, story.id);
    document.getElementById('comment-box')?.classList.remove('hidden');
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

    document.querySelector('meta[name="description"]')?.setAttribute('content', cleanExcerpt);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', cleanTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', cleanExcerpt);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', storyUrl);
    document.querySelector('meta[property="twitter:title"]')?.setAttribute('content', cleanTitle);
    document.querySelector('meta[property="twitter:description"]')?.setAttribute('content', cleanExcerpt);

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

    const fragment = document.createDocumentFragment();

    const flexStart = document.createElement('div');
    flexStart.className = 'flex items-start gap-1';

    const upvote = document.createElement('div');
    upvote.className = `knotes-upvote-triangle ${isUpvoted ? 'upvoted' : ''} mt-[6px]`;
    upvote.setAttribute('data-id', story.id);
    flexStart.appendChild(upvote);

    const contentWrapper = document.createElement('div');
    
    const h1 = document.createElement('h1');
    h1.className = 'story-title text-lg font-bold leading-tight';
    const titleLink = document.createElement('a');
    titleLink.className = 'hover:underline';
    titleLink.href = story.url || '#';
    titleLink.textContent = story.title;
    h1.appendChild(titleLink);
    contentWrapper.appendChild(h1);

    if (story.url) {
        const domainSpan = document.createElement('span');
        domainSpan.className = 'domain-text text-sm';
        domainSpan.appendChild(document.createTextNode(' ('));
        const domainLink = document.createElement('a');
        domainLink.href = story.url;
        domainLink.target = '_blank';
        domainLink.rel = 'noopener noreferrer';
        try {
            domainLink.textContent = new URL(story.url).hostname.replace('www.', '');
        } catch {
            domainLink.textContent = story.url;
        }
        domainSpan.appendChild(domainLink);
        domainSpan.appendChild(document.createTextNode(')'));
        contentWrapper.appendChild(domainSpan);
    } else if (story.category) {
        const catSpan = document.createElement('span');
        catSpan.className = 'domain-text text-sm';
        catSpan.textContent = ` (${story.category})`;
        contentWrapper.appendChild(catSpan);
    }

    const metaDiv = document.createElement('div');
    metaDiv.className = 'story-meta mt-1';
    
    const metaSpan = document.createElement('span');
    metaSpan.className = 'text-xs';
    
    const pointsSpan = document.createElement('span');
    pointsSpan.className = 'points-count';
    pointsSpan.textContent = `${story.likes_count || 0} points`;
    metaSpan.appendChild(pointsSpan);
    
    metaSpan.appendChild(document.createTextNode(' by '));
    const authorLink = document.createElement('a');
    authorLink.className = 'hover:underline';
    authorLink.href = profileHref(story.author);
    authorLink.textContent = story.author || 'anonymous';
    metaSpan.appendChild(authorLink);

    metaSpan.appendChild(document.createTextNode(` | ${timeAgo} | `));

    const hideLink = document.createElement('a');
    hideLink.className = 'hover:underline';
    hideLink.href = '../home';
    hideLink.textContent = 'hide';
    metaSpan.appendChild(hideLink);
    metaSpan.appendChild(document.createTextNode(' | '));

    const bookmarkContainer = document.createElement('span');
    bookmarkContainer.className = 'bookmark-container inline-block';
    
    const dropdownSpan = document.createElement('span');
    dropdownSpan.className = 'knotes-dropdown inline-block';
    dropdownSpan.setAttribute('data-id', story.id);
    
    const btn = document.createElement('button');
    btn.className = `knotes-dropdown-trigger ${isBookmarked ? 'saved' : ''}`;
    btn.title = isBookmarked ? 'Saved to list' : 'Add to list';
    btn.textContent = isBookmarked ? 'saved' : '+';
    dropdownSpan.appendChild(btn);

    const menu = document.createElement('div');
    menu.className = 'knotes-dropdown-menu hidden';
    
    ['To Learn', 'Inspiration', 'Archive', 'Reading List'].forEach(f => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.setAttribute('data-folder', f);
        item.textContent = f;
        menu.appendChild(item);
    });

    if (isBookmarked) {
        const divider = document.createElement('div');
        divider.className = 'dropdown-divider border-t border-gray-100 my-1';
        menu.appendChild(divider);

        const unsave = document.createElement('div');
        unsave.className = 'dropdown-item text-red-500 font-medium';
        unsave.setAttribute('data-folder', 'unsave');
        unsave.textContent = 'Unsave';
        menu.appendChild(unsave);
    }
    
    dropdownSpan.appendChild(menu);
    bookmarkContainer.appendChild(dropdownSpan);
    metaSpan.appendChild(bookmarkContainer);
    metaSpan.appendChild(document.createTextNode(' | '));

    const shareLink = document.createElement('a');
    shareLink.className = 'hover:underline share-btn';
    shareLink.href = '#';
    shareLink.setAttribute('data-title', story.title || '');
    shareLink.setAttribute('data-url', storyUrl);
    shareLink.textContent = 'share';
    metaSpan.appendChild(shareLink);
    metaSpan.appendChild(document.createTextNode(' | '));

    const commentLink = document.createElement('a');
    commentLink.className = 'hover:underline';
    commentLink.href = `home?s=${story.slug || ''}`;
    commentLink.textContent = `${story.comments_count || 0} comments`;
    metaSpan.appendChild(commentLink);
    metaSpan.appendChild(document.createTextNode(' | '));

    const addLink = document.createElement('a');
    addLink.className = 'hover:underline add-comment-link';
    addLink.href = '#comment-input';
    addLink.textContent = 'add';
    metaSpan.appendChild(addLink);

    metaDiv.appendChild(metaSpan);
    contentWrapper.appendChild(metaDiv);
    flexStart.appendChild(contentWrapper);
    fragment.appendChild(flexStart);

    if (story.content) {
        const readStats = document.createElement('div');
        readStats.className = 'text-gray-500 text-[10px] mt-2 ml-[17px] flex items-center gap-1';
        const bookIcon = document.createElement('span');
        bookIcon.className = 'material-symbols-outlined';
        bookIcon.style.fontSize = '12px';
        bookIcon.textContent = 'menu_book';
        readStats.appendChild(bookIcon);
        const mins = Math.max(1, Math.ceil((story.content.split(/\s+/).length) / 200));
        readStats.appendChild(document.createTextNode(` ${mins} min read \u00B7 ${story.clicks_count || 0} views`));
        fragment.appendChild(readStats);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'text-black mt-2 ml-[17px] max-w-prose leading-relaxed text-[10pt] story-content';
        contentDiv.style.cssText = 'white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word;';
        contentDiv.innerHTML = renderMarkdown(story.content).trim();
        fragment.appendChild(contentDiv);
    }

    articleEl.replaceChildren(fragment);
    window.currentStoryId = story.id;
}

function renderCommentsSection(comments, blogId) {
    const commentsListEl = document.getElementById('comments-container');
    if (commentsListEl) {
        commentsListEl.replaceChildren(renderCommentList(comments));
    }
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
    renderPage();


    const addBtn = document.getElementById('add-comment-btn');
    const textarea = document.getElementById('comment-input');

    const commentInputContainer = textarea?.parentElement;



    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            if (commentInputContainer) {
                const notice = document.createElement('div');
                notice.className = 'w-full max-w-2xl p-4 bg-yellow-50 dark:bg-stone-900 border border-yellow-200 dark:border-stone-800 text-yellow-800 dark:text-yellow-200 rounded text-sm shadow-sm';
                notice.appendChild(document.createTextNode('Please '));
                const loginLink = document.createElement('a');
                loginLink.href = '../login';
                loginLink.className = 'underline font-bold text-[#ff6600] hover:text-[#e65c00]';
                loginLink.textContent = 'login';
                notice.appendChild(loginLink);
                notice.appendChild(document.createTextNode(' to add a comment.'));
                commentInputContainer.replaceChildren(notice);
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

        if (e.target.classList.contains('reply-btn') || e.target.classList.contains('add-comment-link')) {
            e.preventDefault();
            const activeTextarea = document.getElementById('comment-input');
            if (activeTextarea) {
                activeTextarea.scrollIntoView({ behavior: 'smooth' });
                activeTextarea.focus();
            } else {
                const container = document.getElementById('comment-box');
                if (container) {
                    container.scrollIntoView({ behavior: 'smooth' });
                }
            }
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
                    const pointsSpan = metaRow.querySelector('.points-count');
                    if (pointsSpan) {
                        let pts = parseInt(pointsSpan.textContent, 10) || 0;
                        if (result.action === 'added') pts++;
                        else if (result.action === 'removed') pts = Math.max(0, pts - 1);
                        pointsSpan.textContent = `${pts} points`;
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
            const storyId = parseInt(dropdown.getAttribute('data-id'));
            const trigger = dropdown.querySelector('.knotes-dropdown-trigger');
            const menu = dropdown.querySelector('.knotes-dropdown-menu');

            if (!storyId || !folderName) return;

            menu.classList.add('hidden');

            if (folderName === 'unsave') {
                trigger.textContent = '+';
                trigger.classList.remove('saved');
                showInlineMsg(trigger, 'Removed');

                const unsaveOpt = menu.querySelector('[data-folder="unsave"]');
                if (unsaveOpt) unsaveOpt.remove();
                const divider = menu.querySelector('.dropdown-divider');
                if (divider) divider.remove();

                menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold'));

                const idx = userBookmarks.indexOf(storyId);
                if (idx > -1) userBookmarks.splice(idx, 1);

                const userId = (await supabase.auth.getSession()).data.session?.user?.id;
                if (userId) {
                    const key = `kn-folders-${userId}`;
                    const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                    delete mapping[storyId];
                    localStorage.setItem(key, JSON.stringify(mapping));
                }

                toggleBookmark(storyId).catch(err => {
                    console.error('Failed to unsave:', err);
                });
            } else {
                trigger.textContent = 'saved';
                trigger.classList.add('saved');
                showInlineMsg(trigger, `Added to ${folderName}`);

                if (!userBookmarks.includes(storyId)) {
                    userBookmarks.push(storyId);
                }

                const userId = (await supabase.auth.getSession()).data.session?.user?.id;
                if (userId) {
                    const key = `kn-folders-${userId}`;
                    const mapping = JSON.parse(localStorage.getItem(key) || '{}');
                    mapping[storyId] = folderName;
                    localStorage.setItem(key, JSON.stringify(mapping));
                }

                toggleBookmark(storyId).catch(err => {
                    console.error('Failed to save:', err);
                });

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

                menu.querySelectorAll('.dropdown-item').forEach(i => {
                    if (i.getAttribute('data-folder') === folderName) {
                        i.classList.add('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    } else {
                        i.classList.remove('bg-orange-50', 'text-[#ff6600]', 'font-bold');
                    }
                });
            }
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

            const { data: profile } = await supabase.from('public_profiles').select('id').eq('username', author).maybeSingle();
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
