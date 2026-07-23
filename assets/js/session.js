import { supabase } from './supabaseClient.js?v=8';

function applyTheme(preference = 'system') {
    const resolved = preference === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : preference;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    try { localStorage.setItem('kn-theme-preference', preference); } catch (e) { }
}

try { applyTheme(localStorage.getItem('kn-theme-preference') || 'system'); } catch (e) { applyTheme('system'); }

const AUTH_CACHE_KEY = 'kn-auth-cache';
const INSTALL_PROMPT_KEY = 'kn-install-prompt-seen';
const APP_ROOT = window.location.pathname.includes('/pulse/') ? '../' : '';
const CLEAN_PATH = window.location.pathname.replace(/\/+$/, '');
const PAGE_NAME = (CLEAN_PATH.split('/').pop()?.replace(/\.html$/i, '') || 'home').toLowerCase();
const HEADERLESS_PAGES = new Set(['login', 'maintenance']);

function isCompactHeader() {
    return window.matchMedia('(max-width: 639px)').matches;
}

function syncHeaderLabels() {
    const compact = isCompactHeader();
    const brand = document.querySelector('.kn-header-brand');
    if (brand) brand.textContent = compact ? 'KN' : 'K. Notes';

    document.querySelectorAll('.kn-user-name').forEach(node => {
        node.hidden = compact;
    });
    document.querySelectorAll('.kn-user-initials').forEach(node => {
        node.hidden = !compact;
    });
}

window.addEventListener('resize', syncHeaderLabels);

function enhanceFormAccessibility() {
    document.querySelectorAll('input, textarea, select').forEach(field => {
        if (!field.name && field.id) field.name = field.id;

        const hasLabel = field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (!hasLabel && !field.hasAttribute('aria-label')) {
            const fallback = field.placeholder || field.title || field.id?.replace(/[-_]+/g, ' ');
            if (fallback) field.setAttribute('aria-label', fallback);
        }
    });

    document.querySelectorAll('[id*="search-input"]').forEach(input => {
        input.name = 'search';
        input.setAttribute('aria-label', 'Search');
        input.setAttribute('autocomplete', 'off');
    });
}

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

function setupInstallPrompt() {
    if (localStorage.getItem(INSTALL_PROMPT_KEY) || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

    let installEvent;
    let banner;

    const dismiss = () => {
        localStorage.setItem(INSTALL_PROMPT_KEY, '1');
        banner?.remove();
    };

    const showBanner = (message, buttonText, action) => {
        if (banner) return;
        banner = document.createElement('aside');
        banner.className = 'kn-install-prompt';
        banner.setAttribute('aria-label', 'Install K. Notes');

        const text = document.createElement('span');
        text.textContent = message;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = buttonText;
        button.addEventListener('click', action);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'kn-install-close';
        close.setAttribute('aria-label', 'Dismiss install prompt');
        close.textContent = '×';
        close.addEventListener('click', dismiss);

        banner.append(text, button, close);
        document.body.appendChild(banner);
    };

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installEvent = event;
        showBanner('Install K. Notes for quick access and offline reading.', 'Install', async () => {
            localStorage.setItem(INSTALL_PROMPT_KEY, '1');
            await installEvent.prompt();
            installEvent = null;
            banner?.remove();
        });
    });

    window.addEventListener('appinstalled', dismiss);

    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = APP_ROOT + 'manifest.webmanifest';
    document.head.appendChild(manifest);

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            let hasReloadedForNewWorker = false;

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (hasReloadedForNewWorker) return;
                hasReloadedForNewWorker = true;
                window.location.reload();
            });

            try {
                const registration = await navigator.serviceWorker.register(APP_ROOT + 'service-worker.js', {
                    updateViaCache: 'none'
                });
                await registration.update();
            } catch (e) { }
        });
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos && !navigator.standalone) {
        showBanner('Install K. Notes: tap Share, then Add to Home Screen.', 'Got it', dismiss);
    }
}

