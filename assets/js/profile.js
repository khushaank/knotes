import { supabase, calculateTimeAgo, sanitize, getBookmarkedPosts, toggleFollow, isFollowing, getFollowerCount, getFollowingCount, uploadAvatar, deleteAvatar, deleteStory, listUserMedia, uploadMediaFile, getUserComments, updateComment, deleteComment, getFollowingList, getFollowersList } from './supabaseClient.js';

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(async () => {
    const profileContainer = document.getElementById('profile-container');
    const profileLoading = document.getElementById('profile-loading');
    const authMessage = document.getElementById('auth-message');
    const usernameEl = document.getElementById('profile-username');
    const createdEl = document.getElementById('profile-created');
    const karmaEl = document.getElementById('profile-karma');
    const postsCountEl = document.getElementById('profile-posts-count');
    const followingCountEl = document.getElementById('profile-following-count');
    const profileLinkPill = document.getElementById('profile-link-pill');
    const shareProfileBtn = document.getElementById('btn-share-profile');
    const aboutInput = document.getElementById('profile-about');
    const updateBtn = document.getElementById('btn-update-profile');
    const submissionsEl = document.getElementById('profile-submissions');
    const avatarEl = document.getElementById('profile-avatar');
    const followBtn = document.getElementById('follow-btn');
    const avatarEditBtn = document.getElementById('avatar-edit-btn');
    const avatarMenu = document.getElementById('avatar-menu');
    const avatarFileInput = document.getElementById('avatar-file-input');
    const privacyContainer = document.getElementById('profile-privacy-container');
    const isPublicCheckbox = document.getElementById('profile-is-public');
    const usernameEditBtn = document.getElementById('btn-edit-username');
    const usernameInputWrapper = document.getElementById('username-input-wrapper');
    const usernameInput = document.getElementById('username-input');
    const usernameSaveBtn = document.getElementById('btn-save-username');
    const usernameCancelBtn = document.getElementById('btn-cancel-username');
    const usernameError = document.getElementById('username-error');
    const usernameHint = document.getElementById('username-hint');
    const logoutBtn = document.getElementById('btn-logout-profile');

    function showProfileContainer() {
        if (profileLoading) profileLoading.classList.add('hidden');
        profileContainer.classList.remove('hidden');
    }

    function showAuthMessage() {
        if (profileLoading) profileLoading.classList.add('hidden');
        authMessage.classList.remove('hidden');
    }

    function goToNotFound() {
        window.location.replace('404.html');
    }

    function isValidUsername(username) {
        return /^[a-z0-9_.-]{3,40}$/i.test(username || '');
    }

    if (!supabase) {
        if (profileLoading) profileLoading.textContent = 'Could not load profile right now.';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const viewingUser = urlParams.get('user');

    const { data: { session } } = await supabase.auth.getSession();

    setupTabs();
    setupShareButton();

    if (viewingUser) {
        if (!isValidUsername(viewingUser)) {
            goToNotFound();
            return;
        }
        showProfileContainer();

        if (aboutInput) aboutInput.disabled = true;
        if (updateBtn) updateBtn.style.display = 'none';

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', viewingUser)
            .maybeSingle();

        if (!profile) {
            goToNotFound();
            return;
        }

        const isOwnProfile = session && session.user.id === profile.id;

        if (isOwnProfile) {
            if (aboutInput) aboutInput.disabled = false;
            if (updateBtn) updateBtn.style.display = '';
            document.getElementById('tab-saved')?.classList.remove('hidden');
            if (privacyContainer) privacyContainer.style.display = '';
            setupAvatarEdit(profile);
            setupMediaLibrary();
            setupLogoutButton();
            await loadSubscriptions(profile.id);
        } else if (session) {
            followBtn.classList.remove('hidden');
            setupFollowButton(profile.id);
        }

        await setProfileData(profile, isOwnProfile);
        await loadSubmissions(profile.username, isOwnProfile);

        if (isOwnProfile) {
            setupUpdateButton(session.user.id);
        }



        return;
    }
    if (!session) {
        showAuthMessage();
        return;
    }

    showProfileContainer();

    const userId = session.user.id;
    const userEmail = session.user.email;
    const defaultUsername = userEmail.split('@')[0];

    let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (!profile) {
        const { generateUniqueUsername } = await import('./supabaseClient.js');
        const uniqueUsername = await generateUniqueUsername(userEmail);

        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ id: userId, username: uniqueUsername, email: userEmail }])
            .select()
            .single();

        if (!insertError) {
            profile = newProfile;
        }
    }

    if (profile) {
        await setProfileData(profile, true);
        setupAvatarEdit(profile);
        setupLogoutButton();
        if (privacyContainer) privacyContainer.style.display = '';
    } else {
        usernameEl.textContent = defaultUsername;
        setAvatarLetter(defaultUsername);
    }

    await loadSubmissions(profile?.username || defaultUsername, true);
    await loadBookmarks();
    await loadComments(userId);
    await loadSubscriptions(userId);
    await loadHiddenStories();
    setupUpdateButton(userId);
    setupMediaLibrary();
    document.getElementById('tab-comments')?.classList.remove('hidden');

    async function setProfileData(p, isOwn) {
        usernameEl.textContent = p.username;
        document.title = `${p.username}'s Profile - K. Notes`;
        createdEl.textContent = new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        if (aboutInput) aboutInput.value = p.about || '';
        if (profileLinkPill) profileLinkPill.textContent = `@${p.username}`;
        if (shareProfileBtn) shareProfileBtn.dataset.profileUrl = getProfileUrl(p.username);

        if (p.avatar_url) {
            setAvatarImage(p.avatar_url, p.username);
        } else {
            setAvatarLetter(p.username);
        }

        const followers = await getFollowerCount(p.id);
        if (karmaEl) karmaEl.textContent = followers;
        const following = await getFollowingCount(p.id);
        if (followingCountEl) followingCountEl.textContent = following;

        if (isPublicCheckbox && p.is_public !== undefined) {
            isPublicCheckbox.checked = p.is_public === true;
        }

        if (isOwn) {
            setupUsernameEdit(p);
            const creatorBtn = document.getElementById('btn-creator-dashboard');
            if (creatorBtn) creatorBtn.style.display = 'inline-flex';
        }
    }

    function setupLogoutButton() {
        if (!logoutBtn) return;
        logoutBtn.style.display = 'inline-flex';
        if (logoutBtn.dataset.bound === 'true') return;
        logoutBtn.dataset.bound = 'true';

        logoutBtn.addEventListener('click', async () => {
            logoutBtn.disabled = true;
            logoutBtn.style.opacity = '0.65';
            try {
                sessionStorage.removeItem('kn-auth-cache');
                await supabase.auth.signOut();
            } finally {
                window.location.href = 'index.html';
            }
        });
    }

    function getProfileUrl(username) {
        const url = new URL('profile.html', window.location.href);
        url.searchParams.set('user', username);
        return url.href;
    }

    function setupShareButton() {
        if (!shareProfileBtn) return;
        shareProfileBtn.addEventListener('click', async () => {
            const url = shareProfileBtn.dataset.profileUrl || window.location.href;
            const oldText = shareProfileBtn.lastChild?.textContent || 'Share profile';
            try {
                if (navigator.share) {
                    await navigator.share({
                        title: document.title,
                        url
                    });
                } else {
                    await navigator.clipboard.writeText(url);
                    shareProfileBtn.lastChild.textContent = 'Copied';
                    setTimeout(() => {
                        shareProfileBtn.lastChild.textContent = oldText;
                    }, 1500);
                }
            } catch { }
        });
    }

    function setupUsernameEdit(profile) {
        if (!usernameEditBtn) return;
        usernameEditBtn.classList.remove('hidden');

        const currentYear = new Date().getFullYear();
        const changesCount = profile.username_changes_count || 0;
        const lastChangeDate = profile.last_username_change_at ? new Date(profile.last_username_change_at) : null;

        let canChange = true;
        if (lastChangeDate && lastChangeDate.getFullYear() === currentYear && changesCount >= 2) {
            canChange = false;
        }

        usernameEditBtn.addEventListener('click', () => {
            if (!canChange) {
                usernameError.textContent = "You've already changed your username twice this year. Try again in " + (currentYear + 1) + ".";
                usernameError.classList.remove('hidden');
                setTimeout(() => usernameError.classList.add('hidden'), 5000);
                return;
            }
            usernameInputWrapper.classList.remove('hidden');
            document.getElementById('username-edit-container').classList.add('hidden');
            usernameInput.value = profile.username;
            usernameInput.focus();
            usernameHint.textContent = `You have used ${lastChangeDate && lastChangeDate.getFullYear() === currentYear ? changesCount : 0}/2 changes this year.`;
            usernameHint.classList.remove('hidden');
        });

        usernameCancelBtn.addEventListener('click', () => {
            usernameInputWrapper.classList.add('hidden');
            document.getElementById('username-edit-container').classList.remove('hidden');
            usernameError.classList.add('hidden');
            usernameHint.classList.add('hidden');
        });

        usernameSaveBtn.addEventListener('click', async () => {
            const newUsername = usernameInput.value.trim().toLowerCase();
            if (newUsername === profile.username.toLowerCase()) {
                usernameCancelBtn.click();
                return;
            }

            if (!/^[a-z0-9_]{3,20}$/.test(newUsername)) {
                usernameError.textContent = "Username must be 3-20 characters (letters, numbers, underscores).";
                usernameError.classList.remove('hidden');
                return;
            }

            usernameSaveBtn.disabled = true;
            usernameSaveBtn.textContent = "saving...";

            // Check if username taken
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', newUsername)
                .maybeSingle();

            if (existing) {
                usernameError.textContent = "This username is already taken.";
                usernameError.classList.remove('hidden');
                usernameSaveBtn.disabled = false;
                usernameSaveBtn.textContent = "save";
                return;
            }

            // Update profile
            const now = new Date().toISOString();
            const newCount = (lastChangeDate && lastChangeDate.getFullYear() === currentYear) ? changesCount + 1 : 1;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    username: newUsername,
                    username_changes_count: newCount,
                    last_username_change_at: now
                })
                .eq('id', profile.id);

            if (updateError) {
                usernameError.textContent = "Failed to update: " + updateError.message;
                usernameError.classList.remove('hidden');
                usernameSaveBtn.disabled = false;
                usernameSaveBtn.textContent = "save";
            } else {
                window.location.reload(); // Simplest way to refresh all references
            }
        });
    }

    function setAvatarLetter(username) {
        if (!avatarEl) return;
        const colors = ['profile-avatar-red', 'profile-avatar-blue', 'profile-avatar-green', 'profile-avatar-gold', 'profile-avatar-rose', 'profile-avatar-cyan'];
        const charCode = (username || '?').charCodeAt(0) || 0;
        const colorClass = colors.at(charCode % colors.length);
        avatarEl.className = `profile-avatar flex items-center justify-center text-2xl font-bold uppercase flex-shrink-0 overflow-hidden ${colorClass}`;
        avatarEl.textContent = (username || '?').charAt(0).toUpperCase();
    }

    function setAvatarImage(url, username) {
        if (!avatarEl) return;
        avatarEl.className = 'profile-avatar flex-shrink-0 overflow-hidden bg-gray-200';
        const img = document.createElement('img');
        img.src = url;
        img.alt = username || '';
        img.className = 'avatar-img';
        img.onerror = function () { this.remove(); };
        avatarEl.replaceChildren(img);
    }

    function setupAvatarEdit(profile) {
        if (!avatarEditBtn) return;
        avatarEditBtn.classList.remove('hidden');
        avatarEditBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            avatarMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', () => {
            avatarMenu.classList.add('hidden');
        });
        document.getElementById('avatar-upload-btn')?.addEventListener('click', () => {
            avatarMenu.classList.add('hidden');
            avatarFileInput.click();
        });

        avatarFileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                alert('Image must be under 2MB');
                return;
            }

            avatarEditBtn.style.opacity = '0.5';
            const result = await uploadAvatar(file);
            avatarEditBtn.style.opacity = '1';

            if (result.error) {
                alert('Upload failed: ' + result.error);
            } else {
                setAvatarImage(result.url, profile.username);
            }
            avatarFileInput.value = '';
        });

        document.getElementById('avatar-delete-btn')?.addEventListener('click', async () => {
            avatarMenu.classList.add('hidden');
            const result = await deleteAvatar();
            if (result.error) {
                alert('Delete failed: ' + result.error);
            } else {
                setAvatarLetter(profile.username);
            }
        });
    }

    async function setupFollowButton(targetId) {
        if (!followBtn) return;

        const alreadyFollowing = await isFollowing(targetId);
        updateFollowUI(alreadyFollowing);

        followBtn.addEventListener('click', async () => {
            followBtn.disabled = true;
            const result = await toggleFollow(targetId);
            followBtn.disabled = false;

            if (result.error) {
                alert(result.error);
                return;
            }

            const nowFollowing = result.action === 'followed';
            updateFollowUI(nowFollowing);

            const newCount = await getFollowerCount(targetId);
            if (karmaEl) karmaEl.textContent = newCount;
        });
    }

    function updateFollowUI(isFollowed) {
        if (!followBtn) return;
        if (isFollowed) {
            followBtn.textContent = 'Following';
            followBtn.className = 'follow-btn following';
            followBtn.onmouseenter = () => { followBtn.textContent = 'Unfollow'; };
            followBtn.onmouseleave = () => { followBtn.textContent = 'Following'; };
        } else {
            followBtn.textContent = 'Follow';
            followBtn.className = 'follow-btn follow';
            followBtn.onmouseenter = null;
            followBtn.onmouseleave = null;
        }
    }
});

