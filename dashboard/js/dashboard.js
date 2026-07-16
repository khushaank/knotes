let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let createClient = null;
const SUPABASE_TIMEOUT_MS = 8000;

function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function createTimeoutFetch(timeoutMs = SUPABASE_TIMEOUT_MS) {
    return async (input, init = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(input, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    };
}

try {
    const supabaseModule = await withTimeout(
        import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),
        SUPABASE_TIMEOUT_MS,
        'Supabase client'
    );
    createClient = supabaseModule.createClient;
} catch (e) {
    console.warn('Supabase client library could not be loaded.', e);
}

try {
    const config = await import('./supabaseConfig.js');
    SUPABASE_URL = config.SUPABASE_URL;
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
} catch (e) {
    console.warn('dashboard/js/supabaseConfig.js not found or failed to load.', e);
}

const supabase = (createClient && SUPABASE_URL)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: createTimeoutFetch() } })
    : null;

// Limit words helper
function limitWords(str, maxWords = 5) {
    if (typeof str !== 'string') return '';
    const words = str.trim().split(/\s+/);
    if (words.length <= maxWords) return str;
    return words.slice(0, maxWords).join(' ') + '…';
}

// =============================================
// SAFE DOM HELPERS (XSS Prevention)
// =============================================

/**
 * Creates a table message row with safe textContent (no innerHTML).
 * Used for loading, empty-state, and error messages.
 */
function createMessageRow(colspan, text, style) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', colspan);
    if (style) td.setAttribute('style', style);
    td.textContent = text;
    tr.appendChild(td);
    return tr;
}

/**
 * Parses a static SVG string into a DOM node using DOMParser.
 * MUST only be used with developer-controlled static strings, never user data.
 */
function parseSvgIcon(svgString) {
    const doc = new DOMParser().parseFromString(svgString.trim(), 'image/svg+xml');
    return doc.documentElement;
}

/**
 * Creates the three-dot menu button with an SVG icon using safe DOM APIs.
 */
function createDotsButton() {
    const btn = document.createElement('button');
    btn.className = 'btn-dots';
    const svg = parseSvgIcon(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`);
    btn.appendChild(svg);
    return btn;
}

/**
 * Creates a share SVG icon node.
 */
function createShareIcon() {
    return parseSvgIcon(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`);
}

/**
 * Creates a trash/delete SVG icon node.
 */
