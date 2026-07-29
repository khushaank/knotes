const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cloudflareinsights.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "form-action 'self'",
  "upgrade-insecure-requests"
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

function cachePolicy(pathname) {
  if (pathname === '/service-worker.js' || pathname === '/runtime-config.json') {
    return 'no-store, max-age=0';
  }
  if (/\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(pathname)) {
    return 'public, max-age=14400, must-revalidate';
  }
  if (['/', '/index', '/index.html'].includes(pathname)) return 'public, max-age=300, must-revalidate';
  if (['/login', '/login.html'].includes(pathname)) return 'no-store, max-age=0';
  return 'private, no-store, max-age=0';
}

export default {
  async fetch(request) {
    const response = await fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    headers.set('Cache-Control', cachePolicy(new URL(request.url).pathname));

    const pathname = new URL(request.url).pathname;
    if (!['/', '/index', '/index.html', '/login', '/login.html'].includes(pathname) && !pathname.startsWith('/assets/')) {
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