function renderSharedHeader() {
    let header = document.querySelector('header');
    if (!header) {
        header = document.createElement('header');
        document.body.prepend(header);
    }
    header.classList.add('kn-site-header');

    let inner = header.querySelector(':scope > div');
    if (!inner) {
        inner = document.createElement('div');
        header.appendChild(inner);
    }

    const prefix = APP_ROOT;
    let brand = inner.querySelector(':scope > a');
    let nav = inner.querySelector(':scope > nav') || Array.from(inner.children).find(element =>
        element !== brand && element.querySelector('a[href*="ask"]')
    );
    let auth = Array.from(inner.children).find(element =>
        element !== nav && element.querySelector('a[href*="login"]')
    );

    // Most pages ship this markup in the HTML. Preserve it so hydration cannot
    // replace the header after first paint and cause a visible layout shift.
    if (!brand || !nav || !auth) {
        inner.innerHTML = `
            <a href="${prefix}home" title="K. Notes">K. Notes</a>
            <nav aria-label="Main navigation">
                <a href="${prefix}home">feed</a><span aria-hidden="true">|</span>
                <a href="${prefix}ask">ask</a><span aria-hidden="true">|</span>
                <a href="${prefix}show">show</a><span aria-hidden="true">|</span>
                <a href="${prefix}submit">submit</a>
            </nav>
            <div><a href="${prefix}login">login</a></div>`;
        brand = inner.querySelector(':scope > a');
        nav = inner.querySelector(':scope > nav');
        auth = inner.querySelector(':scope > div');
    }

    inner.classList.add('kn-header-inner');
    brand.classList.add('kn-header-brand');
    nav.classList.add('kn-header-nav');
    nav.setAttribute('aria-label', 'Main navigation');
    auth.classList.add('kn-header-auth');

    // Active links are declared in the page HTML. Keeping that state static
    // avoids changing the navigation width after first paint.
}

