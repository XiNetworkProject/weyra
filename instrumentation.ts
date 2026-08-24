// Server startup hook (Next.js instrumentation). Kicks the scan-pack builder once at boot so
// Atlas finds ready packs without any browser having to trigger anything.
//
// PRODUCTION NOTE: this startup call and the local maintenance route are only suitable for
// local/dev usage. In production, ensureRadarScanPacks() must run in a permanent worker/cron
// (e.g. every 1-2 minutes) so new OPERA scans are packaged as soon as they are available.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WEYRA_RADAR_MAINTENANCE_MODE === "external") return;

  setTimeout(() => {
    import("@/lib/server/opera-packs")
      .then((packs) => {
        packs.ensureRadarScanPacks();
      })
      .catch((error) => {
        console.warn("[radar pack] startup maintenance unavailable", error);
      });
  }, 2_000);
}
