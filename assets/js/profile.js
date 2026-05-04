import { supabase, calculateTimeAgo, sanitize, getBookmarkedPosts, toggleFollow, isFollowing, getFollowerCount, getFollowingCount, uploadAvatar, deleteAvatar, deleteStory, listUserMedia, uploadMediaFile } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const profileContainer = document.getElementById('profile-container');
    const authMessage = document.getElementById('auth-message');
    const usernameEl = document.getElementById('profile-username');
    const createdEl = document.getElementById('profile-created');
    const karmaEl = document.getElementById('profile-karma');
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

    if (!supabase) return;

    const urlParams = new URLSearchParams(window.location.search);
    const viewingUser = urlParams.get('user');

    const { data: { session } } = await supabase.auth.getSession();

    // Setup Tabs
    setupTabs();

    // If viewing another user's profile (public mode)
    if (viewingUser) {
        profileContainer.classList.remove('hidden');

        // Hide edit controls for public profiles
        if (aboutInput) aboutInput.disabled = true;
        if (updateBtn) updateBtn.style.display = 'none';

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', viewingUser)
            .maybeSingle();

        if (!profile) {
            usernameEl.textContent = viewingUser;
            createdEl.textContent = 'Unknown';
            karmaEl.textContent = '0';
            if (aboutInput) aboutInput.value = '';
            submissionsEl.innerHTML = '<p class="text-gray-500 italic">User not found or no profile.</p>';
            return;
        }

        // Check if this is our own profile — re-enable editing
        const isOwnProfile = session && session.user.id === profile.id;

        if (isOwnProfile) {
            if (aboutInput) aboutInput.disabled = false;
            if (updateBtn) updateBtn.style.display = '';
            document.getElementById('tab-saved')?.classList.remove('hidden');
            if (privacyContainer) privacyContainer.style.display = '';
            setupAvatarEdit(profile);
            setupMediaLibrary();
        } else if (session) {
            // Show follow button for other users
            followBtn.classList.remove('hidden');
            setupFollowButton(profile.id);
        }

        await setProfileData(profile);
        await loadSubmissions(profile.username, isOwnProfile);

        // Show bookmarks for all public profiles
        document.getElementById('tab-saved')?.classList.remove('hidden');
        await loadBookmarks(profile.id);

        if (isOwnProfile) {
            setupUpdateButton(session.user.id);
        }

        // Always load hidden stories (localStorage, client-side only)
        await loadHiddenStories();

        return;
    }

    // Own profile (no ?user= param)
    if (!session) {
        authMessage.classList.remove('hidden');
        return;
    }

    profileContainer.classList.remove('hidden');
    document.getElementById('tab-saved')?.classList.remove('hidden');

    const userId = session.user.id;
    const userEmail = session.user.email;
    const defaultUsername = userEmail.split('@')[0];

    // Fetch profile
    let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    // If profile doesn't exist, create it
    if (!profile) {
        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ id: userId, username: defaultUsername }])
            .select()
            .single();

        if (!insertError) {
            profile = newProfile;
        }
    }

    if (profile) {
        await setProfileData(profile);
        setupAvatarEdit(profile);
        if (privacyContainer) privacyContainer.style.display = '';
    } else {
        usernameEl.textContent = defaultUsername;
        setAvatarLetter(defaultUsername);
    }

    await loadSubmissions(profile?.username || defaultUsername, true);
    await loadBookmarks();
    await loadHiddenStories();
    setupUpdateButton(userId);
    setupMediaLibrary();

    // ---- Set Profile Data ---- //
    async function setProfileData(p) {
        usernameEl.textContent = p.username;
        document.title = `${p.username}'s Profile - K. Notes`;
        createdEl.textContent = new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        if (aboutInput) aboutInput.value = p.about || '';

        // Avatar: show image if avatar_url exists, else show letter
        if (p.avatar_url) {
            setAvatarImage(p.avatar_url, p.username);
        } else {
            setAvatarLetter(p.username);
        }

        // Karma = follower count
        const followers = await getFollowerCount(p.id);
        if (karmaEl) karmaEl.textContent = followers;

        // Set privacy checkbox state
        if (isPublicCheckbox && p.is_public !== undefined) {
            isPublicCheckbox.checked = p.is_public === true;
        }
    }

    // ---- Avatar Helpers ---- //
    function setAvatarLetter(username) {
        if (!avatarEl) return;
        const colors = ['bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-yellow-200', 'bg-purple-200', 'bg-pink-200'];
        const charCode = (username || '?').charCodeAt(0) || 0;
        const colorClass = colors[charCode % colors.length];
        avatarEl.className = `w-16 h-16 rounded flex items-center justify-center text-2xl font-bold text-gray-700 uppercase flex-shrink-0 overflow-hidden ${colorClass}`;
        avatarEl.innerHTML = '';
        avatarEl.textContent = (username || '?').charAt(0).toUpperCase();
    }

    function setAvatarImage(url, username) {
        if (!avatarEl) return;
        avatarEl.className = 'w-16 h-16 rounded flex-shrink-0 overflow-hidden bg-gray-200';
        avatarEl.innerHTML = `<img src="${url}" alt="${sanitize(username)}" class="avatar-img" onerror="this.remove()">`;
    }

    // ---- Avatar Edit (pencil) ---- //
    function setupAvatarEdit(profile) {
        if (!avatarEditBtn) return;
        avatarEditBtn.classList.remove('hidden');

        // Toggle menu
        avatarEditBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            avatarMenu.classList.toggle('hidden');
        });

        // Close menu on outside click
        document.addEventListener('click', () => {
            avatarMenu.classList.add('hidden');
        });

        // Upload
        document.getElementById('avatar-upload-btn')?.addEventListener('click', () => {
            avatarMenu.classList.add('hidden');
            avatarFileInput.click();
        });

        avatarFileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate size (max 2MB)
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

        // Delete
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

    // ---- Follow Button ---- //
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

            // Update karma count on page
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

