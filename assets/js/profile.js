import { supabase, calculateTimeAgo, getHiddenPosts, unhideStory } from './supabaseClient.js?v=2';
import { requireApprovedMember } from './routeGuard.js?v=2';

await requireApprovedMember({ allowMfaEnrollment: true });

if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}

const page = document.getElementById('account-page');
const loading = document.getElementById('account-loading');
const passwordDialog = document.getElementById('password-dialog');
const passwordForm = document.getElementById('password-form');
const passwordStatus = document.getElementById('password-status');
const passwordSave = document.getElementById('password-save');
const passwordFields = [...passwordForm.querySelectorAll('input[type="password"]')];
const mfaDialog = document.getElementById('mfa-dialog');
const mfaStatus = document.getElementById('mfa-status');
const mfaDialogStatus = document.getElementById('mfa-dialog-status');
const mfaRemoveDialog = document.getElementById('mfa-remove-dialog');
const mfaRemoveForm = document.getElementById('mfa-remove-form');
const mfaRemoveStatus = document.getElementById('mfa-remove-status');
let mfaFactorId = null;
let mfaEnabled = false;

function setDialogOpen(dialog, open) {
    if (open) dialog.showModal();
    else dialog.close();
}

document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => setDialogOpen(button.closest('dialog'), false));
});

document.querySelectorAll('.account-dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
        if (event.target === dialog) setDialogOpen(dialog, false);
    });
});

function showMfaEnabled(animate = false) {
    document.getElementById('mfa-disabled').hidden = true;
    const badge = document.getElementById('mfa-enabled');
    badge.hidden = false;
    badge.classList.toggle('mfa-enabled-confirmed', animate);
    mfaStatus.textContent = '';
}

function showMfaDisabled() {
    document.getElementById('mfa-disabled').hidden = false;
    document.getElementById('mfa-enabled').hidden = true;
    mfaStatus.textContent = '2FA was removed.';
}

async function loadMfaStatus() {
    const button = document.getElementById('mfa-start');
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
        mfaStatus.textContent = 'Unable to check two-factor authentication.';
        button.disabled = true;
        return;
    }

    const verifiedFactor = data.totp.find(factor => factor.status === 'verified');
    mfaEnabled = Boolean(verifiedFactor);
    mfaFactorId = verifiedFactor?.id || null;
    if (mfaEnabled) showMfaEnabled();
}

async function startMfaEnrollment() {
    const button = document.getElementById('mfa-start');
    if (mfaFactorId && document.getElementById('mfa-qr').src) {
        document.getElementById('mfa-setup-content').hidden = false;
        setDialogOpen(mfaDialog, true);
        document.getElementById('mfa-enrollment-code').focus();
        return;
    }

    button.disabled = true;
    mfaDialogStatus.textContent = 'Preparing secure setup…';
    document.getElementById('mfa-setup-content').hidden = true;
    setDialogOpen(mfaDialog, true);

    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'K. Notes'
    });
    button.disabled = false;

    if (error) {
        mfaDialogStatus.textContent = 'Two-factor setup could not be started. Please try again.';
        return;
    }

    mfaFactorId = data.id;
    document.getElementById('mfa-qr').src = data.totp.qr_code;
    document.getElementById('mfa-secret').textContent = data.totp.secret;
    document.getElementById('mfa-setup-content').hidden = false;
    mfaDialogStatus.textContent = '';
    document.getElementById('mfa-enrollment-code').focus();
}

async function renderHiddenItems() {
    const panel = document.getElementById('hidden-items-panel');
    const container = document.getElementById('hidden-items-list');
    const count = document.getElementById('hidden-items-count');
    const posts = await getHiddenPosts();

    if (!posts.length) {
        panel.hidden = true;
        container.replaceChildren();
        return;
    }

    panel.hidden = false;
    count.textContent = `${posts.length} hidden`;
    const list = document.createElement('ol');

    posts.forEach(post => {
        const item = document.createElement('li');
        item.className = 'hidden-story-item';
        const copy = document.createElement('div');
        const link = document.createElement('a');
        link.className = 'hidden-story-title';
        link.href = post.url || `pulse/home?s=${encodeURIComponent(post.slug || '')}`;
        link.textContent = post.title || 'Untitled story';
        const meta = document.createElement('div');
        meta.className = 'hidden-story-meta';
        meta.textContent = `by ${post.author || 'anonymous'} · ${calculateTimeAgo(post.published_at)}`;
        copy.append(link, meta);

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'account-button account-button-secondary hidden-story-restore';
        restore.textContent = 'Restore';
        restore.addEventListener('click', async () => {
            restore.disabled = true;
            await unhideStory(post.id);
            await renderHiddenItems();
        });

        item.append(copy, restore);
        list.appendChild(item);
    });

    container.replaceChildren(list);
}

