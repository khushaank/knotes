(function () {
    const WHITELISTED_DOMAINS = [
        window.location.hostname,
        'khushaank.github.io',
        'knotes.vercel.app'
    ];

    function isExternalLink(url) {
        if (!url || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) {
            return false;
        }

        try {
            const target = new URL(url, window.location.origin);
            const isInternal = WHITELISTED_DOMAINS.some(domain =>
                target.hostname === domain || target.hostname.endsWith('.' + domain)
            );

            const isRelative = url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || !url.includes('://');

            return !isInternal && !isRelative;
        } catch (e) {
            return false;
        }
    }

    function handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link) return;

        const url = link.getAttribute('href');
        if (isExternalLink(url)) {
            e.preventDefault();

            const absoluteUrl = new URL(url, window.location.origin).href;
            
            // Determine the relative path to exit.html based on current location
            // This is safer for sites hosted in subdirectories (like GitHub Pages)
            const pathSegments = window.location.pathname.split('/').filter(s => s.length > 0);
            
            // If the last segment is a page (like index.html), remove it to get directory depth
            if (pathSegments.length > 0 && pathSegments[pathSegments.length - 1].endsWith('.html')) {
                pathSegments.pop();
            }

            // If we are in 'pulse' or any other subdirectory, we need to go up
            // This project seems to have one level of subdirectories (e.g., /pulse/)
            let exitPath = 'exit.html';
            if (window.location.pathname.includes('/pulse/') || window.location.pathname.includes('/admin-kgnews/')) {
                exitPath = '../exit.html';
            }

            window.location.href = `${exitPath}?url=${encodeURIComponent(absoluteUrl)}`;
        }
    }

    document.addEventListener('click', handleLinkClick, true);

    console.log('Link interceptor active');
})();
