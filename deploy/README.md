# Weyra Freebox deployment

This directory contains templates only. Nothing here modifies Synaura or installs
itself on the Debian VM.

## Release flow

1. A push to `main` runs the ARM64 workflow.
2. Tests, TypeScript, Next.js, the standalone radar worker, and the ARM64 Météo-France BUFR
   decoder must build successfully.
3. The workflow publishes a checksummed `linux-arm64` artifact under the
   `weyra-edge` prerelease.
4. `weyra-deploy` downloads a new commit into a separate release directory.
5. It creates a release-local Python virtual environment and runs an isolated
   health check on port 3199.
6. Only then does it atomically switch `/srv/apps/weyra/current`, restart the
   independent Weyra services and verify port 3100.
7. A failed health check restores the previous release. Failed and previous
   releases are not deleted automatically.

## Isolation

- Application: `/srv/apps/weyra`
- Secrets: `/etc/weyra`
- Radar cache: `/srv/apps/weyra/shared/radar-cache` on the VM's local ext4 filesystem
- Future media storage: `/srv/apps/weyra/shared/media`, outside immutable releases
- Web listener: `127.0.0.1:3100`
- Public host: `weyra.cloud` through its own Nginx virtual host
- Services: `weyra.service`, `weyra-radar.service`, `weyra-deploy.service`

Production secrets belong only in `/etc/weyra/weyra.env` and the optional
private-repository token belongs only in `/etc/weyra/weyra-deploy.env`.
Neither file is committed.

Supabase is not part of the target deployment architecture. The self-hosted PostgreSQL,
authentication, media, and realtime migration is tracked in ADR-0001. Until it is implemented,
production continues in local data mode; no database secret is compiled into the browser bundle.

The bootstrap Nginx template is HTTP-only for initial certificate issuance. The
final template redirects HTTP and `www.weyra.cloud` to the HTTPS apex host,
blocks development radar endpoints, and rate-limits viewport prewarming.

## Radar operations

- `METEOFRANCE_APPLICATION_ID` is the preferred production credential. It stays server-only and
  lets the worker renew short-lived OAuth tokens automatically.
- Météo-France supplies the official metropolitan France DBZH mosaic; EUMETNET OPERA remains the
  European coverage and fallback source.
- `METEOFRANCE_ACCESS_TOKEN` is a temporary diagnostic fallback only and should be left empty in
  production.
- `/api/health` keeps the deployment health contract and includes a `radar` report.
- `/api/health/radar` is strict and returns HTTP 503 when radar health is critical.
- `/status/radar` displays the same safe operational metrics without exposing credentials.
- The worker writes heartbeat and maintenance snapshots under the shared radar cache.
- Logs are one-line JSON records suitable for `journalctl` collection.
- `WEYRA_RADAR_ALERT_WEBHOOK_URL` optionally receives a payload when health changes.
