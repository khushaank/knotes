import { supabase } from './supabaseClient.js';

function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 80)
        + '-' + Date.now().toString(36);
}

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('submit-form');
    const authMessage = document.getElementById('auth-message');

    if (!supabase) return;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        form.classList.add('hidden');
        authMessage.classList.remove('hidden');
    }

    let submitCategory = 'news';

    const btnSubmit = document.getElementById('btn-submit');
    const btnSubmitWork = document.getElementById('btn-submit-work');

    if (btnSubmitWork) {
        btnSubmitWork.addEventListener('click', () => {
            submitCategory = 'show';
            form.requestSubmit();
        });
    }

    // Auto-detect URL paste and validate
    const urlInput = document.getElementById('submit-url');
    if (urlInput) {
        urlInput.addEventListener('paste', () => {
            setTimeout(() => {
                const val = urlInput.value.trim();
                if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                    urlInput.value = 'https://' + val;
                }
            }, 0);
        });

        urlInput.addEventListener('blur', () => {
            const val = urlInput.value.trim();
            if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                urlInput.value = 'https://' + val;
            }
        });
    }

    // Character counter for title
    const titleInput = document.getElementById('submit-title');
    if (titleInput) {
        const counter = document.createElement('span');
        counter.className = 'text-[10px] text-gray-400 ml-2';
        counter.id = 'title-counter';
        titleInput.parentElement.appendChild(counter);

        titleInput.addEventListener('input', () => {
            const len = titleInput.value.length;
            counter.textContent = `${len}/80`;
            counter.style.color = len > 80 ? '#ef4444' : '#9ca3af';
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!session) return;

        let title = document.getElementById('submit-title').value.trim();
        const url = document.getElementById('submit-url').value.trim();
        const text = document.getElementById('submit-text').value.trim();

        if (!title) return;

        if (title.length > 120) {
            alert('Title is too long. Please keep it under 120 characters.');
            return;
        }

        // Validate URL if provided
        if (url) {
            try {
                new URL(url);
            } catch {
                alert('Please enter a valid URL (e.g. https://example.com)');
                return;
            }
        }

        // Determine category if not explicitly set by button
        let finalCategory = submitCategory;
        if (finalCategory === 'news' && !url) {
            finalCategory = 'ask';
        }

        // Prefix for Show HN
        if (finalCategory === 'show' && !title.toLowerCase().startsWith('show hn:')) {
            title = `Show HN: ${title}`;
        }

        const userEmail = session.user.email;
        const author = userEmail.split('@')[0];
        const slug = generateSlug(title);

        // Disable button
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'submitting...'; }

        const { data, error } = await supabase
            .from('blogs')
            .insert([
                {
                    title,
                    url: url || null,
                    content: text || null,
                    author,
                    category: finalCategory,
                    status: 'published',
                    published_at: new Date().toISOString(),
                    slug
                }
            ])
            .select();

        if (error) {
            alert('Failed to submit. Please try again.');
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'submit'; }
        } else {
            submitCategory = 'news';

            if (finalCategory === 'show') {
                window.location.href = 'show.html';
            } else if (finalCategory === 'ask') {
                window.location.href = 'ask.html';
            } else {
                window.location.href = 'index.html';
            }
        }
    });
});
