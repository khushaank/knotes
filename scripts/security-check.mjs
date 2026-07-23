import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const readOptional = async path => {
    try {
        return await read(path);
    } catch {
        return '';
    }
};
const exists = async path => {
    try {
        await access(new URL(path, root));
        return true;
    } catch {
        return false;
    }
};

const [auth, client, login, contact, security, manifest, packageJson, interceptor, session, styles, home, storageMigration] = await Promise.all([
    read('assets/js/auth.js'),
    read('assets/js/supabaseClient.js'),
    read('login.html'),
    read('contact.html'),
    read('security.html'),
    read('manifest.webmanifest'),
    read('package.json'),
    read('assets/js/exit-interceptor.js'),
    read('assets/js/session.js'),
    read('assets/css/input.css'),
    read('index.html'),
    readOptional('Supabase/migrations/20260723_security_hardening.sql')
]);

const pkg = JSON.parse(packageJson);
const pwa = JSON.parse(manifest);

assert.doesNotMatch(auth, /length\s*<\s*(?:6|7|8|9|10|11)\b/, 'all password flows must require at least 12 characters');
assert.match(auth, /PASSWORD_MIN_LENGTH\s*=\s*12/, 'password policy must be centralized at 12 characters');
assert.match(login, /autocomplete="current-password"/, 'login password must declare current-password autocomplete');
assert.match(login, /autocomplete="new-password"/, 'signup password must declare new-password autocomplete');
assert.match(login, /<label[^>]+for="login-email"/, 'login email needs an associated label');
assert.match(login, /<label[^>]+for="signup-password"/, 'signup password needs an associated label');
assert.match(home, /<h1[^>]+class="[^"]*sr-only/, 'homepage needs a semantic h1');
assert.match(session, /function enhanceFormAccessibility\(/, 'shared forms need runtime accessibility normalization');
assert.doesNotMatch(styles, /font-size:\s*7pt/, 'story metadata must remain readable');
assert.match(styles, /:focus-visible/, 'interactive controls need visible keyboard focus');

assert.doesNotMatch(security, /security@knotes\.com/i, 'security page must not publish the non-working knotes.com mailbox');
assert.match(security, /\.well-known\/security\.txt/, 'security page must link to security.txt');
assert.equal(await exists('.well-known/security.txt'), true, 'security.txt must exist');
assert.match(contact, /maxlength="2000"/, 'feedback must have a server-aligned maximum length');
assert.match(contact, /sign in to send feedback/i, 'feedback must require authentication to prevent anonymous spam');
assert.match(contact, /<h1[^>]*>Contact & Feedback<\/h1>/, 'contact page needs a semantic heading');
assert.match(contact, /id="fb-status"[^>]+role="status"[^>]+aria-live="polite"/, 'feedback results must be announced');
assert.match(contact, /<label[^>]+for="footer-search-input"[^>]*>Search:<\/label>/, 'footer search needs a static label');
assert.match(contact, /id="footer-search-input"[^>]+name="search"/, 'footer search needs a form name');

assert.equal(pkg.name, 'knotes', 'package name must match the product');
assert.ok((await read('README.md')).length > 500, 'README must document setup, deployment, and security');
assert.equal(await exists('PRODUCTION_HARDENING.md'), true, 'production approval and rollout steps must be documented');
assert.equal(await exists('LICENSE'), true, 'repository must declare a license');
assert.equal(await exists('.github/workflows/ci.yml'), true, 'CI workflow must exist');
assert.doesNotMatch(pwa.description, /\bprivate\b/i, 'PWA description must match the public community product');

assert.doesNotMatch(interceptor, /window\.location\.href\s*=\s*exitUrl/, 'ordinary external links must not be forced through an interstitial');
assert.match(interceptor, /relList\.add\('noopener'\)/, 'external links must receive noopener');
assert.doesNotMatch(interceptor, /\bexport\s+\{/, 'classic interceptor script must not use ES module exports');
assert.match(session, /updateViaCache:\s*'none'/, 'service-worker registration must bypass HTTP cache');

assert.match(storageMigration, /allowed_mime_types/i, 'storage must enforce MIME types server-side');
assert.match(storageMigration, /file_size_limit/i, 'storage must enforce file-size limits server-side');
assert.match(storageMigration, /feedback/i, 'feedback RLS and limits must be versioned');
assert.match(storageMigration, /char_length\(message\)/i, 'feedback length must be enforced by the database');
assert.match(storageMigration, /set public = false,[\s\S]*where id = 'avatars'/i, 'avatars must remain private');
assert.match(storageMigration, /drop policy if exists "Avatar images are publicly accessible" on storage\.objects/i, 'legacy public avatar reads must be removed');
assert.match(storageMigration, /create policy "Users can view their own avatar"[\s\S]*for select to authenticated[\s\S]*storage\.foldername\(name\)/i, 'avatar reads must be owner scoped');
assert.match(storageMigration, /grant insert \(user_id, name, type, message, page_url\)/i, 'clients must not control feedback timestamps');
assert.match(storageMigration, /new\.created_at := clock_timestamp\(\)/i, 'feedback timestamps must be server controlled');
assert.match(storageMigration, /pg_advisory_xact_lock/i, 'feedback rate checks must serialize per account');
assert.match(storageMigration, /alter column name set not null/i, 'existing feedback schemas must be hardened');
assert.match(storageMigration, /conrelid\s*=\s*'public\.feedback'::regclass/i, 'constraint checks must be scoped to feedback');
assert.match(client, /from\('avatars'\)[\s\S]{0,160}createSignedUrl\(filePath,\s*3600\)/, 'private avatars need signed URLs');
assert.match(client, /update\(\{ avatar_url: filePath \}\)/, 'profiles must store private avatar paths, not public URLs');
assert.doesNotMatch(client, /file\.type === 'application\/octet-stream'[\s\S]{0,80}return null/, 'generic binary MIME must not bypass upload checks');
assert.equal(await exists('cloudflare/worker.js'), true, 'Cloudflare security-header worker must be provided');
assert.equal(await exists('cloudflare/wrangler.toml.example'), true, 'Cloudflare deployment template must be provided');

console.log('Security and production-readiness checks passed.');
