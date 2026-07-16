import { supabase } from './supabaseClient.js';

const ready = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();

await ready;

const page = document.getElementById('account-page');
const loading = document.getElementById('account-loading');
const form = document.getElementById('password-form');
const status = document.getElementById('password-status');
const save = document.getElementById('password-save');
const passwordFields = [...form.querySelectorAll('input[type="password"]')];

if (!supabase) {
    loading.textContent = 'Account service is unavailable.';
} else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.replace('login');
    } else {
        if (window.location.search || window.location.hash) history.replaceState(null, '', 'profile');
        loading.remove();
        page.hidden = false;

        document.getElementById('show-passwords').addEventListener('change', event => {
            passwordFields.forEach(input => { input.type = event.target.checked ? 'text' : 'password'; });
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!form.reportValidity()) return;

            const currentPassword = form.elements['current-password'].value;
            const newPassword = form.elements['new-password'].value;
            const confirmPassword = form.elements['confirm-password'].value;

            if (newPassword !== confirmPassword) {
                status.textContent = 'New passwords do not match.';
                form.elements['confirm-password'].focus();
                return;
            }
            if (currentPassword === newPassword) {
                status.textContent = 'Choose a password different from your current password.';
                form.elements['new-password'].focus();
                return;
            }

            save.disabled = true;
            status.textContent = 'Updating password…';
            const { error } = await supabase.auth.updateUser({
                current_password: currentPassword,
                password: newPassword
            });
            status.textContent = error ? error.message : 'Password updated.';
            if (!error) {
                form.reset();
                passwordFields.forEach(input => { input.type = 'password'; });
            }
            save.disabled = false;
        });

        document.getElementById('profile-logout').addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            sessionStorage.removeItem('kn-auth-cache');
            await supabase.auth.signOut();
            window.location.replace('home');
        });
    }
}