// ---- Tabs ---- //
function setupTabs() {
    const tabs = document.querySelectorAll('.profile-tab');
    const panes = document.querySelectorAll('.tab-pane');

    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || 'all';

    function switchTab(target) {
        tabs.forEach(t => {
            const isTarget = t.getAttribute('data-tab') === target;
            if (isTarget) {
                t.classList.add('font-bold', 'text-black', 'border-b-2', 'border-[#ff6600]');
                t.classList.remove('text-gray-600');
            } else {
                t.classList.remove('font-bold', 'text-black', 'border-b-2', 'border-[#ff6600]');
                t.classList.add('text-gray-600');
            }
        });

        panes.forEach(p => p.classList.add('hidden'));
        const activePane = document.getElementById(`tab-content-${target}`);
        if (activePane) activePane.classList.remove('hidden');
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab.getAttribute('data-tab'));
        });
    });

    // Auto-switch to tab from URL
    if (initialTab !== 'all') {
        switchTab(initialTab);
    }
}

// ---- List Rendering ---- //
function generateListHtml(blogs, showDelete = false) {
    if (blogs.length === 0) {
        return '<p class="text-gray-500 italic py-2">Nothing here yet.</p>';
    }

    let html = '<ul class="space-y-4">'; 
    blogs.forEach(blog => {
        const timeAgo = calculateTimeAgo(blog.published_at);
        const deleteBtnHtml = showDelete ? `<span class="material-symbols-outlined delete-post-btn cursor-pointer text-gray-400 hover:text-red-600 ml-1.5 align-middle transition-colors" style="font-size: 14px;" data-id="${blog.id}" title="Delete post">delete</span>` : '';

        html += `
            <li class="py-1.5 last:border-0">
                <div class="flex items-baseline gap-2">
                    <span class="text-gray-400 text-[12px] select-none">›</span>
                    <a href="${blog.url || `pulse/index.html?s=${blog.slug}`}" class="hover:underline text-[14px] text-black font-medium leading-tight">${sanitize(blog.title)}</a>
                    ${deleteBtnHtml}
                </div>
                <div class="text-[11px] text-gray-500 opacity-60 ml-4">${timeAgo} · ${blog.comments_count || 0} comments</div>
            </li>
        `;
    });
    html += '</ul>';
    return html;
}

// ---- Submissions ---- //
async function loadSubmissions(username, isOwnProfile = false) {
    const { data: blogs, error: blogsError } = await supabase
        .from('blogs')
        .select('likes_count, id, title, published_at, url, slug, comments_count, category, content')
        .eq('author', username)
        .order('published_at', { ascending: false });

    if (blogsError) return;

    const allEl = document.getElementById('profile-submissions');
    const newsEl = document.getElementById('profile-submissions-news');
    const showEl = document.getElementById('profile-submissions-show');
    const askEl = document.getElementById('profile-submissions-ask');

    if (allEl) allEl.innerHTML = generateListHtml(blogs, isOwnProfile);
    if (newsEl) newsEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'news'), isOwnProfile);
    if (showEl) showEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'show'), isOwnProfile);
    if (askEl) askEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'ask'), isOwnProfile);
}

// ---- Bookmarks (Reading Lists) ---- //
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

