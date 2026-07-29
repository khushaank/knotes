import { supabase } from './supabaseClient.js';

const LOGIN_ATTEMPT_KEY = 'kn-login-attempts';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
let pendingMfaFactorId = null;

function loginDestination() {
    return '/home';
}

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
    const mfaForm = document.getElementById('mfa-form');
    const messageContainer = document.getElementById('message-container');
    const passwordToggle = document.getElementById('login-password-toggle');

    passwordToggle?.addEventListener('click', () => {
        const input = document.getElementById('login-password');
        const icon = passwordToggle.querySelector('.material-symbols-outlined');
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        icon.textContent = showing ? 'visibility' : 'visibility_off';
    });

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

            const { error } = await supabase.auth.signInWithPassword({
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
                const needsMfa = await prepareMfaChallenge(showMessage);
                if (!needsMfa) {
                    showMessage('Logged in successfully! Redirecting...', false);
                    window.location.href = loginDestination();
                }
            }
        });
    }

    if (mfaForm) {
        mfaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = mfaForm.querySelector('button');
            const code = mfaForm.elements.code.value.trim();
            button.disabled = true;
            const { error } = await supabase.auth.mfa.challengeAndVerify({
                factorId: pendingMfaFactorId,
                code
            });
            button.disabled = false;
            if (error) {
                showMessage('That authentication code was not accepted. Try a new code.', true);
            } else {
                showMessage('Verified. Redirecting...', false);
                window.location.href = loginDestination();
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
    if (urlParams.get('status') === 'restricted') {
        showMessage('This account does not currently have access.', true);
    }
    if (urlParams.get('type') === 'recovery') {
        showResetPasswordForm();
    }

    if (!hash.includes('type=recovery') && urlParams.get('type') !== 'recovery') {
        supabase?.auth.getSession().then(async ({ data }) => {
            if (!data.session) return;
            const needsMfa = await prepareMfaChallenge(showMessage);
            if (!needsMfa) window.location.href = loginDestination();
        });
    }
});

async function prepareMfaChallenge(showMessage) {
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
        showMessage('Two-factor authentication could not be checked. Please try again.', true);
        return true;
    }
    if (assurance.currentLevel === 'aal2') return false;
    if (assurance.nextLevel !== 'aal2') {
        showMessage('Set up two-factor authentication to enter the private network.', false);
        window.location.replace('/profile#mfa');
        return true;
    }

    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    pendingMfaFactorId = factors?.totp?.find(factor => factor.status === 'verified')?.id || null;
    if (factorError || !pendingMfaFactorId) {
        showMessage('Two-factor authentication is unavailable. Please contact support.', true);
        return true;
    }
    document.getElementById('login-form')?.parentElement?.classList.add('hidden');
    document.getElementById('mfa-section')?.classList.remove('hidden');
    document.getElementById('mfa-code')?.focus();
    showMessage('Enter the code from your authenticator app.', false);
    return true;
}

function showResetPasswordForm() {
    const main = document.querySelector('body');
    const messageContainer = document.getElementById('message-container');

    document.getElementById('login-form')?.parentElement?.classList.add('hidden');
    document.getElementById('mfa-section')?.classList.add('hidden');

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