function createTrashIcon() {
    return parseSvgIcon(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`);
}

let currentUser = null;
let currentProfile = null;
let allPosts = [];
let allComments = [];
let myWrittenComments = [];

// =============================================
// INIT
// =============================================
async function initDashboard() {
    await checkUserAuth();
    setupSidebar();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

// =============================================
// AUTHENTICATION
// =============================================
async function checkUserAuth() {
    if (!supabase) {
        document.getElementById('loading-overlay')?.classList.add('hidden');

        // Build configuration-missing page with safe DOM APIs
        const wrapper = document.createElement('div');
        wrapper.setAttribute('style', 'display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:20px; font-family:Inter, sans-serif; background:var(--bg-body); color:var(--text-primary); text-align:center; padding: 20px;');

        const logo = document.createElement('img');
        logo.src = '../assets/img/logo.png';
        logo.alt = 'K. Notes';
        logo.setAttribute('style', 'height: 64px;');

        const h1 = document.createElement('h1');
        h1.setAttribute('style', 'font-size:24px; font-weight:700; color:#ff6600;');
        h1.textContent = 'Configuration Missing';

        const p = document.createElement('p');
        p.setAttribute('style', 'color:var(--text-secondary); max-width:400px; line-height:1.6;');
        p.textContent = 'The Creator Dashboard configuration file (supabaseConfig.js) is missing or could not be loaded. Please ensure your environment is set up correctly.';

        const link = document.createElement('a');
        link.href = '../home';
        link.className = 'btn btn-primary';
        link.setAttribute('style', 'text-decoration:none; padding:10px 20px; font-weight:600; border-radius: 4px; border: none; cursor: pointer; color: white; background: #ff6600;');
        link.textContent = 'Back to Site';

        wrapper.appendChild(logo);
        wrapper.appendChild(h1);
        wrapper.appendChild(p);
        wrapper.appendChild(link);

        document.body.replaceChildren(wrapper);
        return;
    }
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        // Not logged in -> Redirect to standard blog login
        window.location.href = '../login';
        return;
    }

    currentUser = session.user;

    // Fetch user profile to get creator details
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error || !profile) {
        currentProfile = {
            id: currentUser.id,
            username: currentUser.email.split('@')[0]
        };
    } else {
        currentProfile = profile;
    }

    // Populate Creator Username
    document.getElementById('admin-name').textContent = currentProfile.username;

    // Hide loader, show dashboard shell
    document.getElementById('loading-overlay')?.classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');

    // Register Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '../login';
    });

    // Load user data
    await loadCreatorData();
}

// =============================================
// DATA LOADERS (Personalized to Logged-in User)
// =============================================
async function loadCreatorData() {
    await Promise.all([loadPosts(), loadMyWrittenComments()]);
    await loadComments();
    await populateOverviewMetrics();
}

async function loadPosts() {
    const tbody = document.querySelector('#posts-table tbody');
    tbody.replaceChildren(createMessageRow(4, 'Loading...', 'text-align:center;padding:24px;'));

    const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('author_id', currentUser.id)
        .order('published_at', { ascending: false });

    if (error) {
        tbody.replaceChildren(createMessageRow(4, 'Error: ' + error.message, 'color:var(--red)'));
        return;
    }

    allPosts = data || [];
    renderPostsTable(allPosts);
}

function renderPostsTable(postsList) {
    const tbody = document.querySelector('#posts-table tbody');
    if (!postsList || postsList.length === 0) {
        tbody.replaceChildren(createMessageRow(4, 'No posts written yet. Create your first post above!', 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }

    const fragment = document.createDocumentFragment();

    postsList.forEach((post) => {
        const isPublished = post.status === 'published';
        const dateStr = post.published_at ? new Date(post.published_at).toLocaleDateString() : 'N/A';
        const relUrl = `../pulse/home?s=${encodeURIComponent(post.slug)}`;

        const tr = document.createElement('tr');

        // Title cell
        const tdTitle = document.createElement('td');
        tdTitle.setAttribute('data-label', 'Title');
        const titleLink = document.createElement('a');
        titleLink.href = relUrl;
        titleLink.target = '_blank';
        titleLink.setAttribute('style', 'color:var(--text-primary); font-weight:600; text-decoration:none; transition:color var(--transition);');
        titleLink.textContent = limitWords(post.title, 6);
        tdTitle.appendChild(titleLink);

        // Status cell
        const tdStatus = document.createElement('td');
        tdStatus.setAttribute('data-label', 'Status');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${isPublished ? 'published' : 'draft'}`;
        statusBadge.textContent = isPublished ? 'Published' : 'Draft';
        tdStatus.appendChild(statusBadge);

        // Date cell
        const tdDate = document.createElement('td');
        tdDate.setAttribute('data-label', 'Date');
        tdDate.setAttribute('style', 'color:var(--text-secondary); font-size:13px;');
        tdDate.textContent = dateStr;

        // Actions cell — store action data as structured attributes
        const tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';
        tdActions.setAttribute('style', 'text-align: center;');
        tdActions.dataset.dropdownType = 'post';
        tdActions.dataset.itemId = post.id;
        tdActions.dataset.itemTitle = post.title;
        tdActions.dataset.itemUrl = relUrl;

        const dotsBtn = createDotsButton();
        dotsBtn.addEventListener('click', (event) => {
            window.creatorActions.toggleRowMenu(event);
        });
        tdActions.appendChild(dotsBtn);

        tr.appendChild(tdTitle);
        tr.appendChild(tdStatus);
        tr.appendChild(tdDate);
        tr.appendChild(tdActions);
        fragment.appendChild(tr);
    });

    tbody.replaceChildren(fragment);
}