function setupTabs() {
    const tabs = document.querySelectorAll('.profile-tab');
    const panes = document.querySelectorAll('.tab-pane');

    function getHashTab() {
        return window.location.hash ? window.location.hash.substring(1) : 'all';
    }

    function switchTab(target) {
        const baseTarget = target.split('/')[0];

        tabs.forEach(t => {
            const isTarget = t.getAttribute('data-tab') === baseTarget;
            if (isTarget) {
                t.classList.add('font-bold', 'text-black', 'border-b-2', 'border-[#ff6600]');
                t.classList.remove('text-gray-600');
            } else {
                t.classList.remove('font-bold', 'text-black', 'border-b-2', 'border-[#ff6600]');
                t.classList.add('text-gray-600');
            }
        });

        panes.forEach(p => p.classList.add('hidden'));
        const activePane = document.getElementById(`tab-content-${baseTarget}`);
        if (activePane) activePane.classList.remove('hidden');

        if (history.replaceState) {
            history.replaceState(null, null, '#' + target);
        } else {
            window.location.hash = '#' + target;
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab.getAttribute('data-tab'));
        });
    });

    window.addEventListener('hashchange', () => {
        switchTab(getHashTab());
    });

    switchTab(getHashTab());
}

function getSafeUrl(url, fallbackSlug) {
    if (!url) return `pulse/index.html?s=${encodeURIComponent(fallbackSlug || '')}`;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return url;
        }
    } catch (e) { }
    return '#';
}