function injectMobileHeaderStyles() {
    if (document.getElementById('kn-mobile-header-styles')) return;

    const style = document.createElement('style');
    style.id = 'kn-mobile-header-styles';
    style.textContent = `
        header.kn-site-header {
            background: #ff6600 !important;
            color: #000000 !important;
            width: 100%;
            min-height: 0;
            padding: 2px 8px;
            border: 0;
            border-radius: 0;
            font: 14px/normal Verdana, Geneva, sans-serif;
        }

        header.kn-site-header a,
        header.kn-site-header .kn-header-auth {
            color: #000000 !important;
        }

        .kn-header-brand {
            display: inline-flex;
            align-items: center;
            white-space: nowrap;
            margin-right: 8px;
            padding: 0 4px;
            font-weight: 700;
        }

        .kn-header-inner {
            display: flex;
            align-items: center;
            gap: 4px;
            width: 100%;
            min-width: 0;
            font: inherit;
        }

        .kn-header-nav {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px;
        }

        .kn-header-current {
            font-weight: 700;
        }

        .kn-header-auth {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            white-space: nowrap;
        }

        .kn-header-auth > a {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .kn-site-header a:hover,
        .kn-site-header button:hover {
            text-decoration: underline;
        }

        .kn-theme-toggle {
            position: static !important;
            display: inline-flex;
            align-items: center;
            min-height: 30px;
            padding: 0;
            border: 0;
            background: transparent;
            color: #000;
            cursor: pointer;
            font: inherit;
        }

        .kn-install-prompt {
            position: fixed;
            right: 12px;
            bottom: 12px;
            z-index: 120;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 360px;
            padding: 10px 12px;
            border: 1px solid #b34700;
            border-radius: 6px;
            background: #fff;
            color: #261812;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
            font-size: 12px;
            line-height: 1.4;
        }

        .kn-install-prompt button {
            flex: 0 0 auto;
            padding: 5px 9px;
            border: 1px solid #b34700;
            border-radius: 4px;
            background: #ff6600;
            color: #000;
            cursor: pointer;
            font: inherit;
            font-weight: bold;
        }

        .kn-install-prompt .kn-install-close {
            padding: 2px 5px;
            border: 0;
            background: transparent;
            font-size: 18px;
            font-weight: normal;
        }

        @media (max-width: 639px) {
            header.kn-site-header {
                position: sticky;
                top: 0;
                z-index: 80;
                min-height: 0;
                padding: 2px 6px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.22);
            }

            header.kn-site-header a[title="K.Notes"],
            header.kn-site-header a.font-bold {
                flex: 0 0 auto;
                font-size: 13px;
            }

            .kn-install-prompt {
                right: 8px;
                bottom: 8px;
                left: 8px;
                max-width: none;
            }

            header.kn-site-header .kn-header-inner {
                flex-wrap: wrap !important;
                gap: 1px 3px !important;
                font-size: 12px;
            }

            .kn-header-brand {
                order: 1;
            }

            .kn-header-nav {
                order: 3;
                width: 100%;
                flex-wrap: nowrap;
                padding-left: 4px;
                font-size: 12px;
            }

            .kn-header-auth {
                order: 2;
                max-width: 55%;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: 12px;
            }
        }

        html.dark body,
        html.dark main,
        html.dark footer,
        html.dark .bg-surface-bright {
            background: #1c1917 !important;
            color: #f5f5f4 !important;
        }

        html.dark .text-gray-500,
        html.dark .text-gray-600,
        html.dark .text-gray-700,
        html.dark .text-hn-grey {
            color: #b8b3ad !important;
        }

        html.dark footer,
        html.dark .border-gray-200,
        html.dark .border-gray-300,
        html.dark .border-gray-400 {
            border-color: #57534e !important;
        }
    `;
    document.head.appendChild(style);
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function applyAuthUI(username) {
    const auth = document.querySelector('.kn-header-auth');
    if (!auth) return;
    const prefix = APP_ROOT;
    const profile = document.createElement('a');
    profile.href = prefix + 'profile';
    profile.className = 'hover:underline text-black';
    const initials = String(username || 'member')
        .split(/[^a-z0-9]+/i)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join('') || 'M';
    profile.title = username;
    profile.setAttribute('aria-label', `Profile: ${username}`);
    const name = document.createElement('span');
    name.className = 'kn-user-name';
    name.textContent = username;
    const compactName = document.createElement('span');
    compactName.className = 'kn-user-initials';
    compactName.setAttribute('aria-hidden', 'true');
    compactName.textContent = initials;
    profile.append(name, compactName);
    auth.replaceChildren(profile);
    syncHeaderLabels();
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
// ─── Main Session Logic ───────────────────────────────────────────────────────
(document.readyState === 'loading'
    ? document.addEventListener.bind(document, 'DOMContentLoaded')
    : (cb) => cb()
)(async () => {
    setupInstallPrompt();
    enhanceFormAccessibility();
    if (!HEADERLESS_PAGES.has(PAGE_NAME)) {
        renderSharedHeader();
        syncHeaderLabels();
    }
    document.querySelectorAll('a[href*="profile?user="]').forEach(link => link.replaceWith(document.createTextNode(link.textContent)));
    if (!supabase) {
        document.body.style.visibility = 'visible';
        return;
    }

    // STEP 1 — Instant render from cache (zero network)
    const cached = getCachedAuth();
    if (cached && cached.username) {
        applyAuthUI(cached.username);
        applyTheme(cached.themePreference || 'system');
    }

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
                    .select('is_admin, username, theme_preference')
                    .eq('id', session.user.id)
                    .single();

                if (profile) {
                    const username = profile.username || session.user.email.split('@')[0];
                    const themePreference = profile.theme_preference || 'system';
                    setCachedAuth({ username, isAdmin: !!profile.is_admin, themePreference });
                    applyTheme(themePreference);
                    applyAuthUI(username);
                }
            } else {
                // Cache hit — silently refresh cache in background, no UI change
                supabase
                    .from('profiles')
                    .select('is_admin, username, theme_preference')
                    .eq('id', session.user.id)
                    .single()
                    .then(({ data: profile }) => {
                        if (profile) {
                            const username = profile.username || session.user.email.split('@')[0];
                            // Only update cache — don't touch the DOM (already correct)
                            const themePreference = profile.theme_preference || 'system';
                            setCachedAuth({ username, isAdmin: !!profile.is_admin, themePreference });
                            applyTheme(themePreference);
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