async function loadComments() {
    const tbody = document.querySelector('#comments-table tbody');
    tbody.replaceChildren(createMessageRow(4, 'Loading...', 'text-align:center;padding:24px;'));

    if (allPosts.length === 0) {
        tbody.replaceChildren(createMessageRow(4, 'No posts written yet. Comments will appear once you publish a post.', 'text-align:center;padding:24px;color:var(--text-muted);'));
        allComments = [];
        return;
    }

    const postIds = allPosts.map(p => p.id);

    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .in('blog_id', postIds)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.replaceChildren(createMessageRow(4, 'Error: ' + error.message, 'color:var(--red)'));
        return;
    }

    allComments = data || [];
    renderCommentsTable(allComments);
}

function renderCommentsTable(commentsList) {
    const tbody = document.querySelector('#comments-table tbody');
    if (!commentsList || commentsList.length === 0) {
        tbody.replaceChildren(createMessageRow(4, 'No comments left on your posts yet.', 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }

    const fragment = document.createDocumentFragment();

    commentsList.forEach((c) => {
        const dateStr = new Date(c.created_at).toLocaleDateString();

        const tr = document.createElement('tr');

        // Comment cell
        const tdComment = document.createElement('td');
        tdComment.setAttribute('data-label', 'Comment');
        tdComment.setAttribute('style', 'font-weight:500;');
        tdComment.textContent = `"${limitWords(c.comment_text, 8)}"`;

        // User cell
        const tdUser = document.createElement('td');
        tdUser.setAttribute('data-label', 'User');
        tdUser.setAttribute('style', 'color:var(--accent); font-weight:600;');
        tdUser.textContent = `@${c.user_name}`;

        // Date cell
        const tdDate = document.createElement('td');
        tdDate.setAttribute('data-label', 'Date');
        tdDate.setAttribute('style', 'color:var(--text-secondary); font-size:13px;');
        tdDate.textContent = dateStr;

        // Actions cell
        const tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';
        tdActions.setAttribute('style', 'text-align: center;');
        tdActions.dataset.dropdownType = 'comment';
        tdActions.dataset.itemId = c.id;

        const dotsBtn = createDotsButton();
        dotsBtn.addEventListener('click', (event) => {
            window.creatorActions.toggleRowMenu(event);
        });
        tdActions.appendChild(dotsBtn);

        tr.appendChild(tdComment);
        tr.appendChild(tdUser);
        tr.appendChild(tdDate);
        tr.appendChild(tdActions);
        fragment.appendChild(tr);
    });

    tbody.replaceChildren(fragment);
}

async function loadMyWrittenComments() {
    const tbody = document.querySelector('#my-comments-table tbody');
    if (!tbody) return;
    tbody.replaceChildren(createMessageRow(3, 'Loading...', 'text-align:center;padding:24px;'));

    const { data, error } = await supabase
        .from('comments')
        .select('*, blogs(title, slug)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.replaceChildren(createMessageRow(3, 'Error: ' + error.message, 'color:var(--red)'));
        return;
    }

    myWrittenComments = data || [];
    renderMyWrittenCommentsTable(myWrittenComments);
}

function renderMyWrittenCommentsTable(commentsList) {
    const tbody = document.querySelector('#my-comments-table tbody');
    if (!tbody) return;
    if (!commentsList || commentsList.length === 0) {
        tbody.replaceChildren(createMessageRow(3, "You haven't written any comments yet.", 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }

    const fragment = document.createDocumentFragment();

    commentsList.forEach((c) => {
        const dateStr = new Date(c.created_at).toLocaleDateString();
        const postTitle = c.blogs ? c.blogs.title : 'Unknown Post';
        const postSlug = c.blogs ? c.blogs.slug : '#';

        const tr = document.createElement('tr');

        // Comment cell with link to post
        const tdComment = document.createElement('td');
        tdComment.setAttribute('data-label', 'Comment');
        tdComment.setAttribute('style', 'font-weight:500;');

        const commentLink = document.createElement('a');
        commentLink.href = `../pulse/home?s=${encodeURIComponent(postSlug)}`;
        commentLink.target = '_blank';
        commentLink.setAttribute('style', 'color:var(--text-primary); text-decoration:none;');
        commentLink.textContent = `"${limitWords(c.comment_text, 8)}"`;

        const postInfo = document.createElement('div');
        postInfo.setAttribute('style', 'font-size:11px; color:var(--text-muted); margin-top:4px;');
        postInfo.textContent = `On: ${limitWords(postTitle, 6)}`;

        tdComment.appendChild(commentLink);
        tdComment.appendChild(postInfo);

        // Date cell
        const tdDate = document.createElement('td');
        tdDate.setAttribute('data-label', 'Date');
        tdDate.setAttribute('style', 'color:var(--text-secondary); font-size:13px;');
        tdDate.textContent = dateStr;

        // Actions cell
        const tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';
        tdActions.setAttribute('style', 'text-align: center;');
        tdActions.dataset.dropdownType = 'my-comment';
        tdActions.dataset.itemId = c.id;

        const dotsBtn = createDotsButton();
        dotsBtn.addEventListener('click', (event) => {
            window.creatorActions.toggleRowMenu(event);
        });
        tdActions.appendChild(dotsBtn);

        tr.appendChild(tdComment);
        tr.appendChild(tdDate);
        tr.appendChild(tdActions);
        fragment.appendChild(tr);
    });

    tbody.replaceChildren(fragment);
}

// =============================================
// METRICS & ACTIVITIES
// =============================================
async function populateOverviewMetrics() {
    // Total posts
    document.getElementById('metric-posts').textContent = allPosts.length;

    // Total Likes sum
    const totalLikes = allPosts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
    document.getElementById('metric-likes').textContent = totalLikes;

    // Total Comments sum
    document.getElementById('metric-comments').textContent = allComments.length;

    // Total Views (clicks) sum
    const totalClicks = allPosts.reduce((sum, p) => sum + (p.clicks_count || 0), 0);
    document.getElementById('metric-clicks').textContent = totalClicks;

    // Popular posts list
    const topPostsTbody = document.querySelector('#top-posts-table tbody');
    const sortedPopular = [...allPosts]
        .sort((a, b) => ((b.likes_count || 0) + (b.clicks_count || 0)) - ((a.likes_count || 0) + (a.clicks_count || 0)))
        .slice(0, 5);

    if (sortedPopular.length === 0) {
        topPostsTbody.replaceChildren(createMessageRow(3, 'No posts published.', 'color:var(--text-muted);text-align:center;padding:12px;'));
    } else {
        const fragment = document.createDocumentFragment();

        sortedPopular.forEach(p => {
            const tr = document.createElement('tr');

            // Title cell
            const tdTitle = document.createElement('td');
            tdTitle.title = p.title;
            const titleLink = document.createElement('a');
            titleLink.href = `../pulse/home?s=${encodeURIComponent(p.slug)}`;
            titleLink.target = '_blank';
            titleLink.setAttribute('style', 'color:var(--text-primary); text-decoration:none; font-weight:600;');
            titleLink.textContent = limitWords(p.title, 5);
            tdTitle.appendChild(titleLink);

            // Likes cell
            const tdLikes = document.createElement('td');
            const likesStrong = document.createElement('strong');
            likesStrong.setAttribute('style', 'color: #ff6600;');
            likesStrong.textContent = p.likes_count || 0;
            tdLikes.appendChild(likesStrong);

            // Clicks cell
            const tdClicks = document.createElement('td');
            tdClicks.textContent = p.clicks_count || 0;

            tr.appendChild(tdTitle);
            tr.appendChild(tdLikes);
            tr.appendChild(tdClicks);
            fragment.appendChild(tr);
        });

        topPostsTbody.replaceChildren(fragment);
    }

    // Recent Activity List
    populateRecentActivity();

    // Redraw Analytics Charts
    drawPostsChart();
    drawCategoryChart();
    drawCumulativeChart();
}

function populateRecentActivity() {
    const list = document.getElementById('recent-activity-list');
    if (!list) return;

    const activities = [];

    allPosts.slice(0, 5).forEach(p => {
        activities.push({
            type: 'post',
            title: p.title,
            date: p.published_at
        });
    });

    allComments.slice(0, 5).forEach(c => {
        activities.push({
            type: 'comment',
            userName: c.user_name,
            commentText: c.comment_text,
            date: c.created_at
        });
    });

    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (activities.length === 0) {
        const li = document.createElement('li');
        li.className = 'activity-item';
        const dot = document.createElement('span');
        dot.className = 'activity-dot';
        li.appendChild(dot);
        li.appendChild(document.createTextNode('No recent activity.'));
        list.replaceChildren(li);
        return;
    }

    const fragment = document.createDocumentFragment();

    activities.slice(0, 5).forEach(a => {
        const li = document.createElement('li');
        li.className = 'activity-item';

        const dot = document.createElement('span');
        dot.className = 'activity-dot';
        li.appendChild(dot);

        const textSpan = document.createElement('span');

        if (a.type === 'post') {
            textSpan.appendChild(document.createTextNode('You published '));
            const strong = document.createElement('strong');
            strong.title = a.title;
            strong.textContent = limitWords(a.title, 5);
            textSpan.appendChild(strong);
        } else {
            const strong = document.createElement('strong');
            strong.textContent = `@${a.userName}`;
            textSpan.appendChild(strong);
            const commentPreview = a.commentText ? a.commentText.substring(0, 30) : '';
            textSpan.appendChild(document.createTextNode(` commented on your post: "${commentPreview}…"`));
        }

        li.appendChild(textSpan);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'activity-time';
        timeSpan.textContent = timeAgo(a.date);
        li.appendChild(timeSpan);

        fragment.appendChild(li);
    });

    list.replaceChildren(fragment);
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}



// =============================================
// TOAST NOTIFICATIONS
// =============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const toastBody = document.createElement('div');
    toastBody.className = 'toast-body';

    // Build SVG icon safely using DOMParser (static hardcoded strings only)
    let svgString;
    if (type === 'error') {
        svgString = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else if (type === 'info') {
        svgString = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    } else {
        svgString = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }

    const icon = parseSvgIcon(svgString);
    toastBody.appendChild(icon);

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toastBody.appendChild(msgSpan);

    toast.appendChild(toastBody);
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =============================================
// SIDEBAR & ROUTING
// =============================================
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const brandToggle = document.getElementById('sidebar-brand-toggle');

    if (brandToggle && sidebar) {
        brandToggle.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
        });
    }

    // Hash routing
    const hash = window.location.hash.substring(1);

    // Route transitions
    document.querySelectorAll('.nav-item').forEach(btn => {
        const targetId = btn.getAttribute('data-target');
        if (!targetId) return;

        if (hash === targetId) {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
            const targetTab = document.getElementById(targetId);
            if (targetTab) targetTab.classList.remove('hidden');
        }

        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
            const targetTab = document.getElementById(targetId);
            if (targetTab) targetTab.classList.remove('hidden');

            window.history.replaceState(null, '', '#' + targetId);
        });
    });
}

