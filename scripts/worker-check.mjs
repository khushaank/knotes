import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

const originalFetch = globalThis.fetch;
globalThis.fetch = async request => {
    const url = new URL(request.url);
    const common = { 'Content-Type': 'text/html; charset=utf-8', 'X-Origin': 'preserved' };

    if (url.pathname === '/redirect') {
        return new Response(null, { status: 302, headers: { ...common, Location: '/login' } });
    }
    if (url.pathname === '/missing') {
        return new Response('Not found', { status: 404, headers: common });
    }
    if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers: common });
    }
    return new Response('<!doctype html><title>Knotes</title>', { status: 200, headers: common });
};

try {
    const home = await worker.fetch(new Request('https://knotes.dpdns.org/'));
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('x-origin'), 'preserved', 'upstream headers must survive');
    assert.match(home.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    assert.equal(home.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');

    const runtime = await worker.fetch(new Request('https://knotes.dpdns.org/runtime-config.json'));
    assert.equal(runtime.headers.get('cache-control'), 'no-store, max-age=0');

    const serviceWorker = await worker.fetch(new Request('https://knotes.dpdns.org/service-worker.js'));
    assert.equal(serviceWorker.headers.get('cache-control'), 'no-store, max-age=0');

    const dashboard = await worker.fetch(new Request('https://knotes.dpdns.org/dashboard/'));
    assert.equal(dashboard.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(dashboard.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

    const asset = await worker.fetch(new Request('https://knotes.dpdns.org/assets/app.js'));
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=14400, must-revalidate');

    const redirect = await worker.fetch(new Request('https://knotes.dpdns.org/redirect'));
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/login');

    const missing = await worker.fetch(new Request('https://knotes.dpdns.org/missing'));
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'Not found');

    const head = await worker.fetch(new Request('https://knotes.dpdns.org/', { method: 'HEAD' }));
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
} finally {
    globalThis.fetch = originalFetch;
}

console.log('Cloudflare Worker checks passed (headers, cache, status, redirects, errors, and HEAD).');
