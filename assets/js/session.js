import { supabase } from './supabaseClient.js';

const currentTheme = localStorage.getItem('kn-theme') || 'light';
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
} else {
    document.documentElement.setAttribute('data-theme', 'light');
}

if (window.history && window.history.replaceState) {
    const path = window.location.pathname;
    if (path.endsWith('.html') && !path.endsWith('index.html') && !path.includes('profile.html') && !path.includes('404.html')) {
        const cleanPath = path.substring(0, path.length - 5) + window.location.search + window.location.hash;
        window.history.replaceState(null, '', cleanPath);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const authLinks = document.querySelectorAll('a[href="login.html"], a[href="../login.html"]');
    if (!supabase) return;

    try {
        const { data: maintData } = await supabase
            .from('site_settings')
            .select('value')
            .eq('id', 'maintenance_mode')
            .maybeSingle();

        const isMaintenance = (maintData && (maintData.value === 'true' || maintData.value === true));
        const path = window.location.pathname;
        const isMaintPage = path.includes('maintenance.html');
        const isLoginPage = path.includes('login.html');
        const isAdminPage = path.includes('/admin/');

        const { data: { session } } = await supabase.auth.getSession();
        let isAdmin = false;

        if (session && session.user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin, username')
                .eq('id', session.user.id)
                .single();

            isAdmin = !!profile?.is_admin;

            if (profile) {
                const username = profile.username || session.user.email.split('@')[0];
                updateAuthUI(authLinks, username);
            }
        }

        if (isMaintenance && !isAdmin) {
            if (isMaintPage) {
                document.body.style.visibility = 'visible';
            } else if (!isLoginPage && !isAdminPage) {
                const isSubdir = path.includes('/pulse/') || path.includes('/admin/');
                window.location.replace(isSubdir ? '../maintenance.html' : 'maintenance.html');
            }
        } else if (!isMaintenance && isMaintPage) {
            window.location.replace('index.html');
        } else {
            document.body.style.visibility = 'visible';
        }

    } catch (err) {
        console.error('Session error:', err);
        document.body.style.visibility = 'visible';
    }

    const headerRight = document.querySelector('header .ml-auto');
    if (headerRight) {
        const separator = document.createElement('span');
        separator.textContent = ' | ';
        
        const toggleBtn = document.createElement('a');
        toggleBtn.href = '#';
        toggleBtn.className = 'hover:underline text-black';
        toggleBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light mode' : 'dark mode';
        toggleBtn.style.cursor = 'pointer';

        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.documentElement.getAttribute('data-theme') === 'dark') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('kn-theme', 'light');
                toggleBtn.textContent = 'dark mode';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('kn-theme', 'dark');
                toggleBtn.textContent = 'light mode';
            }
        });

        headerRight.appendChild(separator);
        headerRight.appendChild(toggleBtn);
    }

    setTimeout(() => {
        if (document.body.style.visibility !== 'visible') {
            document.body.style.visibility = 'visible';
        }
    }, 2500);
});

function updateAuthUI(authLinks, username) {
    authLinks.forEach(link => {
        const parent = link.parentNode;
        const isSubdir = link.getAttribute('href') === '../login.html';
        const prefix = isSubdir ? '../' : '';

        const userContainer = document.createElement('div');
        userContainer.className = 'flex items-center gap-2';

        const userSpan = document.createElement('a');
        userSpan.href = prefix + 'profile.html?user=' + username;
        userSpan.className = 'hover:underline text-black';
        userSpan.textContent = username;

        const separator = document.createElement('span');
        separator.textContent = '|';

        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.className = 'hover:underline text-black';
        logoutLink.textContent = 'logout';

        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.reload();
        });

        userContainer.appendChild(userSpan);
        userContainer.appendChild(separator);
        userContainer.appendChild(logoutLink);

        parent.replaceChild(userContainer, link);
    });
}