// =============================================
// CHART DEFAULTS & LOGIC
// =============================================
function getChartDefaults() {
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue('--text-secondary').trim();
    const grid = styles.getPropertyValue('--border').trim();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: text, font: { family: 'Inter', size: 12 } } } },
        scales: {
            x: { ticks: { color: text, font: { size: 11 } }, grid: { color: grid } },
            y: { beginAtZero: true, ticks: { color: text, precision: 0, font: { size: 11 } }, grid: { color: grid } }
        }
    };
}

function groupByDate(items, dateField) {
    const counts = Object.create(null);
    items.forEach(item => {
        if (!item[dateField]) return;
        const d = new Date(item[dateField]).toISOString().split('T')[0];
        counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
}

function drawPostsChart() {
    const ctx = document.getElementById('postsChart');
    if (!ctx) return;
    const counts = groupByDate(allPosts, 'published_at');
    const labels = Object.keys(counts).sort();
    if (window._pc) window._pc.destroy();
    window._pc = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Posts Written',
                data: labels.map(l => counts[l]),
                backgroundColor: 'rgba(255,102,0,0.7)',
                borderColor: '#ff6600',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: getChartDefaults()
    });
}

function drawCategoryChart() {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    const counts = Object.create(null);
    allPosts.forEach(p => {
        const cat = p.category || 'uncategorized';
        counts[cat] = (counts[cat] || 0) + 1;
    });
    const labels = Object.keys(counts);
    if (window._cc) window._cc.destroy();
    window._cc = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: labels.map(l => counts[l]),
                backgroundColor: ['#ff6600', '#7c3aed', '#3b82f6', '#10b981', '#ec4899', '#06b6d4'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim(), font: { family: 'Inter', size: 12 }, padding: 16 }
                }
            }
        }
    });
}

