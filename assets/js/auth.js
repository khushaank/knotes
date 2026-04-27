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

            const loginBtn = loginForm.querySelector('button[type="submit"]');
            loginBtn.disabled = true;
            loginBtn.textContent = 'logging in...';

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                showMessage(error.message, true);
                loginBtn.disabled = false;
                loginBtn.textContent = 'login';
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

            if (password.length < 6) {
                showMessage('Password must be at least 6 characters.', true);
                return;
            }

            const signupBtn = signupForm.querySelector('button[type="submit"]');
            signupBtn.disabled = true;
            signupBtn.textContent = 'creating...';

            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            signupBtn.disabled = false;
            signupBtn.textContent = 'create account';

            if (error) {
                showMessage(error.message, true);
            } else {
                showMessage('Account created successfully! You can now login.', false);
                // Auto-switch focus to login form
                document.getElementById('login-email')?.focus();
            }
        });
    }

    // Forgot Password
    const forgotLink = document.getElementById('forgot-password-link');
    if (forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login-email')?.value?.trim();
            if (!email) {
                showMessage('Please enter your email in the username field first, then click "Forgot password".', true);
                document.getElementById('login-email')?.focus();
                return;
            }

            forgotLink.textContent = 'Sending...';
            forgotLink.style.pointerEvents = 'none';

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login.html'
            });

            forgotLink.textContent = 'Forgot your password?';
            forgotLink.style.pointerEvents = '';

            if (error) {
                showMessage(error.message, true);
            } else {
                showMessage('Password reset email sent! Check your inbox.', false);
            }
        });
    }

    // Handle password reset if user came from reset email
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
        showResetPasswordForm();
    }

    // Also check for access_token in URL (Supabase redirect)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('type') === 'recovery') {
        showResetPasswordForm();
    }
});

function showResetPasswordForm() {
    const main = document.querySelector('body');
    const messageContainer = document.getElementById('message-container');

    // Hide login/signup forms
    document.getElementById('login-form')?.parentElement?.classList.add('hidden');
    document.getElementById('signup-form')?.parentElement?.classList.add('hidden');

    // Create reset form
    const resetDiv = document.createElement('div');
    resetDiv.className = 'mb-8';
    resetDiv.innerHTML = `
        <b class="text-[13px] text-black">Reset Your Password</b>
        <form id="reset-password-form" class="mt-2 text-[13px]">
            <table class="border-spacing-0 border-collapse">
                <tbody>
                    <tr>
                        <td class="py-1 pr-2">new password:</td>
                        <td class="py-1"><input type="password" id="new-password"
                                class="border border-gray-400 p-1 text-xs w-36 focus:outline-none focus:border-[#ff6600]"></td>
                    </tr>
                    <tr>
                        <td class="py-1 pr-2">confirm:</td>
                        <td class="py-1"><input type="password" id="confirm-password"
                                class="border border-gray-400 p-1 text-xs w-36 focus:outline-none focus:border-[#ff6600]"></td>
                    </tr>
                    <tr>
                        <td></td>
                        <td class="py-2"><button type="submit"
                                class="bg-gray-200 border border-gray-400 px-2 py-0.5 hover:bg-gray-300 text-black cursor-pointer">update password</button></td>
                    </tr>
                </tbody>
            </table>
        </form>
    `;

    messageContainer.parentElement.insertBefore(resetDiv, messageContainer.nextSibling);

    document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;

        if (!newPass || newPass.length < 6) {
            messageContainer.textContent = 'Password must be at least 6 characters.';
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-red-600');
            return;
        }

        if (newPass !== confirmPass) {
            messageContainer.textContent = 'Passwords do not match.';
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-red-600');
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            // Need to exchange the token from URL
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken) {
                await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            }
        }

        const { error } = await supabase.auth.updateUser({ password: newPass });

        if (error) {
            messageContainer.textContent = error.message;
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-red-600');
        } else {
            messageContainer.textContent = 'Password updated! Redirecting to login...';
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-green-600');
            messageContainer.classList.remove('text-red-600');
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        }
    });
}