function generateListElements(blogs, showDelete = false) {
    const fragment = document.createDocumentFragment();

    if (blogs.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'profile-empty';
        emptyDiv.textContent = 'Nothing here yet.';
        fragment.appendChild(emptyDiv);
        return fragment;
    }

    const ul = document.createElement('ul');
    ul.className = 'profile-post-list';

    blogs.forEach((blog, index) => {
        const timeAgo = calculateTimeAgo(blog.published_at);
        const category = blog.category || 'link';
        let domainStr = '';
        try {
            if (blog.url) domainStr = new URL(blog.url).hostname.replace('www.', '');
        } catch (e) { }

        const li = document.createElement('li');
        li.className = 'profile-post transition-colors';

        const mainDiv = document.createElement('div');
        mainDiv.className = 'profile-post-main items-start sm:items-center';

        const indexSpan = document.createElement('span');
        indexSpan.className = 'text-gray-500 text-[13px] font-medium w-5 text-right flex-shrink-0 pt-1 sm:pt-0';
        indexSpan.textContent = `${index + 1}.`;

        const markerSpan = document.createElement('span');
        markerSpan.className = 'profile-post-marker flex-shrink-0';
        markerSpan.textContent = category.charAt(0).toUpperCase();

        const copyDiv = document.createElement('div');
        copyDiv.className = 'profile-post-copy min-w-0';

        const titleRow = document.createElement('div');
        titleRow.className = 'profile-post-title-row';

        const titleLink = document.createElement('a');
        titleLink.className = 'profile-post-title break-words';
        titleLink.href = getSafeUrl(blog.url, blog.slug);
        titleLink.textContent = blog.title;

        titleRow.appendChild(titleLink);

        if (domainStr) {
            const domainSpan = document.createElement('span');
            domainSpan.className = 'profile-post-domain break-all sm:break-normal';
            domainSpan.textContent = `(${domainStr})`;
            titleRow.appendChild(domainSpan);
        }

        if (showDelete) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'profile-post-icon delete-post-btn';
            deleteBtn.setAttribute('data-id', blog.id);
            deleteBtn.title = 'Delete post';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined';
            iconSpan.style.fontSize = '14px';
            iconSpan.textContent = 'delete';

            deleteBtn.appendChild(iconSpan);
            titleRow.appendChild(deleteBtn);
        }

        const metaDiv = document.createElement('div');
        metaDiv.className = 'profile-post-meta';

        const timeSpan = document.createElement('span');
        timeSpan.textContent = timeAgo;

        const karmaSpan = document.createElement('span');
        karmaSpan.textContent = `${blog.likes_count || 0} karma`;

        const commentsSpan = document.createElement('span');
        commentsSpan.textContent = `${blog.comments_count || 0} comments`;

        const chipSpan = document.createElement('span');
        chipSpan.className = 'profile-post-chip';
        chipSpan.textContent = category;

        metaDiv.appendChild(timeSpan);
        metaDiv.appendChild(karmaSpan);
        metaDiv.appendChild(commentsSpan);
        metaDiv.appendChild(chipSpan);

        copyDiv.appendChild(titleRow);
        copyDiv.appendChild(metaDiv);

        mainDiv.appendChild(indexSpan);
        mainDiv.appendChild(markerSpan);
        mainDiv.appendChild(copyDiv);

        li.appendChild(mainDiv);
        ul.appendChild(li);
    });

    fragment.appendChild(ul);
    return fragment;
}

async function loadSubmissions(username, isOwnProfile = false) {
    const { data: blogs, error: blogsError } = await supabase
        .from('blogs')
        .select('likes_count, id, title, published_at, url, slug, comments_count, category, content')
        .eq('author', username)
        .order('published_at', { ascending: false });

    if (blogsError) return;
    const postsCountEl = document.getElementById('profile-posts-count');
    if (postsCountEl) postsCountEl.textContent = blogs.length;

    const allEl = document.getElementById('profile-submissions');
    const newsEl = document.getElementById('profile-submissions-news');
    const showEl = document.getElementById('profile-submissions-show');
    const askEl = document.getElementById('profile-submissions-ask');

    if (allEl) allEl.replaceChildren(generateListElements(blogs, isOwnProfile));
    if (newsEl) newsEl.replaceChildren(generateListElements(blogs.filter(b => b.category === 'news'), isOwnProfile));
    if (showEl) showEl.replaceChildren(generateListElements(blogs.filter(b => b.category === 'show'), isOwnProfile));
    if (askEl) askEl.replaceChildren(generateListElements(blogs.filter(b => b.category === 'ask'), isOwnProfile));
}

const DEFAULT_FOLDERS = ['To Learn', 'Inspiration', 'Archive', 'Reading List'];

function getFolderMapping(userId) {
    try {
        const key = `kn-folders-${userId}`;
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        const map = new Map();
        for (const [k, v] of Object.entries(parsed)) {
            map.set(String(k), v);
        }
        return map;
    } catch { return new Map(); }
}

function moveStoryToFolder(userId, storyId, folderName) {
    const mapping = getFolderMapping(userId);
    mapping.set(String(storyId), folderName);
    localStorage.setItem(`kn-folders-${userId}`, JSON.stringify(Object.fromEntries(mapping)));
}

function removeStoryFromFolder(userId, storyId) {
    const mapping = getFolderMapping(userId);
    mapping.delete(String(storyId));
    localStorage.setItem(`kn-folders-${userId}`, JSON.stringify(Object.fromEntries(mapping)));
}

function profileHref(username) {
    return `profile.html?user=${encodeURIComponent(username || '')}`;
}