function drawCumulativeChart() {
    const ctx = document.getElementById('cumulativeUsersChart');
    if (!ctx) return;

    // Group cumulative likes and clicks over posts sorted by date
    const sorted = [...allPosts].sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
    const labels = sorted.map(p => new Date(p.published_at).toLocaleDateString());

    let rollingLikes = 0;
    let rollingClicks = 0;
    const likesData = [];
    const clicksData = [];

    sorted.forEach(p => {
        rollingLikes += (p.likes_count || 0);
        rollingClicks += (p.clicks_count || 0);
        likesData.push(rollingLikes);
        clicksData.push(rollingClicks);
    });

    if (window._cuc) window._cuc.destroy();
    window._cuc = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Cumulative Likes',
                    data: likesData,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124,58,237,0.05)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4
                },
                {
                    label: 'Cumulative Views (Clicks)',
                    data: clicksData,
                    borderColor: '#ff6600',
                    backgroundColor: 'rgba(255,102,0,0.05)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4
                }
            ]
        },
        options: getChartDefaults()
    });
}

window.addEventListener('kn-theme-change', () => {
    drawPostsChart();
    drawCategoryChart();
    drawCumulativeChart();
});

// =============================================
// DROPDOWN BUILDER (Safe DOM construction)
// =============================================

