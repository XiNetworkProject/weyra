# Weyra Freebox deployment

This directory contains templates only. Nothing here modifies Synaura or installs
itself on the Debian VM.

## Release flow

1. A push to `main` runs the ARM64 workflow.
2. TypeScript, Next.js and the standalone radar worker must build successfully.
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
- Web listener: `127.0.0.1:3100`
- Public host: `weyra.cloud` through its own Nginx virtual host
- Services: `weyra.service`, `weyra-radar.service`, `weyra-deploy.service`

Production secrets belong only in `/etc/weyra/weyra.env` and the optional
private-repository token belongs only in `/etc/weyra/weyra-deploy.env`.
Neither file is committed.

The two `NEXT_PUBLIC_SUPABASE_*` values are public client configuration, not
service-role secrets. If Supabase mode is enabled, define the same values as
GitHub Actions repository variables so Next can include them in the browser
bundle, and in `/etc/weyra/weyra.env` for server-side requests. The
`SUPABASE_SECRET_KEY` remains runtime-only and must never enter GitHub Actions.

The bootstrap Nginx template is HTTP-only for initial certificate issuance. The
final template redirects HTTP and `www.weyra.cloud` to the HTTPS apex host,
blocks development radar endpoints, and rate-limits viewport prewarming.
