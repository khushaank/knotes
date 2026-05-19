import { supabase } from './supabaseClient.js';

const currentTheme = localStorage.getItem('kn-theme') || 'light';
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
}


// ─── Auth Cache ───────────────────────────────────────────────────────────────
const AUTH_CACHE_KEY = 'kn-auth-cache';

function getCachedAuth() {
    try {
        const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function setCachedAuth(data) {
    try { sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(data)); } catch (e) { }
}

function clearCachedAuth() {
    try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch (e) { }
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function applyAuthUI(authLinks, username) {
    authLinks.forEach(link => {
        const parent = link.parentNode;
        if (!parent) return;
        const prefix = link.getAttribute('href') === '../login.html' ? '../' : '';

        const userContainer = document.createElement('div');
        userContainer.className = 'flex items-center gap-2';

        const userSpan = document.createElement('a');
        userSpan.href = prefix + 'profile.html?user=' + username;
        userSpan.className = 'hover:underline text-black';
        userSpan.textContent = username;

        const sep = document.createElement('span');
        sep.textContent = '|';

        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.className = 'hover:underline text-black';
        logoutLink.textContent = 'logout';

        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();
            clearCachedAuth();
            await supabase.auth.signOut();
            window.location.href = prefix ? prefix + 'index.html' : 'index.html';
        });

        userContainer.appendChild(userSpan);
        userContainer.appendChild(sep);
        userContainer.appendChild(logoutLink);
        parent.replaceChild(userContainer, link);
    });
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
function addThemeToggle() {
    const headerRight = document.querySelector('header .ml-auto');
    if (!headerRight || headerRight.querySelector('.kn-theme-toggle')) return;

    const sep = document.createElement('span');
    sep.textContent = ' | ';

    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'kn-theme-toggle hover:text-gray-800 text-black flex items-center justify-center';
    btn.style.cursor = 'pointer';
    btn.title = 'Toggle Theme';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.style.fontSize = '18px';
    icon.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light_mode' : 'dark_mode';
    btn.appendChild(icon);

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            document.documentElement.classList.remove('dark');
            localStorage.setItem('kn-theme', 'light');
            icon.textContent = 'dark_mode';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('kn-theme', 'dark');
            icon.textContent = 'light_mode';
        }
    });

    headerRight.appendChild(sep);
    headerRight.appendChild(btn);
}

// ─── Main Session Logic ───────────────────────────────────────────────────────
(document.readyState === 'loading'
    ? document.addEventListener.bind(document, 'DOMContentLoaded')
    : (cb) => cb()
)(async () => {
    const authLinks = document.querySelectorAll('a[href="login.html"], a[href="../login.html"]');

    if (!supabase) {
        document.body.style.visibility = 'visible';
        addThemeToggle();
        return;
    }

    // STEP 1 — Instant render from cache (zero network)
    const cached = getCachedAuth();
    if (cached && cached.username) {
        applyAuthUI(authLinks, cached.username);
    }
    addThemeToggle();

    // Show body immediately when we have cached state — no flicker
    if (cached) {
        document.body.style.visibility = 'visible';
    }

    // STEP 2 — Background validation
    try {
        const [maintResult, sessionResult] = await Promise.all([
            supabase.from('site_settings').select('value').eq('id', 'maintenance_mode').maybeSingle(),
            supabase.auth.getSession()
        ]);

        const isMaintenance = !!(maintResult.data &&
            (maintResult.data.value === 'true' || maintResult.data.value === true));
        const session = sessionResult.data?.session;
        const path = window.location.pathname;
        const isMaintPage = path.includes('maintenance.html');
        const isLoginPage = path.includes('login.html');
        const isAdminPage = path.includes('/admin/');

        if (session && session.user) {
            if (!cached || !cached.username) {
                // First load — fetch profile and cache it
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_admin, username')
                    .eq('id', session.user.id)
                    .single();

                if (profile) {
                    const username = profile.username || session.user.email.split('@')[0];
                    setCachedAuth({ username, isAdmin: !!profile.is_admin });
                    applyAuthUI(authLinks, username);
                }
            } else {
                // Cache hit — silently refresh cache in background, no UI change
                supabase
                    .from('profiles')
                    .select('is_admin, username')
                    .eq('id', session.user.id)
                    .single()
                    .then(({ data: profile }) => {
                        if (profile) {
                            const username = profile.username || session.user.email.split('@')[0];
                            // Only update cache — don't touch the DOM (already correct)
                            setCachedAuth({ username, isAdmin: !!profile.is_admin });
                        }
                    });
            }
        } else {
            // Session expired or logged out — clear stale cache and reload once
            if (cached) {
                clearCachedAuth();
                window.location.reload();
                return;
            }
        }

        // Maintenance mode routing
        const isAdmin = getCachedAuth()?.isAdmin || false;
        if (isMaintenance && !isAdmin) {
            if (isMaintPage) {
                document.body.style.visibility = 'visible';
            } else if (!isLoginPage && !isAdminPage) {
                const isSubdir = path.includes('/pulse/') || path.includes('/admin/');
                window.location.replace(isSubdir ? '../maintenance.html' : 'maintenance.html');
                return;
            }
        } else if (!isMaintenance && isMaintPage) {
            window.location.replace('index.html');
            return;
        }

        document.body.style.visibility = 'visible';

    } catch (err) {
        console.error('Session error:', err);
        document.body.style.visibility = 'visible';
    }

    // Failsafe — always show body after 2.5s
    setTimeout(() => {
        if (document.body.style.visibility !== 'visible') {
            document.body.style.visibility = 'visible';
        }
    }, 2500);
});