/**
 * Builds a dropdown menu element for a given action cell using safe DOM APIs.
 * Instead of storing pre-rendered HTML in data-attributes and using innerHTML,
 * this reads structured data-attributes and constructs the dropdown dynamically.
 */
function buildDropdownForCell(cell) {
    const type = cell.dataset.dropdownType;
    const itemId = cell.dataset.itemId;

    const container = document.createElement('div');
    container.className = 'user-details-dropdown';
    container.setAttribute('style', 'padding: 8px; min-width: 120px; text-align: left;');

    if (type === 'post') {
        const itemTitle = cell.dataset.itemTitle;
        const itemUrl = cell.dataset.itemUrl;

        // Share button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'row-dropdown-item';
        shareBtn.setAttribute('style', 'padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center;');
        shareBtn.appendChild(createShareIcon());
        shareBtn.appendChild(document.createTextNode('Share'));
        shareBtn.addEventListener('click', () => {
            window.creatorActions.sharePost(itemTitle, itemUrl);
        });

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'row-dropdown-item danger';
        deleteBtn.setAttribute('style', 'padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center; border: 1px solid rgba(239, 68, 68, 0.15);');
        deleteBtn.appendChild(createTrashIcon());
        deleteBtn.appendChild(document.createTextNode('Delete'));
        deleteBtn.addEventListener('click', () => {
            window.creatorActions.deletePost(itemId);
        });

        container.style.minWidth = '140px';
        container.appendChild(shareBtn);
        container.appendChild(deleteBtn);

    } else if (type === 'comment') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'row-dropdown-item danger';
        removeBtn.setAttribute('style', 'padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center;');
        removeBtn.appendChild(createTrashIcon());
        removeBtn.appendChild(document.createTextNode('Remove'));
        removeBtn.addEventListener('click', () => {
            window.creatorActions.deleteComment(itemId);
        });

        container.appendChild(removeBtn);

    } else if (type === 'my-comment') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'row-dropdown-item danger';
        deleteBtn.setAttribute('style', 'padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center;');
        deleteBtn.appendChild(createTrashIcon());
        deleteBtn.appendChild(document.createTextNode('Delete'));
        deleteBtn.addEventListener('click', () => {
            window.creatorActions.deleteMyComment(itemId);
        });

        container.appendChild(deleteBtn);
    }

    return container;
}

