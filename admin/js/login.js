let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let createClient = null;
const SUPABASE_TIMEOUT_MS = 8000;

function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function createTimeoutFetch(timeoutMs = SUPABASE_TIMEOUT_MS) {
    return async (input, init = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(input, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    };
}

try {
    const supabaseModule = await withTimeout(
        import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),
        SUPABASE_TIMEOUT_MS,
        'Supabase client'
    );
    createClient = supabaseModule.createClient;
} catch (e) {
    console.warn('Supabase client library could not be loaded.', e);
}

try {
    const config = await import('./supabaseConfig.js');
    SUPABASE_URL = config.SUPABASE_URL;
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
} catch (e) {
    console.warn('admin/js/supabaseConfig.js not found or failed to load.', e);
}

const supabase = (createClient && SUPABASE_URL)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: createTimeoutFetch() } })
    : null;

const ADMIN_LOGIN_ATTEMPT_KEY = 'kn-admin-login-attempts';
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getAdminLoginAttempts() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ADMIN_LOGIN_ATTEMPT_KEY) || '{}');
        if (!parsed.firstAttemptAt || Date.now() - parsed.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
            return { count: 0, firstAttemptAt: Date.now() };
        }
        return parsed;
    } catch {
        return { count: 0, firstAttemptAt: Date.now() };
    }
}

function isAdminLoginRateLimited() {
    const attempts = getAdminLoginAttempts();
    if (attempts.count < ADMIN_LOGIN_MAX_ATTEMPTS) return { limited: false };
    const retryIn = Math.ceil((ADMIN_LOGIN_WINDOW_MS - (Date.now() - attempts.firstAttemptAt)) / 60000);
    return { limited: true, retryIn: Math.max(1, retryIn) };
}

function recordFailedAdminLogin() {
    const attempts = getAdminLoginAttempts();
    localStorage.setItem(ADMIN_LOGIN_ATTEMPT_KEY, JSON.stringify({
        count: attempts.count + 1,
        firstAttemptAt: attempts.firstAttemptAt
    }));
}

function clearFailedAdminLogins() {
    localStorage.removeItem(ADMIN_LOGIN_ATTEMPT_KEY);
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(() => {
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

        const rateLimit = isAdminLoginRateLimited();
        if (rateLimit.limited) {
            errorMsg.textContent = `Too many admin login attempts. Try again in ${rateLimit.retryIn} minute(s).`;
            errorMsg.style.display = 'block';
            return;
        }

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
            recordFailedAdminLogin();
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
            recordFailedAdminLogin();
            errorMsg.textContent = 'Access denied. Admin privileges required.';
            errorMsg.style.display = 'block';
            await supabase.auth.signOut();
            loginBtn.textContent = 'Log In';
            loginBtn.disabled = false;
            return;
        }

        // Success, redirect to dashboard
        clearFailedAdminLogins();
        window.location.href = 'home';
    }

    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
});
