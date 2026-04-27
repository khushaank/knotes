import { supabase, calculateTimeAgo, sanitize, getBookmarkedPosts } from './supabaseClient.js';

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
        if (session && session.user.id === profile.id) {
            if (aboutInput) aboutInput.disabled = false;
            if (updateBtn) updateBtn.style.display = '';
            document.getElementById('tab-saved')?.classList.remove('hidden');
        }

        setProfileData(profile);
        await loadSubmissions(profile.username);

        // Show bookmarks only for own profile
        if (session && session.user.id === profile.id) {
            await loadBookmarks();
            setupUpdateButton(session.user.id);
        }

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
        setProfileData(profile);
    } else {
        usernameEl.textContent = defaultUsername;
        avatarEl.textContent = defaultUsername.charAt(0).toUpperCase();
    }

    await loadSubmissions(profile?.username || defaultUsername);
    await loadBookmarks();
    setupUpdateButton(userId);

    function setProfileData(p) {
        usernameEl.textContent = p.username;
        document.title = `${p.username}'s Profile - K. Notes`;
        createdEl.textContent = new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        if (aboutInput) aboutInput.value = p.about || '';
        
        if (avatarEl) {
            avatarEl.textContent = p.username.charAt(0).toUpperCase();
            // Optional: generate a consistent background color based on username
            const colors = ['bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-yellow-200', 'bg-purple-200', 'bg-pink-200'];
            const charCode = p.username.charCodeAt(0) || 0;
            const colorClass = colors[charCode % colors.length];
            avatarEl.className = `w-20 h-20 rounded-md flex items-center justify-center text-3xl font-bold text-gray-700 uppercase ${colorClass}`;
        }
    }
});

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

function generateListHtml(blogs) {
    if (blogs.length === 0) {
        return '<p class="text-gray-500 italic">Nothing found here yet.</p>';
    }
    
    let html = '<ul class="space-y-2">';
    blogs.forEach(blog => {
        const timeAgo = calculateTimeAgo(blog.published_at);
        html += `
            <li>
                <a href="${blog.url || `pulse/index.html?s=${blog.slug}`}" class="hover:underline text-black font-medium">${sanitize(blog.title)}</a>
                <span class="text-xs text-gray-500 ml-2">${timeAgo} | ${blog.likes_count || 0} points | ${blog.comments_count || 0} comments</span>
            </li>
        `;
    });
    html += '</ul>';
    return html;
}

async function loadSubmissions(username) {
    const karmaEl = document.getElementById('profile-karma');

    const { data: blogs, error: blogsError } = await supabase
        .from('blogs')
        .select('likes_count, id, title, published_at, url, slug, comments_count, category')
        .eq('author', username)
        .order('published_at', { ascending: false });

    if (blogsError) return;

    const karma = blogs.reduce((sum, blog) => sum + (blog.likes_count || 0), 0);
    if (karmaEl) karmaEl.textContent = karma;

    const allEl = document.getElementById('profile-submissions');
    const newsEl = document.getElementById('profile-submissions-news');
    const showEl = document.getElementById('profile-submissions-show');
    const askEl = document.getElementById('profile-submissions-ask');

    if (allEl) allEl.innerHTML = generateListHtml(blogs);
    if (newsEl) newsEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'news'));
    if (showEl) showEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'show'));
    if (askEl) askEl.innerHTML = generateListHtml(blogs.filter(b => b.category === 'ask'));
}

async function loadBookmarks() {
    const listEl = document.getElementById('bookmarks-list');
    if (!listEl) return;

    const posts = await getBookmarkedPosts();
    listEl.innerHTML = generateListHtml(posts);
}

function setupUpdateButton(userId) {
    const updateBtn = document.getElementById('btn-update-profile');
    const aboutInput = document.getElementById('profile-about');
    if (!updateBtn || !aboutInput) return;

    updateBtn.addEventListener('click', async () => {
        const aboutText = aboutInput.value.trim();
        updateBtn.disabled = true;
        updateBtn.textContent = 'updating...';

        const { error } = await supabase
            .from('profiles')
            .update({ about: aboutText })
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