// =============================================
// WINDOW EXPOSED CREATOR ACTIONS
// =============================================
window.creatorActions = {
    async deletePost(id) {
        if (!confirm('Are you sure you want to delete this post?')) return;
        const { error } = await supabase.from('blogs').delete().eq('id', id);
        if (error) {
            showToast('Error: ' + error.message, 'error');
        } else {
            showToast('Post deleted.', 'success');
            await loadCreatorData();
        }
    },

    async deleteComment(id) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) {
            showToast('Error: ' + error.message, 'error');
        } else {
            showToast('Comment deleted.', 'success');
            await loadCreatorData();
        }
    },

    async deleteMyComment(id) {
        if (!confirm('Are you sure you want to delete your comment?')) return;
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) {
            showToast('Error: ' + error.message, 'error');
        } else {
            showToast('Comment deleted.', 'success');
            await loadCreatorData();
        }
    },

    async sharePost(title, relUrl) {
        const fullUrl = window.location.origin + relUrl.replace('..', '');
        if (navigator.share) {
            navigator.share({ title, url: fullUrl }).catch(() => { });
        } else {
            navigator.clipboard.writeText(fullUrl);
            showToast('Link copied to clipboard!', 'info');
        }
    },

    toggleRowMenu(event) {
        event.stopPropagation();

        const existing = document.querySelector('.row-dropdown');
        const trigger = event.currentTarget;

        if (existing) {
            const wasSameTrigger = existing._triggerElement === trigger;
            existing.remove();
            if (wasSameTrigger) return;
        }

        const parent = trigger.parentElement;
        if (!parent.dataset.dropdownType) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'row-dropdown';
        dropdown._triggerElement = trigger;

        // Build dropdown content safely from structured data attributes
        const content = buildDropdownForCell(parent);
        dropdown.appendChild(content);

        dropdown.style.position = 'fixed';
        dropdown.style.margin = '0';

        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.body.appendChild(dropdown);

        const rect = trigger.getBoundingClientRect();
        const dropdownWidth = dropdown.offsetWidth || 150;

        dropdown.style.top = `${rect.bottom + 4}px`;

        let leftPos = rect.right - dropdownWidth;
        if (leftPos < 10) leftPos = 10;
        dropdown.style.left = `${leftPos}px`;
        dropdown.style.zIndex = '99999';
    }
};

window.addEventListener('click', () => {
    const dropdown = document.querySelector('.row-dropdown');
    if (dropdown) dropdown.remove();
});

window.addEventListener('scroll', () => {
    const dropdown = document.querySelector('.row-dropdown');
    if (dropdown) dropdown.remove();
}, { passive: true });
