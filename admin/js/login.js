import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('error-msg');

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
