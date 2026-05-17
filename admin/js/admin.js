import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

try {
    const config = await import('./supabaseConfig.js');
    SUPABASE_URL = config.SUPABASE_URL;
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
} catch (e) {
    console.warn('admin/js/supabaseConfig.js not found or failed to load.', e);
}

const supabase = (SUPABASE_URL) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// HTML escape helper to prevent XSS in admin templates
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Limit the number of words in a string
function limitWords(str, maxWords = 5) {
    if (typeof str !== 'string') return '';
    const words = str.trim().split(/\s+/);
    if (words.length <= maxWords) return str;
    return words.slice(0, maxWords).join(' ') + '…';
}


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
    setupExportButtons();
    setupSystemSettings();
});

// =============================================
// AUTH
// =============================================
async function checkAdminAuth() {
    if (!supabase) {
        document.getElementById('loading-overlay')?.classList.add('hidden');
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:20px; font-family:Inter, sans-serif; background:var(--bg-body); color:var(--text-primary); text-align:center; padding: 20px;">
                <img src="../assets/img/logo.png" alt="K. Notes" style="height: 64px;">
                <h1 style="font-size:24px; font-weight:700; color:#ff6600;">Configuration Missing</h1>
                <p style="color:var(--text-secondary); max-width:400px; line-height:1.6;">
                    The Admin Panel configuration file (<strong>supabaseConfig.js</strong>) is missing or could not be loaded. Please ensure your environment is set up correctly.
                </p>
                <a href="../index.html" class="btn btn-primary" style="text-decoration:none; padding:10px 20px; font-weight:600; border-radius: 4px; border: none; cursor: pointer; color: white; background: #ff6600;">Back to Site</a>
            </div>
        `;
        return;
    }
    // Check sessionStorage first
    const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true';
    const { data: { session } } = await supabase.auth.getSession();

    if (isAuthenticated && session) {
        // Expose user identity
        currentUser = session.user;
        
        // Fetch profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, username')
            .eq('id', currentUser.id)
            .single();
            
        currentProfile = profile;
        document.getElementById('admin-name').textContent = profile?.username || currentUser.email;

        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('loading-overlay')?.classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');

        document.getElementById('logout-btn').addEventListener('click', async () => {
            sessionStorage.removeItem('admin_authenticated');
            await supabase.auth.signOut();
            window.location.reload();
        });

        await Promise.all([loadUsers(), loadPosts(), loadComments()]);
        await populateOverviewMetrics();
    } else {
        // If not authenticated, show login form
        document.getElementById('loading-overlay')?.classList.add('hidden');
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');

        setupLoginForm();
    }
}

function setupLoginForm() {
    const form = document.getElementById('admin-login-form');
    if (!form) return;

    // Remove any previous listener by cloning the form
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwdInput = document.getElementById('admin-password-input');
        const submitBtn = newForm.querySelector('button[type="submit"]');

        if (!pwdInput || !pwdInput.value) return;
        const enteredPassword = pwdInput.value.trim();

        submitBtn.disabled = true;
        submitBtn.textContent = 'Unlocking...';

        try {
            // 1. Fetch site_settings password (seed if missing)
            let { data: setting } = await supabase
                .from('site_settings')
                .select('value')
                .eq('id', 'admin_password')
                .maybeSingle();

            if (!setting || !setting.value) {
                // Self-heal: insert default admin password
                await supabase.from('site_settings').insert([{ id: 'admin_password', value: 'India@123' }]);
                setting = { value: 'India@123' };
            }

            // 2. Validate password
            if (enteredPassword !== setting.value) {
                showToast('Invalid Admin Password!', 'error');
                pwdInput.value = '';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Unlock Dashboard';
                return;
            }

            // 3. Log in under the hood via Supabase Auth to obtain RLS write privileges
            const { error: authErr } = await supabase.auth.signInWithPassword({
                email: 'khushaankgupta@gmail.com',
                password: enteredPassword
            });

            if (authErr) {
                showToast('Authentication failed: ' + authErr.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Unlock Dashboard';
                return;
            }

            // 4. Success! Mark authenticated and reload to enter dashboard
            sessionStorage.setItem('admin_authenticated', 'true');
            showToast('Welcome back, Admin!', 'success');
            
            setTimeout(() => {
                window.location.reload();
            }, 800);

        } catch (err) {
            showToast('Error logging in: ' + err.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Unlock Dashboard';
        }
    });
}

// =============================================
// SIDEBAR NAVIGATION & ROUTING
// =============================================
function handleHashRoute() {
    const hash = window.location.hash.substring(1); // e.g. "users"
    const targetId = hash ? `${hash}-section` : 'overview-section';
    const targetBtn = document.querySelector(`.sidebar-nav .nav-item[data-target="${targetId}"]`);
    
    if (targetBtn) {
        const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
        navItems.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

        targetBtn.classList.add('active');
        const el = document.getElementById(targetId);
        if (el) el.classList.remove('hidden');
    }
}

function setupSidebar() {
    // Default collapsed state to true for desktop if not set yet
    const savedCollapsed = localStorage.getItem('kn-sidebar-collapsed');
    if (window.innerWidth > 768) {
        if (savedCollapsed === 'false') {
            document.body.classList.remove('sidebar-collapsed');
        } else {
            document.body.classList.add('sidebar-collapsed');
        }
    } else {
        document.body.classList.remove('sidebar-collapsed');
    }

    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            const hash = target.replace('-section', '');
            window.location.hash = hash;

            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('active');
        });
    });

    // Handle hash route on load and on hashchange
    window.addEventListener('hashchange', handleHashRoute);
    handleHashRoute();

    // Sidebar Brand Toggle (Desktop: Brand Logo acts as collapse button)
    const brandToggle = document.getElementById('sidebar-brand-toggle');
    brandToggle?.addEventListener('click', () => {
        if (window.innerWidth > 768) {
            document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('kn-sidebar-collapsed', document.body.classList.contains('sidebar-collapsed'));
        }
    });

    // Sidebar Toggle (Mobile topbar drawer toggle)
    const toggle = document.getElementById('sidebar-toggle');
    toggle?.addEventListener('click', () => {
        if (window.innerWidth > 768) {
            document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('kn-sidebar-collapsed', document.body.classList.contains('sidebar-collapsed'));
        } else {
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
// Expose showToast to the global window scope to allow ES module function calls from inline HTML
window.showToast = showToast;

async function loadUsers() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allUsers = data || [];
    renderUsersTable(allUsers);
}

function renderUsersTable(usersList) {
    const tbody = document.querySelector('#users-table tbody');
    if (!usersList || usersList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = usersList.map((user, index) => {
        const isSelf = user.id === currentUser.id;
        const joinDateString = new Date(user.created_at).toLocaleDateString();
        
        const dropdownHtml = `
            <div class="user-details-dropdown" style="padding: 12px; min-width: 200px; text-align: left;">
                <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">User Info</div>
                
                <!-- Copiable ID -->
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px;">
                    <span style="color: var(--text-secondary);">ID:</span>
                    <span style="font-family: monospace; color: var(--text-primary); cursor: pointer; text-decoration: underline;" 
                          title="Click to copy ID" 
                          onclick="navigator.clipboard.writeText('${user.id}'); window.showToast('Copied User ID!', 'success');">
                          ${escapeHtml(user.id.substring(0, 8))}...
                    </span>
                </div>
                
                <!-- Clickable Joined Date -->
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border);">
                    <span style="color: var(--text-secondary);">Joined:</span>
                    <span style="color: var(--text-primary); cursor: pointer; text-decoration: underline;" 
                          title="Click to see everyone who joined on this date" 
                          onclick="window.adminActions.filterUsersByJoinDate('${joinDateString}');">
                          ${joinDateString}
                    </span>
                </div>
                
                <!-- Administrator Role toggle -->
                <div class="desktop-only-admin-toggle" style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px;">
                    <span style="color: var(--text-secondary);">Role: Admin</span>
                    <label class="toggle-switch" style="transform: scale(0.85); transform-origin: right center;">
                        <input type="checkbox" ${user.is_admin ? 'checked' : ''} 
                            onchange="window.adminActions.toggleAdmin('${escapeHtml(user.id)}', this.checked); event.stopPropagation();"
                            ${isSelf ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                
                <!-- Ban/Remove User Action -->
                ${isSelf ? '' : `
                    <button class="row-dropdown-item danger" style="padding: 8px; border-radius: var(--radius-sm); font-size: 12px; justify-content: center; width: 100%; border: 1px solid rgba(239, 68, 68, 0.2);" onclick="window.adminActions.deleteProfile('${escapeHtml(user.id)}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Remove User
                    </button>
                `}
            </div>
        `;
        const encodedContent = encodeURIComponent(dropdownHtml);
        
        return `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-size: 13px;">${index + 1}</td>
                <td><strong>${escapeHtml(user.username || 'N/A')}</strong></td>
                <td class="actions-cell" style="text-align: center;" data-dropdown-content="${encodedContent}">
                    <button class="btn-dots" onclick="window.adminActions.toggleRowMenu(event)">
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

async function loadPosts() {
    const tbody = document.querySelector('#posts-table tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('blogs')
        .select('id, title, author, status, published_at, slug, category, likes_count, clicks_count')
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

    tbody.innerHTML = allPosts.map(post => {
        const pulseUrl = `../pulse/index.html?s=${escapeHtml(post.slug)}`;
        const dropdownHtml = `
            <button class="row-dropdown-item" onclick="window.open('${pulseUrl}', '_blank')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View Story
            </button>
            <button class="row-dropdown-item" onclick="window.adminActions.sharePost('${escapeHtml(post.title).replace(/'/g, "\\'")}', '${pulseUrl}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share Post
            </button>
            <button class="row-dropdown-item danger" onclick="window.adminActions.deletePost('${escapeHtml(String(post.id))}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete Post
            </button>
        `;
        const encodedContent = encodeURIComponent(dropdownHtml);

        return `
            <tr>
                <td data-label="Title"><a href="${pulseUrl}" target="_blank" title="${escapeHtml(post.title)}">${escapeHtml(limitWords(post.title, 5))}</a></td>
                <td data-label="Author">${escapeHtml(post.author)}</td>
                <td data-label="Status"><span class="status-badge ${escapeHtml(post.status || 'published')}">${escapeHtml(post.status || 'published')}</span></td>
                <td data-label="Published">${new Date(post.published_at).toLocaleDateString()}</td>
                <td class="actions-cell" data-label="Actions" data-dropdown-content="${encodedContent}">
                    <button class="btn-dots" onclick="window.adminActions.toggleRowMenu(event)">
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

    tbody.innerHTML = allComments.map(c => {
        const dropdownHtml = `
            <button class="row-dropdown-item danger" onclick="window.adminActions.deleteComment('${escapeHtml(String(c.id))}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete Comment
            </button>
        `;
        const encodedContent = encodeURIComponent(dropdownHtml);

        return `
            <tr>
                <td data-label="Comment">${escapeHtml(c.comment_text.substring(0, 60))}${c.comment_text.length > 60 ? '…' : ''}</td>
                <td data-label="User"><strong>${escapeHtml(c.user_name)}</strong></td>
                <td data-label="Date">${new Date(c.created_at).toLocaleDateString()}</td>
                <td class="actions-cell" data-label="Actions" data-dropdown-content="${encodedContent}">
                    <button class="btn-dots" onclick="window.adminActions.toggleRowMenu(event)">
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
// OVERVIEW METRICS & CHARTS
// =============================================
async function populateOverviewMetrics() {
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

    // Engagement (Comments per post)
    const engagement = allPosts.length > 0 ? (allComments.length / allPosts.length).toFixed(2) : '0';
    document.getElementById('metric-engagement').textContent = engagement;

    // Total Likes and Clicks
    const totalLikes = allPosts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
    const totalClicks = allPosts.reduce((sum, p) => sum + (p.clicks_count || 0), 0);
    if(document.getElementById('metric-likes')) document.getElementById('metric-likes').textContent = totalLikes;
    if(document.getElementById('metric-clicks')) document.getElementById('metric-clicks').textContent = totalClicks;

    // Signups Today
    const signupsToday = allUsers.filter(u => u.created_at && u.created_at.startsWith(today)).length;
    document.getElementById('metric-signups-today').textContent = signupsToday;

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

    // Trending Post calculation (Likes * 3 + Views * 1 + Comments * 2)
    const scoredPosts = allPosts.map(p => {
        const postComments = allComments.filter(c => c.blog_id === p.id).length;
        const score = (p.likes_count || 0) * 3 + (p.clicks_count || 0) + (postComments * 2);
        return { ...p, score };
    }).sort((a, b) => b.score - a.score);

    const trendingPost = scoredPosts[0];
    if (trendingPost && trendingPost.score > 0) {
        document.getElementById('trending-post-title').innerHTML = `<a href="../pulse/index.html?s=${escapeHtml(trendingPost.slug)}" target="_blank" title="${escapeHtml(trendingPost.title)}" style="color: #fff; text-decoration: none; border-bottom: 1px dashed rgba(255,255,255,0.3); padding-bottom: 2px;">${escapeHtml(limitWords(trendingPost.title, 6))}</a>`;
        document.getElementById('trending-post-meta').textContent = `Published by ${escapeHtml(trendingPost.author)} in category ${escapeHtml(trendingPost.category || 'news')}`;
        document.getElementById('trending-post-likes').textContent = trendingPost.likes_count || 0;
        document.getElementById('trending-post-views').textContent = trendingPost.clicks_count || 0;
        document.getElementById('trending-post-score').textContent = trendingPost.score;
    } else {
        document.getElementById('trending-post-title').textContent = "No popular posts found yet";
        document.getElementById('trending-post-meta').textContent = "Metrics will update as readers engage with stories";
    }

    // Platform Network Stats (Follows, Categories, Conversion)
    let followsCount = 0;
    try {
        const { count, error: followsError } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true });
        if (!followsError && count !== null) followsCount = count;
    } catch(e) {}
    
    document.getElementById('network-follows').textContent = followsCount;

    const uniqueCategories = new Set(allPosts.map(p => p.category).filter(Boolean));
    document.getElementById('network-categories').textContent = uniqueCategories.size || 0;

    const conversion = totalClicks > 0 ? ((totalLikes / totalClicks) * 100).toFixed(1) + '%' : '0%';
    document.getElementById('network-ratio').textContent = conversion;

    // Top Authors & Posts
    populateTopAuthors();
    populateTopPosts();

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
    populateUsernameAudit();
    populateTopSearches();
}

// =============================================
// SYSTEM SETTINGS & BROADCAST
// =============================================
async function setupSystemSettings() {
    const input = document.getElementById('broadcast-message-input');
    const saveBtn = document.getElementById('btn-save-broadcast');
    const maintToggle = document.getElementById('maintenance-mode-toggle');
    if (!input || !saveBtn || !maintToggle) return;

    // Load current settings
    const { data: settings } = await supabase
        .from('site_settings')
        .select('*')
        .in('id', ['broadcast_message', 'maintenance_mode']);

    const broadcast = settings?.find(s => s.id === 'broadcast_message');
    const maintenance = settings?.find(s => s.id === 'maintenance_mode');

    if (broadcast) input.value = broadcast.value || '';
    if (maintenance) maintToggle.checked = maintenance.value === 'true';

    // Quick Templates Prefill Listener
    document.querySelectorAll('.quick-tmpl-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const template = btn.getAttribute('data-template');
            if (input && template) {
                input.value = template;
                showToast('Template prefilled!', 'info');
            }
        });
    });

    // Save Broadcast
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Saving...';

        const { error } = await supabase
            .from('site_settings')
            .upsert({ id: 'broadcast_message', value: input.value, updated_by: currentUser.id, updated_at: new Date().toISOString() });

        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            Update Broadcast
        `;

        if (error) showToast('Error: ' + error.message, 'error');
        else showToast('Broadcast updated!', 'success');
    });

    // Toggle Maintenance
    maintToggle.addEventListener('change', async () => {
        const val = maintToggle.checked ? 'true' : 'false';
        const { error } = await supabase
            .from('site_settings')
            .upsert({ id: 'maintenance_mode', value: val, updated_by: currentUser.id, updated_at: new Date().toISOString() });

        if (error) {
            showToast('Error: ' + error.message, 'error');
            maintToggle.checked = !maintToggle.checked;
        } else {
            showToast(`Maintenance mode ${maintToggle.checked ? 'enabled' : 'disabled'}`, 'info');
        }
    });
}

function populateUsernameAudit() {
    const tbody = document.querySelector('#username-audit-table tbody');
    if (!tbody) return;

    const changedUsers = allUsers.filter(u => u.last_username_change_at);

    if (changedUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">No username changes recorded.</td></tr>';
        return;
    }

    tbody.innerHTML = changedUsers.map(u => `
        <tr>
            <td data-label="User"><strong>${escapeHtml(u.username)}</strong></td>
            <td data-label="Total Changes"><span class="status-badge ${u.username_changes_count >= 2 ? 'draft' : 'published'}">${u.username_changes_count || 0}/2</span></td>
            <td data-label="Last Changed">${new Date(u.last_username_change_at).toLocaleString()}</td>
        </tr>
    `).join('');
}

async function populateTopSearches() {
    const tbody = document.querySelector('#top-searches-table tbody');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('search_stats')
        .select('*')
        .order('count', { ascending: false })
        .limit(10);

    if (error || !data) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:12px;color:var(--red);">Failed to load stats.</td></tr>';
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:12px;color:var(--text-muted);">No searches yet.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => `
        <tr>
            <td>${escapeHtml(s.term)}</td>
            <td><strong>${s.count}</strong></td>
        </tr>
    `).join('');
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
        <tr><td><strong>${escapeHtml(author)}</strong></td><td>${count}</td></tr>
    `).join('');
}

