# Weyra product roadmap

Last reviewed: 2026-08-27

This file is the shared product and engineering backlog for Weyra. A checked item is only
considered complete after implementation, automated validation, and production verification.

## Current truth

- Atlas, EUMETNET OPERA DBZH tiles, the 12-scan timeline, and atomic Freebox deployments are real.
- Community content is primarily fixture data or browser-local state.
- Production currently runs in `local` data mode. ADR-0001 establishes self-hosted PostgreSQL,
  Weyra-owned sessions, media storage, and realtime delivery as the target platform; Supabase is
  now a legacy adapter pending phased replacement.
- Météo-France Package Radar is integrated server-side as the primary official source over
  metropolitan France. Weyra decodes the real 1 km / 5 minute DBZH BUFR mosaic, while EUMETNET
  OPERA remains the European coverage and upstream fallback. No credentials belong in this file.

## P0 - Before beta

- [~] Restore and continuously measure production radar freshness.
- [~] Add latest scan age, worker state, generation duration, and source-to-pack lag to health checks.
- [~] Prioritize the latest scan and reduce maintenance latency.
- [~] Add structured operational logs, alert hooks, and a radar health dashboard.
- [~] Establish unit, API integration, and Playwright smoke tests.
  Unit coverage, API smoke tests, responsive moderation checks, and a real production PWA offline
  test now run locally and in CI; broader product regression coverage remains.
- [~] Add ESLint and an incremental formatting gate to CI.
- [ ] Build the self-hosted PostgreSQL platform described by ADR-0001, then validate accounts,
      sessions, media, authorization, backups, deletion/export, and realtime with multiple users.
- [~] Make observations server-backed: media upload, server-side location rounding, reporting,
  moderation, deletion, and realtime synchronization.
  Server routes and the standalone moderation console exist, but persistence is still local.
  PostgreSQL repositories, real media storage, multi-account validation, and contributor-side
  media consent remain required.
- [~] Publish terms, privacy notice, community charter, media rights, retention, export, and deletion rules.
  Draft routes exist; publisher identity, final retention choices, and legal review remain required.
- [~] Implement a real PWA: service worker, controlled cache, low-data mode, and offline page.
  The implementation and local production install/offline audit pass; Freebox deployment remains.

## P1 - Community expectations

- [~] Display radar timestamp, freshness, source, cadence, and coverage wherever radar is shown.
  Atlas, scan-pack metadata, and the radar health page now expose the active provider, timestamp,
  native resolution, attribution, and coverage; mobile/product-wide consistency remains to audit.
- [ ] Keep observed radar and forecast products strictly separated.
- [ ] Add lightning, satellite, official stations, and personal weather stations.
- [ ] Add configurable heavy-rain, storm, and lightning alerts, separate from official warnings.
- [ ] Provide a simple "Will it rain here soon?" mode and a distinct expert mode.
- [ ] Keep the map dominant and the animation controls compact.
- [ ] Add favorite places, watched areas, thresholds, and local summaries.
- [ ] Link every observation to its map position, time, phenomena, media, and weather event.
- [ ] Implement contextual trust, progressive moderation, appeals, and an audit trail.
- [ ] Treat startup speed, freshness, and graceful degradation as product features.

## P2 - Product depth

- [ ] Multi-model forecasts, run comparison, ensembles, and uncertainty.
- [ ] Radar, satellite, lightning, and observation archives with event replay.
- [ ] Wind, gust, temperature, snow, hail, and air-quality layers.
- [ ] Realtime Storm Rooms for significant weather episodes.
- [ ] Contributor profiles, geographic subscriptions, and event collections.
- [ ] Complete localization, units, and country-specific sources.
- [ ] Keyboard, screen-reader, contrast, and textual map accessibility.
- [ ] Anonymous, privacy-preserving community statistics.

## Technical debt

- [ ] Split `AtlasApp.tsx`, `AtlasMap.tsx`, and `CommunityExperience.tsx` into owned feature modules.
- [ ] Consolidate the four global stylesheets and their roughly 21,000 lines of layered CSS.
- [ ] Remove disabled RainViewer routes and references.
- [ ] Visually distinguish real data, local heuristics, and demonstration content.
- [ ] Never present heuristic nowcasts or local signals as official forecasts or warnings.
- [ ] Remove the legacy Supabase adapters and migrations after equivalent self-hosted repositories exist.

## Community research references

- Radar source transparency: https://community.windy.com/topic/41448/data-sources-for-radar
- Observations versus forecast separation: https://community.windy.com/topic/31367/recent-changes-2024/2
- Location-based rain and storm alerts: https://community.windy.com/topic/40542/how-to-activate-your-live-storm-and-heavy-rain-alerts
- Map-first interface feedback: https://community.windy.com/topic/44331/i-want-the-old-design-back/2
- Reliability and speed discussions: https://www.reddit.com/r/meteorology/comments/1o0rwtb/best_meteorology_apps/
