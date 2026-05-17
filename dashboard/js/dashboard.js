import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

try {
    const config = await import('./supabaseConfig.js');
    SUPABASE_URL = config.SUPABASE_URL;
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
} catch (e) {
    console.warn('dashboard/js/supabaseConfig.js not found or failed to load.', e);
}

const supabase = (SUPABASE_URL) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// HTML escape helper to prevent XSS
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Limit words helper
function limitWords(str, maxWords = 5) {
    if (typeof str !== 'string') return '';
    const words = str.trim().split(/\s+/);
    if (words.length <= maxWords) return str;
    return words.slice(0, maxWords).join(' ') + '…';
}

let currentUser = null;
let currentProfile = null;
let allPosts = [];
let allComments = [];
let myWrittenComments = [];

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkUserAuth();
    setupSidebar();
    setupResponsiveMenu();
});

// =============================================
// AUTHENTICATION
// =============================================
async function checkUserAuth() {
    if (!supabase) {
        document.getElementById('loading-overlay')?.classList.add('hidden');
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:20px; font-family:Inter, sans-serif; background:var(--bg-body); color:var(--text-primary); text-align:center; padding: 20px;">
                <img src="../assets/img/logo.png" alt="K. Notes" style="height: 64px;">
                <h1 style="font-size:24px; font-weight:700; color:#ff6600;">Configuration Missing</h1>
                <p style="color:var(--text-secondary); max-width:400px; line-height:1.6;">
                    The Creator Dashboard configuration file (<strong>supabaseConfig.js</strong>) is missing or could not be loaded. Please ensure your environment is set up correctly.
                </p>
                <a href="../index.html" class="btn btn-primary" style="text-decoration:none; padding:10px 20px; font-weight:600; border-radius: 4px; border: none; cursor: pointer; color: white; background: #ff6600;">Back to Site</a>
            </div>
        `;
        return;
    }
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        // Not logged in -> Redirect to standard blog login
        window.location.href = '../login.html';
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
        window.location.href = '../login.html';
    });

    // Load user data
    await loadCreatorData();
}

// =============================================
// DATA LOADERS (Personalized to Logged-in User)
// =============================================
async function loadCreatorData() {
    await loadPosts();
    await loadComments();
    await loadMyWrittenComments();
    await populateOverviewMetrics();
}

async function loadPosts() {
    const tbody = document.querySelector('#posts-table tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('author', currentProfile.username)
        .order('published_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allPosts = data || [];
    renderPostsTable(allPosts);
}

function renderPostsTable(postsList) {
    const tbody = document.querySelector('#posts-table tbody');
    if (!postsList || postsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No posts written yet. Create your first post above!</td></tr>';
        return;
    }

    tbody.innerHTML = postsList.map((post, index) => {
        const isPublished = post.status === 'published';
        const dateStr = post.published_at ? new Date(post.published_at).toLocaleDateString() : 'N/A';
        const relUrl = `../pulse/index.html?s=${post.slug}`;
        
        const dropdownHtml = `
            <div class="user-details-dropdown" style="padding: 8px; min-width: 140px; text-align: left;">
                <button class="row-dropdown-item" style="padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center;" onclick="window.creatorActions.sharePost('${escapeHtml(post.title)}', '${relUrl}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    Share
                </button>
                <button class="row-dropdown-item danger" style="padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center; border: 1px solid rgba(239, 68, 68, 0.15);" onclick="window.creatorActions.deletePost('${escapeHtml(post.id)}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
            </div>
        `;
        const encodedContent = encodeURIComponent(dropdownHtml);

        return `
            <tr>
                <td data-label="Title">
                    <a href="${relUrl}" target="_blank" style="color:var(--text-primary); font-weight:600; text-decoration:none; transition:color var(--transition);">
                        ${escapeHtml(limitWords(post.title, 6))}
                    </a>
                </td>
                <td data-label="Status">
                    <span class="status-badge ${isPublished ? 'published' : 'draft'}">
                        ${isPublished ? 'Published' : 'Draft'}
                    </span>
                </td>
                <td data-label="Date" style="color:var(--text-secondary); font-size:13px;">${dateStr}</td>
                <td class="actions-cell" style="text-align: center;" data-dropdown-content="${encodedContent}">
                    <button class="btn-dots" onclick="window.creatorActions.toggleRowMenu(event)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1.5"/>
                            <circle cx="12" cy="5" r="1.5"/>
                            <circle cx="12" cy="19" r="1.5"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadComments() {
    const tbody = document.querySelector('#comments-table tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;">Loading...</td></tr>';

    if (allPosts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No posts written yet. Comments will appear once you publish a post.</td></tr>';
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
        tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allComments = data || [];
    renderCommentsTable(allComments);
}

function renderCommentsTable(commentsList) {
    const tbody = document.querySelector('#comments-table tbody');
    if (!commentsList || commentsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No comments left on your posts yet.</td></tr>';
        return;
    }

    tbody.innerHTML = commentsList.map((c) => {
        const dateStr = new Date(c.created_at).toLocaleDateString();
        
        const dropdownHtml = `
            <div class="user-details-dropdown" style="padding: 8px; min-width: 120px; text-align: left;">
                <button class="row-dropdown-item danger" style="padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center;" onclick="window.creatorActions.deleteComment('${escapeHtml(c.id)}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Remove
                </button>
            </div>
        `;
        const encodedContent = encodeURIComponent(dropdownHtml);

        return `
            <tr>
                <td data-label="Comment" style="font-weight:500;">"${escapeHtml(limitWords(c.comment_text, 8))}"</td>
                <td data-label="User" style="color:var(--accent); font-weight:600;">@${escapeHtml(c.user_name)}</td>
                <td data-label="Date" style="color:var(--text-secondary); font-size:13px;">${dateStr}</td>
                <td class="actions-cell" style="text-align: center;" data-dropdown-content="${encodedContent}">
                    <button class="btn-dots" onclick="window.creatorActions.toggleRowMenu(event)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1.5"/>
                            <circle cx="12" cy="5" r="1.5"/>
                            <circle cx="12" cy="19" r="1.5"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadMyWrittenComments() {
    const tbody = document.querySelector('#my-comments-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('comments')
        .select('*, blogs(title, slug)')
        .eq('user_name', currentProfile.username)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    myWrittenComments = data || [];
    renderMyWrittenCommentsTable(myWrittenComments);
}

function renderMyWrittenCommentsTable(commentsList) {
    const tbody = document.querySelector('#my-comments-table tbody');
    if (!tbody) return;
    if (!commentsList || commentsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">You haven\'t written any comments yet.</td></tr>';
        return;
    }

    tbody.innerHTML = commentsList.map((c) => {
        const dateStr = new Date(c.created_at).toLocaleDateString();
        const postTitle = c.blogs ? c.blogs.title : 'Unknown Post';
        const postSlug = c.blogs ? c.blogs.slug : '#';
        
        const dropdownHtml = `
            <div class="user-details-dropdown" style="padding: 8px; min-width: 120px; text-align: left;">
                <button class="row-dropdown-item danger" style="padding: 8px; border-radius: var(--radius-sm); font-size: 12px; width: 100%; display: flex; align-items: center;" onclick="window.creatorActions.deleteMyComment('${escapeHtml(c.id)}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
            </div>
        `;
        const encodedContent = encodeURIComponent(dropdownHtml);

        return `
            <tr>
                <td data-label="Comment" style="font-weight:500;">
                    <a href="../pulse/index.html?s=${escapeHtml(postSlug)}" target="_blank" style="color:var(--text-primary); text-decoration:none;">
                        "${escapeHtml(limitWords(c.comment_text, 8))}"
                    </a>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">On: ${escapeHtml(limitWords(postTitle, 6))}</div>
                </td>
                <td data-label="Date" style="color:var(--text-secondary); font-size:13px;">${dateStr}</td>
                <td class="actions-cell" style="text-align: center;" data-dropdown-content="${encodedContent}">
                    <button class="btn-dots" onclick="window.creatorActions.toggleRowMenu(event)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1.5"/>
                            <circle cx="12" cy="5" r="1.5"/>
                            <circle cx="12" cy="19" r="1.5"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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
        topPostsTbody.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:12px;">No posts published.</td></tr>';
    } else {
        topPostsTbody.innerHTML = sortedPopular.map(p => `
            <tr>
                <td title="${escapeHtml(p.title)}">
                    <a href="../pulse/index.html?s=${p.slug}" target="_blank" style="color:var(--text-primary); text-decoration:none; font-weight:600;">
                        ${escapeHtml(limitWords(p.title, 5))}
                    </a>
                </td>
                <td><strong style="color: #ff6600;">${p.likes_count || 0}</strong></td>
                <td>${p.clicks_count || 0}</td>
            </tr>
        `).join('');
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
            text: `You published <strong title="${escapeHtml(p.title)}">${escapeHtml(limitWords(p.title, 5))}</strong>`,
            date: p.published_at
        });
    });

    allComments.slice(0, 5).forEach(c => {
        activities.push({
            text: `<strong>@${escapeHtml(c.user_name)}</strong> commented on your post: "${escapeHtml(c.comment_text.substring(0, 30))}…"`,
            date: c.created_at
        });
    });

    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (activities.length === 0) {
        list.innerHTML = '<li class="activity-item"><span class="activity-dot"></span>No recent activity.</li>';
        return;
    }

    list.innerHTML = activities.slice(0, 5).map(a => `
        <li class="activity-item">
            <span class="activity-dot"></span>
            <span>${a.text}</span>
            <span class="activity-time">${timeAgo(a.date)}</span>
        </li>
    `).join('');
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
    
    let icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;
    if (type === 'error') {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        `;
    } else if (type === 'info') {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
        `;
    }

    toast.innerHTML = `
        <div class="toast-body">
            ${icon}
            <span>${message}</span>
        </div>
    `;

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
    const hamburger = document.getElementById('sidebar-toggle');

    if (brandToggle && sidebar) {
        brandToggle.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
        });
    }

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
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

            document.body.classList.remove('sidebar-open');
            window.history.replaceState(null, '', '#' + targetId);
        });
    });
}

