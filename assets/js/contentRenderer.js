import { sanitize } from './supabaseClient.js';

export function renderMarkdown(text) {
    if (!text) return '';
    
    let processedText = text;

    // Auto-embed YouTube
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    processedText = processedText.replace(ytRegex, (match, videoId) => {
        // Only replace if it's not already in an iframe or markdown link (basic check)
        if (match.includes('iframe') || match.includes('youtube.com/embed')) return match;
        return `\n<iframe class="w-full max-w-2xl rounded shadow-md mt-2 mb-4" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n`;
    });

    // Auto-embed Images (bare URLs ending in image extensions)
    // We only replace if there isn't a ! in front of it (basic markdown image check)
    const imgRegex = /(?<!\!\[.*?\]\()(?<!src=["'])(https?:\/\/[^\s<]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<]*)?)/gi;
    processedText = processedText.replace(imgRegex, '![]($1)');

    // Parse with marked
    let parsed = '';
    if (typeof marked !== 'undefined') {
        parsed = marked.parse(processedText, { breaks: true, gfm: true });
    } else {
        parsed = sanitize(processedText);
    }
    
    return parsed;
}

export function setupLinkPreviews() {
    // Add tooltip container to body if not exists
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
        // Add sandbox to prevent frame busting and annoying alerts
        iframe.sandbox = "allow-scripts";
        
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
        
        // Only preview external links that aren't the same domain
        if (!target.href.startsWith('http') || target.href.includes(window.location.hostname)) return;

        // Skip if it's already an image or video link (they are auto-embedded anyway)
        if (target.href.match(/\.(jpg|jpeg|png|gif|webp)$/i) || target.href.includes('youtube.com') || target.href.includes('youtu.be')) return;

        clearTimeout(timeout);
        
        target.addEventListener('mouseenter', () => {
            clearTimeout(timeout);
            header.textContent = target.href;
            if (iframe.src !== target.href) {
                iframe.src = target.href;
            }
            
            const rect = target.getBoundingClientRect();
            
            // Positioning logic to keep it on screen
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
            }, 100); // slight delay
        }, { once: true });
    });
}
