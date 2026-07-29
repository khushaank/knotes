import {
    deleteMediaFile,
    listUserMedia,
    updateMediaDetails,
    uploadMediaFile
} from './supabaseClient.js?v=2';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv']);
const iconByExtension = {
    pdf: 'picture_as_pdf', xls: 'table_chart', xlsx: 'table_chart', csv: 'table_chart',
    doc: 'description', docx: 'description', ppt: 'present_to_all', pptx: 'present_to_all',
    txt: 'article'
};

function extension(name = '') {
    return name.split('.').pop().toLowerCase();
}

export function isImageMedia(media) {
    return IMAGE_EXTENSIONS.has(extension(media.name || media.displayName));
}

export function mediaMarkdown(media) {
    const label = (isImageMedia(media) ? media.altText : media.displayName) || media.displayName || 'File';
    const safeLabel = label.replace(/[[\]]/g, '').trim();
    return isImageMedia(media)
        ? `\n![${safeLabel}](${media.reference})\n`
        : `\n[${safeLabel}](${media.reference})\n`;
}

function makeDialog(title) {
    const dialog = document.createElement('dialog');
    dialog.className = 'kn-media-dialog';
    dialog.innerHTML = `<div class="kn-media-dialog-card"><div class="kn-media-dialog-head"><h2></h2><button type="button" class="kn-media-icon-button" aria-label="Close">×</button></div><div class="kn-media-dialog-body"></div></div>`;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    return dialog;
}

export function askMediaDetails(fileOrMedia) {
    const isFile = fileOrMedia instanceof File;
    const dialog = makeDialog(isFile ? 'File details' : 'Edit file details');
    const body = dialog.querySelector('.kn-media-dialog-body');
    const form = document.createElement('form');
    form.className = 'kn-media-form';
    form.innerHTML = `
      <p class="kn-media-help">Choose the name readers see. Add alt text for images so everyone can understand them.</p>
      <label>Display name<input name="displayName" maxlength="160" required></label>
      <label>Alt text <span>(images)</span><textarea name="altText" maxlength="500" rows="3"></textarea></label>
      <p class="kn-media-status" role="status" aria-live="polite"></p>
      <div class="kn-media-form-actions"><button type="button" class="kn-media-button secondary">Cancel</button><button type="submit" class="kn-media-button primary">Save</button></div>`;
    form.elements.displayName.value = fileOrMedia.displayName || fileOrMedia.name || '';
    form.elements.altText.value = fileOrMedia.altText || '';
    if (!(isFile ? IMAGE_EXTENSIONS.has(extension(fileOrMedia.name)) : isImageMedia(fileOrMedia))) {
        form.elements.altText.closest('label').hidden = true;
    }
    body.append(form);
    dialog.showModal();
    form.elements.displayName.focus();

    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
            dialog.close();
        };
        form.querySelector('.secondary').addEventListener('click', () => finish(null));
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            finish({
                displayName: form.elements.displayName.value.trim(),
                altText: form.elements.altText.value.trim()
            });
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    });
}

export async function uploadMediaWithDetails(file) {
    const details = await askMediaDetails(file);
    if (!details) return { cancelled: true };
    return uploadMediaFile(file, details);
}

export async function openMediaPreview(media) {
    const dialog = makeDialog(media.displayName || 'File preview');
    dialog.classList.add('kn-media-preview-dialog');
    const body = dialog.querySelector('.kn-media-dialog-body');
    const ext = extension(media.name);

    if (isImageMedia(media)) {
        const image = document.createElement('img');
        image.className = 'kn-media-preview-image';
        image.src = media.url;
        image.alt = media.altText || media.displayName || '';
        body.append(image);
    } else if (ext === 'pdf') {
        const frame = document.createElement('iframe');
        frame.className = 'kn-media-preview-frame';
        frame.src = media.url;
        frame.title = `${media.displayName || 'PDF'} preview`;
        body.append(frame);
    } else if (TEXT_EXTENSIONS.has(ext)) {
        const pre = document.createElement('pre');
        pre.className = 'kn-media-preview-text';
        pre.textContent = 'Loading preview…';
        body.append(pre);
        fetch(media.url).then(response => response.text()).then(text => {
            pre.textContent = text.slice(0, 200000);
        }).catch(() => { pre.textContent = 'Preview unavailable.'; });
    } else {
        const message = document.createElement('div');
        message.className = 'kn-media-document-fallback';
        message.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">description</span><p>Word, Excel, and PowerPoint files open in their compatible app.</p>`;
        body.append(message);
    }

    const open = document.createElement('a');
    open.className = 'kn-media-button primary kn-media-open';
    open.href = media.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'Open full file';
    body.append(open);
    dialog.showModal();
}

function makeIconButton(label, icon, onClick, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `kn-media-card-action${danger ? ' danger' : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>`;
    button.addEventListener('click', event => {
        event.stopPropagation();
        onClick();
    });
    return button;
}

export async function renderMediaLibrary(container, { onInsert, manage = false, onChanged } = {}) {
    container.classList.add('kn-media-grid');
    container.textContent = 'Loading your files…';
    const files = await listUserMedia();
    if (!files.length) {
        container.innerHTML = '<p class="kn-media-empty">No files yet. Upload your first file.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    files.forEach(media => {
        const card = document.createElement('article');
        card.className = 'kn-media-card';
        if (isImageMedia(media)) {
            const image = document.createElement('img');
            image.src = media.url;
            image.alt = media.altText || '';
            image.loading = 'lazy';
            card.append(image);
        } else {
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined kn-media-file-icon';
            icon.textContent = iconByExtension[extension(media.name)] || 'insert_drive_file';
            card.append(icon);
        }
        const title = document.createElement('div');
        title.className = 'kn-media-card-title';
        title.textContent = media.displayName;
        const actions = document.createElement('div');
        actions.className = 'kn-media-card-actions';
        actions.append(makeIconButton('Preview full screen', 'fullscreen', () => openMediaPreview(media)));
        if (onInsert) actions.append(makeIconButton('Insert into post', 'add', () => onInsert(media)));
        if (manage) {
            actions.append(makeIconButton('Rename and edit alt text', 'edit', async () => {
                const details = await askMediaDetails(media);
                if (!details) return;
                const result = await updateMediaDetails(media.id, details);
                if (result.error) return alert(result.error);
                await renderMediaLibrary(container, { onInsert, manage, onChanged });
                onChanged?.();
            }));
            actions.append(makeIconButton('Delete file', 'delete', async () => {
                if (!confirm(`Delete “${media.displayName}”? Existing post links to it will stop working.`)) return;
                const result = await deleteMediaFile(media);
                if (result.error) return alert(result.error);
                await renderMediaLibrary(container, { onInsert, manage, onChanged });
                onChanged?.();
            }, true));
        }
        card.append(actions, title);
        fragment.append(card);
    });
    container.replaceChildren(fragment);
}
