import { supabase, calculateTimeAgo, sanitize, getBookmarkedPosts, toggleFollow, isFollowing, getFollowerCount, getFollowingCount, uploadAvatar, deleteAvatar, deleteStory, listUserMedia, uploadMediaFile, getUserComments, updateComment, deleteComment, getFollowingList, getFollowersList } from './supabaseClient.js';

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())( async () => {
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
        const colorClass = colors[charCode % colors.length];
        avatarEl.className = `profile-avatar flex items-center justify-center text-2xl font-bold uppercase flex-shrink-0 overflow-hidden ${colorClass}`;
        avatarEl.innerHTML = '';
        avatarEl.textContent = (username || '?').charAt(0).toUpperCase();
    }

    function setAvatarImage(url, username) {
        if (!avatarEl) return;
        avatarEl.className = 'profile-avatar flex-shrink-0 overflow-hidden bg-gray-200';
        avatarEl.innerHTML = `<img src="${url}" alt="${sanitize(username)}" class="avatar-img" onerror="this.remove()">`;
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

function generateListHtml(blogs, showDelete = false) {
    if (blogs.length === 0) {
        return '<div class="profile-empty">Nothing here yet.</div>';
    }

    let html = '<ul class="profile-post-list">';
    blogs.forEach(blog => {
        const timeAgo = calculateTimeAgo(blog.published_at);
        const deleteBtnHtml = showDelete ? `<button type="button" class="profile-post-icon delete-post-btn" data-id="${blog.id}" title="Delete post"><span class="material-symbols-outlined" style="font-size: 14px;">delete</span></button>` : '';
        const category = blog.category || 'link';
        const domain = blog.url ? new URL(blog.url).hostname.replace('www.', '') : '';

        html += `
            <li class="profile-post">
                <div class="profile-post-main">
                    <span class="profile-post-marker">${category.charAt(0).toUpperCase()}</span>
                    <div class="profile-post-copy">
                        <div class="profile-post-title-row">
                            <a href="${blog.url || `pulse/index.html?s=${blog.slug}`}" class="profile-post-title">${sanitize(blog.title)}</a>
                            ${domain ? `<span class="profile-post-domain">${sanitize(domain)}</span>` : ''}
                            ${deleteBtnHtml}
                        </div>
                        <div class="profile-post-meta">
                            <span>${timeAgo}</span>
                            <span>${blog.likes_count || 0} karma</span>
                            <span>${blog.comments_count || 0} comments</span>
                            <span class="profile-post-chip">${sanitize(category)}</span>
                        </div>
                    </div>
                </div>
            </li>
        `;
    });
    html += '</ul>';
    return html;
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

    if (allEl) allEl.innerHTML = generateListHtml(blogs, isOwnProfile);
    if (newsEl) newsEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'news'), isOwnProfile);
    if (showEl) showEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'show'), isOwnProfile);
    if (askEl) askEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'ask'), isOwnProfile);
}

const DEFAULT_FOLDERS = ['To Learn', 'Inspiration', 'Archive', 'Reading List'];

