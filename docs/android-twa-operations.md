# Android/TWA deployment and operations

This runbook covers the Website API, Admin, renderer, and the existing TWA Builder
service. Do not change or redeploy `core/bagdja-twa-builder` as part of the
Website rollout unless that is separately approved.

## Deployment configuration

Configure these values in the production secret manager/deployment environment,
not in Git or a browser:

| Variable | Requirement |
|---|---|
| `CLIENT_APP_ID` | Registered Website Builder service caller in Bagdja Auth and allowed by TWA Builder. |
| `CLIENT_APP_SECRET` | Secret for the registered service caller. |
| `TWA_BUILDER_URL` | Root HTTPS URL for the running Builder API; no credentials, path, query, or fragment. |
| `WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY` | Canonical base64 encoding of exactly 32 random bytes. Generate with `openssl rand -base64 32`. |
| `WEBSITE_ANDROID_APPS_ENABLED` | Set to `true` only for an approved rollout. Defaults to disabled in production and enabled outside production. |
| `PLATFORM_HOST` | Hostname only (no scheme/port), matching `NEXT_PUBLIC_PLATFORM_URL` in the renderer deployment. |
| `BAGDJA_AUTH_API` / `BAGDJA_AUTH_URL` | Reachable Auth endpoint used to obtain the Builder service token. |
| `BAGDJA_STORAGE_API` | Reachable Storage service used for private keystores and public app images. |

Production startup fails if the service caller, HTTPS Builder URL, encryption key,
or platform hostname is missing or invalid. Deploy the API only after all these
values are set. Configuration, keystore upload, and build mutations return
`503` in production until `WEBSITE_ANDROID_APPS_ENABLED=true`; read-only
configuration/history remains available. Keep database `synchronize` disabled;
schema changes are applied through reviewed SQL migrations.

The Admin must use the same Website API environment and the renderer's
`NEXT_PUBLIC_PLATFORM_URL` must agree with API `PLATFORM_HOST`. Confirm service
network access in each environment; do not use production URLs or credentials in
local development.

## Database migration procedure

1. Review the exact migration SQL and take/verify a database backup.
2. Check `_bagdja_migrations` and Supabase migration history against the actual
   schema before applying anything. The custom runner cannot infer which older
   migrations were applied manually before its ledger existed.
3. Reconcile historical ledger state in a reviewed operation. Do not run the
   full runner against an existing database with an empty or incomplete ledger.
4. Run the reviewed migration from a controlled release environment using
   `npm run db:migrate:only`; this skips `seed.sql`.
5. Verify the migration ledger and expected columns/indexes, then deploy the
   API. Never use `db:reset` or `db:push` as a production migration shortcut.

No production migration has been run by this implementation.

The Android build-admission migration adds durable, website-scoped request
records. It is required before enabling builds on an environment that does not
already have the table.

The Android app assets / Play signing migration adds per-website icon and splash
image references plus Google Play App Signing fingerprints. Apply it before
using those Admin settings.

## Signing-key and encryption-key recovery

- The website owner must retain a secure backup of the original `.jks`, `.p12`,
  or `.pfx` and its alias/passwords. Re-upload the same signing key to restore
  release signing. Replacing it changes the certificate fingerprint; keep both
  fingerprints active during app/key migration and retire the old fingerprint
  only when the old app population no longer needs it.
- Losing a website keystore can prevent publishing updates accepted by Android
  for an already distributed package. The platform cannot recover the key.
- Back up `WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY` in the secret manager's
  recovery process. Replacing it without decrypting and re-encrypting every
  stored password makes existing encrypted passwords unreadable. Rotation is
  not an environment-variable-only operation; plan a versioned re-encryption
  migration or have each affected website re-upload its keystore credentials.
- Never log, place in tickets, or include in client-side storage the keystore,
  passwords, encryption key, Builder token, or signed artifact URL.
- Website Android app icons and splash images are uploaded to public Storage
  URLs so the TWA Builder can fetch them. Do not upload private or sensitive
  images. The running Builder's `ICON_ALLOWED_HOSTS` must allow the public
  Storage hostname; use a specific host allowlist rather than a wildcard where
  possible. Website API changes do not modify Builder configuration.

## Artifacts, monitoring, and rollout gates

- Builder history retains the Builder's configured recent jobs; artifact URLs
  are temporary (currently 15 minutes). Admin obtains a fresh URL through the
  tenant-scoped Website API immediately before download.
- Website API admits at most one active build per website and five newly
  accepted build requests per website in a rolling hour. Reusing the same
  idempotency key does not consume another request. Keys are retained for 24
  hours; after that, reusing one is treated as a new request. During that
  window, a retry returns the recorded job instead of enqueueing another; if
  Builder history has already pruned that job, the API returns a conflict.
  Database row locking enforces these limits across API instances. The
  existing Builder's global worker concurrency remains independently
  configured (default 2).
- Monitor failed jobs and Builder/Auth/Storage connectivity through service
  logs and health checks. Do not log signed URLs or signing data.
- Do not enable general tenant rollout until the build-admission migration is
  applied and the intended pilot availability/feature gate is approved.
- Verify the running Builder's trusted-origin configuration before release.
  The current Builder may include global Auth/login/payment origins; the
  Website-only origin decision remains unresolved and must not be represented
  as verified.
- Staging sign-off requires debug APK, release APK and release AAB; package and
  fingerprint checks; artifact download; DAL verification on a platform
  subdomain and a verified custom domain; role and tenant-isolation checks;
  and installation on an Android device confirming TWA behavior.

Staging/production deployment, migration execution, live connectivity checks,
and artifact/device testing require authorized non-production credentials and
operator approval. Do not perform those steps against production from a local
development session.
