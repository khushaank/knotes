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

function sanitize(str) {
    if (typeof str !== 'string') return '';
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(str, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
            ALLOWED_ATTR: ['href', 'title', 'target']
        });
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const rateLimit = {
    _lastSubmit: 0,
    _cooldownMs: 5000,
    canSubmit() {
        return Date.now() - this._lastSubmit > this._cooldownMs;
    },
    mark() {
        this._lastSubmit = Date.now();
    },
    remaining() {
        const left = this._cooldownMs - (Date.now() - this._lastSubmit);
        return Math.max(0, Math.ceil(left / 1000));
    }
};

const HASH_TO_CATEGORY = {
    '#article': 'article',
    '#ask': 'ask',
    '#show': 'show',
};


(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(async () => {
    const form = document.getElementById('submit-form');
    const authMessage = document.getElementById('auth-message');
    const loadingSkeleton = document.getElementById('submit-loading');
    const quickLinks = document.getElementById('submit-quick-links');
    const statusEl = document.getElementById('submit-status');

    if (!form || !authMessage) return;

    if (!supabase) {
        if (loadingSkeleton) loadingSkeleton.style.display = 'none';
        authMessage.classList.add('ready');
        return;
    }

    let session = null;
    try {
        const result = await supabase.auth.getSession();
        session = result?.data?.session ?? null;
    } catch (err) {
    }

    if (loadingSkeleton) {
        loadingSkeleton.style.display = 'none';
    }

    if (!session) {
        form.style.display = 'none';
        authMessage.classList.add('ready');
        return;
    }

    authMessage.style.display = 'none';
    form.classList.add('ready');

    if (quickLinks) quickLinks.classList.remove('hidden');

    const textToolbar = document.getElementById('text-toolbar');
    if (textToolbar) textToolbar.style.display = 'flex';

    const btnSubmit = document.getElementById('btn-submit');
    const categorySelect = document.getElementById('submit-category');
    const rowUrl = document.getElementById('row-url');
    const rowText = document.getElementById('row-text');

    function applyCategoryView(cat) {
        if (cat === 'article') {
            if (rowUrl) rowUrl.style.display = '';
            if (rowText) rowText.style.display = '';
        } else if (cat === 'ask') {
            if (rowUrl) rowUrl.style.display = 'none';
            if (rowText) rowText.style.display = '';
        } else if (cat === 'show') {
            if (rowUrl) rowUrl.style.display = '';
            if (rowText) rowText.style.display = '';
        }
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            applyCategoryView(categorySelect.value);
            const hashVal = '#' + categorySelect.value;
            if (window.location.hash !== hashVal) {
                history.replaceState(null, '', hashVal);
            }
        });

        const hash = window.location.hash.toLowerCase();
        if (HASH_TO_CATEGORY[hash]) {
            categorySelect.value = HASH_TO_CATEGORY[hash];
        }
        applyCategoryView(categorySelect.value);
    }

    document.querySelectorAll('.submit-quick-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = link.getAttribute('data-cat');
            if (categorySelect && cat) {
                categorySelect.value = cat;
                applyCategoryView(cat);
                history.replaceState(null, '', '#' + cat);
                const titleField = document.getElementById('submit-title');
                if (titleField) titleField.focus();
            }
        });
    });

    window.addEventListener('hashchange', () => {
        const newHash = window.location.hash.toLowerCase();
        if (HASH_TO_CATEGORY[newHash] && categorySelect) {
            categorySelect.value = HASH_TO_CATEGORY[newHash];
            applyCategoryView(HASH_TO_CATEGORY[newHash]);
        }
    });

    const urlInput = document.getElementById('submit-url');
    if (urlInput) {
        function fixUrlProtocol() {
            const val = urlInput.value.trim();
            if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                urlInput.value = 'https://' + val;
            }
        }
        urlInput.addEventListener('paste', () => setTimeout(fixUrlProtocol, 0));
        urlInput.addEventListener('blur', fixUrlProtocol);
    }

    const titleInput = document.getElementById('submit-title');
    if (titleInput) {
        const counter = document.createElement('span');
        counter.className = 'text-[10px] text-gray-400 ml-2';
        counter.id = 'title-counter';
        titleInput.parentElement.appendChild(counter);

        titleInput.addEventListener('input', () => {
            const len = titleInput.value.length;
            counter.textContent = `${len}/120`;
            counter.style.color = len > 100 ? (len > 120 ? '#ef4444' : '#f59e0b') : '#9ca3af';
        });
    }

    function showStatus(msg, isError = false) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.style.color = isError ? '#ef4444' : '#9ca3af';
        statusEl.classList.remove('hidden');
    }

    function hideStatus() {
        if (statusEl) statusEl.classList.add('hidden');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideStatus();

        if (!session) {
            showStatus('You must be logged in to submit.', true);
            return;
        }
        if (!rateLimit.canSubmit()) {
            showStatus(`Please wait ${rateLimit.remaining()}s before submitting again.`, true);
            return;
        }

        let title = sanitize(document.getElementById('submit-title')?.value ?? '');
        const url = sanitize(document.getElementById('submit-url')?.value ?? '');
        const text = sanitize(document.getElementById('submit-text')?.value ?? '');

        if (!title) {
            showStatus('Title is required.', true);
            document.getElementById('submit-title')?.focus();
            return;
        }

        if (title.length > 120) {
            showStatus('Title is too long. Keep it under 120 characters.', true);
            return;
        }

        if (title.length < 3) {
            showStatus('Title must be at least 3 characters.', true);
            return;
        }

        if (url) {
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    showStatus('Only http and https URLs are allowed.', true);
                    return;
                }
            } catch {
                showStatus('Please enter a valid URL (e.g. https://example.com)', true);
                return;
            }
        }

        const categoryInput = document.getElementById('submit-category');
        let finalCategory = categoryInput ? categoryInput.value : 'article';

        if (!['article', 'ask', 'show'].includes(finalCategory)) {
            finalCategory = 'article';
        }
        if (finalCategory === 'article' && !url && !text) {
            showStatus('Write the article or include a URL.', true);
            document.getElementById('submit-text')?.focus();
            return;
        }

        if (finalCategory === 'show' && !title.toLowerCase().startsWith('show kn:')) {
            title = `Show KN: ${title}`;
        }

        const slug = generateSlug(title);

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'submitting...';
            btnSubmit.style.opacity = '0.6';
        }
        showStatus('Submitting your post...');

        rateLimit.mark();

        try {
            const { data, error } = await supabase
                .from('blogs')
                .insert({
                    title,
                    url: url || '',
                    content: text || '',
                    category: finalCategory,
                    status: 'published',
                    published_at: new Date().toISOString(),
                    slug,
                    likes_count: 0,
                    comments_count: 0,
                    clicks_count: 0
                })
                .select()
                .maybeSingle();

            if (error) {
                let userMsg = error.message;
                if (error.code === '23505') userMsg = 'A post with this title already exists.';
                if (error.details) userMsg += ' (' + error.details + ')';

                showStatus('Submit Error: ' + userMsg, true);
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = 'submit';
                    btnSubmit.style.opacity = '';
                }
            } else {
                showStatus('Submitted! Redirecting...');
                setTimeout(() => {
                    if (finalCategory === 'show') {
                        window.location.href = 'show';
                    } else if (finalCategory === 'ask') {
                        window.location.href = 'ask';
                    } else {
                        window.location.href = 'home';
                    }
                }, 400);
            }
        } catch (err) {
            showStatus('An unexpected error occurred. Please try again.', true);
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'submit';
                btnSubmit.style.opacity = '';
            }
        }
    });

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

            try {
                const result = await uploadMediaFile(file);

                if (result.error) {
                    alert('Upload failed: ' + result.error);
                } else {
                    const ext = result.name.split('.').pop().toLowerCase();
                    const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

                    if (isImg) {
                        let altText = prompt('Enter a short description (alt text) for this image:', 'Image');
                        if (altText === null) altText = 'Image';
                        altText = sanitize(altText);
                        const markdown = `\n![${altText}](${result.url})\n`;
                        insertAtCursor(textarea, markdown);
                    } else {
                        const safeName = sanitize(result.name.split('-')[0]) || 'File';
                        const markdown = `\n[${safeName}](${result.url})\n`;
                        insertAtCursor(textarea, markdown);
                    }
                }
            } catch (err) {
                alert('Upload failed unexpectedly. Please try again.');
            }

            btnUploadImage.disabled = false;
            btnUploadImage.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px">upload_file</span> Upload File';
            imageUploadInput.value = '';
        });
    }

    const btnMediaLibrary = document.getElementById('btn-media-library');
    const mediaModal = document.getElementById('media-library-modal');
    const btnCloseMedia = document.getElementById('btn-close-media');
    const mediaGrid = document.getElementById('media-library-grid');

    if (btnMediaLibrary && mediaModal) {
        async function loadMediaFiles() {
            mediaGrid.innerHTML = '<div class="col-span-full text-center py-12"><div class="animate-spin inline-block w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full mb-4"></div><p class="text-gray-500 text-sm italic">Loading your photos...</p></div>';

            try {
                const files = await listUserMedia();

                if (!files || files.length === 0) {
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
                    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                }

                const fragment = document.createDocumentFragment();
                files.forEach(f => {
                    const isImg = isImage(f.name);
                    const icon = getFileIcon(f.name);

                    const card = document.createElement('div');
                    card.className = 'group relative aspect-passport bg-white rounded border border-gray-200 overflow-hidden hover:border-[#ff6600] transition-all shadow-sm hover:shadow-md cursor-pointer media-item';
                    card.setAttribute('data-url', f.url);
                    card.setAttribute('data-name', f.name);
                    card.setAttribute('data-is-img', isImg);

                    if (isImg) {
                        const img = document.createElement('img');
                        img.src = f.url;
                        img.className = 'w-full h-full object-cover';
                        img.loading = 'lazy';
                        card.appendChild(img);
                    } else {
                        const iconContainer = document.createElement('div');
                        iconContainer.className = 'w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-2 text-center';

                        const spanIcon = document.createElement('span');
                        spanIcon.className = 'material-symbols-outlined text-3xl mb-1';
                        spanIcon.textContent = icon;
                        iconContainer.appendChild(spanIcon);

                        const spanName = document.createElement('span');
                        spanName.className = 'text-[9px] truncate w-full px-1';
                        spanName.textContent = f.name.split('-')[0];
                        iconContainer.appendChild(spanName);

                        card.appendChild(iconContainer);
                    }

                    const hoverDiv = document.createElement('div');
                    hoverDiv.className = 'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold';
                    hoverDiv.textContent = 'Insert';
                    card.appendChild(hoverDiv);

                    fragment.appendChild(card);
                });
                mediaGrid.replaceChildren(fragment);

                mediaGrid.querySelectorAll('.media-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const url = item.getAttribute('data-url');
                        const name = item.getAttribute('data-name').split('-')[0] || 'File';
                        const isImg = item.getAttribute('data-is-img') === 'true';

                        if (isImg) {
                            insertAtCursor(textarea, `\n![${sanitize(name)}](${url})\n`);
                        } else {
                            insertAtCursor(textarea, `\n[${sanitize(name)}](${url})\n`);
                        }
                        mediaModal.classList.add('hidden');

                    });

                    item.addEventListener('mouseenter', (e) => {
                        const url = item.getAttribute('data-url');
                        const isImg = item.getAttribute('data-is-img') === 'true';
                        if (!isImg) showPreview(url, e);
                    });

                    item.addEventListener('mouseleave', hidePreview);
                });
            } catch (err) {
                const errDiv = document.createElement('div');
                errDiv.className = 'col-span-full text-sm text-red-500 text-center py-8';
                errDiv.textContent = 'Failed to load media. Please try again.';
                mediaGrid.replaceChildren(errDiv);
            }
        }

        const previewTooltip = document.createElement('div');
        previewTooltip.className = 'media-preview-tooltip';
        document.body.appendChild(previewTooltip);

        function showPreview(url, e) {
            const officeExts = /\.(xlsx?|docx?|pptx?)$/i;
            let viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

            if (url.match(officeExts)) {
                viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
            }

            const iframe = document.createElement('iframe');
            iframe.src = viewerUrl;
            iframe.className = 'preview-frame';
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
            previewTooltip.replaceChildren(iframe);
            previewTooltip.classList.add('visible');
            updatePreviewPos(e);
        }

        function hidePreview() {
            previewTooltip.classList.remove('visible');
            previewTooltip.replaceChildren();
        }

        function updatePreviewPos(e) {
            const x = e.clientX + 20;
            const y = e.clientY - 200;

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

        imageUploadInput.addEventListener('change', async () => {
            if (!mediaModal.classList.contains('hidden')) {
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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !mediaModal.classList.contains('hidden')) {
                mediaModal.classList.add('hidden');
            }
        });
    }

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
