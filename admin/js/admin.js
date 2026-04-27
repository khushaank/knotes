import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let allUsers = [];
let allPosts = [];
let allComments = [];

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminAuth();
    setupSidebar();
    setupAddPostForm();
    setupExportButtons();
});

// =============================================
// AUTH
// =============================================
async function checkAdminAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        showLoginRequired();
        return;
    }

    currentUser = session.user;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, username')
        .eq('id', currentUser.id)
        .single();

    if (error || !profile || !profile.is_admin) {
        showLoginRequired();
        return;
    }

    currentProfile = profile;
    document.getElementById('admin-name').textContent = profile.username || currentUser.email;

    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });

    // Load all data
    await Promise.all([loadUsers(), loadPosts(), loadComments()]);
    populateOverviewMetrics();
}

function showLoginRequired() {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
}

// =============================================
// SIDEBAR NAVIGATION
// =============================================
function setupSidebar() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            navItems.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            const el = document.getElementById(target);
            if (el) el.classList.remove('hidden');

            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('active');
        });
    });

    // Hamburger toggle
    const toggle = document.getElementById('sidebar-toggle');
    toggle?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => {
                document.getElementById('sidebar').classList.remove('open');
                overlay.classList.remove('active');
            });
        }
        overlay.classList.toggle('active');
    });
}

// =============================================
// CREATE POST FORM
// =============================================
function setupAddPostForm() {
    const form = document.getElementById('admin-add-post-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('admin-post-title').value.trim();
        const url = document.getElementById('admin-post-url').value.trim();
        const content = document.getElementById('admin-post-content').value.trim();
        const category = document.getElementById('admin-post-category').value;

        if (!title) return;

        const author = currentProfile?.username || currentUser?.email?.split('@')[0] || 'Admin';

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';

        const { error } = await supabase
            .from('blogs')
            .insert([{
                title,
                url: url || null,
                content: content || null,
                author,
                category,
                status: 'published',
                published_at: new Date().toISOString()
            }]);

        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish Post';

        if (error) {
            showToast('Failed to publish: ' + error.message, 'error');
        } else {
            showToast('Post published successfully!', 'success');
            form.reset();
            await loadPosts();
            populateOverviewMetrics();
        }
    });
}

// =============================================
// EXPORT
// =============================================
function setupExportButtons() {
    document.getElementById('export-users-btn')?.addEventListener('click', () => {
        if (allUsers.length) {
            exportToCSV('users.csv', allUsers);
            showToast('Users exported!', 'info');
        }
    });

    document.getElementById('export-posts-btn')?.addEventListener('click', () => {
        if (allPosts.length) {
            exportToCSV('posts.csv', allPosts);
            showToast('Posts exported!', 'info');
        }
    });
}