async function loadBookmarks(userId = null) {
    const listEl = document.getElementById('bookmarks-list');
    if (!listEl) return;

    listEl.replaceChildren();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'py-4 text-gray-500 italic';
    loadingDiv.textContent = 'Loading your library...';
    listEl.appendChild(loadingDiv);

    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const currentUserId = userId || (session ? session.user.id : null);

    if (!currentUserId) {
        const msg = document.createElement('p');
        msg.className = 'text-gray-500 italic';
        msg.textContent = 'Please login to view bookmarks.';
        listEl.replaceChildren(msg);
        return;
    }

    const posts = await getBookmarkedPosts(currentUserId);
    const folderMapping = getFolderMapping(currentUserId);

    if (posts.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'py-12 text-center bg-gray-50 rounded border border-dashed border-gray-200';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined text-gray-300';
        iconSpan.style.fontSize = '48px';
        iconSpan.textContent = 'bookmark_border';

        const msg = document.createElement('p');
        msg.className = 'text-gray-500 text-sm mt-2';
        msg.textContent = 'Your reading list is empty.';

        const browseLink = document.createElement('a');
        browseLink.href = 'index.html';
        browseLink.className = 'text-[#ff6600] text-xs hover:underline mt-1 inline-block';
        browseLink.textContent = 'Browse stories to save';

        emptyDiv.appendChild(iconSpan);
        emptyDiv.appendChild(msg);
        emptyDiv.appendChild(browseLink);
        listEl.replaceChildren(emptyDiv);
        return;
    }

    const organized = new Map();
    DEFAULT_FOLDERS.forEach(f => organized.set(f, []));
    organized.set('Uncategorized', []);

    posts.forEach(post => {
        const folder = folderMapping.get(String(post.id)) || 'Uncategorized';
        if (!organized.has(folder)) organized.set(folder, []);
        organized.get(folder).push(post);
    });

    const activeFolders = Array.from(organized.keys()).filter(f => organized.get(f).length > 0 || DEFAULT_FOLDERS.includes(f));

    function renderFolderContentElements(folderName) {
        const folderPosts = organized.get(folderName) || [];
        if (folderPosts.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'py-4 text-center text-gray-400 italic text-[11px]';
            emptyDiv.textContent = 'No stories in this category yet.';
            return emptyDiv;
        }

        const container = document.createElement('div');
        container.className = 'space-y-4';

        folderPosts.forEach(post => {
            const timeAgo = calculateTimeAgo(post.published_at);
            const domain = post.url ? new URL(post.url).hostname.replace('www.', '') : null;
            const favicon = domain ? `https://www.google.com/s2/favicons?sz=32&domain=${domain}` : null;

            const postDiv = document.createElement('div');
            postDiv.className = 'flex flex-col group py-1.5';

            const titleRow = document.createElement('div');
            titleRow.className = 'flex items-baseline gap-1.5';

            if (favicon) {
                const img = document.createElement('img');
                img.src = favicon;
                img.className = 'w-3 h-3 translate-y-[1px] opacity-90';
                img.alt = '';
                titleRow.appendChild(img);
            } else {
                const span = document.createElement('span');
                span.className = 'text-gray-400 text-[12px] select-none';
                span.textContent = '›';
                titleRow.appendChild(span);
            }

            const titleLink = document.createElement('a');
            titleLink.href = getSafeUrl(post.url, post.slug);
            titleLink.className = 'text-[14px] text-black hover:underline leading-tight font-medium';
            titleLink.textContent = post.title;
            titleRow.appendChild(titleLink);

            if (domain) {
                const domainSpan = document.createElement('span');
                domainSpan.className = 'text-[11px] text-gray-400';
                domainSpan.textContent = `(${domain})`;
                titleRow.appendChild(domainSpan);
            }

            const metaDiv = document.createElement('div');
            metaDiv.className = 'story-meta flex items-center gap-1 ml-4.5';

            const metaSpan = document.createElement('span');
            metaSpan.className = 'text-[11px]';
            metaSpan.textContent = `by ${post.author || 'anonymous'} ${timeAgo} | `;

            const bookmarkContainer = document.createElement('span');
            bookmarkContainer.className = 'bookmark-container inline-block';

            const dropdownSpan = document.createElement('span');
            dropdownSpan.className = 'knotes-dropdown inline-block';
            dropdownSpan.setAttribute('data-id', post.id);

            const triggerBtn = document.createElement('button');
            triggerBtn.className = 'knotes-dropdown-trigger saved';
            triggerBtn.title = 'Move to folder';
            triggerBtn.textContent = 'saved';

            const menuDiv = document.createElement('div');
            menuDiv.className = 'knotes-dropdown-menu hidden';

            ['To Learn', 'Inspiration', 'Archive', 'Reading List'].forEach(f => {
                const itemDiv = document.createElement('div');
                itemDiv.className = `dropdown-item ${folderName === f ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}`;
                itemDiv.setAttribute('data-folder', f);
                itemDiv.textContent = f;
                menuDiv.appendChild(itemDiv);
            });

            const divider = document.createElement('div');
            divider.className = 'dropdown-divider border-t border-gray-100 my-1';
            menuDiv.appendChild(divider);

            const unsaveDiv = document.createElement('div');
            unsaveDiv.className = 'dropdown-item text-red-500 font-medium';
            unsaveDiv.setAttribute('data-folder', 'unsave');
            unsaveDiv.textContent = 'Unsave';
            menuDiv.appendChild(unsaveDiv);

            dropdownSpan.appendChild(triggerBtn);
            dropdownSpan.appendChild(menuDiv);

            const removeBtn = document.createElement('a');
            removeBtn.href = '#';
            removeBtn.className = 'remove-bookmark hover:underline text-red-400 ml-0.5';
            removeBtn.setAttribute('data-id', post.id);
            removeBtn.textContent = 'remove';

            bookmarkContainer.appendChild(dropdownSpan);
            bookmarkContainer.appendChild(removeBtn);

            metaSpan.appendChild(bookmarkContainer);
            metaDiv.appendChild(metaSpan);

            postDiv.appendChild(titleRow);
            postDiv.appendChild(metaDiv);
            container.appendChild(postDiv);
        });

        return container;
    }

    let currentFolder = 'To Learn';
    const currentHash = window.location.hash.substring(1);
    if (currentHash.startsWith('saved/')) {
        const folderSlug = currentHash.split('/')[1];
        const matchedFolder = activeFolders.find(f => f.replace(/\s+/g, '-').toLowerCase() === folderSlug.toLowerCase());
        if (matchedFolder) currentFolder = matchedFolder;
    }

    const dashboard = document.createElement('div');
    dashboard.className = 'folder-dashboard';

    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'flex flex-wrap gap-4 mb-4 pb-1 border-b border-gray-100';

    activeFolders.forEach(f => {
        const a = document.createElement('a');
        a.href = `#saved/${f.replace(/\s+/g, '-')}`;
        a.className = `folder-chip py-1 text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer focus:outline-none ${f === currentFolder ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}`;
        a.setAttribute('data-folder', f);
        a.textContent = `${f} `;

        const countSpan = document.createElement('span');
        countSpan.className = 'opacity-50 ml-0.5 font-normal';
        countSpan.textContent = `(${organized.get(f).length})`;

        a.appendChild(countSpan);
        tabsDiv.appendChild(a);
    });

    const activeContent = document.createElement('div');
    activeContent.id = 'folder-active-content';
    activeContent.className = 'min-h-[120px] mt-2';
    activeContent.replaceChildren(renderFolderContentElements(currentFolder));

    dashboard.appendChild(tabsDiv);
    dashboard.appendChild(activeContent);

    listEl.replaceChildren(dashboard);

    const chips = listEl.querySelectorAll('.folder-chip');

    function updateFolderView() {
        let targetFolder = 'To Learn';
        const hash = window.location.hash.substring(1);
        if (hash.startsWith('saved/')) {
            const folderSlug = hash.split('/')[1];
            const matchedFolder = activeFolders.find(f => f.replace(/\s+/g, '-').toLowerCase() === folderSlug.toLowerCase());
            if (matchedFolder) targetFolder = matchedFolder;
        }

        chips.forEach(c => {
            if (c.getAttribute('data-folder') === targetFolder) {
                c.classList.add('text-[#ff6600]', 'border-b-2', 'border-[#ff6600]');
                c.classList.remove('text-gray-400');
            } else {
                c.classList.remove('text-[#ff6600]', 'border-b-2', 'border-[#ff6600]');
                c.classList.add('text-gray-400');
            }
        });

        activeContent.replaceChildren(renderFolderContentElements(targetFolder));
        attachBookmarkListeners(activeContent);
    }

    if (window._bookmarkHashListener) {
        window.removeEventListener('hashchange', window._bookmarkHashListener);
    }
    window._bookmarkHashListener = () => {
        if (window.location.hash.substring(1).startsWith('saved')) {
            updateFolderView();
        }
    };
    window.addEventListener('hashchange', window._bookmarkHashListener);

    function attachBookmarkListeners(container) {
        container.querySelectorAll('.knotes-dropdown-trigger').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                const menu = trigger.nextElementSibling;
                document.querySelectorAll('.knotes-dropdown-menu').forEach(m => {
                    if (m !== menu) m.classList.add('hidden');
                });
                menu.classList.toggle('hidden');
            });
        });

        container.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const folderName = item.getAttribute('data-folder');
                const dropdown = item.closest('.knotes-dropdown');
                const storyId = dropdown.getAttribute('data-id');
                const trigger = dropdown.querySelector('.knotes-dropdown-trigger');

                if (folderName === 'unsave') {
                    removeStoryFromFolder(currentUserId, storyId);
                    // Also trigger the actual bookmark removal if needed, but here it's likely already in Supabase
                    // Since it's in the "Saved" tab, removing from folder might mean unsaving.
                    // Let's call toggleBookmark if it's the own profile.
                    const { toggleBookmark } = await import('./supabaseClient.js');
                    await toggleBookmark(parseInt(storyId));
                    await loadBookmarks(currentUserId);
                } else {
                    moveStoryToFolder(currentUserId, storyId, folderName);
                    await loadBookmarks(currentUserId);
                }
            });
        });

        container.querySelectorAll('.remove-bookmark').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const storyId = btn.getAttribute('data-id');
                if (confirm('Remove from your lists?')) {
                    removeStoryFromFolder(currentUserId, storyId);
                    await loadBookmarks(currentUserId);
                }
            });
        });
    }

    attachBookmarkListeners(listEl);
}

