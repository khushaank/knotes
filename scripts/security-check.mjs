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

const [auth, client, login, contact, security, manifest, packageJson, interceptor, session, styles, home, feed, routeGuard, dashboard, worker, storageMigration, coreMigration, privateCircleMigration, removeCountMigration, invitationMigration, invitations, profile, serviceWorker, supabaseVendor] = await Promise.all([
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
    read('assets/js/index.js'),
    read('assets/js/routeGuard.js'),
    read('dashboard/js/dashboard.js'),
    read('cloudflare/worker.js'),
    readOptional('Supabase/migrations/20260723_security_hardening.sql'),
    readOptional('Supabase/migrations/20260722_core_schema.sql'),
    readOptional('Supabase/migrations/20260728_private_circle.sql'),
    readOptional('Supabase/migrations/20260728_remove_fake_community_size.sql'),
    readOptional('Supabase/migrations/20260729_secure_invitations.sql'),
    read('assets/js/invitations.js'),
    read('assets/js/profile.js'),
    read('service-worker.js'),
    read('assets/vendor/supabase.js')
]);

const pkg = JSON.parse(packageJson);
const pwa = JSON.parse(manifest);
const dashboardHtml = await read('dashboard/index.html');
const dashboardStyles = await read('dashboard/css/dashboard.css');

