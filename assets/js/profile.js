import { supabase, calculateTimeAgo, sanitize } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const profileContainer = document.getElementById('profile-container');
    const authMessage = document.getElementById('auth-message');
    const usernameEl = document.getElementById('profile-username');
    const createdEl = document.getElementById('profile-created');
    const karmaEl = document.getElementById('profile-karma');
    const aboutInput = document.getElementById('profile-about');
    const updateBtn = document.getElementById('btn-update-profile');
    const submissionsEl = document.getElementById('profile-submissions');

    if (!supabase) return;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        authMessage.classList.remove('hidden');
        return;
    }

    profileContainer.classList.remove('hidden');

    const userId = session.user.id;
    const userEmail = session.user.email;
    const defaultUsername = userEmail.split('@')[0];

    // Fetch profile
    let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (profileError) {
    }

    // If profile doesn't exist, create it (fallback for existing users)
    if (!profile) {
        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ id: userId, username: defaultUsername }])
            .select()
            .single();
        
        if (insertError) {
            usernameEl.textContent = defaultUsername;
        } else {
            profile = newProfile;
        }
    }

    if (profile) {
        usernameEl.textContent = profile.username;
        const createdDate = new Date(profile.created_at);
        createdEl.textContent = createdDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        aboutInput.value = profile.about || '';
    }

    // Fetch karma (sum of likes_count on user's blogs)
    const { data: blogs, error: blogsError } = await supabase
        .from('blogs')
        .select('likes_count, id, title, published_at, url, slug')
        .eq('author', profile?.username || defaultUsername)
        .order('published_at', { ascending: false });

    if (blogsError) {
    } else {
        const karma = blogs.reduce((sum, blog) => sum + (blog.likes_count || 0), 0);
        karmaEl.textContent = karma;

        if (blogs.length === 0) {
            submissionsEl.innerHTML = '<p class="text-gray-500 italic">No submissions yet.</p>';
        } else {
            let html = '<ul class="space-y-2">';
            blogs.forEach(blog => {
                const timeAgo = calculateTimeAgo(blog.published_at);
                html += `
                    <li>
                        <a href="${blog.url || `pulse/index.html?s=${blog.slug}`}" class="hover:underline text-black font-medium">${sanitize(blog.title)}</a>
                        <span class="text-xs text-gray-500 ml-2">${timeAgo} | ${blog.likes_count || 0} points</span>
                    </li>
                `;
            });
            html += '</ul>';
            submissionsEl.innerHTML = html;
        }
    }

    // Update profile
    updateBtn.addEventListener('click', async () => {
        const aboutText = aboutInput.value.trim();
        updateBtn.disabled = true;
        updateBtn.textContent = 'updating...';

        const { error } = await supabase
            .from('profiles')
            .update({ about: aboutText })
            .eq('id', userId);

        if (error) {
            alert('Failed to update profile.');
        } else {
            alert('Profile updated!');
        }

        updateBtn.disabled = false;
        updateBtn.textContent = 'update';
    });
});
