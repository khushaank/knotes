# Production hardening checklist

Repository changes alone do not harden the live service. Complete these steps with organization-controlled accounts and MFA. Do not paste tokens, service-role keys, database passwords, or account identifiers into the repository.

## Approval gate

Cloudflare deployment, Supabase schema/storage changes, credential rotation, DNS changes, and changes to protected GitHub settings require the project's two explicit production approvals. Record both approvals, the operator, timestamp, environment, backup/recovery point, and planned rollback before proceeding.

## 1. Supabase staging

1. Create or refresh an isolated staging project and take a database backup.
2. Compare the staging schema, existing RLS policies, grants, storage buckets, and feedback columns with `Supabase/migrations/20260723_security_hardening.sql`.
3. Check legacy feedback rows for null `name`, `type`, `message`, or `created_at`. The migration deliberately fails closed when those rows need operator-reviewed cleanup.
4. Apply the migration to staging only.
5. Verify:
   - anonymous feedback inserts fail;
   - authenticated users can insert only their own feedback;
   - clients cannot set `created_at` or bypass the limit using an old timestamp;
   - six simultaneous feedback requests result in no more than five accepted rows per account in ten minutes;
   - users cannot select other users' feedback;
   - avatar uploads accept only JPEG, PNG, WebP, and GIF up to 2 MiB;
   - avatars are private and one-hour signed URLs work for the owner;
   - public media accepts only the documented types up to 10 MiB.
6. Validate the four `NOT VALID` feedback constraints after reviewing historical rows.
7. Configure Supabase Auth with a 12-character password minimum, leaked-password protection, appropriate email verification, and server-side Auth rate limits.
8. Add edge-verified Cloudflare Turnstile to signup, login, password reset, and feedback if abuse risk warrants it. Never trust a browser-only CAPTCHA result.
9. Review all existing keys. Rotate any exposed non-publishable credential and update it only in the appropriate secret store.

After staging passes and both production approvals are recorded, back up production, apply the migration during a monitored window, and repeat the checks. A migration error rolls back its transaction; restoration from the pre-change backup is the recovery path for problems discovered after commit.

## 2. Cloudflare staging and production

1. Copy `cloudflare/wrangler.toml.example` to an ignored local `cloudflare/wrangler.toml` and fill account/zone details outside Git.
2. Deploy `cloudflare/worker.js` to a staging hostname.
3. Verify normal pages, redirects, 404 responses, static assets, `HEAD` requests, authentication callbacks, Supabase requests, embedded content, and service-worker upgrades.
4. Confirm CSP, HSTS, `X-Content-Type-Options`, anti-clickjacking, referrer, permissions, COOP, and CORP headers.
5. Confirm `runtime-config.json`, `service-worker.js`, and `/dashboard/` are not cached, and the dashboard carries `noindex` directives.
6. Review Cloudflare logs for CSP or application failures.

After both approvals, deploy the tested Worker version and attach `knotes.dpdns.org/*`. Keep the previous Worker version available for immediate rollback.

## 3. GitHub

1. Push `harden/audit-fixes` and open a pull request; do not push credentials or the local Wrangler configuration.
2. Require the pinned CI workflow to pass before merge.
3. Enable branch protection for `main`: pull requests, required CI, conversation resolution, no force-pushes, and no branch deletion.
4. Enable Dependabot alerts/updates, secret scanning, push protection where available, and least-privilege Actions permissions.
5. Protect deployment environments and require reviewers for production.
6. Review GitHub Pages and custom-domain settings after merge.

## 4. Security contact and DNS

Use the working contact published in `/.well-known/security.txt`. If a branded security mailbox is desired, repair its DNS and mail configuration first, verify inbound delivery, then update `security.html` and `security.txt`. DNS/mail changes require both production approvals.

## 5. Post-deployment verification

- HTTP redirects to HTTPS and TLS is valid.
- Live response headers match the Worker policy.
- No unexpected CSP violations occur.
- Signup, login, logout, reset, and session expiry work.
- Password and rate-limit policies are enforced server-side.
- Upload limits and private avatar access work.
- Feedback ownership and concurrent rate limiting work.
- Runtime configuration and authenticated pages are not cached.
- Service-worker updates activate correctly.
- Main routes, 404 handling, mobile layout, keyboard navigation, labels, focus visibility, and external links work.
- Monitoring and rollback ownership are assigned.
