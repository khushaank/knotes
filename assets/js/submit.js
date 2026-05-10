import { supabase, uploadMediaFile, listUserMedia } from './supabaseClient.js';
import { renderMarkdown } from './contentRenderer.js';

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

        // Prefix for Show KN
        if (finalCategory === 'show' && !title.toLowerCase().startsWith('show hn:')) {
            title = `Show KN: ${title}`;
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
    const previewContainer = document.getElementById('markdown-preview');
    const previewContent = document.getElementById('preview-content');

    if (textarea && previewContainer && previewContent) {
        textarea.addEventListener('input', () => {
            const val = textarea.value.trim();
            if (val) {
                previewContainer.classList.remove('hidden');
                previewContent.innerHTML = renderMarkdown(val);
            } else {
                previewContainer.classList.add('hidden');
            }
        });
    }

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
                const ext = result.name.split('.').pop().toLowerCase();
                const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);

                if (isImg) {
                    let altText = prompt('Enter a short description (alt text) for this image:', 'Image');
                    if (altText === null) altText = 'Image';
                    const markdown = `\n![${altText}](${result.url})\n`;
                    insertAtCursor(textarea, markdown);
                } else {
                    const markdown = `\n[${result.name.split('-')[0]}](${result.url})\n`;
                    insertAtCursor(textarea, markdown);
                }
            }

            btnUploadImage.disabled = false;
            btnUploadImage.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px">upload_file</span> Upload File';
            imageUploadInput.value = '';
        });
    }

    // Media Library Modal
    const btnMediaLibrary = document.getElementById('btn-media-library');
    const mediaModal = document.getElementById('media-library-modal');
    const btnCloseMedia = document.getElementById('btn-close-media');
    const mediaGrid = document.getElementById('media-library-grid');

    if (btnMediaLibrary && mediaModal) {
        async function loadMediaFiles() {
            mediaGrid.innerHTML = '<div class="col-span-full text-center py-12"><div class="animate-spin inline-block w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full mb-4"></div><p class="text-gray-500 text-sm italic">Loading your photos...</p></div>';

            const files = await listUserMedia();

            if (files.length === 0) {
                mediaGrid.innerHTML = '<div class="col-span-full text-sm text-gray-500 text-center py-8 italic">You haven\'t uploaded any photos yet</div>';
                return;
            }

            function getFileIcon(filename) {
                const ext = filename.split('.').pop().toLowerCase();
                switch (ext) {
                    case 'pdf': return 'picture_as_pdf';
                    case 'xls':
                    case 'xlsx':
                    case 'csv': return 'table_chart';
                    case 'doc':
                    case 'docx': return 'description';
                    case 'ppt':
                    case 'pptx': return 'present_to_all';
                    case 'txt': return 'article';
                    default: return 'insert_drive_file';
                }
            }

            function isImage(filename) {
                const ext = filename.split('.').pop().toLowerCase();
                return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
            }

            let html = '';
            files.forEach(f => {
                const isImg = isImage(f.name);
                const icon = getFileIcon(f.name);

                html += `
                    <div class="group relative aspect-passport bg-white rounded border border-gray-200 overflow-hidden hover:border-[#ff6600] transition-all shadow-sm hover:shadow-md cursor-pointer media-item" 
                         data-url="${f.url}" 
                         data-name="${f.name}" 
                         data-is-img="${isImg}">
                        ${isImg
                        ? `<img src="${f.url}" class="w-full h-full object-cover" loading="lazy">`
                        : `<div class="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-2 text-center">
                                 <span class="material-symbols-outlined text-3xl mb-1">${icon}</span>
                                 <span class="text-[9px] truncate w-full px-1">${f.name.split('-')[0]}</span>
                               </div>`
                    }
                        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                            Insert
                        </div>
                    </div>
                `;
            });
            mediaGrid.innerHTML = html;

            mediaGrid.querySelectorAll('.media-item').forEach(item => {
                item.addEventListener('click', () => {
                    const url = item.getAttribute('data-url');
                    const name = item.getAttribute('data-name').split('-')[0] || 'File';
                    const isImg = item.getAttribute('data-is-img') === 'true';

                    if (isImg) {
                        insertAtCursor(textarea, `\n![${name}](${url})\n`);
                    } else {
                        insertAtCursor(textarea, `\n[${name}](${url})\n`);
                    }
                    mediaModal.classList.add('hidden');
                    hidePreview();
                });

                item.addEventListener('mouseenter', (e) => {
                    const url = item.getAttribute('data-url');
                    const isImg = item.getAttribute('data-is-img') === 'true';
                    if (!isImg) showPreview(url, e);
                });

                item.addEventListener('mouseleave', hidePreview);
            });
        }

        // Preview Tooltip Logic
        const previewTooltip = document.createElement('div');
        previewTooltip.className = 'media-preview-tooltip';
        document.body.appendChild(previewTooltip);

        function showPreview(url, e) {
            const officeExts = /\.(xlsx?|docx?|pptx?)$/i;
            let viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

            if (url.match(officeExts)) {
                viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
            }

            previewTooltip.innerHTML = `<iframe src="${viewerUrl}" class="preview-frame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
            previewTooltip.classList.add('visible');
            updatePreviewPos(e);
        }

        function hidePreview() {
            previewTooltip.classList.remove('visible');
            previewTooltip.innerHTML = '';
        }

        function updatePreviewPos(e) {
            const x = e.clientX + 20;
            const y = e.clientY - 200;

            // Boundary checks
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let finalX = x;
            let finalY = y;

            if (x + 320 > winW) finalX = e.clientX - 340;
            if (y + 450 > winH) finalY = winH - 460;
            if (finalY < 10) finalY = 10;

            previewTooltip.style.left = `${finalX}px`;
            previewTooltip.style.top = `${finalY}px`;
        }

        document.addEventListener('mousemove', (e) => {
            if (previewTooltip.classList.contains('visible')) {
                updatePreviewPos(e);
            }
        });

        btnMediaLibrary.addEventListener('click', () => {
            mediaModal.classList.remove('hidden');
            loadMediaFiles();
        });

        // Add upload listener within this scope to trigger refresh if needed
        imageUploadInput.addEventListener('change', async () => {
            if (!mediaModal.classList.contains('hidden')) {
                // If modal is open, wait a bit then refresh
                setTimeout(loadMediaFiles, 1500);
            }
        });

        const btnUploadMore = document.getElementById('btn-upload-more-submit');
        btnUploadMore?.addEventListener('click', () => {
            imageUploadInput.click();
        });

        btnCloseMedia?.addEventListener('click', () => {
            mediaModal.classList.add('hidden');
        });

        mediaModal.addEventListener('click', (e) => {
            if (e.target === mediaModal) {
                mediaModal.classList.add('hidden');
            }
        });

        // Close on Esc key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !mediaModal.classList.contains('hidden')) {
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
        myField.dispatchEvent(new Event('input'));
    }
});
