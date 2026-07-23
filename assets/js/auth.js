import { supabase } from './supabaseClient.js';

const LOGIN_ATTEMPT_KEY = 'kn-login-attempts';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;

function getLoginAttempts() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOGIN_ATTEMPT_KEY) || '{}');
        if (!parsed.firstAttemptAt || Date.now() - parsed.firstAttemptAt > LOGIN_WINDOW_MS) {
            return { count: 0, firstAttemptAt: Date.now() };
        }
        return parsed;
    } catch {
        return { count: 0, firstAttemptAt: Date.now() };
    }
}

function isLoginRateLimited() {
    const attempts = getLoginAttempts();
    if (attempts.count < LOGIN_MAX_ATTEMPTS) return { limited: false };
    const retryIn = Math.ceil((LOGIN_WINDOW_MS - (Date.now() - attempts.firstAttemptAt)) / 60000);
    return { limited: true, retryIn: Math.max(1, retryIn) };
}

function recordFailedLogin() {
    const attempts = getLoginAttempts();
    localStorage.setItem(LOGIN_ATTEMPT_KEY, JSON.stringify({
        count: attempts.count + 1,
        firstAttemptAt: attempts.firstAttemptAt
    }));
}

function clearFailedLogins() {
    localStorage.removeItem(LOGIN_ATTEMPT_KEY);
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
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
            if (!supabase) {
                showMessage('Authentication service is currently unavailable.', true);
                return;
            }

            const rateLimit = isLoginRateLimited();
            if (rateLimit.limited) {
                showMessage(`Too many login attempts. Try again in ${rateLimit.retryIn} minute(s).`, true);
                return;
            }

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                showMessage('Please enter both email and password.', true);
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
                recordFailedLogin();
                showMessage('Login failed. Check your credentials and try again.', true);
                loginBtn.disabled = false;
                loginBtn.textContent = 'login';
            } else {
                clearFailedLogins();
                showMessage('Logged in successfully! Redirecting...', false);
                setTimeout(() => {
                    window.location.href = 'home';
                }, 1000);
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!supabase) {
                showMessage('Authentication service is currently unavailable.', true);
                return;
            }

            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;

            if (!email || !password) {
                showMessage('Please enter both username/email and password.', true);
                return;
            }

            if (password.length < PASSWORD_MIN_LENGTH) {
                showMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, true);
                return;
            }

            const signupBtn = signupForm.querySelector('button[type="submit"]');
            signupBtn.disabled = true;
            signupBtn.textContent = 'creating...';

            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (error) {
                showMessage('Account creation failed. Check your details or try again later.', true);
                signupBtn.disabled = false;
                signupBtn.textContent = 'create account';
            } else {
                showMessage(data.session
                    ? 'Account created successfully.'
                    : 'Account created. Check your email to confirm it, then login.', false);
                signupBtn.disabled = false;
                signupBtn.textContent = 'create account';
                document.getElementById('login-email')?.focus();
            }
        });
    }

    const forgotLink = document.getElementById('forgot-password-link');
    if (forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();

            if (!supabase) {
                showMessage('Authentication service is currently unavailable.', true);
                return;
            }

            const email = document.getElementById('login-email')?.value?.trim();
            if (!email) {
                showMessage('Please enter your email first, then click "Forgot password".', true);
                document.getElementById('login-email')?.focus();
                return;
            }

            forgotLink.textContent = 'Sending...';
            forgotLink.style.pointerEvents = 'none';

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login'
            });

            forgotLink.textContent = 'Forgot your password?';
            forgotLink.style.pointerEvents = '';

            if (error) {
                showMessage('Password reset could not be started. Please try again later.', true);
            } else {
                showMessage('Password reset email sent! Check your inbox.', false);
            }
        });
    }

    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
        showResetPasswordForm();
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('type') === 'recovery') {
        showResetPasswordForm();
    }
});

function showResetPasswordForm() {
    const main = document.querySelector('body');
    const messageContainer = document.getElementById('message-container');

    document.getElementById('login-form')?.parentElement?.classList.add('hidden');
    document.getElementById('signup-form')?.parentElement?.classList.add('hidden');

    const resetDiv = document.createElement('div');
    resetDiv.className = 'mb-8';
    resetDiv.innerHTML = `
        <b class="text-[13px] text-black">Reset Your Password</b>
        <form id="reset-password-form" class="mt-2 text-[13px]">
            <table class="border-spacing-0 border-collapse">
                <tbody>
                    <tr>
                        <td class="py-1 pr-2"><label for="new-password">new password:</label></td>
                        <td class="py-1"><input type="password" id="new-password" name="new-password" minlength="12" autocomplete="new-password" required
                                class="border border-gray-400 p-1 text-xs w-36 focus:outline-none focus:border-[#ff6600]"></td>
                    </tr>
                    <tr>
                        <td class="py-1 pr-2"><label for="confirm-password">confirm:</label></td>
                        <td class="py-1"><input type="password" id="confirm-password" name="confirm-password" minlength="12" autocomplete="new-password" required
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

        if (!newPass || newPass.length < PASSWORD_MIN_LENGTH) {
            messageContainer.textContent = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
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

        if (!supabase) {
            messageContainer.textContent = 'Authentication service is currently unavailable.';
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-red-600');
            return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken) {
                await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            }
        }

        const { error } = await supabase.auth.updateUser({ password: newPass });

        if (error) {
            messageContainer.textContent = 'Password update failed. Request a new recovery link and try again.';
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-red-600');
        } else {
            messageContainer.textContent = 'Password updated! Redirecting to login...';
            messageContainer.classList.remove('hidden');
            messageContainer.classList.add('text-green-600');
            messageContainer.classList.remove('text-red-600');
            setTimeout(() => { window.location.href = 'login'; }, 2000);
        }
    });
}