import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authLinks = document.querySelectorAll('a[href="login.html"], a[href="../login.html"]');

    if (!supabase) return;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (session && session.user) {
            const email = session.user.email;
            const username = email.split('@')[0];

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
    } catch (err) {
    }

});
