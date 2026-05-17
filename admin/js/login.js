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

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('error-msg');

    if (!supabase && errorMsg) {
        errorMsg.textContent = 'Configuration missing: admin/js/supabaseConfig.js could not be loaded.';
        errorMsg.style.display = 'block';
        if (loginBtn) loginBtn.disabled = true;
    }

    async function handleLogin() {
        errorMsg.style.display = 'none';
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            errorMsg.textContent = 'Please enter both email and password.';
            errorMsg.style.display = 'block';
            return;
        }

        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            errorMsg.textContent = error.message;
            errorMsg.style.display = 'block';
            loginBtn.textContent = 'Log In';
            loginBtn.disabled = false;
            return;
        }

        // Check if admin
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', data.user.id)
            .single();

        if (profileError || !profile || !profile.is_admin) {
            errorMsg.textContent = 'Access denied. Admin privileges required.';
            errorMsg.style.display = 'block';
            await supabase.auth.signOut();
            loginBtn.textContent = 'Log In';
            loginBtn.disabled = false;
            return;
        }

        // Success, redirect to dashboard
        window.location.href = 'index.html';
    }

    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
});
