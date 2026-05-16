import { supabase } from './supabaseClient.js';

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
        const isAdminPage = path.includes('/admin-kgnews/');

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
                const isSubdir = path.includes('/pulse/') || path.includes('/admin-kgnews/');
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
        userSpan.href = prefix + 'profile.html';
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
