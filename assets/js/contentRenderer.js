const ALLOWED_FRAME_ORIGINS = new Set([
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com'
]);

function isAllowedFrameUrl(src) {
    try {
        const url = new URL(src, window.location.origin);
        if (!ALLOWED_FRAME_ORIGINS.has(url.origin)) return false;
        if (url.origin.includes('youtube') && !url.pathname.startsWith('/embed/')) return false;
        return true;
    } catch {
        return false;
    }
}

function hardenRenderedHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    template.content.querySelectorAll('iframe').forEach(iframe => {
        const src = iframe.getAttribute('src') || '';
        if (!isAllowedFrameUrl(src)) {
            iframe.remove();
            return;
        }
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    });

    template.content.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noopener noreferrer nofollow');
        }
    });

    template.content.querySelectorAll('img').forEach(image => {
        try {
            const url = new URL(image.getAttribute('src') || '', window.location.origin);
            const client = globalThis.KNOTES_SUPABASE;
            const supabaseOrigin = client?.supabaseUrl ? new URL(client.supabaseUrl).origin : '';
            if (url.origin !== window.location.origin &&
                !(url.origin === supabaseOrigin && url.pathname.startsWith('/storage/v1/object/sign/media/'))) {
                image.replaceWith(document.createTextNode(image.alt || '[external image blocked]'));
                return;
            }
        } catch {
            image.remove();
            return;
        }
        image.setAttribute('loading', 'lazy');
        image.setAttribute('decoding', 'async');
        if (!image.hasAttribute('alt')) image.setAttribute('alt', '');
    });

    return template.innerHTML;
}

function escapePlainText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function resolvePrivateMedia(text) {
    const matches = [...new Set(String(text).match(/kn-media:\/\/[A-Za-z0-9%._~-]+/g) || [])];
    const supabase = globalThis.KNOTES_SUPABASE;
    if (!matches.length || !supabase) return text;

    const paths = matches.map(value => decodeURIComponent(value.slice('kn-media://'.length)));
    const { data, error } = await supabase.storage.from('media').createSignedUrls(paths, 900);
    if (error) return text;

    let resolved = String(text);
    matches.forEach((match, index) => {
        resolved = resolved.replaceAll(match, data?.[index]?.signedUrl || '#private-media-unavailable');
    });
    return resolved;
}

export async function renderMarkdown(text) {
    if (!text) return '';

    let processedText = (await resolvePrivateMedia(text)).replace(/\r\n?/g, '\n');
    const ytRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s]*?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/gi;
    processedText = processedText.replace(ytRegex, (match, videoId) => {
        return `\n<iframe class="kn-media-embed" title="YouTube video" src="https://www.youtube-nocookie.com/embed/${videoId}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n`;
    });

    let parsed = '';
    if (globalThis.marked?.parse) {
        parsed = globalThis.marked.parse(processedText, { breaks: true, gfm: true });
    } else {
        // Keep viewer pages functional if the optional Markdown parser fails
        // to load, without treating user text as HTML.
        parsed = escapePlainText(processedText).replace(/\r?\n/g, '<br>');
    }

    if (globalThis.DOMPurify?.sanitize) {
        const cleanHtml = globalThis.DOMPurify.sanitize(parsed, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'height', 'loading', 'referrerpolicy', 'sandbox', 'scrolling', 'src']
        });
        return hardenRenderedHtml(cleanHtml);
    }

    return escapePlainText(processedText).replace(/\n/g, '<br>');
}

export function setupLinkPreviews(container = document) {
    const preview = async media => {
        const { openMediaPreview } = await import('./mediaLibrary.js?v=1');
        openMediaPreview(media);
    };
    const selector = '[src*="/storage/v1/object/sign/media/"],a[href*="/storage/v1/object/sign/media/"]';
    container.querySelectorAll(selector).forEach(element => {
        if (element.dataset.knPreviewReady) return;
        element.dataset.knPreviewReady = 'true';
        const isImage = element.tagName === 'IMG';
        const url = isImage ? element.src : element.href;
        const pathName = decodeURIComponent(new URL(url).pathname);
        const storedName = pathName.split('/').pop() || 'File';
        const name = isImage ? (element.alt || storedName) : (element.textContent.trim() || storedName);
        const media = {
            name: storedName,
            displayName: name,
            altText: isImage ? element.alt : '',
            url
        };
        if (isImage) {
            element.tabIndex = 0;
            element.role = 'button';
            element.setAttribute('aria-label', `Open ${name} full screen`);
            element.style.cursor = 'zoom-in';
            element.addEventListener('click', () => preview(media));
            element.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    preview(media);
                }
            });
        } else {
            element.addEventListener('click', event => {
                event.preventDefault();
                preview(media);
            });
        }
    });
}