async function loadBookmarks(userId = null) {
    const listEl = document.getElementById('bookmarks-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="py-4 text-gray-500 italic">Loading your library...</div>';

    const { data: { session } } = await supabase.auth.getSession();
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

    // Organize by folder
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
                            <div class="story-meta flex items-center gap-1 opacity-60 ml-4.5">
                                <span class="text-[11px]">
                                    by ${post.author} ${timeAgo} | 
                                    <span class="bookmark-container">
                                        <select class="move-folder folder-picker" data-id="${post.id}" data-current-folder="${folderName}">
                                            <option value="" disabled selected>+</option>
                                            ${DEFAULT_FOLDERS.map(f => `<option value="${f}" ${f === folderName ? 'disabled' : ''}>${f}</option>`).join('')}
                                            <option value="Uncategorized" ${folderName === 'Uncategorized' ? 'disabled' : ''}>Uncategorized</option>
                                        </select>
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

    let html = `
        <div class="folder-dashboard">
            <div class="flex flex-wrap gap-4 mb-4 pb-1 border-b border-gray-100">
                ${activeFolders.map(f => `
                    <button class="folder-chip py-1 text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer focus:outline-none ${f === 'Reading List' ? 'text-[#ff6600] border-b-2 border-[#ff6600]' : 'text-gray-400 hover:text-black'}" data-folder="${f}">
                        ${f} <span class="opacity-50 ml-0.5 font-normal">(${organized[f].length})</span>
                    </button>
                `).join('')}
            </div>
            <div id="folder-active-content" class="min-h-[120px] mt-2">
                ${renderFolderContent('Reading List')}
            </div>
        </div>
    `;

    listEl.innerHTML = html;

    // Add listeners for folder chips
    const chips = listEl.querySelectorAll('.folder-chip');
    const activeContent = document.getElementById('folder-active-content');

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => {
                c.classList.remove('text-[#ff6600]', 'border-b-2', 'border-[#ff6600]');
                c.classList.add('text-gray-400');
            });
            chip.classList.add('text-[#ff6600]', 'border-b-2', 'border-[#ff6600]');
            chip.classList.remove('text-gray-400');

            const folder = chip.getAttribute('data-folder');
            activeContent.innerHTML = renderFolderContent(folder);
            attachBookmarkListeners(activeContent);
        });
    });

    function attachBookmarkListeners(container) {
        container.querySelectorAll('.move-folder').forEach(select => {
            select.addEventListener('change', async (e) => {
                const storyId = e.target.getAttribute('data-id');
                const newFolder = e.target.value;
                moveStoryToFolder(currentUserId, storyId, newFolder);
                await loadBookmarks(currentUserId);
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

// ---- Hidden Stories (from localStorage) ---- //
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

    // Unhide button handlers
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

// ---- Update Profile ---- //
function setupUpdateButton(userId) {
    const updateBtn = document.getElementById('btn-update-profile');
    const aboutInput = document.getElementById('profile-about');
    const isPublicCheckbox = document.getElementById('profile-is-public');
    if (!updateBtn || !aboutInput) return;

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
        } else {
            updateBtn.textContent = 'updated ✓';
            setTimeout(() => { updateBtn.textContent = 'update'; }, 1500);
        }

        updateBtn.disabled = false;
    });
}

// ---- Media Library ---- //
function setupMediaLibrary() {
    const btnMedia = document.getElementById('btn-media-library-profile');
    const modal = document.getElementById('media-library-modal');
    const closeBtn = document.getElementById('btn-close-media');
    const grid = document.getElementById('media-library-grid');
    const uploadBtn = document.getElementById('btn-upload-more');
    const uploadInput = document.getElementById('media-upload-input');

    if (!btnMedia || !modal) return;

    btnMedia.addEventListener('click', async () => {
        modal.classList.remove('hidden');
        loadMediaFiles();
    });

    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    // Close on Esc key
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

        // Preview Logic
        grid.querySelectorAll('.media-item').forEach(item => {
            item.addEventListener('mouseenter', (e) => {
                const url = item.getAttribute('data-url');
                const isImg = item.getAttribute('data-is-img') === 'true';
                if (!isImg) showPreview(url, e);
            });
            item.addEventListener('mouseleave', hidePreview);
        });
    }

    // Preview Tooltip Element & Functions
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

    // Upload logic
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

// Global click listener for deleting posts
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-post-btn')) {
        const id = e.target.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this post? This cannot be undone.')) {
            e.target.style.opacity = '0.5';
            e.target.style.pointerEvents = 'none';
            const result = await deleteStory(id);
            if (result.error) {
                alert(result.error);
                e.target.style.opacity = '1';
                e.target.style.pointerEvents = 'auto';
            } else {
                const li = e.target.closest('li');
                if (li) {
                    li.style.transition = 'opacity 0.3s';
                    li.style.opacity = '0';
                    setTimeout(() => li.remove(), 300);
                }
            }
        }
    }
});
