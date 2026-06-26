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
    console.warn('admin/js/supabaseConfig.js not found or failed to load.', e);
}

const supabase = (createClient && SUPABASE_URL)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: createTimeoutFetch() } })
    : null;

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function limitWords(str, maxWords = 5) {
    if (typeof str !== 'string') return '';
    const words = str.trim().split(/\s+/);
    if (words.length <= maxWords) return str;
    return words.slice(0, maxWords).join(' ') + '…';
}

// =============================================
// SAFE DOM HELPERS (XSS Prevention)
// =============================================
function createMessageRow(colspan, text, style, isError = false) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', colspan);
    if (style) td.setAttribute('style', style);
    if (isError) td.style.color = 'var(--red)';
    td.textContent = text;
    tr.appendChild(td);
    return tr;
}
function parseStaticHTML(htmlString) {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    return doc.body.firstChild;
}
function parseSvgIcon(svgString) {
    const doc = new DOMParser().parseFromString(svgString.trim(), 'image/svg+xml');
    return doc.documentElement;
}
function createDotsButton() {
    const btn = document.createElement('button');
    btn.className = 'btn-dots';
    btn.appendChild(parseSvgIcon(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`));
    return btn;
}
function createTrashIcon() {
    return parseSvgIcon(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`);
}
function createShareIcon() {
    return parseSvgIcon(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`);
}
function createEyeIcon() {
    return parseSvgIcon(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`);
}
function createCheckIcon() {
    return parseSvgIcon(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`);
}

let currentUser = null;
let currentProfile = null;
let allUsers = [];
let allPosts = [];
let allComments = [];

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(async () => {
    await checkAdminAuth();
    setupSidebar();
    setupExportButtons();
    setupSystemSettings();
});

async function checkAdminAuth() {
    if (!supabase) {
        document.getElementById('loading-overlay')?.classList.add('hidden');
        document.body.replaceChildren(parseStaticHTML(`
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:20px; font-family:Inter, sans-serif; background:var(--bg-body); color:var(--text-primary); text-align:center; padding: 20px;">
                <img src="../assets/img/logo.png" alt="K. Notes" style="height: 64px;">
                <h1 style="font-size:24px; font-weight:700; color:#ff6600;">Configuration Missing</h1>
                <p style="color:var(--text-secondary); max-width:400px; line-height:1.6;">
                    The Admin Panel configuration file (<strong>supabaseConfig.js</strong>) is missing or could not be loaded. Please ensure your environment is set up correctly.
                </p>
                <a href="../home" class="btn btn-primary" style="text-decoration:none; padding:10px 20px; font-weight:600; border-radius: 4px; border: none; cursor: pointer; color: white; background: #ff6600;">Back to Site</a>
            </div>
        `));
        return;
    }
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.replace('login');
        return;
    }

    currentUser = session.user;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin, username')
        .eq('id', currentUser.id)
        .single();

    if (profileError || !profile?.is_admin) {
        await supabase.auth.signOut();
        window.location.replace('login');
        return;
    }

    currentProfile = profile;
    document.getElementById('admin-name').textContent = profile.username || currentUser.email;

    document.getElementById('login-container')?.classList.add('hidden');
    document.getElementById('loading-overlay')?.classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.replace('login');
    });

    await Promise.all([loadUsers(), loadPosts(), loadComments()]);
    await populateOverviewMetrics();
}

function handleHashRoute() {
    const hash = window.location.hash.substring(1);
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

            document.getElementById('sidebar').classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('active');
        });
    });

    window.addEventListener('hashchange', handleHashRoute);
    handleHashRoute();

    const brandToggle = document.getElementById('sidebar-brand-toggle');
    brandToggle?.addEventListener('click', () => {
        if (window.innerWidth > 768) {
            document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('kn-sidebar-collapsed', document.body.classList.contains('sidebar-collapsed'));
        }
    });

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
        ...rows.map(row => {
            const valuesByKey = new Map(Object.entries(row));
            return keys.map(k => {
                let v = valuesByKey.get(k) ?? '';
                v = String(v).replace(/"/g, '""');
                return /[",\n]/.test(v) ? `"${v}"` : v;
            }).join(',');
        })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

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

window.showToast = showToast;

async function loadUsers() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.replaceChildren(createMessageRow(3, 'Loading...', 'text-align:center;padding:24px;'));

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.replaceChildren(createMessageRow(3, `Error: ${error.message}`, '', true));
        return;
    }

    allUsers = data || [];
    renderUsersTable(allUsers);
}

function renderUsersTable(usersList) {
    const tbody = document.querySelector('#users-table tbody');
    if (!usersList || usersList.length === 0) {
        tbody.replaceChildren(createMessageRow(3, 'No users found.', 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }

    const frag = document.createDocumentFragment();
    usersList.forEach((user, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.setAttribute('style', 'text-align: center; color: var(--text-muted); font-size: 13px;');
        tdIndex.textContent = index + 1;

        const tdName = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = user.username || 'N/A';
        tdName.appendChild(strong);

        const tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';
        tdActions.setAttribute('style', 'text-align: center;');
        tdActions.dataset.dropdownType = 'user';
        tdActions.dataset.userId = user.id;
        tdActions.dataset.userJoined = new Date(user.created_at).toLocaleDateString();
        tdActions.dataset.userIsAdmin = user.is_admin ? 'true' : 'false';
        tdActions.dataset.isSelf = (user.id === currentUser.id) ? 'true' : 'false';

        const btn = createDotsButton();
        btn.addEventListener('click', (e) => window.adminActions.toggleRowMenu(e));
        tdActions.appendChild(btn);

        tr.appendChild(tdIndex);
        tr.appendChild(tdName);
        tr.appendChild(tdActions);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);
}

async function loadPosts() {
    const tbody = document.querySelector('#posts-table tbody');
    tbody.replaceChildren(createMessageRow(5, 'Loading...', 'text-align:center;padding:24px;'));

    const { data, error } = await supabase
        .from('blogs')
        .select('id, title, author, status, published_at, slug, category, likes_count, clicks_count')
        .order('published_at', { ascending: false });

    if (error) {
        tbody.replaceChildren(createMessageRow(5, `Error: ${error.message}`, '', true));
        return;
    }

    allPosts = data || [];

    if (allPosts.length === 0) {
        tbody.replaceChildren(createMessageRow(5, 'No posts found.', 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    postsList.forEach(post => {
        const pulseUrl = `../pulse/home?s=${encodeURIComponent(post.slug)}`;
        const tr = document.createElement('tr');

        const tdTitle = document.createElement('td');
        tdTitle.setAttribute('data-label', 'Title');
        const aTitle = document.createElement('a');
        aTitle.href = pulseUrl;
        aTitle.target = '_blank';
        aTitle.title = post.title;
        aTitle.textContent = limitWords(post.title, 5);
        tdTitle.appendChild(aTitle);

        const tdAuthor = document.createElement('td');
        tdAuthor.setAttribute('data-label', 'Author');
        tdAuthor.textContent = post.author;

        const tdStatus = document.createElement('td');
        tdStatus.setAttribute('data-label', 'Status');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${post.status || 'published'}`;
        statusBadge.textContent = post.status || 'published';
        tdStatus.appendChild(statusBadge);

        const tdPublished = document.createElement('td');
        tdPublished.setAttribute('data-label', 'Published');
        tdPublished.textContent = new Date(post.published_at).toLocaleDateString();

        const tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';
        tdActions.setAttribute('data-label', 'Actions');
        tdActions.dataset.dropdownType = 'post';
        tdActions.dataset.postId = post.id;
        tdActions.dataset.postTitle = post.title;
        tdActions.dataset.postUrl = pulseUrl;

        const btn = createDotsButton();
        btn.addEventListener('click', (e) => window.adminActions.toggleRowMenu(e));
        tdActions.appendChild(btn);

        tr.appendChild(tdTitle);
        tr.appendChild(tdAuthor);
        tr.appendChild(tdStatus);
        tr.appendChild(tdPublished);
        tr.appendChild(tdActions);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

}

async function loadComments() {
    const tbody = document.querySelector('#comments-table tbody');
    tbody.replaceChildren(createMessageRow(4, 'Loading...', 'text-align:center;padding:24px;'));

    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.replaceChildren(createMessageRow(4, `Error: ${error.message}`, '', true));
        return;
    }

    allComments = data || [];

    if (allComments.length === 0) {
        tbody.replaceChildren(createMessageRow(4, 'No comments found.', 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    allComments.forEach(c => {
        const tr = document.createElement('tr');

        const tdComment = document.createElement('td');
        tdComment.setAttribute('data-label', 'Comment');
        const commentText = c.comment_text.substring(0, 60) + (c.comment_text.length > 60 ? '…' : '');
        tdComment.textContent = commentText;

        const tdUser = document.createElement('td');
        tdUser.setAttribute('data-label', 'User');
        const strong = document.createElement('strong');
        strong.textContent = c.user_name;
        tdUser.appendChild(strong);

        const tdDate = document.createElement('td');
        tdDate.setAttribute('data-label', 'Date');
        tdDate.textContent = new Date(c.created_at).toLocaleDateString();

        const tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';
        tdActions.setAttribute('data-label', 'Actions');
        tdActions.dataset.dropdownType = 'comment';
        tdActions.dataset.commentId = c.id;

        const btn = createDotsButton();
        btn.addEventListener('click', (e) => window.adminActions.toggleRowMenu(e));
        tdActions.appendChild(btn);

        tr.appendChild(tdComment);
        tr.appendChild(tdUser);
        tr.appendChild(tdDate);
        tr.appendChild(tdActions);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

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
    if (document.getElementById('metric-likes')) document.getElementById('metric-likes').textContent = totalLikes;
    if (document.getElementById('metric-clicks')) document.getElementById('metric-clicks').textContent = totalClicks;

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
        const aTitle = document.createElement('a');
        aTitle.href = `../pulse/home?s=${encodeURIComponent(trendingPost.slug)}`;
        aTitle.target = '_blank';
        aTitle.title = trendingPost.title;
        aTitle.setAttribute('style', 'color: #fff; text-decoration: none; border-bottom: 1px dashed rgba(255,255,255,0.3); padding-bottom: 2px;');
        aTitle.textContent = limitWords(trendingPost.title, 6);
        document.getElementById('trending-post-title').replaceChildren(aTitle);
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
    } catch (e) { }

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
        saveBtn.textContent = 'Saving...';

        const { error } = await supabase
            .from('site_settings')
            .upsert({ id: 'broadcast_message', value: input.value, updated_by: currentUser.id, updated_at: new Date().toISOString() });

        saveBtn.disabled = false;
        saveBtn.replaceChildren(createCheckIcon(), document.createTextNode(' Update Broadcast'));

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
        tbody.replaceChildren(createMessageRow(3, 'No username changes recorded.', 'text-align:center;padding:24px;color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    changedUsers.forEach(u => {
        const tr = document.createElement('tr');

        const tdUser = document.createElement('td');
        tdUser.setAttribute('data-label', 'User');
        const strong = document.createElement('strong');
        strong.textContent = u.username;
        tdUser.appendChild(strong);

        const tdChanges = document.createElement('td');
        tdChanges.setAttribute('data-label', 'Total Changes');
        const badge = document.createElement('span');
        badge.className = `status-badge ${u.username_changes_count >= 2 ? 'draft' : 'published'}`;
        badge.textContent = `${u.username_changes_count || 0}/2`;
        tdChanges.appendChild(badge);

        const tdDate = document.createElement('td');
        tdDate.setAttribute('data-label', 'Last Changed');
        tdDate.textContent = new Date(u.last_username_change_at).toLocaleString();

        tr.appendChild(tdUser);
        tr.appendChild(tdChanges);
        tr.appendChild(tdDate);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

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
        tbody.replaceChildren(createMessageRow(2, 'Failed to load stats.', 'text-align:center;padding:12px;color:var(--red);'));
        return;
    }

    if (data.length === 0) {
        tbody.replaceChildren(createMessageRow(2, 'No searches yet.', 'text-align:center;padding:12px;color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    data.forEach(s => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td'); td1.textContent = s.term;
        const td2 = document.createElement('td');
        const st = document.createElement('strong'); st.textContent = s.count;
        td2.appendChild(st);
        tr.appendChild(td1); tr.appendChild(td2);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

}

// =============================================
// TOP AUTHORS
// =============================================
function populateTopAuthors() {
    const tbody = document.querySelector('#top-authors-table tbody');
    const counts = new Map();
    allPosts.forEach(p => {
        const author = p.author || 'Unknown';
        counts.set(author, (counts.get(author) || 0) + 1);
    });
    const sorted = Array.from(counts.entries()).sort(([, aCount], [, bCount]) => bCount - aCount).slice(0, 5);

    if (sorted.length === 0) {
        tbody.replaceChildren(createMessageRow(2, 'No data', 'color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    sorted.forEach(([author, count]) => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const st = document.createElement('strong'); st.textContent = author;
        td1.appendChild(st);
        const td2 = document.createElement('td'); td2.textContent = count;
        tr.appendChild(td1); tr.appendChild(td2);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

}

function populateTopPosts() {
    const tbody = document.querySelector('#top-posts-table tbody');
    if (!tbody) return;

    const sortedPosts = [...allPosts]
        .sort((a, b) => ((b.likes_count || 0) + (b.clicks_count || 0)) - ((a.likes_count || 0) + (a.clicks_count || 0)))
        .slice(0, 5);

    if (sortedPosts.length === 0) {
        tbody.replaceChildren(createMessageRow(3, 'No data', 'color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    sortedPosts.forEach(p => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.title = p.title;
        const a = document.createElement('a');
        a.href = `../pulse/home?s=${encodeURIComponent(p.slug)}`;
        a.target = '_blank';
        a.textContent = limitWords(p.title, 5);
        td1.appendChild(a);

        const td2 = document.createElement('td');
        const st = document.createElement('strong');
        st.setAttribute('style', 'color: #ff6600;');
        st.textContent = p.likes_count || 0;
        td2.appendChild(st);

        const td3 = document.createElement('td');
        td3.textContent = p.clicks_count || 0;

        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

}

// =============================================
// TOP COMMENTERS
// =============================================
function populateTopCommenters() {
    const tbody = document.querySelector('#top-commenters-table tbody');
    const counts = new Map();
    allComments.forEach(c => {
        const userName = c.user_name || 'Unknown';
        counts.set(userName, (counts.get(userName) || 0) + 1);
    });
    const sorted = Array.from(counts.entries()).sort(([, aCount], [, bCount]) => bCount - aCount).slice(0, 10);

    if (sorted.length === 0) {
        tbody.replaceChildren(createMessageRow(2, 'No data', 'color:var(--text-muted);'));
        return;
    }


    const frag = document.createDocumentFragment();
    sorted.forEach(([user, count]) => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const st = document.createElement('strong'); st.textContent = user;
        td1.appendChild(st);
        const td2 = document.createElement('td'); td2.textContent = count;
        tr.appendChild(td1); tr.appendChild(td2);
        frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);

}

// =============================================
// RECENT ACTIVITY
// =============================================
function populateRecentActivity() {
    const list = document.getElementById('recent-activity-list');
    if (!list) return;

    const activities = [];


    allPosts.slice(0, 5).forEach(p => {
        const span = document.createElement('span');
        const s1 = document.createElement('strong'); s1.textContent = p.author;
        const text1 = document.createTextNode(' published ');
        const s2 = document.createElement('strong');
        s2.title = p.title; s2.textContent = limitWords(p.title, 5);
        span.append(s1, text1, s2);
        activities.push({ textNode: span, date: p.published_at });
    });

    allComments.slice(0, 3).forEach(c => {
        const span = document.createElement('span');
        const s1 = document.createElement('strong'); s1.textContent = c.user_name;
        const text1 = document.createTextNode(' commented: "' + c.comment_text.substring(0, 30) + '…"');
        span.append(s1, text1);
        activities.push({ textNode: span, date: c.created_at });
    });

    allUsers.slice(0, 2).forEach(u => {
        const span = document.createElement('span');
        const s1 = document.createElement('strong'); s1.textContent = u.username || 'New user';
        const text1 = document.createTextNode(' joined the platform');
        span.append(s1, text1);
        activities.push({ textNode: span, date: u.created_at });
    });

activities.sort((a, b) => new Date(b.date) - new Date(a.date));

if (activities.length === 0) {
    const li = document.createElement('li'); li.className = 'activity-item'; const s = document.createElement('span'); s.className = 'activity-dot'; li.appendChild(s); li.appendChild(document.createTextNode('No recent activity.')); list.replaceChildren(li);
    return;
}


const frag = document.createDocumentFragment();
activities.slice(0, 8).forEach(a => {
    const li = document.createElement('li');
    li.className = 'activity-item';

    const dot = document.createElement('span');
    dot.className = 'activity-dot';
    li.appendChild(dot);

    const textSpan = document.createElement('span');
    textSpan.appendChild(a.textNode);
    li.appendChild(textSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'activity-time';
    timeSpan.textContent = timeAgo(a.date);
    li.appendChild(timeSpan);

    frag.appendChild(li);
});
list.replaceChildren(frag);

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

function groupByDate(items, getDateValue) {
    const counts = new Map();
    items.forEach(item => {
        const dateValue = getDateValue(item);
        if (!dateValue) return;
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return;
        const d = date.toISOString().slice(0, 10);
        counts.set(d, (counts.get(d) || 0) + 1);
    });
    return counts;
}

// =============================================
// CHARTS
// =============================================
function drawUsersChart() {
    const ctx = document.getElementById('usersChart');
    if (!ctx) return;
    const counts = groupByDate(allUsers, item => item.created_at);
    const labels = Array.from(counts.keys()).sort();
    if (window._uc) window._uc.destroy();
    window._uc = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'New Users',
                data: labels.map(l => counts.get(l) || 0),
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
    const counts = groupByDate(allPosts, item => item.published_at);
    const labels = Array.from(counts.keys()).sort();
    if (window._pc) window._pc.destroy();
    window._pc = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Posts Published',
                data: labels.map(l => counts.get(l) || 0),
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
    const counts = new Map();
    allPosts.forEach(p => {
        const cat = p.category || 'uncategorized';
        counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    const labels = Array.from(counts.keys());
    if (window._cc) window._cc.destroy();
    window._cc = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: labels.map(l => counts.get(l) || 0),
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

    const postCounts = groupByDate(allPosts, item => item.published_at);
    const commentCounts = groupByDate(allComments, item => item.created_at);
    const allDates = new Set([...postCounts.keys(), ...commentCounts.keys()]);
    const labels = [...allDates].sort();

    if (window._dac) window._dac.destroy();
    window._dac = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Posts',
                    data: labels.map(l => postCounts.get(l) || 0),
                    borderColor: '#ff6600',
                    backgroundColor: 'rgba(255,102,0,0.08)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Comments',
                    data: labels.map(l => commentCounts.get(l) || 0),
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
    const counts = groupByDate(allUsers, item => item.created_at);
    const labels = Array.from(counts.keys()).sort();
    let cumulative = 0;
    const data = labels.map(l => { cumulative += counts.get(l) || 0; return cumulative; });

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

    const hourCounts = new Map(Array.from({ length: 24 }, (_, hour) => [hour, 0]));
    allPosts.forEach(p => {
        if (!p.published_at) return;
        const hour = new Date(p.published_at).getUTCHours();
        if (Number.isNaN(hour)) return;
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const data = Array.from({ length: 24 }, (_, hour) => hourCounts.get(hour) || 0);

    if (window._hc) window._hc.destroy();
    window._hc = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Posts by Hour',
                data,
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

        // 1. Verify the profile exists before deleting related content.
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', id)
            .single();

        if (profileErr) {
            showToast('Error fetching profile: ' + profileErr.message, 'error');
            return;
        }

        if (profile?.id) {
            const { error: postsErr } = await supabase
                .from('blogs')
                .delete()
                .eq('author_id', id);
            if (postsErr) {
                showToast('Error deleting posts: ' + postsErr.message, 'error');
            }

            const { error: commentsErr } = await supabase
                .from('comments')
                .delete()
                .eq('user_id', id);
            if (commentsErr) {
                showToast('Error deleting comments: ' + commentsErr.message, 'error');
            }
        }

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
        const existing = document.querySelector('.row-dropdown');
        const trigger = event.currentTarget;
        if (existing) {
            const wasThisOne = existing.dataset.triggerOuter === trigger.outerHTML;
            existing.remove();
            if (wasThisOne) return;
        }

        const parent = trigger.parentElement;
        const type = parent.dataset.dropdownType;
        if (!type) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'row-dropdown';
        dropdown.dataset.triggerOuter = trigger.outerHTML;
        dropdown.style.position = 'fixed';
        dropdown.style.margin = '0';
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        const container = document.createElement('div');
        container.className = 'user-details-dropdown';
        container.setAttribute('style', 'padding: 8px; min-width: 140px; text-align: left;');

        if (type === 'user') {
            container.setAttribute('style', 'padding: 12px; min-width: 200px; text-align: left;');

            const title = document.createElement('div');
            title.setAttribute('style', 'font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;');
            title.textContent = 'User Info';
            container.appendChild(title);

            const idRow = document.createElement('div');
            idRow.setAttribute('style', 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px;');
            const idLabel = document.createElement('span'); idLabel.style.color = 'var(--text-secondary)'; idLabel.textContent = 'ID:';
            const idVal = document.createElement('span'); idVal.setAttribute('style', 'font-family: monospace; color: var(--text-primary); cursor: pointer; text-decoration: underline;');
            idVal.title = 'Click to copy ID';
            idVal.textContent = parent.dataset.userId.substring(0, 8) + '...';
            idVal.addEventListener('click', () => { navigator.clipboard.writeText(parent.dataset.userId); window.showToast('Copied User ID!', 'success'); });
            idRow.append(idLabel, idVal);
            container.appendChild(idRow);

            const joinedRow = document.createElement('div');
            joinedRow.setAttribute('style', 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border);');
            const joinedLabel = document.createElement('span'); joinedLabel.style.color = 'var(--text-secondary)'; joinedLabel.textContent = 'Joined:';
            const joinedVal = document.createElement('span'); joinedVal.setAttribute('style', 'color: var(--text-primary); cursor: pointer; text-decoration: underline;');
            joinedVal.title = 'Click to see everyone who joined on this date';
            joinedVal.textContent = parent.dataset.userJoined;
            joinedVal.addEventListener('click', () => window.adminActions.filterUsersByJoinDate(parent.dataset.userJoined));
            joinedRow.append(joinedLabel, joinedVal);
            container.appendChild(joinedRow);

            const roleRow = document.createElement('div');
            roleRow.className = 'desktop-only-admin-toggle';
            roleRow.setAttribute('style', 'display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px;');
            const roleLabel = document.createElement('span'); roleLabel.style.color = 'var(--text-secondary)'; roleLabel.textContent = 'Role: Admin';
            const toggleLabel = document.createElement('label'); toggleLabel.className = 'toggle-switch'; toggleLabel.setAttribute('style', 'transform: scale(0.85); transform-origin: right center;');
            const toggleInput = document.createElement('input'); toggleInput.type = 'checkbox';
            toggleInput.checked = parent.dataset.userIsAdmin === 'true';
            if (parent.dataset.isSelf === 'true') toggleInput.disabled = true;
            toggleInput.addEventListener('change', (e) => { e.stopPropagation(); window.adminActions.toggleAdmin(parent.dataset.userId, e.target.checked); });
            const toggleSlider = document.createElement('span'); toggleSlider.className = 'toggle-slider';
            toggleLabel.append(toggleInput, toggleSlider);
            roleRow.append(roleLabel, toggleLabel);
            container.appendChild(roleRow);

            if (parent.dataset.isSelf !== 'true') {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'row-dropdown-item danger';
                removeBtn.setAttribute('style', 'padding: 8px; border-radius: var(--radius-sm); font-size: 12px; justify-content: center; width: 100%; border: 1px solid rgba(239, 68, 68, 0.2);');
                removeBtn.appendChild(createTrashIcon());
                removeBtn.appendChild(document.createTextNode(' Remove User'));
                removeBtn.addEventListener('click', () => window.adminActions.deleteProfile(parent.dataset.userId));
                container.appendChild(removeBtn);
            }
        } else if (type === 'post') {
            const viewBtn = document.createElement('button');
            viewBtn.className = 'row-dropdown-item';
            viewBtn.appendChild(createEyeIcon());
            viewBtn.appendChild(document.createTextNode(' View Story'));
            viewBtn.addEventListener('click', () => window.open(parent.dataset.postUrl, '_blank'));

            const shareBtn = document.createElement('button');
            shareBtn.className = 'row-dropdown-item';
            shareBtn.appendChild(createShareIcon());
            shareBtn.appendChild(document.createTextNode(' Share Post'));
            shareBtn.addEventListener('click', () => window.adminActions.sharePost(parent.dataset.postTitle, parent.dataset.postUrl));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'row-dropdown-item danger';
            deleteBtn.appendChild(createTrashIcon());
            deleteBtn.appendChild(document.createTextNode(' Delete Post'));
            deleteBtn.addEventListener('click', () => window.adminActions.deletePost(parent.dataset.postId));

            container.append(viewBtn, shareBtn, deleteBtn);
        } else if (type === 'comment') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'row-dropdown-item danger';
            deleteBtn.appendChild(createTrashIcon());
            deleteBtn.appendChild(document.createTextNode(' Delete Comment'));
            deleteBtn.addEventListener('click', () => window.adminActions.deleteComment(parent.dataset.commentId));
            container.appendChild(deleteBtn);
        }

        dropdown.appendChild(container);
        document.body.appendChild(dropdown);

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