async function loadHiddenStories() {
    const listEl = document.getElementById('hidden-list');
    if (!listEl) return;

    let hiddenIds = [];
    try {
        hiddenIds = JSON.parse(localStorage.getItem('kn-hidden-stories') || '[]');
    } catch { hiddenIds = []; }

    if (hiddenIds.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'text-gray-500 italic py-2';
        msg.textContent = 'No hidden stories.';
        listEl.replaceChildren(msg);
        return;
    }

    if (!supabase) {
        const msg = document.createElement('p');
        msg.className = 'text-gray-500 italic py-2';
        msg.textContent = 'Cannot load hidden stories.';
        listEl.replaceChildren(msg);
        return;
    }

    const numericIds = hiddenIds.map(id => parseInt(id)).filter(id => !isNaN(id));

    const { data: posts, error } = await supabase
        .from('blogs')
        .select('id, title, slug, url, published_at, likes_count, comments_count, author')
        .in('id', numericIds);

    if (error || !posts || posts.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'text-gray-500 italic py-2';
        msg.textContent = `${hiddenIds.length} hidden stories (data unavailable).`;
        listEl.replaceChildren(msg);
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'space-y-2';

    posts.forEach(blog => {
        const timeAgo = calculateTimeAgo(blog.published_at);

        const li = document.createElement('li');
        li.className = 'py-1 border-b border-gray-100 last:border-0 flex items-start justify-between gap-2';

        const minWDiv = document.createElement('div');
        minWDiv.className = 'min-w-0';

        const titleLink = document.createElement('a');
        titleLink.href = getSafeUrl(blog.url, blog.slug);
        titleLink.className = 'hover:underline text-black font-medium';
        titleLink.textContent = blog.title;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'text-xs text-gray-500 mt-0.5';
        metaDiv.textContent = `${timeAgo} · ${blog.likes_count || 0} points · by ${blog.author || 'anonymous'}`;

        minWDiv.appendChild(titleLink);
        minWDiv.appendChild(metaDiv);

        const unhideBtn = document.createElement('button');
        unhideBtn.className = 'unhide-btn text-xs text-[#ff6600] hover:underline flex-shrink-0 mt-0.5 cursor-pointer';
        unhideBtn.setAttribute('data-id', blog.id);
        unhideBtn.textContent = 'unhide';

        li.appendChild(minWDiv);
        li.appendChild(unhideBtn);
        ul.appendChild(li);
    });

    listEl.replaceChildren(ul);

    listEl.querySelectorAll('.unhide-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            let stored = [];
            try { stored = JSON.parse(localStorage.getItem('kn-hidden-stories') || '[]'); } catch { }
            stored = stored.filter(sid => String(sid) !== String(id));
            localStorage.setItem('kn-hidden-stories', JSON.stringify(stored));

            const li = btn.closest('li');
            if (li) {
                li.style.transition = 'opacity 0.2s';
                li.style.opacity = '0';
                setTimeout(() => {
                    li.remove();
                    if (listEl.querySelectorAll('li').length === 0) {
                        const msg = document.createElement('p');
                        msg.className = 'text-gray-500 italic py-2';
                        msg.textContent = 'No hidden stories.';
                        listEl.replaceChildren(msg);
                    }
                }, 200);
            }
        });
    });
}

function setupUpdateButton(userId) {
    const updateBtn = document.getElementById('btn-update-profile');
    const aboutInput = document.getElementById('profile-about');
    const isPublicCheckbox = document.getElementById('profile-is-public');
    if (!updateBtn || !aboutInput) return;

    function setUpdateButton(label, icon = 'check') {
        updateBtn.replaceChildren();
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined';
        iconSpan.style.fontSize = '14px';
        iconSpan.textContent = icon;
        updateBtn.appendChild(iconSpan);
        updateBtn.appendChild(document.createTextNode(label));
    }

    let initialAbout = aboutInput.value;
    let initialIsPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;

    updateBtn.style.display = 'none';

    function checkForChanges() {
        const hasChanged = aboutInput.value !== initialAbout ||
            (isPublicCheckbox && isPublicCheckbox.checked !== initialIsPublic);
        updateBtn.style.display = hasChanged ? 'inline-flex' : 'none';
    }

    aboutInput.addEventListener('input', checkForChanges);
    if (isPublicCheckbox) isPublicCheckbox.addEventListener('change', checkForChanges);

    updateBtn.addEventListener('click', async () => {
        const aboutText = aboutInput.value.trim();
        const isPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;
        updateBtn.disabled = true;
        setUpdateButton('Updating', 'sync');

        const { error } = await supabase
            .from('profiles')
            .update({ about: aboutText, is_public: isPublic })
            .eq('id', userId);

        if (error) {
            alert('Failed to update profile.');
            updateBtn.disabled = false;
            setUpdateButton('Update');
        } else {
            initialAbout = aboutInput.value;
            initialIsPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;

            setUpdateButton('Updated');
            setTimeout(() => {
                setUpdateButton('Update');
                checkForChanges();
            }, 1500);
            updateBtn.disabled = false;
        }
    });
}