function getFolderMapping(userId) {
    try {
        const key = `kn-folders-${userId}`;
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
}

function moveStoryToFolder(userId, storyId, folderName) {
    const mapping = getFolderMapping(userId);
    mapping[storyId] = folderName;
    localStorage.setItem(`kn-folders-${userId}`, JSON.stringify(mapping));
}

function removeStoryFromFolder(userId, storyId) {
    const mapping = getFolderMapping(userId);
    delete mapping[storyId];
    localStorage.setItem(`kn-folders-${userId}`, JSON.stringify(mapping));
}

function profileHref(username) {
    return `profile.html?user=${encodeURIComponent(username || '')}`;
}

async function loadBookmarks(userId = null) {
    const listEl = document.getElementById('bookmarks-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="py-4 text-gray-500 italic">Loading your library...</div>';

    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const currentUserId = userId || (session ? session.user.id : null);

    if (!currentUserId) {
        listEl.innerHTML = '<p class="text-gray-500 italic">Please login to view bookmarks.</p>';
        return;
    }

    const posts = await getBookmarkedPosts(currentUserId);
    const folderMapping = getFolderMapping(currentUserId);

    if (posts.length === 0) {
        listEl.innerHTML = `
            <div class="py-12 text-center bg-gray-50 rounded border border-dashed border-gray-200">
                <span class="material-symbols-outlined text-gray-300" style="font-size:48px">bookmark_border</span>
                <p class="text-gray-500 text-sm mt-2">Your reading list is empty.</p>
                <a href="index.html" class="text-[#ff6600] text-xs hover:underline mt-1 inline-block">Browse stories to save</a>
            </div>
        `;
        return;
    }

    const organized = {};
    DEFAULT_FOLDERS.forEach(f => organized[f] = []);
    organized['Uncategorized'] = [];

    posts.forEach(post => {
        const folder = folderMapping[post.id] || 'Uncategorized';
        if (!organized[folder]) organized[folder] = [];
        organized[folder].push(post);
    });

    const activeFolders = Object.keys(organized).filter(f => organized[f].length > 0 || DEFAULT_FOLDERS.includes(f));

    function renderFolderContent(folderName) {
        const folderPosts = organized[folderName] || [];
        if (folderPosts.length === 0) {
            return `<div class="py-4 text-center text-gray-400 italic text-[11px]">No stories in this category yet.</div>`;
        }

        return `
            <div class="space-y-4">
                ${folderPosts.map(post => {
            const timeAgo = calculateTimeAgo(post.published_at);
            const domain = post.url ? new URL(post.url).hostname.replace('www.', '') : null;
            const favicon = domain ? `https://www.google.com/s2/favicons?sz=32&domain=${domain}` : null;

            return `
                        <div class="flex flex-col group py-1.5">
                            <div class="flex items-baseline gap-1.5">
                                ${favicon ? `<img src="${favicon}" class="w-3 h-3 translate-y-[1px] opacity-90" alt="">` : '<span class="text-gray-400 text-[12px] select-none">›</span>'}
                                <a href="${post.url || `pulse/index.html?s=${post.slug}`}" class="text-[14px] text-black hover:underline leading-tight font-medium">${sanitize(post.title)}</a>
                                ${domain ? `<span class="text-[11px] text-gray-400">(${domain})</span>` : ''}
                            </div>
                            <div class="story-meta flex items-center gap-1 ml-4.5">
                                <span class="text-[11px]">
                                    by ${post.author} ${timeAgo} | 
                                    <span class="bookmark-container inline-block">
                                        <span class="knotes-dropdown inline-block" data-id="${post.id}">
                                            <button class="knotes-dropdown-trigger saved" title="Move to folder">
                                                saved
                                            </button>
                                            <div class="knotes-dropdown-menu hidden">
                                                <div class="dropdown-item ${folderName === 'To Learn' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="To Learn">To Learn</div>
                                                <div class="dropdown-item ${folderName === 'Inspiration' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="Inspiration">Inspiration</div>
                                                <div class="dropdown-item ${folderName === 'Archive' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="Archive">Archive</div>
                                                <div class="dropdown-item ${folderName === 'Reading List' ? 'bg-orange-50 text-[#ff6600] font-bold' : ''}" data-folder="Reading List">Reading List</div>
                                                <div class="dropdown-divider border-t border-gray-100 my-1"></div>
                                                <div class="dropdown-item text-red-500 font-medium" data-folder="unsave">Unsave</div>
                                            </div>
                                        </span>
                                        <a href="#" class="remove-bookmark hover:underline text-red-400 ml-0.5" data-id="${post.id}">remove</a>
                                    </span>
                                </span>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    let currentFolder = 'To Learn';
    const currentHash = window.location.hash.substring(1);
    if (currentHash.startsWith('saved/')) {
        const folderSlug = currentHash.split('/')[1];
        const matchedFolder = activeFolders.find(f => f.replace(/\s+/g, '-').toLowerCase() === folderSlug.toLowerCase());
        if (matchedFolder) currentFolder = matchedFolder;
    }

    let html = `
        <div class="folder-dashboard">
            <div class="flex flex-wrap gap-4 mb-4 pb-1 border-b border-gray-100">
                ${activeFolders.map(f => `
                    <a href="#saved/${f.replace(/\s+/g, '-')}" class="folder-chip py-1 text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer focus:outline-none ${f === currentFolder ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}" data-folder="${f}">
                        ${f} <span class="opacity-50 ml-0.5 font-normal">(${organized[f].length})</span>
                    </a>
                `).join('')}
            </div>
            <div id="folder-active-content" class="min-h-[120px] mt-2">
                ${renderFolderContent(currentFolder)}
            </div>
        </div>
    `;

    listEl.innerHTML = html;

    const chips = listEl.querySelectorAll('.folder-chip');
    const activeContent = document.getElementById('folder-active-content');

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

        activeContent.innerHTML = renderFolderContent(targetFolder);
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
        listEl.innerHTML = '<p class="text-gray-500 italic py-2">No hidden stories.</p>';
        return;
    }

    if (!supabase) {
        listEl.innerHTML = '<p class="text-gray-500 italic py-2">Cannot load hidden stories.</p>';
        return;
    }

    const numericIds = hiddenIds.map(id => parseInt(id)).filter(id => !isNaN(id));

    const { data: posts, error } = await supabase
        .from('blogs')
        .select('id, title, slug, url, published_at, likes_count, comments_count, author')
        .in('id', numericIds);

    if (error || !posts || posts.length === 0) {
        listEl.innerHTML = `<p class="text-gray-500 italic py-2">${hiddenIds.length} hidden stories (data unavailable).</p>`;
        return;
    }

    let html = '<ul class="space-y-2">';
    posts.forEach(blog => {
        const timeAgo = calculateTimeAgo(blog.published_at);
        html += `
            <li class="py-1 border-b border-gray-100 last:border-0 flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <a href="${blog.url || `pulse/index.html?s=${blog.slug}`}" class="hover:underline text-black font-medium">${sanitize(blog.title)}</a>
                    <div class="text-xs text-gray-500 mt-0.5">${timeAgo} · ${blog.likes_count || 0} points · by ${sanitize(blog.author || 'anonymous')}</div>
                </div>
                <button class="unhide-btn text-xs text-[#ff6600] hover:underline flex-shrink-0 mt-0.5 cursor-pointer" data-id="${blog.id}">unhide</button>
            </li>
        `;
    });
    html += '</ul>';
    listEl.innerHTML = html;

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
                        listEl.innerHTML = '<p class="text-gray-500 italic py-2">No hidden stories.</p>';
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

    let initialAbout = aboutInput.value;
    let initialIsPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;

    updateBtn.style.display = 'none';

    function checkForChanges() {
        const hasChanged = aboutInput.value !== initialAbout ||
            (isPublicCheckbox && isPublicCheckbox.checked !== initialIsPublic);
        updateBtn.style.display = hasChanged ? 'inline-block' : 'none';
    }

    aboutInput.addEventListener('input', checkForChanges);
    if (isPublicCheckbox) isPublicCheckbox.addEventListener('change', checkForChanges);

    updateBtn.addEventListener('click', async () => {
        const aboutText = aboutInput.value.trim();
        const isPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;
        updateBtn.disabled = true;
        updateBtn.textContent = 'updating...';

        const { error } = await supabase
            .from('profiles')
            .update({ about: aboutText, is_public: isPublic })
            .eq('id', userId);

        if (error) {
            alert('Failed to update profile.');
            updateBtn.disabled = false;
            updateBtn.textContent = 'update';
        } else {
            initialAbout = aboutInput.value;
            initialIsPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;

            updateBtn.textContent = 'updated ✓';
            setTimeout(() => {
                updateBtn.textContent = 'update';
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
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="animate-spin inline-block w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full mb-4"></div>
                <p class="text-gray-500 text-sm italic">Fetching your media gallery...</p>
            </div>
        `;

        const files = await listUserMedia();

        if (files.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12 bg-white rounded border border-dashed border-gray-300">
                    <span class="material-symbols-outlined text-gray-300" style="font-size:48px">photo_library</span>
                    <p class="text-gray-500 text-sm mt-2">No photos found in your library.</p>
                </div>
            `;
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

        let html = '';
        files.forEach(f => {
            const isImg = isImage(f.name);
            const icon = getFileIcon(f.name);

            html += `
                <div class="group relative aspect-passport bg-white rounded border border-gray-200 overflow-hidden hover:border-[#ff6600] transition-all shadow-sm hover:shadow-md cursor-pointer media-item" 
                     data-url="${f.url}" 
                     data-is-img="${isImg}"
                     onclick="window.open('${f.url}', '_blank')">
                    ${isImg
                    ? `<img src="${f.url}" class="w-full h-full object-cover" loading="lazy">`
                    : `<div class="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-2 text-center">
                             <span class="material-symbols-outlined text-3xl mb-1">${icon}</span>
                             <span class="text-[9px] truncate w-full px-1">${sanitize(f.name.split('-')[0])}</span>
                           </div>`
                }
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                        <span class="text-white text-[10px] font-bold truncate w-full">${sanitize(f.name)}</span>
                        <button class="mt-2 bg-white text-black text-[9px] px-2 py-1 rounded font-bold hover:bg-[#ff6600] hover:text-white transition-colors" onclick="event.stopPropagation(); navigator.clipboard.writeText('${f.url}'); alert('URL copied to clipboard!')">
                            Copy Link
                        </button>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;

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

        previewTooltip.innerHTML = `<iframe src="${viewerUrl}" class="preview-frame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
        previewTooltip.classList.add('visible');
        updatePreviewPos(e);
    }

    function hidePreview() {
        previewTooltip.classList.remove('visible');
        previewTooltip.innerHTML = '';
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
        uploadBtn.innerHTML = '<span class="animate-spin material-symbols-outlined" style="font-size:14px">sync</span> Uploading...';

        const result = await uploadMediaFile(file);

        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">upload_file</span> Upload New';

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

    listEl.innerHTML = '<div class="py-4 text-gray-500 italic">Loading your comments...</div>';

    const comments = await getUserComments(userId);

    if (comments.length === 0) {
        listEl.innerHTML = '<p class="text-gray-500 italic py-4">You haven\'t posted any comments yet.</p>';
        return;
    }

    const sortedComments = [...comments].sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return commentSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    let html = `
        <div class="flex items-center gap-4 mb-4 pb-1 border-b border-gray-100">
            <button class="sort-comments text-[11px] font-bold uppercase tracking-widest cursor-pointer transition-all ${commentSortOrder === 'newest' ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}" data-sort="newest">Newest First</button>
            <button class="sort-comments text-[11px] font-bold uppercase tracking-widest cursor-pointer transition-all ${commentSortOrder === 'oldest' ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}" data-sort="oldest">Oldest First</button>
        </div>
        <div class="space-y-6">
    `;

    sortedComments.forEach(comment => {
        const timeAgo = calculateTimeAgo(comment.created_at);
        const story = comment.blogs || { title: 'Unknown Story', slug: '#' };

        html += `
            <div class="comment-item pb-4 border-b border-gray-100 last:border-0" data-id="${comment.id}" data-blog-id="${comment.blog_id}">
                <div class="text-[11px] text-gray-500 mb-1 flex items-center justify-between">
                    <span>
                        <span class="text-gray-400 text-[12px] select-none mr-1">›</span>
                        on <a href="pulse/index.html?s=${story.slug}" class="text-black font-medium hover:underline">${sanitize(story.title)}</a>
                        · ${timeAgo}
                    </span>
                    <div class="flex items-center gap-3">
                        <button class="edit-comment-btn text-gray-400 hover:text-[#ff6600] cursor-pointer transition-colors" data-id="${comment.id}" title="Edit comment">
                            <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                        </button>
                        <button class="delete-comment-btn text-gray-400 hover:text-red-600 cursor-pointer transition-colors" data-id="${comment.id}" title="Delete comment">
                            <span class="material-symbols-outlined" style="font-size:16px">delete</span>
                        </button>
                    </div>
                </div>
                <div class="comment-body text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ml-4">${sanitize(comment.comment_text)}</div>
                <div class="edit-mode hidden mt-2 ml-4">
                    <textarea class="w-full border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#ff6600] rounded-sm resize-y h-24 mb-2">${sanitize(comment.comment_text)}</textarea>
                    <div class="flex items-center gap-2">
                        <button class="save-comment-btn bg-[#ff6600] text-white px-3 py-1 text-xs rounded hover:bg-[#e65c00] transition-colors cursor-pointer">save</button>
                        <button class="cancel-edit-btn text-gray-500 text-xs hover:underline cursor-pointer">cancel</button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    listEl.innerHTML = html;

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
                        listEl.innerHTML = '<p class="text-gray-500 italic py-4">You haven\'t posted any comments yet.</p>';
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

    listEl.innerHTML = '<div class="py-4 text-gray-500 italic">Loading subscriptions...</div>';

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

        return `
            <div class="flex items-center gap-3 p-2 bg-white rounded border border-gray-100 hover:border-[#ff6600] transition-colors">
                <div class="w-8 h-8 ${bgClass} rounded-full flex items-center justify-center text-xs font-bold ${colorClass} uppercase overflow-hidden">
                    ${p.avatar_url ? `<img src="${p.avatar_url}" class="w-full h-full object-cover">` : (p.username ? p.username.charAt(0) : '?')}
                </div>
                <div class="flex-1 min-w-0">
                    <a href="${profileHref(p.username)}" class="text-sm font-medium text-black hover:underline block truncate">${sanitize(p.username)}</a>
                    <p class="text-[10px] text-gray-400 truncate">${sanitize(p.about || '')}</p>
                </div>
                ${currentUserId && !isMe ? `
                    <button class="sub-follow-btn text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer whitespace-nowrap ${isFollowed ? 'bg-white border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200' : 'bg-white border-[#ff6600] text-[#ff6600] hover:bg-[#ff6600] hover:text-white'}" 
                            data-id="${p.id}" 
                            data-followed="${isFollowed}">
                        ${isFollowed ? 'Following' : 'Follow'}
                    </button>
                ` : ''}
            </div>
        `;
    }

    let html = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-100 pb-1 flex items-center gap-2">
                    <span class="material-symbols-outlined" style="font-size:14px">person_add</span>
                    Following (${following.length})
                </h3>
                ${following.length === 0 ? '<p class="text-gray-400 italic text-xs">Not following anyone yet.</p>' : `
                    <div class="space-y-3">
                        ${following.map(p => renderUserItem(p, 'following')).join('')}
                    </div>
                `}
            </div>
            <div>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-100 pb-1 flex items-center gap-2">
                    <span class="material-symbols-outlined" style="font-size:14px">group</span>
                    Followers (${followers.length})
                </h3>
                ${followers.length === 0 ? '<p class="text-gray-400 italic text-xs">No followers yet.</p>' : `
                    <div class="space-y-3">
                        ${followers.map(p => renderUserItem(p, 'followers')).join('')}
                    </div>
                `}
            </div>
        </div>
    `;

    listEl.innerHTML = html;

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
