# Operations and recovery

## Deployment verification

Before each deployment, resolve the Compose configuration and verify it:

- `node scripts/verify-deployment.mjs online`
- `node scripts/verify-deployment.mjs airgap`
- `./kritt airgap verify` for the stricter air-gap network and credential check.

Apply database migrations twice against a disposable database before release. The
migration sequence is additive and must remain idempotent.

## Evidence and report handling

- Reports are rendered only from immutable assessment snapshots.
- PDF, DOCX, and XLSX downloads are SHA-256 recorded as artifact metadata.
- Keep the database, report downloads, and Docker/offline-bundle inventory on
  operator-controlled encrypted storage.
- Do not place credentials, raw tokens, or unrelated personal data in scope,
  authorization, action, or audit fields.

## Recovery

1. Stop services if an authorization, deployment mode, or evidence issue is suspected.
2. Preserve the PostgreSQL volume and engine data directory for investigation.
3. Restart services; incomplete engine work is designed to be reviewed rather than automatically resumed.
4. Re-run deployment verification and review assessment audit events before creating a new run.

## Local model controls

- Air-gap local models require an explicit internal HTTP(S) service hostname and model ID.
- Loopback endpoints are rejected because they resolve inside the backend/engine container, not the intended provider.
- Air-gap local model selection rejects cloud credentials to prevent fallback.
- This configuration does not enable target operations or external network access.