assert.doesNotMatch(auth, /length\s*<\s*(?:6|7|8|9|10|11)\b/, 'all password flows must require at least 12 characters');
assert.match(auth, /PASSWORD_MIN_LENGTH\s*=\s*12/, 'password policy must be centralized at 12 characters');
assert.match(login, /autocomplete="current-password"/, 'login password must declare current-password autocomplete');
assert.match(login, /<label[^>]+for="login-email"/, 'login email needs an associated label');
assert.doesNotMatch(login, /signup-form|Create Account/i, 'public account creation must not be offered');
assert.doesNotMatch(auth, /\.auth\.signUp\(/, 'browser signup must be removed');
assert.match(invitations, /\.auth\.signUp\(/, 'invitation redemption must create the invited account');
assert.match(auth, /getAuthenticatorAssuranceLevel/, 'login must check whether MFA is required');
assert.match(auth, /challengeAndVerify/, 'login must verify enrolled MFA factors');
assert.match(home, /<h1[^>]*>/, 'landing page needs a semantic h1');
assert.match(home, /id="membership-form"/, 'landing page needs the membership request form');
assert.doesNotMatch(home, /assets\/js\/index\.js|Loading stories/i, 'landing page must not load the private feed');
assert.doesNotMatch(home, /\b500\+|member-count/i, 'landing page must not display an invented member count');
assert.doesNotMatch(await read('assets/js/landing.js'), /community_size|from\(['"]blogs['"]\)/i, 'landing script must not query private content or member counts');
assert.match(await read('assets/js/landing.js'), /serviceWorker\.register\('\/service-worker\.js'/, 'landing page must update an existing service worker');
assert.doesNotMatch(await read('assets/js/landing.js'), /redirectApprovedMember\(/, 'the public landing page must not redirect signed-in members');
assert.ok(feed.indexOf('requireApprovedMember()') < feed.indexOf(".from('blogs')"), 'home feed must authorize before querying blogs');
assert.match(routeGuard, /auth\.getSession\(\)/, 'route guard must immediately reject visitors without a local session');
assert.match(routeGuard, /auth\.getUser\(\)/, 'route guard must verify the user with Supabase Auth in the background');
assert.match(routeGuard, /rpc\('is_approved_member'\)/, 'route guard must verify approved membership in trusted database state');
assert.match(routeGuard, /location\.replace\('\/'\)/, 'private pages must send non-members to the public landing page');
assert.match(routeGuard, /classList\.add\('access-ready'\)/, 'private pages must only reveal after approval');
assert.match(auth, /return '\/home';/, 'successful login must always open the private feed');
assert.equal((client.match(/\bcreateClient\(/g) || []).length, 1, 'canonical client must be constructed once');
assert.doesNotMatch(dashboard, /createClient\(|@supabase\/supabase-js/, 'dashboard must reuse the canonical Supabase client');
assert.doesNotMatch(dashboard, /icon\.style/, 'dashboard action icons must support XML-parsed SVG elements');
assert.match(dashboard, /icon\.removeAttribute\('style'\)/, 'dashboard action icons must remove legacy spacing safely');
assert.match(dashboardHtml, /id="top-posts-table" class="stack-on-mobile"/, 'all dashboard tables must use the responsive mobile layout');
assert.match(dashboardStyles, /\.content\s*\{[\s\S]*?min-width:\s*0/, 'dashboard content must be allowed to shrink inside its flex layout');
assert.match(dashboardHtml, /src="\.\.\/assets\/js\/theme-bootstrap\.js"/, 'dashboard theme bootstrap must be CSP-safe');
assert.match((await read('assets/js/index.js')) + session, /supabaseClient\.js\?v=2/, 'module specifiers must share the current Supabase client version');
assert.match(session, /function enhanceFormAccessibility\(/, 'shared forms need runtime accessibility normalization');
assert.doesNotMatch(styles, /font-size:\s*7pt/, 'story metadata must remain readable');
assert.match(styles, /:focus-visible/, 'interactive controls need visible keyboard focus');
assert.doesNotMatch(styles, /Checking access/i, 'private pages must not show a blocking access-check overlay');

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
assert.match(pwa.description, /\bprivate\b/i, 'PWA description must state that member content is private');
assert.match(pwa.description, /\bMFA-protected\b/i, 'PWA description must state the member security boundary');

assert.doesNotMatch(interceptor, /window\.location\.href\s*=\s*exitUrl/, 'ordinary external links must not be forced through an interstitial');
assert.match(interceptor, /relList\.add\('noopener'\)/, 'external links must receive noopener');
assert.doesNotMatch(interceptor, /\bexport\s+\{/, 'classic interceptor script must not use ES module exports');
assert.match(session, /updateViaCache:\s*'none'/, 'service-worker registration must bypass HTTP cache');
assert.match(session, /requireApprovedMember\(\)/, 'private pages must invoke the approved-member route guard');
assert.doesNotMatch(serviceWorker, /const SHELL = \[[^\]]*\/home/, 'private home must not be pre-cached');
assert.doesNotMatch(serviceWorker, /PUBLIC_PAGES[\s\S]{0,180}'\/home'/, 'private home must not be a public navigation cache');
assert.match(serviceWorker, /knotes-v23/, 'service-worker cache must be bumped after changing route delivery');
assert.match(serviceWorker, /\(\?:css\|img\|js\|vendor\)/, 'service worker must revalidate vendored browser dependencies');
assert.match(serviceWorker, /new Request\(request, \{ cache: 'reload' \}\)/, 'service worker must revalidate scripts and styles after deploy');
assert.ok(
    session.indexOf("if ('serviceWorker' in navigator)") < session.indexOf('localStorage.getItem(INSTALL_PROMPT_KEY)'),
    'service-worker updates must not depend on whether the install prompt was dismissed'
);
assert.match(supabaseVendor, /globalThis\.supabase\s*=\s*supabase/, 'vendored Supabase UMD build must expose its browser global after module loading');
assert.match(worker, /https:\/\/static\.cloudflareinsights\.com/, 'CSP must allow the intentional Cloudflare beacon');
assert.match(worker, /https:\/\/cloudflareinsights\.com/, 'CSP must allow the Cloudflare analytics endpoint');

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
assert.match(client, /startsWith\('kn-cache-'\)[\s\S]+localStorage\.removeItem/i, 'legacy private browser caches must be erased');
assert.doesNotMatch(client, /file\.type === 'application\/octet-stream'[\s\S]{0,80}return null/, 'generic binary MIME must not bypass upload checks');
assert.equal(await exists('cloudflare/worker.js'), true, 'Cloudflare security-header worker must be provided');
assert.equal(await exists('cloudflare/wrangler.toml.example'), true, 'Cloudflare deployment template must be provided');
assert.match(coreMigration, /create table if not exists public\.profiles/i, 'a clean Supabase project must create profiles before hardening');
assert.match(coreMigration, /create table if not exists public\.blogs/i, 'a clean Supabase project must create core content tables before hardening');
assert.match(privateCircleMigration, /create or replace function public\.is_approved_member\(\)/i, 'membership authorization must be database-backed');
assert.match(privateCircleMigration, /revoke all on public\.blogs[\s\S]+from anon/i, 'anonymous private-content grants must be removed');
assert.match(privateCircleMigration, /security invoker/i, 'search must not bypass private-content RLS');
assert.match(privateCircleMigration, /update storage\.buckets set public = false where id in \('avatars', 'media'\)/i, 'member storage must be private');
assert.match(privateCircleMigration, /create or replace function public\.request_membership/i, 'membership requests must use a trusted database function');
assert.match(removeCountMigration, /drop function if exists public\.community_size\(\)/i, 'fake member-count function must be removed');
assert.match(invitationMigration, /before insert on auth\.users/i, 'invitation codes must be enforced inside the auth signup transaction');
assert.match(invitationMigration, /add column if not exists membership_status/i, 'final invitation hardening must bootstrap membership columns');
assert.match(invitationMigration, /code_hash = extensions\.digest/i, 'invitation codes must be stored and compared as hashes');
assert.match(invitationMigration, /create or replace function public\.begin_invitation/i, 'invitation codes must be verified before showing account creation');
assert.match(invitationMigration, /claim_expires_at[\s\S]+interval '15 minutes'/i, 'invitation claims must expire quickly');
assert.match(invitationMigration, /claim_hash = extensions\.digest/i, 'invitation claims must be stored as hashes');
assert.match(invitations, /rpc\('begin_invitation'/i, 'the invitation screen must verify the code server-side');
assert.match(invitations, /invite_claim/i, 'signup must use the short-lived invitation claim');
assert.doesNotMatch(invitations, /create_invitation|admin-panel/i, 'the public invitation page must not create invitations');
assert.match(invitationMigration, /for update/i, 'single-use invitation redemption must lock the matching row');
assert.match(invitationMigration, /used_at is null/i, 'used invitation codes must be rejected');
assert.match(invitationMigration, /email = lower\(new\.email\)/i, 'invitation codes must be tied to the invited email');
assert.match(profile, /auth\.mfa\.enroll/i, 'profile must support TOTP enrollment');
assert.match(profile, /challengeAndVerify[\s\S]+auth\.mfa\.unenroll/i, 'MFA removal must require a fresh authenticator proof');
assert.match(profile, /rpc\('complete_invited_membership'\)/i, 'verified MFA must complete invited membership server-side');
assert.match(invitationMigration, /auth\.jwt\(\)\s*->>\s*'aal'[\s\S]+aal2/i, 'private membership must require an AAL2 session');
assert.match(invitationMigration, /create trigger secure_blog_insert[\s\S]+handle_blog_insert/i, 'server post controls must be attached to inserts');
assert.match(invitationMigration, /create trigger secure_blog_update[\s\S]+handle_blog_update/i, 'protected post columns must be enforced on updates');
assert.match(invitationMigration, /create trigger secure_comment_insert[\s\S]+handle_comment_insert/i, 'server comment controls must be attached to inserts');
assert.doesNotMatch(worker, /script-src[^"\n]*'unsafe-inline'/i, 'production CSP must reject inline scripts');

console.log('Security and production-readiness checks passed.');
