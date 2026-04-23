import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const messageContainer = document.getElementById('message-container');

    function showMessage(msg, isError = false) {
        messageContainer.textContent = msg;
        messageContainer.classList.remove('hidden');
        if (isError) {
            messageContainer.classList.add('text-red-600');
            messageContainer.classList.remove('text-green-600');
        } else {
            messageContainer.classList.add('text-green-600');
            messageContainer.classList.remove('text-red-600');
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                showMessage('Please enter both username/email and password.', true);
                return;
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                showMessage(error.message, true);
            } else {
                showMessage('Logged in successfully! Redirecting...', false);
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;

            if (!email || !password) {
                showMessage('Please enter both username/email and password.', true);
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (error) {
                showMessage(error.message, true);
            } else {
                showMessage('Account created successfully! You can now login.', false);
            }
        });
    }
});
