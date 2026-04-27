import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Check if the auth-link element exists or try to find the login link
    const authLinks = document.querySelectorAll('a[href="login.html"]');
    
    // Quick fast-path if Supabase isn't initialized properly
    if (!supabase) return;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && session.user) {
            // User is logged in
            const email = session.user.email;
            // Assuming the username is the part before @ for simplicity, or just use email
            const username = email.split('@')[0];
            
            authLinks.forEach(link => {
                const parent = link.parentNode;
                
                // Create a container for username and logout
                const userContainer = document.createElement('div');
                userContainer.className = 'flex items-center gap-2';
                
                const userSpan = document.createElement('a');
                userSpan.href = 'profile.html';
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

    // ---- Back to Top Button ---- //
    const btn = document.createElement('button');
    btn.id = 'back-to-top';
    btn.innerHTML = '↑';
    btn.title = 'Back to top';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:36px;height:36px;border-radius:50%;border:1px solid #ccc;background:#fff;color:#333;font-size:16px;cursor:pointer;display:none;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:opacity 0.3s, transform 0.3s;';
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            btn.style.display = 'block';
            btn.style.opacity = '1';
        } else {
            btn.style.opacity = '0';
            setTimeout(() => { if (window.scrollY <= 400) btn.style.display = 'none'; }, 300);
        }
    }, { passive: true });
});