function setupResponsiveMenu() {
    // Close sidebar on responsive layout click outside
    document.addEventListener('click', (e) => {
        if (document.body.classList.contains('sidebar-open')) {
            const sidebar = document.getElementById('sidebar');
            const hamburger = document.getElementById('sidebar-toggle');
            if (sidebar && !sidebar.contains(e.target) && hamburger && !hamburger.contains(e.target)) {
                document.body.classList.remove('sidebar-open');
            }
        }
    });
}

// =============================================
// CHART DEFAULTS & LOGIC
// =============================================
const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: '#8b8fa7', font: { family: 'Inter', size: 12 } }
        }
    },
    scales: {
        x: {
            ticks: { color: '#5c5f75', font: { size: 11 } },
            grid: { color: 'rgba(42,45,62,0.5)' }
        },
        y: {
            beginAtZero: true,
            ticks: { color: '#5c5f75', precision: 0, font: { size: 11 } },
            grid: { color: 'rgba(42,45,62,0.5)' }
        }
    }
};

function groupByDate(items, dateField) {
    const counts = {};
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
        options: chartDefaults
    });
}

function drawCategoryChart() {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    const counts = {};
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
                    labels: { color: '#8b8fa7', font: { family: 'Inter', size: 12 }, padding: 16 }
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
        options: chartDefaults
    });
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
            const wasThisOne = existing.dataset.triggerOuter === trigger.outerHTML;
            existing.remove();
            if (wasThisOne) return;
        }

        const parent = trigger.parentElement;
        const dropdownHtml = parent.getAttribute('data-dropdown-content');
        if (!dropdownHtml) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'row-dropdown';
        dropdown.innerHTML = decodeURIComponent(dropdownHtml);
        dropdown.dataset.triggerOuter = trigger.outerHTML;
        
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