function applyTheme(preference) {
    const resolved = preference === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    window.dispatchEvent(new CustomEvent('kn-theme-change', { detail: { preference, resolved } }));
}

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

        const themeSelect = document.getElementById('theme-preference');
        const themeStatus = document.getElementById('theme-status');
        themeSelect.value = localStorage.getItem('kn-theme-preference') || 'system';

        await Promise.all([renderHiddenItems(), loadMfaStatus()]);

        document.getElementById('password-open').addEventListener('click', () => {
            passwordStatus.textContent = '';
            setDialogOpen(passwordDialog, true);
            passwordForm.elements['current-password'].focus();
        });

        document.getElementById('mfa-start').addEventListener('click', startMfaEnrollment);
        document.getElementById('mfa-remove-open').addEventListener('click', () => {
            mfaRemoveStatus.textContent = '';
            setDialogOpen(mfaRemoveDialog, true);
            mfaRemoveForm.elements.code.focus();
        });
        mfaRemoveForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (!mfaRemoveForm.reportValidity() || !mfaFactorId) return;
            const confirmButton = document.getElementById('mfa-remove-confirm');
            confirmButton.disabled = true;
            mfaRemoveStatus.textContent = 'Verifying…';
            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                factorId: mfaFactorId,
                code: mfaRemoveForm.elements.code.value.trim()
            });
            if (verifyError) {
                confirmButton.disabled = false;
                mfaRemoveStatus.textContent = 'That code was not accepted. Wait for a new code and try again.';
                mfaRemoveForm.elements.code.select();
                return;
            }
            const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
            confirmButton.disabled = false;
            if (error) {
                mfaRemoveStatus.textContent = '2FA could not be removed. Please try again.';
                return;
            }
            await supabase.auth.refreshSession();
            mfaEnabled = false;
            mfaFactorId = null;
            mfaRemoveForm.reset();
            setDialogOpen(mfaRemoveDialog, false);
            showMfaDisabled();
        });
        document.getElementById('mfa-enrollment-form').addEventListener('submit', async event => {
            event.preventDefault();
            if (!event.currentTarget.reportValidity() || !mfaFactorId) return;

            const verify = document.getElementById('mfa-verify');
            verify.disabled = true;
            mfaDialogStatus.textContent = 'Verifying…';
            const { error } = await supabase.auth.mfa.challengeAndVerify({
                factorId: mfaFactorId,
                code: event.currentTarget.elements.code.value.trim()
            });
            verify.disabled = false;

            if (error) {
                mfaDialogStatus.textContent = 'That code was not accepted. Wait for a new code and try again.';
                event.currentTarget.elements.code.select();
                return;
            }

            mfaEnabled = true;
            await supabase.rpc('complete_invited_membership');
            setDialogOpen(mfaDialog, false);
            showMfaEnabled(true);
        });

        mfaDialog.addEventListener('close', () => {
            document.getElementById('mfa-enrollment-form').reset();
            mfaDialogStatus.textContent = '';
        });

        document.getElementById('show-passwords').addEventListener('change', event => {
            passwordFields.forEach(input => { input.type = event.target.checked ? 'text' : 'password'; });
        });

        passwordForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (!passwordForm.reportValidity()) return;

            const currentPassword = passwordForm.elements['current-password'].value;
            const newPassword = passwordForm.elements['new-password'].value;
            const confirmPassword = passwordForm.elements['confirm-password'].value;

            if (newPassword !== confirmPassword) {
                passwordStatus.textContent = 'New passwords do not match.';
                passwordForm.elements['confirm-password'].focus();
                return;
            }
            if (currentPassword === newPassword) {
                passwordStatus.textContent = 'Choose a password different from your current password.';
                passwordForm.elements['new-password'].focus();
                return;
            }

            passwordSave.disabled = true;
            passwordStatus.textContent = 'Updating password…';
            const { error } = await supabase.auth.updateUser({
                email: user.email,
                current_password: currentPassword,
                password: newPassword
            });
            passwordSave.disabled = false;
            if (error) {
                passwordStatus.textContent = error.message;
                passwordForm.elements['current-password'].select();
                return;
            }

            passwordForm.reset();
            passwordFields.forEach(input => { input.type = 'password'; });
            setDialogOpen(passwordDialog, false);
        });

        document.getElementById('profile-logout').addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            sessionStorage.removeItem('kn-auth-cache');
            await supabase.auth.signOut();
            window.location.replace('/');
        });

        themeSelect.addEventListener('change', () => {
            const preference = themeSelect.value;
            localStorage.setItem('kn-theme-preference', preference);
            applyTheme(preference);
            themeStatus.textContent = 'Saved';
            window.setTimeout(() => { themeStatus.textContent = ''; }, 1600);
        });
    }
}