function exportToCSV(filename, rows) {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [
        keys.join(','),
        ...rows.map(row => keys.map(k => {
            let v = row[k] ?? '';
            v = String(v).replace(/"/g, '""');
            return /[",\n]/.test(v) ? `"${v}"` : v;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// =============================================
// TOAST NOTIFICATIONS
// =============================================
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =============================================
// DATA LOADING
// =============================================
async function loadUsers() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allUsers = data || [];

    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(user => `
        <tr>
            <td title="${user.id}" style="font-family: monospace; font-size:12px; color:var(--text-muted);">${user.id.substring(0, 8)}…</td>
            <td><strong>${user.username || 'N/A'}</strong></td>
            <td>
                <label class="toggle-switch">
                    <input type="checkbox" ${user.is_admin ? 'checked' : ''} 
                        onchange="window.adminActions.toggleAdmin('${user.id}', this.checked)"
                        ${user.id === currentUser.id ? 'disabled' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="window.adminActions.deleteProfile('${user.id}')"
                    ${user.id === currentUser.id ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadPosts() {
    const tbody = document.querySelector('#posts-table tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('blogs')
        .select('id, title, author, status, published_at, slug, category')
        .order('published_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allPosts = data || [];

    if (allPosts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No posts found.</td></tr>';
        return;
    }

    tbody.innerHTML = allPosts.map(post => `
        <tr>
            <td><a href="../pulse/index.html?s=${post.slug}" target="_blank">${post.title.substring(0, 50)}${post.title.length > 50 ? '…' : ''}</a></td>
            <td>${post.author}</td>
            <td><span class="status-badge ${post.status || 'published'}">${post.status || 'published'}</span></td>
            <td>${new Date(post.published_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="window.adminActions.deletePost('${post.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadComments() {
    const tbody = document.querySelector('#comments-table tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allComments = data || [];

    if (allComments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No comments found.</td></tr>';
        return;
    }

    tbody.innerHTML = allComments.map(c => `
        <tr>
            <td>${c.comment_text.substring(0, 60)}${c.comment_text.length > 60 ? '…' : ''}</td>
            <td><strong>${c.user_name}</strong></td>
            <td>${new Date(c.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="window.adminActions.deleteComment('${c.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// =============================================
// OVERVIEW METRICS & CHARTS
// =============================================
function populateOverviewMetrics() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now - 7 * 86400000).toISOString();
    const monthAgo = new Date(now - 30 * 86400000).toISOString();

    // Top-level metric cards
    document.getElementById('metric-users').textContent = allUsers.length;
    document.getElementById('metric-posts').textContent = allPosts.length;
    document.getElementById('metric-comments').textContent = allComments.length;

    // Avg posts/day
    if (allPosts.length > 0) {
        const dates = allPosts.map(p => p.published_at).filter(Boolean).sort();
        const firstDate = new Date(dates[0]);
        const daySpan = Math.max(1, Math.ceil((now - firstDate) / 86400000));
        document.getElementById('metric-avg-posts').textContent = (allPosts.length / daySpan).toFixed(1);
    } else {
        document.getElementById('metric-avg-posts').textContent = '0';
    }

    // Content Health
    const postsToday = allPosts.filter(p => p.published_at && p.published_at.startsWith(today)).length;
    const postsWeek = allPosts.filter(p => p.published_at && p.published_at >= weekAgo).length;
    const postsMonth = allPosts.filter(p => p.published_at && p.published_at >= monthAgo).length;
    const usersWeek = allUsers.filter(u => u.created_at && u.created_at >= weekAgo).length;
    const adminCount = allUsers.filter(u => u.is_admin).length;
    const commentsWeek = allComments.filter(c => c.created_at && c.created_at >= weekAgo).length;

    document.getElementById('health-posts-today').textContent = postsToday;
    document.getElementById('health-posts-week').textContent = postsWeek;
    document.getElementById('health-posts-month').textContent = postsMonth;
    document.getElementById('health-users-week').textContent = usersWeek;
    document.getElementById('health-admin-count').textContent = adminCount;
    document.getElementById('health-comments-week').textContent = commentsWeek;

    // Top Authors
    populateTopAuthors();

    // Recent Activity
    populateRecentActivity();

    // Charts
    drawUsersChart();
    drawPostsChart();
    drawCategoryChart();
    drawDailyActivityChart();
    drawCumulativeUsersChart();
    drawHourlyChart();
    populateTopCommenters();
}

// =============================================
// TOP AUTHORS
// =============================================
function populateTopAuthors() {
    const tbody = document.querySelector('#top-authors-table tbody');
    const counts = {};
    allPosts.forEach(p => { counts[p.author] = (counts[p.author] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted)">No data</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(([author, count]) => `
        <tr><td><strong>${author}</strong></td><td>${count}</td></tr>
    `).join('');
}

// =============================================
// TOP COMMENTERS
// =============================================
function populateTopCommenters() {
    const tbody = document.querySelector('#top-commenters-table tbody');
    const counts = {};
    allComments.forEach(c => { counts[c.user_name] = (counts[c.user_name] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted)">No data</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(([user, count]) => `
        <tr><td><strong>${user}</strong></td><td>${count}</td></tr>
    `).join('');
}

// =============================================
// RECENT ACTIVITY
// =============================================
function populateRecentActivity() {
    const list = document.getElementById('recent-activity-list');
    if (!list) return;

    const activities = [];

    allPosts.slice(0, 5).forEach(p => {
        activities.push({
            text: `<strong>${p.author}</strong> published <strong>${p.title.substring(0, 35)}${p.title.length > 35 ? '…' : ''}</strong>`,
            date: p.published_at
        });
    });

    allComments.slice(0, 3).forEach(c => {
        activities.push({
            text: `<strong>${c.user_name}</strong> commented: "${c.comment_text.substring(0, 30)}…"`,
            date: c.created_at
        });
    });

    allUsers.slice(0, 2).forEach(u => {
        activities.push({
            text: `<strong>${u.username || 'New user'}</strong> joined the platform`,
            date: u.created_at
        });
    });

    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (activities.length === 0) {
        list.innerHTML = '<li class="activity-item"><span class="activity-dot"></span>No recent activity.</li>';
        return;
    }

    list.innerHTML = activities.slice(0, 8).map(a => `
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
// CHART DEFAULTS
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

// =============================================
// CHARTS
// =============================================
function drawUsersChart() {
    const ctx = document.getElementById('usersChart');
    if (!ctx) return;
    const counts = groupByDate(allUsers, 'created_at');
    const labels = Object.keys(counts).sort();
    if (window._uc) window._uc.destroy();
    window._uc = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'New Users',
                data: labels.map(l => counts[l]),
                borderColor: '#7c3aed',
                backgroundColor: 'rgba(124,58,237,0.1)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointBackgroundColor: '#7c3aed'
            }]
        },
        options: chartDefaults
    });
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
                label: 'Posts Published',
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

function drawDailyActivityChart() {
    const ctx = document.getElementById('dailyActivityChart');
    if (!ctx) return;

    const postCounts = groupByDate(allPosts, 'published_at');
    const commentCounts = groupByDate(allComments, 'created_at');
    const allDates = new Set([...Object.keys(postCounts), ...Object.keys(commentCounts)]);
    const labels = [...allDates].sort();

    if (window._dac) window._dac.destroy();
    window._dac = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Posts',
                    data: labels.map(l => postCounts[l] || 0),
                    borderColor: '#ff6600',
                    backgroundColor: 'rgba(255,102,0,0.08)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Comments',
                    data: labels.map(l => commentCounts[l] || 0),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: chartDefaults
    });
}

function drawCumulativeUsersChart() {
    const ctx = document.getElementById('cumulativeUsersChart');
    if (!ctx) return;
    const counts = groupByDate(allUsers, 'created_at');
    const labels = Object.keys(counts).sort();
    let cumulative = 0;
    const data = labels.map(l => { cumulative += counts[l]; return cumulative; });

    if (window._cuc) window._cuc.destroy();
    window._cuc = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Total Users',
                data,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 2
            }]
        },
        options: chartDefaults
    });
}

function drawHourlyChart() {
    const ctx = document.getElementById('hourlyChart');
    if (!ctx) return;

    const hourCounts = new Array(24).fill(0);
    allPosts.forEach(p => {
        if (!p.published_at) return;
        hourCounts[new Date(p.published_at).getUTCHours()]++;
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

    if (window._hc) window._hc.destroy();
    window._hc = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Posts by Hour',
                data: hourCounts,
                backgroundColor: 'rgba(236,72,153,0.6)',
                borderColor: '#ec4899',
                borderWidth: 1,
                borderRadius: 3
            }]
        },
        options: chartDefaults
    });
}

// =============================================
// ACTIONS
// =============================================
window.adminActions = {
    async deletePost(id) {
        if (!confirm('Are you sure you want to delete this post?')) return;
        const { error } = await supabase.from('blogs').delete().eq('id', id);
        if (error) showToast('Error: ' + error.message, 'error');
        else {
            showToast('Post deleted.', 'success');
            await loadPosts();
            populateOverviewMetrics();
        }
    },

    async deleteComment(id) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) showToast('Error: ' + error.message, 'error');
        else {
            showToast('Comment deleted.', 'success');
            await loadComments();
            populateOverviewMetrics();
        }
    },

    async deleteProfile(id) {
        if (!confirm('Delete this profile? They may still be able to login via auth.')) return;
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) showToast('Error: ' + error.message, 'error');
        else {
            showToast('Profile deleted.', 'success');
            await loadUsers();
            populateOverviewMetrics();
        }
    },

    async toggleAdmin(id, isAdmin) {
        const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', id);
        if (error) {
            showToast('Error: ' + error.message, 'error');
            loadUsers();
        } else {
            showToast(isAdmin ? 'User promoted to admin.' : 'Admin privileges revoked.', 'success');
        }
    }
};
