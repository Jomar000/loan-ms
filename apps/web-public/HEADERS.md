# Security Headers

The repository owns the web application's security headers. Wrangler reads
`static/_headers`, copies it into the static build, and applies its rules to
static asset responses. This file remains the source of truth. Do not
hand-maintain duplicate Cloudflare dashboard rules; use the optional API mirror
below when edge-managed headers are required.

## Active HTTP Headers

The `/*` rule in `static/_headers` applies this baseline:

| Header                       | Value                                                          | Purpose                                                                                                 |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`    | `frame-ancestors 'none'; upgrade-insecure-requests;`           | Prevents framing and upgrades insecure document requests. The remaining CSP is generated at build time. |
| `X-Frame-Options`            | `DENY`                                                         | Retains legacy clickjacking protection alongside `frame-ancestors`.                                     |
| `X-Content-Type-Options`     | `nosniff`                                                      | Prevents MIME-type sniffing.                                                                            |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`                              | Sends full referrers only to the same origin and omits referrers on downgrade.                          |
| `Permissions-Policy`         | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Disables browser capabilities the application does not use.                                             |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups`                                     | Isolates unrelated opener contexts while preserving trusted cross-origin popup workflows.               |
| `X-XSS-Protection`           | `0`                                                            | Disables obsolete browser XSS auditors in favor of CSP.                                                 |

`Cross-Origin-Opener-Policy` can affect `window.opener` and cross-window
communication. Keep popup, authentication, and payment-style flows in browser
regression coverage.

## Content Security Policy

SvelteKit uses hash mode in `svelte.config.js` and emits the resource-loading
policy as an early CSP meta element. The HTTP header supplies
`frame-ancestors`, which CSP does not support in a meta policy, plus
`upgrade-insecure-requests`. Browsers enforce both policies together.

| Directive                      | Effective source policy                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `default-src`                  | `'none'`                                                                                    |
| `base-uri`                     | `'none'`                                                                                    |
| `connect-src`                  | `'self'`, Cloudflare Web Analytics, and validated build-time API, WebSocket, and R2 origins |
| `font-src`                     | `'self'`                                                                                    |
| `form-action`                  | `'self'`                                                                                    |
| `frame-src`                    | `'self'`, Cloudflare Turnstile, and YouTube                                                 |
| `img-src`                      | `'self'`, `blob:`, `data:`, and YouTube thumbnails                                          |
| `manifest-src`                 | `'self'`                                                                                    |
| `media-src`                    | `'self'`, `blob:`, `data:`, and `mediastream:`                                              |
| `object-src`                   | `'none'`                                                                                    |
| `script-src`                   | `'self'`, Cloudflare Turnstile, Cloudflare Web Analytics, and SvelteKit-generated hashes    |
| `script-src-attr`              | `'none'`                                                                                    |
| `style-src` / `style-src-elem` | `'self'`                                                                                    |
| `style-src-attr`               | `'unsafe-inline'` for application-generated style attributes only                           |
| `worker-src`                   | `'self'` and `blob:`                                                                        |

Do not add `unsafe-inline` or `unsafe-eval` to script policy. A `strict-dynamic`
or Trusted Types migration requires separate compatibility work for third-party
scripts.

## Cloudflare Configuration

Keep Cloudflare's **Add security headers** Managed Transform disabled. As of
August 2026 it injects values such as `X-XSS-Protection: 1; mode=block`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, and obsolete
`Expect-CT`, which do not match this repository baseline.

### Optional API Mirror

The Node orchestrator under `scripts/cloudflare/` mirrors the committed
`_headers` policies into profile-scoped Response Header Transform Rules through
cURL. Its shared JSON policy is an enforced mirror, not a second source of
truth; run
`pnpm test:cloudflare-headers` whenever either policy changes.

Create a zone-scoped API token with **Zone > Transform Rules > Edit** and
**Zone > Managed Headers > Edit** access. Supply it only through
`CLOUDFLARE_API_TOKEN`; never commit it or pass it on the command line.

The supported profiles and their Cloudflare rule names are:

| Target                  | Rule name                     | Match                 |
| ----------------------- | ----------------------------- | --------------------- |
| `public=<hostname>`     | `Public Security Headers`     | Exact `http.host`     |
| `backoffice=<hostname>` | `BackOffice Security Headers` | Exact `http.host`     |
| `global`                | `Global Security Headers`     | All incoming requests |

From the repository root, inspect a shared zone without changing it:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<zone-scoped-token>'
node ./scripts/cloudflare/configure-security-headers.mjs `
    --zone-id '<32-character-zone-id>' `
    --target 'public=www.example.com' `
    --target 'backoffice=admin.example.com'
```

Apply the reviewed plan by adding both explicit flags:

```powershell
node ./scripts/cloudflare/configure-security-headers.mjs `
    --zone-id '<32-character-zone-id>' `
    --target 'public=www.example.com' `
    --target 'backoffice=admin.example.com' `
    --apply `
    --acknowledge-zone-wide-disable
```

For separate zones, invoke the same orchestrator once per zone and include only
the profile hosted by that zone:

```bash
export CLOUDFLARE_API_TOKEN='<zone-scoped-token>'
node ./scripts/cloudflare/configure-security-headers.mjs \
  --zone-id '<public-zone-id>' \
  --target 'public=www.example.com'
node ./scripts/cloudflare/configure-security-headers.mjs \
  --zone-id '<backoffice-zone-id>' \
  --target 'backoffice=admin.example.com'
```

To match every incoming request in a zone, use the Global profile without a
hostname:

```bash
node ./scripts/cloudflare/configure-security-headers.mjs \
  --zone-id '<zone-id>' \
  --target global
```

The command is read-only unless `--apply` is present. It creates or patches only
rules with its stable `loanms_security_headers_*` references, preserves every
unrelated rule, verifies all target rules, and then disables only the
`add_security_headers` Managed Transform. That Managed Transform setting is
zone-wide: every hostname in the zone loses Cloudflare's managed baseline, so
include every application hostname that depends on the replacement headers or
use the Global profile or separate zones. The script requires
`--acknowledge-zone-wide-disable` for this reason.

The committed Wrangler configuration serves static assets with
`run_worker_first = false`. If a future deployment generates responses in
Worker code, `_headers` will not cover those responses and the Worker must set
the required headers itself.

## Deferred Headers

| Header                         | Status                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Strict-Transport-Security`    | Deferred until the live hostname and HTTPS inventory is audited. Start with host-only `max-age=2592000`; review `includeSubDomains` and `preload` separately. |
| `Cross-Origin-Resource-Policy` | Deferred until same-site-only consumption of static assets becomes an explicit contract.                                                                      |
| `Cross-Origin-Embedder-Policy` | Not planned because it can break Turnstile, YouTube, and other cross-origin resources without a cross-origin-isolation requirement.                           |

## Validation References

- [W3C Content Security Policy Level 3](https://www.w3.org/TR/CSP/)
- [MDN CSP implementation guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP)
- [Cloudflare Workers static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Cloudflare Managed Transforms reference](https://developers.cloudflare.com/rules/transform/managed-transforms/reference/)
- [Cloudflare Managed Transforms API](https://developers.cloudflare.com/api/resources/managed_transforms/methods/edit/)
- [Cloudflare Response Header Transform Rules API](https://developers.cloudflare.com/rules/transform/response-header-modification/create-api/)
- [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory)
- [Google CSP Evaluator](https://csp-evaluator.withgoogle.com/)