function setupMediaLibrary() {
    const btnMedia = document.getElementById('btn-media-library-profile');
    const modal = document.getElementById('media-library-modal');
    const closeBtn = document.getElementById('btn-close-media');
    const grid = document.getElementById('media-library-grid');
    const uploadBtn = document.getElementById('btn-upload-more');
    const uploadInput = document.getElementById('media-upload-input');

    if (!btnMedia || !modal) return;
    btnMedia.style.display = 'inline-flex';

    btnMedia.addEventListener('click', async () => {
        modal.classList.remove('hidden');
        loadMediaFiles();
    });

    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });

    async function loadMediaFiles() {
        grid.replaceChildren();
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'col-span-full text-center py-12';

        const spinner = document.createElement('div');
        spinner.className = 'animate-spin inline-block w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full mb-4';

        const loadingText = document.createElement('p');
        loadingText.className = 'text-gray-500 text-sm italic';
        loadingText.textContent = 'Fetching your media gallery...';

        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(loadingText);
        grid.appendChild(loadingDiv);

        const files = await listUserMedia();

        if (files.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'col-span-full text-center py-12 bg-white rounded border border-dashed border-gray-300';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined text-gray-300';
            iconSpan.style.fontSize = '48px';
            iconSpan.textContent = 'photo_library';

            const emptyText = document.createElement('p');
            emptyText.className = 'text-gray-500 text-sm mt-2';
            emptyText.textContent = 'No photos found in your library.';

            emptyDiv.appendChild(iconSpan);
            emptyDiv.appendChild(emptyText);
            grid.replaceChildren(emptyDiv);
            return;
        }

        function getFileIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            switch (ext) {
                case 'pdf': return 'picture_as_pdf';
                case 'xls':
                case 'xlsx':
                case 'csv': return 'table_chart';
                case 'doc':
                case 'docx': return 'description';
                case 'ppt':
                case 'pptx': return 'present_to_all';
                case 'txt': return 'article';
                default: return 'insert_drive_file';
            }
        }

        function isImage(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
        }

        const fragment = document.createDocumentFragment();
        files.forEach(f => {
            const isImg = isImage(f.name);
            const icon = getFileIcon(f.name);

            const itemDiv = document.createElement('div');
            itemDiv.className = 'group relative aspect-passport bg-white rounded border border-gray-200 overflow-hidden hover:border-[#ff6600] transition-all shadow-sm hover:shadow-md cursor-pointer media-item';
            itemDiv.setAttribute('data-url', f.url);
            itemDiv.setAttribute('data-is-img', isImg);
            itemDiv.addEventListener('click', () => window.open(f.url, '_blank'));

            if (isImg) {
                const img = document.createElement('img');
                img.src = f.url;
                img.className = 'w-full h-full object-cover';
                img.loading = 'lazy';
                itemDiv.appendChild(img);
            } else {
                const fileTypeDiv = document.createElement('div');
                fileTypeDiv.className = 'w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-2 text-center';

                const iconSpan = document.createElement('span');
                iconSpan.className = 'material-symbols-outlined text-3xl mb-1';
                iconSpan.textContent = icon;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'text-[9px] truncate w-full px-1';
                nameSpan.textContent = f.name.split('-')[0];

                fileTypeDiv.appendChild(iconSpan);
                fileTypeDiv.appendChild(nameSpan);
                itemDiv.appendChild(fileTypeDiv);
            }

            const hoverDiv = document.createElement('div');
            hoverDiv.className = 'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center';

            const hoverNameSpan = document.createElement('span');
            hoverNameSpan.className = 'text-white text-[10px] font-bold truncate w-full';
            hoverNameSpan.textContent = f.name;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'mt-2 bg-white text-black text-[9px] px-2 py-1 rounded font-bold hover:bg-[#ff6600] hover:text-white transition-colors';
            copyBtn.textContent = 'Copy Link';
            copyBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                navigator.clipboard.writeText(f.url);
                alert('URL copied to clipboard!');
            });

            hoverDiv.appendChild(hoverNameSpan);
            hoverDiv.appendChild(copyBtn);
            itemDiv.appendChild(hoverDiv);

            fragment.appendChild(itemDiv);
        });
        grid.replaceChildren(fragment);

        grid.querySelectorAll('.media-item').forEach(item => {
            item.addEventListener('mouseenter', (e) => {
                const url = item.getAttribute('data-url');
                const isImg = item.getAttribute('data-is-img') === 'true';
                if (!isImg) showPreview(url, e);
            });
            item.addEventListener('mouseleave', hidePreview);
        });
    }

    const previewTooltip = document.createElement('div');
    previewTooltip.className = 'media-preview-tooltip';
    document.body.appendChild(previewTooltip);

    function showPreview(url, e) {
        const officeExts = /\.(xlsx?|docx?|pptx?)$/i;
        let viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

        if (url.match(officeExts)) {
            viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
        }

        previewTooltip.replaceChildren();
        const iframe = document.createElement('iframe');
        iframe.src = viewerUrl;
        iframe.className = 'preview-frame';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');

        previewTooltip.appendChild(iframe);
        previewTooltip.classList.add('visible');
        updatePreviewPos(e);
    }

    function hidePreview() {
        previewTooltip.classList.remove('visible');
        previewTooltip.replaceChildren();
    }

    function updatePreviewPos(e) {
        const x = e.clientX + 20;
        const y = e.clientY - 200;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        let finalX = x;
        let finalY = y;
        if (x + 320 > winW) finalX = e.clientX - 340;
        if (y + 450 > winH) finalY = winH - 460;
        if (finalY < 10) finalY = 10;
        previewTooltip.style.left = `${finalX}px`;
        previewTooltip.style.top = `${finalY}px`;
    }

    document.addEventListener('mousemove', (e) => {
        if (previewTooltip.classList.contains('visible')) updatePreviewPos(e);
    });

    uploadBtn?.addEventListener('click', () => uploadInput.click());
    uploadInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('File too large (max 5MB)');
            return;
        }

        uploadBtn.disabled = true;
        uploadBtn.replaceChildren();
        const spinIcon = document.createElement('span');
        spinIcon.className = 'animate-spin material-symbols-outlined';
        spinIcon.style.fontSize = '14px';
        spinIcon.textContent = 'sync';
        uploadBtn.appendChild(spinIcon);
        uploadBtn.appendChild(document.createTextNode(' Uploading...'));

        const result = await uploadMediaFile(file);

        uploadBtn.disabled = false;
        uploadBtn.replaceChildren();
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined';
        iconSpan.style.fontSize = '14px';
        iconSpan.textContent = 'upload_file';
        uploadBtn.appendChild(iconSpan);
        uploadBtn.appendChild(document.createTextNode(' Upload New'));

        if (result.error) {
            alert('Upload failed: ' + result.error);
        } else {
            loadMediaFiles();
        }
        uploadInput.value = '';
    });
}

