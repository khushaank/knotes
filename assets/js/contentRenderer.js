const ALLOWED_FRAME_ORIGINS = new Set([
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://docs.google.com',
    'https://view.officeapps.live.com'
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

export function renderMarkdown(text) {
    if (!text) return '';

    let processedText = String(text).replace(/\r\n?/g, '\n');
    const ytRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s]*?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/gi;
    processedText = processedText.replace(ytRegex, (match, videoId) => {
        return `\n<iframe class="kn-media-embed" title="YouTube video" src="https://www.youtube-nocookie.com/embed/${videoId}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n`;
    });

    const imgRegex = /(?<!\!\[.*?\]\()(?<!src=["'])(https?:\/\/[^\s<]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<]*)?)/gi;
    processedText = processedText.replace(imgRegex, '![]($1)');

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

export function setupLinkPreviews() {
    let tooltip = document.getElementById('link-preview-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'link-preview-tooltip';
        tooltip.className = 'hidden absolute z-50 bg-white border border-gray-300 shadow-2xl rounded overflow-hidden pointer-events-none transition-opacity duration-200 opacity-0';
        tooltip.style.width = '400px';
        tooltip.style.height = '300px';

        const header = document.createElement('div');
        header.className = 'bg-gray-100 px-2 py-1 text-xs text-gray-600 border-b border-gray-200 truncate font-semibold';
        header.id = 'link-preview-header';

        const iframe = document.createElement('iframe');
        iframe.id = 'link-preview-iframe';
        iframe.style.width = '100%';
        iframe.style.height = 'calc(100% - 24px)';
        iframe.style.border = 'none';
        iframe.sandbox = "allow-scripts allow-same-origin";
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';

        tooltip.appendChild(header);
        tooltip.appendChild(iframe);
        document.body.appendChild(tooltip);
    }

    const iframe = document.getElementById('link-preview-iframe');
    const header = document.getElementById('link-preview-header');
    let timeout;

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('a');
        if (!target) return;

        if (!target.href.startsWith('http') || target.href.includes(window.location.hostname)) return;
        if (target.href.match(/\.(jpg|jpeg|png|gif|webp)$/i) || target.href.includes('youtube.com') || target.href.includes('youtu.be')) return;

        clearTimeout(timeout);

        target.addEventListener('mouseenter', () => {
            clearTimeout(timeout);
            header.textContent = target.textContent.trim() || target.href;
            const officeExts = /\.(xlsx?|docx?|pptx?)$/i;
            const pdfExts = /\.pdf$/i;
            let finalUrl = '';

            if (target.href.match(officeExts)) {
                finalUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(target.href)}`;
            } else if (target.href.match(pdfExts) || target.href.includes('supabase.co/storage/v1/object/public/media')) {
                finalUrl = `https://docs.google.com/gview?url=${encodeURIComponent(target.href)}&embedded=true`;
            }

            if (!finalUrl || !isAllowedFrameUrl(finalUrl)) return;

            if (iframe.src !== finalUrl) {
                iframe.src = finalUrl;
            }

            const rect = target.getBoundingClientRect();

            let left = rect.left + window.scrollX;
            let top = rect.bottom + window.scrollY + 10;

            if (left + 400 > window.innerWidth) {
                left = window.innerWidth - 420;
            }
            if (top - window.scrollY + 300 > window.innerHeight) {
                top = rect.top + window.scrollY - 310;
            }

            tooltip.style.left = `${Math.max(10, left)}px`;
            tooltip.style.top = `${Math.max(10, top)}px`;

            tooltip.classList.remove('hidden');
            setTimeout(() => tooltip.classList.remove('opacity-0'), 10);
        }, { once: true });

        target.addEventListener('mouseleave', () => {
            timeout = setTimeout(() => {
                tooltip.classList.add('opacity-0');
                setTimeout(() => tooltip.classList.add('hidden'), 200);
            }, 100);
        }, { once: true });
    });
}
