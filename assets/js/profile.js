import { supabase, calculateTimeAgo, getHiddenPosts, unhideStory } from './supabaseClient.js';

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

async function renderHiddenItems() {
    const container = document.getElementById('hidden-items-list');
    const count = document.getElementById('hidden-items-count');
    const posts = await getHiddenPosts();
    count.textContent = `${posts.length} hidden`;

    if (!posts.length) {
        const empty = document.createElement('p');
        empty.className = 'account-help';
        empty.textContent = 'You have no hidden stories.';
        container.replaceChildren(empty);
        return;
    }

    const list = document.createElement('ol');
    posts.forEach(post => {
        const item = document.createElement('li');
        item.className = 'hidden-story-item';

        const copy = document.createElement('div');
        const link = document.createElement('a');
        link.className = 'hidden-story-title';
        link.href = post.url || `pulse/home?s=${encodeURIComponent(post.slug || '')}`;
        link.textContent = post.title || 'Untitled story';
        copy.appendChild(link);

        const meta = document.createElement('div');
        meta.className = 'hidden-story-meta';
        meta.textContent = `by ${post.author || 'anonymous'} Â· ${calculateTimeAgo(post.published_at)}`;
        copy.appendChild(meta);

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

if (!supabase) {
    loading.textContent = 'Account service is unavailable.';
} else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.replace('login');
    } else {
        if (window.location.search || window.location.hash) history.replaceState(null, '', 'profile');
        const themeSelect = document.getElementById('theme-preference');
        const themeStatus = document.getElementById('theme-status');
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', user.id)
            .single();
        if (profileError) {
            themeStatus.textContent = 'Unable to load your theme setting.';
        } else {
            themeSelect.value = profile?.theme_preference || 'system';
        }
        loading.remove();
        page.hidden = false;
        await renderHiddenItems();

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

        document.getElementById('theme-form').addEventListener('change', async () => {
            const preference = themeSelect.value;
            themeSelect.disabled = true;
            themeStatus.textContent = 'Saving appearance…';
            const { error } = await supabase
                .from('profiles')
                .update({ theme_preference: preference })
                .eq('id', user.id);
            if (error) {
                themeStatus.textContent = error.message;
            } else {
                localStorage.setItem('kn-theme-preference', preference);
                const resolved = preference === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : preference;
                document.documentElement.setAttribute('data-theme', resolved);
                document.documentElement.classList.toggle('dark', resolved === 'dark');
                themeStatus.textContent = 'Appearance saved.';
            }
            themeSelect.disabled = false;
        });
    }
}
