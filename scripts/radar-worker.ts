import { getScanPackMaintenanceStatus, ensureRadarScanPacks } from "../lib/server/opera-packs";

const pollSeconds = Math.max(30, Math.min(600, Number(process.env.WEYRA_RADAR_POLL_SECONDS) || 90));
let stopping = false;

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function requestStop() {
  stopping = true;
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function runMaintenanceCycle() {
  ensureRadarScanPacks();

  while (!stopping) {
    const snapshot = getScanPackMaintenanceStatus();
    if (!snapshot.running) {
      if (snapshot.errors.length > 0) {
        console.warn(`[radar worker] cycle completed with ${snapshot.errors.length} error(s)`);
      } else {
        console.info(`[radar worker] cycle completed packs=${snapshot.packsReady}`);
      }
      return;
    }
    await sleep(5_000);
  }
}

async function main() {
  console.info(`[radar worker] started poll=${pollSeconds}s`);
  while (!stopping) {
    await runMaintenanceCycle();
    if (!stopping) await sleep(pollSeconds * 1_000);
  }
  console.info("[radar worker] stopped");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[radar worker] fatal: ${message.slice(0, 500)}`);
  process.exitCode = 1;
});
