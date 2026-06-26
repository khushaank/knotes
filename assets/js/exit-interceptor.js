(function () {
    function showPageLoading() {
        if (document.getElementById('knotes-page-loading')) return;

        const style = document.createElement('style');
        style.id = 'knotes-loading-styles';
        style.textContent = `
            #knotes-page-loading {
                position: fixed;
                inset: 0;
                z-index: 9999999;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: radial-gradient(circle at center, rgba(15, 23, 42, 0.96) 0%, rgba(3, 7, 18, 0.99) 100%);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                color: #ffffff;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                opacity: 1;
                transition: opacity 280ms cubic-bezier(0.4, 0, 0.2, 1);
            }
            .k-loader-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 28px;
                animation: k-fade-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .k-spinner-wrap {
                position: relative;
                width: 80px;
                height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .k-spinner {
                animation: k-spin 1.2s linear infinite;
            }
            .k-spinner-bg {
                stroke: rgba(255, 102, 0, 0.08);
            }
            .k-spinner-path {
                stroke: url(#k-gradient-orange);
                stroke-dasharray: 180;
                stroke-dashoffset: 135;
                stroke-linecap: round;
                animation: k-dash 1.5s ease-in-out infinite;
                transform-origin: center;
            }
            .k-loader-logo {
                position: absolute;
                font-size: 26px;
                font-weight: 800;
                color: #ff6600;
                text-shadow: 0 0 16px rgba(255, 102, 0, 0.6);
                font-family: inherit;
                animation: k-pulse-logo 2s ease-in-out infinite;
            }
            .k-loader-text {
                font-size: 15px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.92);
                letter-spacing: 4px;
                text-transform: uppercase;
                display: flex;
                align-items: center;
                text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
            }
            .k-dot {
                color: #ff6600;
                animation: k-dot-pulse 1.5s infinite both;
                text-shadow: 0 0 10px rgba(255, 102, 0, 0.9);
            }
            .k-dot:nth-child(1) { animation-delay: 0s; }
            .k-dot:nth-child(2) { animation-delay: 0.18s; }
            .k-dot:nth-child(3) { animation-delay: 0.36s; }
            .k-dot:nth-child(4) { animation-delay: 0.54s; }
            .k-dot:nth-child(5) { animation-delay: 0.72s; }

            @keyframes k-spin {
                100% { transform: rotate(360deg); }
            }
            @keyframes k-dash {
                0% {
                    stroke-dashoffset: 180;
                }
                50% {
                    stroke-dashoffset: 45;
                    transform: rotate(135deg);
                }
                100% {
                    stroke-dashoffset: 180;
                    transform: rotate(450deg);
                }
            }
            @keyframes k-pulse-logo {
                0%, 100% { transform: scale(1); opacity: 0.9; }
                50% { transform: scale(1.1); opacity: 1; filter: drop-shadow(0 0 10px rgba(255, 102, 0, 0.8)); }
            }
            @keyframes k-dot-pulse {
                0%, 100% { opacity: 0.15; transform: scale(0.85); }
                50% { opacity: 1; transform: scale(1.2); }
            }
            @keyframes k-fade-in {
                from { opacity: 0; transform: translateY(16px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);

        const loading = document.createElement('div');
        loading.id = 'knotes-page-loading';
        loading.setAttribute('role', 'status');
        loading.setAttribute('aria-live', 'polite');
        loading.innerHTML = `
            <div class="k-loader-container">
                <div class="k-spinner-wrap">
                    <svg class="k-spinner" width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle class="k-spinner-bg" cx="40" cy="40" r="35" stroke-width="4.5" />
                        <circle class="k-spinner-path" cx="40" cy="40" r="35" stroke-width="4.5" />
                        <defs>
                            <linearGradient id="k-gradient-orange" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#ffaa00" />
                                <stop offset="100%" stop-color="#ff6600" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div class="k-loader-logo">K</div>
                </div>
                <div class="k-loader-text">
                    Loading<span class="k-dot">.</span><span class="k-dot">.</span><span class="k-dot">.</span><span class="k-dot">.</span><span class="k-dot">.</span>
                </div>
            </div>
        `;

        document.documentElement.appendChild(loading);
    }

    function hidePageLoading() {
        const loading = document.getElementById('knotes-page-loading');
        if (!loading) return;
        loading.style.opacity = '0';
        setTimeout(() => {
            loading.remove();
            const styles = document.getElementById('knotes-loading-styles');
            if (styles) styles.remove();
        }, 300);
    }



    const WHITELISTED_DOMAINS = [
        window.location.hostname
    ];

    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'exit') {
        return;
    }

    function isExternalLink(url) {
        const rawUrl = (url || '').trim();
        if (!rawUrl || rawUrl.startsWith('javascript:') || rawUrl.startsWith('#') || rawUrl.startsWith('mailto:') || rawUrl.startsWith('tel:')) {
            return false;
        }

        try {
            const target = new URL(rawUrl, window.location.origin);
            if (!['http:', 'https:'].includes(target.protocol)) return false;

            const isInternal = WHITELISTED_DOMAINS.some(domain =>
                target.hostname === domain || target.hostname.endsWith('.' + domain)
            );

            return !isInternal;
        } catch (e) {
            return false;
        }
    }

    function getExitPath() {
        const scriptSrc = document.currentScript?.getAttribute('src') || '';
        const parentSegments = scriptSrc.match(/(?:^|\/)\.\.\//g);
        return `${'../'.repeat(parentSegments ? parentSegments.length : 0)}exit`;
    }

    function handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link) return;
        if (link.hasAttribute('download') || link.dataset.noIntercept === 'true') return;

        const url = link.getAttribute('href');
        if (isExternalLink(url)) {
            e.preventDefault();

            const absoluteUrl = new URL(url, window.location.origin).href;
            const exitUrl = `${getExitPath()}?url=${encodeURIComponent(absoluteUrl)}`;
            const target = link.getAttribute('target');

            if (target === '_blank') {
                window.open(exitUrl, '_blank', 'noopener');
            } else {
                window.location.href = exitUrl;
            }
        }
    }

    document.addEventListener('click', handleLinkClick, true);

})();