document.addEventListener('click', async (e) => {
    const deletePostBtn = e.target.closest?.('.delete-post-btn');
    if (deletePostBtn) {
        const id = deletePostBtn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this post? This cannot be undone.')) {
            deletePostBtn.style.opacity = '0.5';
            deletePostBtn.style.pointerEvents = 'none';
            const result = await deleteStory(id);
            if (result.error) {
                alert(result.error);
                deletePostBtn.style.opacity = '1';
                deletePostBtn.style.pointerEvents = 'auto';
            } else {
                const li = deletePostBtn.closest('li');
                if (li) {
                    li.style.transition = 'opacity 0.3s';
                    li.style.opacity = '0';
                    setTimeout(() => li.remove(), 300);
                }
            }
        }
    }
    if (!e.target.closest('.knotes-dropdown')) {
        document.querySelectorAll('.knotes-dropdown-menu').forEach(m => m.classList.add('hidden'));
    }
});

let commentSortOrder = 'newest';

async function loadComments(userId) {
    const listEl = document.getElementById('comments-list');
    if (!listEl) return;

    listEl.replaceChildren();
    const loadMsg = document.createElement('div');
    loadMsg.className = 'py-4 text-gray-500 italic';
    loadMsg.textContent = 'Loading your comments...';
    listEl.appendChild(loadMsg);

    const comments = await getUserComments(userId);

    if (comments.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'text-gray-500 italic py-4';
        msg.textContent = 'You haven\'t posted any comments yet.';
        listEl.replaceChildren(msg);
        return;
    }

    const sortedComments = [...comments].sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return commentSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    listEl.replaceChildren();

    const sortDiv = document.createElement('div');
    sortDiv.className = 'flex items-center gap-4 mb-4 pb-1 border-b border-gray-100';

    const newestBtn = document.createElement('button');
    newestBtn.className = `sort-comments text-[11px] font-bold uppercase tracking-widest cursor-pointer transition-all ${commentSortOrder === 'newest' ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}`;
    newestBtn.setAttribute('data-sort', 'newest');
    newestBtn.textContent = 'Newest First';

    const oldestBtn = document.createElement('button');
    oldestBtn.className = `sort-comments text-[11px] font-bold uppercase tracking-widest cursor-pointer transition-all ${commentSortOrder === 'oldest' ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}`;
    oldestBtn.setAttribute('data-sort', 'oldest');
    oldestBtn.textContent = 'Oldest First';

    sortDiv.appendChild(newestBtn);
    sortDiv.appendChild(oldestBtn);
    listEl.appendChild(sortDiv);

    const spaceDiv = document.createElement('div');
    spaceDiv.className = 'space-y-6';

    sortedComments.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        const story = comment.blogs || { title: 'Unknown Story', slug: '#' };

        const itemDiv = document.createElement('div');
        itemDiv.className = 'comment-item pb-4 border-b border-gray-100 last:border-0';
        itemDiv.setAttribute('data-id', comment.id);
        itemDiv.setAttribute('data-blog-id', comment.blog_id);

        const headerDiv = document.createElement('div');
        headerDiv.className = 'text-[11px] text-gray-500 mb-1 flex items-center justify-between';

        const spanLeft = document.createElement('span');

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'text-gray-400 text-[12px] select-none mr-1';
        arrowSpan.textContent = '›';

        const onText = document.createTextNode('on ');

        const storyLink = document.createElement('a');
        storyLink.href = `pulse/index.html?s=${encodeURIComponent(story.slug)}`;
        storyLink.className = 'text-black font-medium hover:underline';
        storyLink.textContent = story.title;

        const timeText = document.createTextNode(` · ${timeAgo}`);

        spanLeft.appendChild(arrowSpan);
        spanLeft.appendChild(onText);
        spanLeft.appendChild(storyLink);
        spanLeft.appendChild(timeText);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'flex items-center gap-3';

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-comment-btn text-gray-400 hover:text-[#ff6600] cursor-pointer transition-colors';
        editBtn.setAttribute('data-id', comment.id);
        editBtn.title = 'Edit comment';

        const editIcon = document.createElement('span');
        editIcon.className = 'material-symbols-outlined';
        editIcon.style.fontSize = '16px';
        editIcon.textContent = 'edit';
        editBtn.appendChild(editIcon);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-comment-btn text-gray-400 hover:text-red-600 cursor-pointer transition-colors';
        delBtn.setAttribute('data-id', comment.id);
        delBtn.title = 'Delete comment';

        const delIcon = document.createElement('span');
        delIcon.className = 'material-symbols-outlined';
        delIcon.style.fontSize = '16px';
        delIcon.textContent = 'delete';
        delBtn.appendChild(delIcon);

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(delBtn);

        headerDiv.appendChild(spanLeft);
        headerDiv.appendChild(actionsDiv);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'comment-body text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ml-4';
        bodyDiv.textContent = comment.comment_text;

        const editModeDiv = document.createElement('div');
        editModeDiv.className = 'edit-mode hidden mt-2 ml-4';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#ff6600] rounded-sm resize-y h-24 mb-2';
        textarea.value = comment.comment_text;

        const editActionsDiv = document.createElement('div');
        editActionsDiv.className = 'flex items-center gap-2';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-comment-btn bg-[#ff6600] text-white px-3 py-1 text-xs rounded hover:bg-[#e65c00] transition-colors cursor-pointer';
        saveBtn.textContent = 'save';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-edit-btn text-gray-500 text-xs hover:underline cursor-pointer';
        cancelBtn.textContent = 'cancel';

        editActionsDiv.appendChild(saveBtn);
        editActionsDiv.appendChild(cancelBtn);

        editModeDiv.appendChild(textarea);
        editModeDiv.appendChild(editActionsDiv);

        itemDiv.appendChild(headerDiv);
        itemDiv.appendChild(bodyDiv);
        itemDiv.appendChild(editModeDiv);

        spaceDiv.appendChild(itemDiv);
    });

    listEl.appendChild(spaceDiv);

    listEl.querySelectorAll('.sort-comments').forEach(btn => {
        btn.addEventListener('click', () => {
            commentSortOrder = btn.getAttribute('data-sort');
            loadComments(userId);
        });
    });

    // Attach listeners
    listEl.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const commentId = btn.getAttribute('data-id');
            const item = btn.closest('.comment-item');
            const blogId = item.getAttribute('data-blog-id');

            if (confirm('Are you sure you want to delete this comment?')) {
                btn.disabled = true;
                const icon = btn.querySelector('.material-symbols-outlined');
                const originalText = icon.textContent;
                icon.textContent = 'sync';
                icon.classList.add('animate-spin');

                const result = await deleteComment(commentId, blogId);
                if (result.error) {
                    alert('Delete failed: ' + result.error);
                    btn.disabled = false;
                    icon.textContent = originalText;
                    icon.classList.remove('animate-spin');
                } else {
                    item.remove();
                    if (listEl.querySelectorAll('.comment-item').length === 0) {
                        const msg = document.createElement('p');
                        msg.className = 'text-gray-500 italic py-4';
                        msg.textContent = 'You haven\'t posted any comments yet.';
                        listEl.replaceChildren(msg);
                    }
                }
            }
        });
    });

    listEl.querySelectorAll('.edit-comment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.comment-item');
            item.querySelector('.comment-body').classList.add('hidden');
            item.querySelector('.edit-mode').classList.remove('hidden');
            btn.closest('.flex').classList.add('invisible');
        });
    });

    listEl.querySelectorAll('.cancel-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.comment-item');
            item.querySelector('.comment-body').classList.remove('hidden');
            item.querySelector('.edit-mode').classList.add('hidden');
            item.querySelector('.flex.items-center.justify-between .flex').classList.remove('invisible');
        });
    });

    listEl.querySelectorAll('.save-comment-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = btn.closest('.comment-item');
            const commentId = item.getAttribute('data-id');
            const newText = item.querySelector('textarea').value.trim();

            if (!newText) {
                alert('Comment cannot be empty');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'saving...';
            const result = await updateComment(commentId, newText);
            btn.disabled = false;
            btn.textContent = 'save';

            if (result.error) {
                alert('Update failed: ' + result.error);
            } else {
                item.querySelector('.comment-body').textContent = newText;
                item.querySelector('.comment-body').classList.remove('hidden');
                item.querySelector('.edit-mode').classList.add('hidden');
                item.querySelector('.flex.items-center.justify-between .flex').classList.remove('invisible');
            }
        });
    });
}

