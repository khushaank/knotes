# Knotes

Knotes is a community-driven technology news aggregator and discussion forum. The frontend is a static HTML/JavaScript application, Supabase provides authentication, PostgreSQL, and object storage, and the production site is delivered from GitHub Pages behind Cloudflare.

Production: <https://knotes.dpdns.org>

## Requirements

- Node.js 22 or newer
- npm
- A Supabase project
- A local static HTTP server

## Local setup

```bash
npm ci
cp runtime-config.example.json runtime-config.json
```

Fill `runtime-config.json` with the Supabase project URL and **publishable/anon key**. Never place a service-role key in this repository or in browser code.

Serve the repository root over HTTP; ES modules do not work reliably when pages are opened through `file://`.

```bash
npx serve .
```

Then open the URL printed by `serve`.

## Development commands

```bash
npm test                 # static, renderer, and security regression checks
npm run build            # regenerate assets/css/styles.css
npm audit --audit-level=high
```

Commit generated CSS when Tailwind input changes. GitHub Actions executes the same checks on pull requests and pushes to `main`.

## Runtime configuration

`assets/js/supabaseConfig.js` reads `runtime-config.json`. The publishable Supabase key is public by design; security must come from Row Level Security and restricted database grants. Production configuration can be generated from deployment environment variables:

```bash
SUPABASE_URL=https://project.supabase.co \
SUPABASE_ANON_KEY=your-publishable-key \
node scripts/write-runtime-config.mjs
```

## Database and storage

SQL is under `Supabase/`. New production changes belong in ordered files under `Supabase/migrations/` and should be tested in a staging Supabase project first.

The hardening migration at `Supabase/migrations/20260723_security_hardening.sql`:

- requires authentication for feedback;
- enforces feedback length, ownership, and account rate limits;
- keeps avatar objects private, serves them through one-hour signed URLs, and limits uploads to images up to 2 MiB;
- limits media to images, PDF, TXT, and CSV up to 10 MiB.

Apply migrations with the Supabase CLI or SQL editor only after reviewing the current production schema. Validate any `NOT VALID` constraints after cleaning historical data. Follow [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) for staging, approvals, verification, and recovery.

## Deployment

GitHub Pages does not honor Netlify `_headers` or `netlify.toml`. Knotes therefore includes `cloudflare/worker.js`, which adds browser security headers and correct cache policies at the edge.

1. Copy `cloudflare/wrangler.toml.example` to `cloudflare/wrangler.toml`.
2. Configure the Cloudflare account and route without committing account IDs or tokens.
3. Test the Worker on staging.
4. Deploy it with Wrangler.
5. Verify the live headers with:

```bash
curl -sSI https://knotes.dpdns.org/
curl -sSI https://knotes.dpdns.org/service-worker.js
curl -sSI https://knotes.dpdns.org/dashboard/
```

Expected results include CSP, HSTS, `X-Content-Type-Options`, clickjacking protection, and `no-store` for runtime configuration, the service worker, and dashboard pages.

## Security

Report vulnerabilities using <https://knotes.dpdns.org/.well-known/security.txt>. Do not access data belonging to other users or disrupt the production service while testing.

Security controls include:

- Supabase RLS and least-privilege grants;
- server-side upload and feedback limits;
- DOMPurify for rendered user content;
- strict URL protocol and iframe-origin allowlists;
- automated dependency, static, renderer, and security checks.

Browser-only login throttling is a user-experience guard, not a security boundary. Production should also enable Supabase Auth rate limits, leaked-password protection, and an edge-verified CAPTCHA such as Cloudflare Turnstile.

## Privacy and operations

Review `legal.html` whenever processors, retention, or data flows change. Keep Cloudflare, Supabase, GitHub, DNS, and security-contact access in organization-controlled accounts with multifactor authentication. Enable GitHub branch protection, secret scanning, Dependabot alerts, and required CI checks.

## License

ISC — see [LICENSE](LICENSE).
