import { supabase, uploadMediaFile, listUserMedia } from './supabaseClient.js';

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
    } else {
        const textToolbar = document.getElementById('text-toolbar');
        if (textToolbar) textToolbar.style.display = 'flex';
    }

    const btnSubmit = document.getElementById('btn-submit');
    const categorySelect = document.getElementById('submit-category');
    const rowUrl = document.getElementById('row-url');
    const rowText = document.getElementById('row-text');

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            const cat = categorySelect.value;
            if (cat === 'news') {
                if (rowUrl) rowUrl.style.display = '';
                if (rowText) rowText.style.display = 'none';
            } else if (cat === 'ask') {
                if (rowUrl) rowUrl.style.display = 'none';
                if (rowText) rowText.style.display = '';
            } else if (cat === 'show') {
                if (rowUrl) rowUrl.style.display = '';
                if (rowText) rowText.style.display = '';
            }
        });
        // Trigger initially
        categorySelect.dispatchEvent(new Event('change'));
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

        const categoryInput = document.getElementById('submit-category');
        let finalCategory = categoryInput ? categoryInput.value : 'news';

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
            if (finalCategory === 'show') {
                window.location.href = 'show.html';
            } else if (finalCategory === 'ask') {
                window.location.href = 'ask.html';
            } else {
                window.location.href = 'index.html';
            }
        }
    });

    // ---- Media Upload & Library Logic ---- //
    const btnUploadImage = document.getElementById('btn-upload-image');
    const imageUploadInput = document.getElementById('image-upload-input');
    const textarea = document.getElementById('submit-text');

    if (btnUploadImage && imageUploadInput) {
        btnUploadImage.addEventListener('click', () => {
            imageUploadInput.click();
        });

        imageUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                alert('Image must be under 5MB');
                return;
            }

            btnUploadImage.disabled = true;
            btnUploadImage.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px">sync</span> Uploading...';

            const result = await uploadMediaFile(file);

            if (result.error) {
                alert('Upload failed: ' + result.error);
            } else {
                let altText = prompt('Enter a short description (alt text) for this image:', 'Image');
                if (altText === null) altText = 'Image'; // if user cancels prompt

                const markdown = `\n![${altText}](${result.url})\n`;
                insertAtCursor(textarea, markdown);
            }

            btnUploadImage.disabled = false;
            btnUploadImage.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px">image</span> Upload Image';
            imageUploadInput.value = '';
        });
    }

    // Media Library Modal
    const btnMediaLibrary = document.getElementById('btn-media-library');
    const mediaModal = document.getElementById('media-library-modal');
    const btnCloseMedia = document.getElementById('btn-close-media');
    const mediaGrid = document.getElementById('media-library-grid');

    if (btnMediaLibrary && mediaModal) {
        btnMediaLibrary.addEventListener('click', async () => {
            mediaModal.classList.remove('hidden');
            mediaGrid.innerHTML = '<div class="col-span-full text-sm text-gray-500 text-center py-8 italic">Loading your photos...</div>';

            const files = await listUserMedia();

            if (files.length === 0) {
                mediaGrid.innerHTML = '<div class="col-span-full text-sm text-gray-500 text-center py-8 italic">You haven\\\\\'t uploaded any photos yet</div>';
                return;
            }

            let html = '';
            files.forEach(f => {
                html += `
                    <div class="media-item border border-gray-200 rounded cursor-pointer hover:border-[#ff6600] overflow-hidden group relative bg-gray-50" data-url="${f.url}" data-name="${f.name}">
                        <div class="aspect-square bg-cover bg-center" style="background-image: url('${f.url}')"></div>
                        <div class="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white text-xs font-bold">
                            Insert
                        </div>
                    </div>
                `;
            });
            mediaGrid.innerHTML = html;

            mediaGrid.querySelectorAll('.media-item').forEach(item => {
                item.addEventListener('click', () => {
                    const url = item.getAttribute('data-url');
                    const name = item.getAttribute('data-name').split('-')[0]; // simple alt text
                    insertAtCursor(textarea, `\n![${name}](${url})\n`);
                    mediaModal.classList.add('hidden');
                });
            });
        });

        btnCloseMedia?.addEventListener('click', () => {
            mediaModal.classList.add('hidden');
        });

        mediaModal.addEventListener('click', (e) => {
            if (e.target === mediaModal) {
                mediaModal.classList.add('hidden');
            }
        });
    }

    // Helper to insert text at cursor
    function insertAtCursor(myField, myValue) {
        if (!myField) return;
        if (myField.selectionStart || myField.selectionStart === '0') {
            var startPos = myField.selectionStart;
            var endPos = myField.selectionEnd;
            myField.value = myField.value.substring(0, startPos)
                + myValue
                + myField.value.substring(endPos, myField.value.length);
            myField.selectionStart = startPos + myValue.length;
            myField.selectionEnd = startPos + myValue.length;
        } else {
            myField.value += myValue;
        }
        myField.focus();
    }
});