async function loadSubscriptions(userId) {
    const listEl = document.getElementById('subscriptions-list');
    if (!listEl) return;

    listEl.replaceChildren();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'py-4 text-gray-500 italic';
    loadingDiv.textContent = 'Loading subscriptions...';
    listEl.appendChild(loadingDiv);

    const following = await getFollowingList(userId);
    const followers = await getFollowersList(userId);

    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const currentUserId = session ? session.user.id : null;

    let myFollowingIds = [];
    if (currentUserId) {
        const myFollowing = await getFollowingList(currentUserId);
        myFollowingIds = myFollowing.map(u => u.id);
    }

    function renderUserItem(p, type) {
        const isFollowed = myFollowingIds.includes(p.id);
        const isMe = currentUserId === p.id;
        const colorClass = type === 'following' ? 'text-[#ff6600]' : 'text-blue-500';
        const bgClass = type === 'following' ? 'bg-orange-50' : 'bg-blue-50';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'flex items-center gap-3 p-2 bg-white rounded border border-gray-100 hover:border-[#ff6600] transition-colors';

        const avatarDiv = document.createElement('div');
        avatarDiv.className = `w-8 h-8 ${bgClass} rounded-full flex items-center justify-center text-xs font-bold ${colorClass} uppercase overflow-hidden`;

        if (p.avatar_url) {
            const img = document.createElement('img');
            img.src = p.avatar_url;
            img.className = 'w-full h-full object-cover';
            avatarDiv.appendChild(img);
        } else {
            avatarDiv.textContent = p.username ? p.username.charAt(0) : '?';
        }

        const infoDiv = document.createElement('div');
        infoDiv.className = 'flex-1 min-w-0';

        const nameLink = document.createElement('a');
        nameLink.href = profileHref(p.username);
        nameLink.className = 'text-sm font-medium text-black hover:underline block truncate';
        nameLink.textContent = p.username;

        const aboutP = document.createElement('p');
        aboutP.className = 'text-[10px] text-gray-400 truncate';
        aboutP.textContent = p.about || '';

        infoDiv.appendChild(nameLink);
        infoDiv.appendChild(aboutP);

        itemDiv.appendChild(avatarDiv);
        itemDiv.appendChild(infoDiv);

        if (currentUserId && !isMe) {
            const followBtn = document.createElement('button');
            followBtn.setAttribute('data-id', p.id);
            followBtn.setAttribute('data-followed', isFollowed);
            followBtn.className = `sub-follow-btn text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer whitespace-nowrap ${isFollowed ? 'bg-white border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200' : 'bg-white border-[#ff6600] text-[#ff6600] hover:bg-[#ff6600] hover:text-white'}`;
            followBtn.textContent = isFollowed ? 'Following' : 'Follow';
            itemDiv.appendChild(followBtn);
        }

        return itemDiv;
    }

    listEl.replaceChildren();

    const gridDiv = document.createElement('div');
    gridDiv.className = 'grid grid-cols-1 md:grid-cols-2 gap-8';

    // Following Column
    const followingCol = document.createElement('div');

    const followingH3 = document.createElement('h3');
    followingH3.className = 'text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-100 pb-1 flex items-center gap-2';

    const followingIcon = document.createElement('span');
    followingIcon.className = 'material-symbols-outlined';
    followingIcon.style.fontSize = '14px';
    followingIcon.textContent = 'person_add';

    followingH3.appendChild(followingIcon);
    followingH3.appendChild(document.createTextNode(` Following (${following.length})`));

    followingCol.appendChild(followingH3);

    if (following.length === 0) {
        const noFollowingMsg = document.createElement('p');
        noFollowingMsg.className = 'text-gray-400 italic text-xs';
        noFollowingMsg.textContent = 'Not following anyone yet.';
        followingCol.appendChild(noFollowingMsg);
    } else {
        const followingListDiv = document.createElement('div');
        followingListDiv.className = 'space-y-3';
        following.forEach(p => {
            followingListDiv.appendChild(renderUserItem(p, 'following'));
        });
        followingCol.appendChild(followingListDiv);
    }

    // Followers Column
    const followersCol = document.createElement('div');

    const followersH3 = document.createElement('h3');
    followersH3.className = 'text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-100 pb-1 flex items-center gap-2';

    const followersIcon = document.createElement('span');
    followersIcon.className = 'material-symbols-outlined';
    followersIcon.style.fontSize = '14px';
    followersIcon.textContent = 'group';

    followersH3.appendChild(followersIcon);
    followersH3.appendChild(document.createTextNode(` Followers (${followers.length})`));

    followersCol.appendChild(followersH3);

    if (followers.length === 0) {
        const noFollowersMsg = document.createElement('p');
        noFollowersMsg.className = 'text-gray-400 italic text-xs';
        noFollowersMsg.textContent = 'No followers yet.';
        followersCol.appendChild(noFollowersMsg);
    } else {
        const followersListDiv = document.createElement('div');
        followersListDiv.className = 'space-y-3';
        followers.forEach(p => {
            followersListDiv.appendChild(renderUserItem(p, 'followers'));
        });
        followersCol.appendChild(followersListDiv);
    }

    gridDiv.appendChild(followingCol);
    gridDiv.appendChild(followersCol);

    listEl.appendChild(gridDiv);

    listEl.querySelectorAll('.sub-follow-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-id');
            btn.disabled = true;
            btn.style.opacity = '0.5';

            const result = await toggleFollow(targetId);
            btn.disabled = false;
            btn.style.opacity = '1';

            if (result.error) {
                alert(result.error);
                return;
            }

            const nowFollowed = result.action === 'followed';
            btn.setAttribute('data-followed', nowFollowed);
            btn.textContent = nowFollowed ? 'Following' : 'Follow';

            if (nowFollowed) {
                btn.className = 'sub-follow-btn text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer whitespace-nowrap bg-white border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200';
            } else {
                btn.className = 'sub-follow-btn text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer whitespace-nowrap bg-white border-[#ff6600] text-[#ff6600] hover:bg-[#ff6600] hover:text-white';
            }

            // If we are viewing our own profile, we might want to refresh the counts
            const urlParams = new URLSearchParams(window.location.search);
            const viewingUser = urlParams.get('user');
            if (!viewingUser || (session && viewingUser === session.user.email.split('@')[0])) {
                // Refresh lists after a short delay
                setTimeout(() => loadSubscriptions(userId), 500);
            }
        });
    });
}
