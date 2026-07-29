# Production hardening checklist

Repository changes alone do not harden the live service. Complete these steps with organization-controlled accounts and MFA. Do not paste tokens, service-role keys, database passwords, or account identifiers into the repository.

## Approval gate

Cloudflare deployment, Supabase schema/storage changes, credential rotation, DNS changes, and changes to protected GitHub settings require the project's two explicit production approvals. Record both approvals, the operator, timestamp, environment, backup/recovery point, and planned rollback before proceeding.

## 1. Supabase staging

1. Create or refresh an isolated staging project and take a database backup.
2. Compare the staging schema, existing RLS policies, grants, storage buckets, and feedback columns with `Supabase/migrations/20260723_security_hardening.sql` and `Supabase/migrations/20260728_private_circle.sql`.
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
   - private media accepts only images up to 10 MiB;
   - owners can read unused uploads, while other AAL2 members can read only media referenced by a published post.
6. Validate the four `NOT VALID` feedback constraints after reviewing historical rows.
7. Configure Supabase Auth with a 12-character password minimum, leaked-password protection, appropriate email verification, and server-side Auth rate limits.
8. Apply `Supabase/migrations/20260729_secure_invitations.sql`, then enable email signups in Supabase Auth. The database trigger rejects every signup without a valid, email-bound, unexpired invitation claim; do not enable signups before this migration succeeds. Create codes only in the Supabase SQL editor with `select private.create_invitation('person@example.com', 7);` and send the returned code once through a trusted channel.
9. Enable TOTP enrollment and verification in Supabase Auth. Verify that an invited AAL1 account can access only its own profile, becomes approved only after TOTP verification, and loses private access whenever its session is below AAL2. Factor removal is intentionally unavailable in the member UI.
10. Review every existing profile. Legacy `is_admin` flags are not trusted by the final admin check until an operator explicitly verifies `approved_by`; all other existing accounts remain pending until invited and MFA-verified.
11. Add edge-verified Cloudflare Turnstile to login, password reset, and membership requests if abuse risk warrants it. Never trust a browser-only CAPTCHA result.
12. Review all existing keys. Rotate any exposed non-publishable credential and update it only in the appropriate secret store.

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

1. Make the repository private unless public source is an explicit, documented decision. Push a `codex/` branch and open a pull request; do not push credentials, `runtime-config.json`, or the local Wrangler configuration.
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
- Invitation, login, MFA, logout, reset, and session expiry work.
- Anonymous, pending, approved, suspended, moderator, administrator, AAL1, and AAL2 test accounts receive exactly their intended database and storage access.
- Password and rate-limit policies are enforced server-side.
- Upload limits, signed media access, unpublished-upload isolation, and private avatar access work.
- Feedback ownership and concurrent rate limiting work.
- Runtime configuration and authenticated pages are not cached.
- Service-worker updates activate correctly.
- Main routes, 404 handling, mobile layout, keyboard navigation, labels, focus visibility, and external links work.
- Monitoring and rollback ownership are assigned.
