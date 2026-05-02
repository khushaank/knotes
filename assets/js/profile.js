import { supabase, calculateTimeAgo, sanitize, getBookmarkedPosts, toggleFollow, isFollowing, getFollowerCount, getFollowingCount, uploadAvatar, deleteAvatar, deleteStory } from './supabaseClient.js';

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

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const target = tab.getAttribute('data-tab');

            tabs.forEach(t => {
                t.classList.remove('font-bold', 'text-black', 'border-b-2', 'border-[#ff6600]');
                t.classList.add('text-gray-600');
            });
            tab.classList.add('font-bold', 'text-black', 'border-b-2', 'border-[#ff6600]');
            tab.classList.remove('text-gray-600');

            panes.forEach(p => p.classList.add('hidden'));
            document.getElementById(`tab-content-${target}`)?.classList.remove('hidden');
        });
    });
}

// ---- List Rendering ---- //
function generateListHtml(blogs, showDelete = false) {
    if (blogs.length === 0) {
        return '<p class="text-gray-500 italic py-2">Nothing here yet.</p>';
    }

    let html = '<ul class="space-y-4">'; // increased spacing
    blogs.forEach(blog => {
        const timeAgo = calculateTimeAgo(blog.published_at);
        const deleteBtnHtml = showDelete ? `<span class="material-symbols-outlined delete-post-btn cursor-pointer text-gray-400 hover:text-red-600 ml-2 align-middle transition-colors" style="font-size: 16px;" data-id="${blog.id}" title="Delete post">delete</span>` : '';

        html += `
            <li class="py-2 border-b border-gray-100 last:border-0">
                <div class="flex items-center">
                    <a href="${blog.url || `pulse/index.html?s=${blog.slug}`}" class="hover:underline text-black font-medium">${sanitize(blog.title)}</a>
                    ${deleteBtnHtml}
                </div>
                <div class="text-xs text-gray-500 mt-0.5"><a href="#" onclick="alert('Posted on ' + new Date('${blog.published_at}').toLocaleString() + ' by ${sanitize(blog.author) || 'anonymous'}'); return false;" class="hover:underline text-gray-500">${timeAgo}</a> &middot; ${blog.likes_count || 0} points &middot; ${blog.comments_count || 0} comments</div>
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

// ---- Bookmarks ---- //
async function loadBookmarks(userId = null) {
    const listEl = document.getElementById('bookmarks-list');
    if (!listEl) return;

    const posts = await getBookmarkedPosts(userId);
    listEl.innerHTML = generateListHtml(posts);
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