function populateTopPosts() {
    const tbody = document.querySelector('#top-posts-table tbody');
    if (!tbody) return;

    const sortedPosts = [...allPosts]
        .sort((a, b) => ((b.likes_count || 0) + (b.clicks_count || 0)) - ((a.likes_count || 0) + (a.clicks_count || 0)))
        .slice(0, 5);

    if (sortedPosts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted)">No data</td></tr>';
        return;
    }

    tbody.innerHTML = sortedPosts.map(p => `
        <tr>
            <td title="${escapeHtml(p.title)}"><a href="../pulse/index.html?s=${escapeHtml(p.slug)}" target="_blank">${escapeHtml(limitWords(p.title, 5))}</a></td>
            <td><strong style="color: #ff6600;">${p.likes_count || 0}</strong></td>
            <td>${p.clicks_count || 0}</td>
        </tr>
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
        <tr><td><strong>${escapeHtml(user)}</strong></td><td>${count}</td></tr>
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
            text: `<strong>${escapeHtml(p.author)}</strong> published <strong title="${escapeHtml(p.title)}">${escapeHtml(limitWords(p.title, 5))}</strong>`,
            date: p.published_at
        });
    });

    allComments.slice(0, 3).forEach(c => {
        activities.push({
            text: `<strong>${escapeHtml(c.user_name)}</strong> commented: "${escapeHtml(c.comment_text.substring(0, 30))}…"`,
            date: c.created_at
        });
    });

    allUsers.slice(0, 2).forEach(u => {
        activities.push({
            text: `<strong>${escapeHtml(u.username || 'New user')}</strong> joined the platform`,
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
            await populateOverviewMetrics();
        }
    },

    async deleteComment(id) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) showToast('Error: ' + error.message, 'error');
        else {
            showToast('Comment deleted.', 'success');
            await loadComments();
            await populateOverviewMetrics();
        }
    },

    async deleteProfile(id) {
        if (!confirm('Are you sure you want to remove this user? This will also delete all their posts and comments.')) return;
        
        // 1. Fetch user's profile to get their username
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', id)
            .single();
            
        if (profileErr) {
            showToast('Error fetching profile: ' + profileErr.message, 'error');
            return;
        }

        const username = profile?.username;

        // 2. Delete posts by this username
        if (username) {
            const { error: postsErr } = await supabase
                .from('blogs')
                .delete()
                .eq('author', username);
            if (postsErr) {
                showToast('Error deleting posts: ' + postsErr.message, 'error');
            }
            
            // 3. Delete comments by this username
            const { error: commentsErr } = await supabase
                .from('comments')
                .delete()
                .eq('user_name', username);
            if (commentsErr) {
                showToast('Error deleting comments: ' + commentsErr.message, 'error');
            }
        }

        // 4. Delete the profile itself
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) {
            showToast('Error: ' + error.message, 'error');
        } else {
            showToast('User removed along with all their posts and comments.', 'success');
            await Promise.all([loadUsers(), loadPosts(), loadComments()]);
            await populateOverviewMetrics();
        }
    },

    filterUsersByJoinDate(dateString) {
        const filtered = allUsers.filter(u => new Date(u.created_at).toLocaleDateString() === dateString);
        renderUsersTable(filtered);
        
        const badge = document.getElementById('user-filter-badge');
        const dateSpan = document.getElementById('user-filter-date');
        if (badge && dateSpan) {
            dateSpan.textContent = dateString;
            badge.classList.remove('hidden');
        }
        
        showToast(`Filtered: users who joined on ${dateString}`, 'info');
        
        const dropdown = document.querySelector('.row-dropdown');
        if (dropdown) dropdown.remove();
    },

    clearUserFilter() {
        renderUsersTable(allUsers);
        
        const badge = document.getElementById('user-filter-badge');
        if (badge) {
            badge.classList.add('hidden');
        }
        
        showToast('Filter cleared', 'info');
    },

    async toggleAdmin(id, isAdmin) {
        const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', id);
        if (error) {
            showToast('Error: ' + error.message, 'error');
        } else {
            showToast(isAdmin ? 'User promoted to admin.' : 'Admin privileges revoked.', 'success');
        }
        await loadUsers();
        await populateOverviewMetrics();
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
        
        // Find existing open dropdowns
        const existing = document.querySelector('.row-dropdown');
        const trigger = event.currentTarget;
        
        if (existing) {
            const wasThisOne = existing.dataset.triggerOuter === trigger.outerHTML;
            existing.remove();
            if (wasThisOne) return; // Toggle close
        }

        // Get the target dropdown content from parent
        const parent = trigger.parentElement;
        const dropdownHtml = parent.getAttribute('data-dropdown-content');
        if (!dropdownHtml) return;

        // Create and position dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'row-dropdown';
        dropdown.innerHTML = decodeURIComponent(dropdownHtml);
        dropdown.dataset.triggerOuter = trigger.outerHTML;
        
        // Use fixed positioning so it's immune to table / card overflow clipping
        dropdown.style.position = 'fixed';
        dropdown.style.margin = '0';
        
        // Stop clicks inside the dropdown card from closing it
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.body.appendChild(dropdown);

        // Position it perfectly relative to the trigger button
        const rect = trigger.getBoundingClientRect();
        const dropdownWidth = dropdown.offsetWidth || 210;
        
        dropdown.style.top = `${rect.bottom + 4}px`;
        
        let leftPos = rect.right - dropdownWidth;
        if (leftPos < 10) leftPos = 10;
        dropdown.style.left = `${leftPos}px`;
        dropdown.style.zIndex = '99999';
    }
};

// Close row actions dropdowns on any outside click or scroll
window.addEventListener('click', () => {
    const dropdown = document.querySelector('.row-dropdown');
    if (dropdown) dropdown.remove();
});

window.addEventListener('scroll', () => {
    const dropdown = document.querySelector('.row-dropdown');
    if (dropdown) dropdown.remove();
}, { passive: true });
