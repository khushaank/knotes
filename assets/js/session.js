import { supabase } from './supabaseClient.js';

const currentTheme = localStorage.getItem('kn-theme') || 'light';
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
}

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

function injectMobileHeaderStyles() {
    if (document.getElementById('kn-mobile-header-styles')) return;

    const style = document.createElement('style');
    style.id = 'kn-mobile-header-styles';
    style.textContent = `
        header.kn-site-header {
            background: #ff6600 !important;
            color: #000000 !important;
        }

        header.kn-site-header a,
        header.kn-site-header .kn-header-auth {
            color: #000000 !important;
        }

        .kn-header-inner {
            position: relative;
        }

        .kn-header-panel {
            display: flex;
            align-items: center;
            flex: 1 1 auto;
            min-width: 0;
        }

        .kn-header-nav {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px;
        }

        .kn-header-auth {
            margin-left: auto;
        }

        .kn-mobile-menu-toggle {
            display: none;
        }

        @media (max-width: 639px) {
            header.kn-site-header {
                position: sticky;
                top: 0;
                z-index: 80;
                min-height: 42px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.22);
            }

            header.kn-site-header .kn-header-inner {
                flex-wrap: nowrap !important;
                align-items: center !important;
                gap: 8px !important;
                padding: 6px 8px !important;
            }

            header.kn-site-header a[title="K.Notes"],
            header.kn-site-header a.font-bold {
                flex: 0 0 auto;
                font-size: 13px;
            }

            .kn-header-panel {
                position: absolute;
                top: calc(100% + 1px);
                left: 0;
                right: 0;
                display: none;
                flex-direction: column;
                align-items: stretch;
                gap: 6px;
                padding: 8px;
                background: #ff6600;
                border-bottom: 1px solid rgba(0, 0, 0, 0.18);
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
            }

            header.kn-mobile-menu-open .kn-header-panel {
                display: flex;
            }

            .kn-header-nav {
                display: flex !important;
                flex-direction: column;
                align-items: stretch !important;
                gap: 3px !important;
                font-size: 13px !important;
            }

            .kn-header-separator {
                display: none;
            }

            .kn-header-nav a,
            .kn-header-auth a,
            .kn-header-auth .kn-theme-toggle {
                display: flex !important;
                align-items: center;
                min-height: 34px;
                padding: 7px 9px;
                border: 1px solid rgba(0, 0, 0, 0.16);
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.24);
                color: #000000 !important;
                text-decoration: none !important;
            }

            .kn-header-auth {
                width: 100%;
                margin-left: 0 !important;
                padding-top: 6px;
                border-top: 1px solid rgba(0, 0, 0, 0.16);
                font-size: 13px !important;
            }

            .kn-header-auth > div {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .kn-header-auth > span {
                display: none;
            }

            .kn-mobile-menu-toggle {
                display: inline-flex;
                width: 34px;
                height: 30px;
                margin-left: auto;
                flex: 0 0 auto;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                border: 1px solid rgba(0, 0, 0, 0.24);
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.28);
                cursor: pointer;
            }

            .kn-mobile-menu-toggle span {
                width: 17px;
                height: 2px;
                border-radius: 999px;
                background: #000000;
                transition: transform 0.16s ease, opacity 0.16s ease;
            }

            header.kn-mobile-menu-open .kn-mobile-menu-toggle span:nth-child(1) {
                transform: translateY(6px) rotate(45deg);
            }

            header.kn-mobile-menu-open .kn-mobile-menu-toggle span:nth-child(2) {
                opacity: 0;
            }

            header.kn-mobile-menu-open .kn-mobile-menu-toggle span:nth-child(3) {
                transform: translateY(-6px) rotate(-45deg);
            }
        }
    `;
    document.head.appendChild(style);
}

function wrapHeaderSeparators(nav) {
    Array.from(nav.childNodes).forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.includes('|')) return;
        const fragment = document.createDocumentFragment();
        node.textContent.split('|').forEach((part, index, parts) => {
            if (part) fragment.appendChild(document.createTextNode(part));
            if (index < parts.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'kn-header-separator';
                sep.textContent = '|';
                fragment.appendChild(sep);
            }
        });
        node.replaceWith(fragment);
    });
}

function setupMobileHeader() {
    injectMobileHeaderStyles();

    const header = document.querySelector('header');
    if (!header || header.classList.contains('kn-site-header-ready')) return;

    const inner = header.querySelector('.flex.items-center.gap-1.w-full');
    if (!inner) return;

    const brand = inner.querySelector('a[title="K.Notes"], a.font-bold');
    const nav = Array.from(inner.children).find(el =>
        el !== brand &&
        el.classList?.contains('flex') &&
        el.classList?.contains('flex-wrap') &&
        !el.classList?.contains('ml-auto')
    );
    const auth = inner.querySelector('.ml-auto');
    if (!brand || !nav || !auth) return;

    header.classList.add('kn-site-header', 'kn-site-header-ready');
    inner.classList.add('kn-header-inner');
    nav.classList.add('kn-header-nav');
    auth.classList.add('kn-header-auth');
    wrapHeaderSeparators(nav);

    const panel = document.createElement('div');
    panel.className = 'kn-header-panel';
    inner.insertBefore(panel, nav);
    panel.appendChild(nav);
    panel.appendChild(auth);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'kn-mobile-menu-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    inner.appendChild(toggle);

    function setOpen(open) {
        header.classList.toggle('kn-mobile-menu-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!header.classList.contains('kn-mobile-menu-open'));
    });

    panel.addEventListener('click', (event) => {
        if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('click', (event) => {
        if (!header.contains(event.target)) setOpen(false);
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setOpen(false);
    });
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function applyAuthUI(authLinks, username) {
    authLinks.forEach(link => {
        const parent = link.parentNode;
        if (!parent) return;
        const prefix = link.getAttribute('href') === '../login' ? '../' : '';

        const userContainer = document.createElement('div');
        userContainer.className = 'flex items-center gap-2';

        const userSpan = document.createElement('a');
        userSpan.href = prefix + 'profile?user=' + encodeURIComponent(username);
        userSpan.className = 'hover:underline text-black';
        userSpan.textContent = username;

        userContainer.appendChild(userSpan);
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
    const authLinks = document.querySelectorAll('a[href="login"], a[href="../login"]');

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
        const isMaintPage = path.includes('maintenance');
        const isLoginPage = path.includes('login');
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
                window.location.replace(isSubdir ? '../maintenance' : 'maintenance');
                return;
            }
        } else if (!isMaintenance && isMaintPage) {
            window.location.replace('home');
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
