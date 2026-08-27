# ADR-0001: Self-hosted Weyra data platform

Status: Accepted

Date: 2026-08-27

## Context

Weyra currently runs its product prototype in local mode. Earlier work introduced optional
Supabase adapters and migrations, but the product decision is now to own the operational data
platform, as already done for Synaura. Weather ingestion must also stay server-side so provider
credentials, licensing rules, caches, and rate limits never reach the browser.

## Decision

Weyra will use an application-owned, self-hosted platform with these boundaries:

- PostgreSQL is the source of truth for accounts, profiles, observations, moderation, social
  content, subscriptions, notifications, sessions, and audit records.
- Browser clients call Weyra's Next.js server API only. They never connect directly to PostgreSQL
  and never receive a privileged database credential.
- Authentication and sessions are owned by Weyra. Passwords use Argon2id; browser sessions use
  rotating, revocable, `HttpOnly`, `Secure`, `SameSite=Lax` cookies with CSRF protection.
- Media bytes live in Weyra-managed storage outside release directories. PostgreSQL stores media
  metadata, ownership, consent, hashes, moderation state, and retention deadlines.
- Realtime delivery uses Weyra-managed SSE or WebSocket gateways fed by a transactional outbox.
  Database writes remain valid even when realtime delivery is temporarily unavailable.
- Background jobs use PostgreSQL-backed queues with leases and `FOR UPDATE SKIP LOCKED` before a
  dedicated broker is justified.
- Schema changes are versioned SQL migrations, reviewed and applied by deployment tooling before
  a release is activated.
- Météo-France and EUMETNET credentials, source archives, and derived radar grids stay in the
  worker/server boundary. Only normalized metadata and generated tiles are public.

Supabase is no longer a deployment target. Existing Supabase code is a legacy adapter and will be
removed only after each feature has an equivalent Weyra repository, to avoid breaking the current
prototype while the self-hosted platform is built.

## Migration phases

1. Introduce the PostgreSQL connection, migration runner, health check, and repository contracts.
2. Implement accounts, sessions, profiles, and security/audit primitives.
3. Move observations, media, reports, moderation, and deletion/export workflows.
4. Move social content, follows, notifications, messages, and realtime outbox delivery.
5. Remove Supabase packages, environment variables, adapters, migrations, and staging scripts.

## Consequences

Weyra gains full control over data location, reliability, privacy, and product behavior, at the
cost of owning backups, upgrades, monitoring, abuse protection, email delivery, and incident
response. Until phase 1 is implemented, production remains in local data mode; this ADR does not
pretend that persistence, authentication, or realtime have already migrated.
