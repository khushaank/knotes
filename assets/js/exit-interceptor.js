// External links should behave normally. This module only applies browser
// isolation attributes and blocks non-web protocols from user-generated links.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function hardenLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return false;

    let url;
    try {
        url = new URL(link.getAttribute('href') || '', window.location.href);
    } catch {
        link.removeAttribute('href');
        return false;
    }

    if (!SAFE_PROTOCOLS.has(url.protocol)) {
        link.removeAttribute('href');
        return false;
    }

    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== window.location.origin) {
        link.relList.add('noopener');
        link.relList.add('noreferrer');
    }

    return true;
}

function hardenDocumentLinks(root = document) {
    root.querySelectorAll('a[href]').forEach(hardenLink);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hardenDocumentLinks(), { once: true });
} else {
    hardenDocumentLinks();
}

document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (link && !hardenLink(link)) event.preventDefault();
}, true);
