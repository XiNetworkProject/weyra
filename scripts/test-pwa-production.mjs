import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const playwrightBin = require.resolve("@playwright/test/cli");
const host = "127.0.0.1";
const port = Number(process.env.WEYRA_PWA_TEST_PORT ?? 3101);
const baseURL = `http://${host}:${port}`;
const commonEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  WEYRA_RADAR_MAINTENANCE_MODE: "external",
  WEYRA_RADAR_CACHE_DIR: ".e2e-radar-cache",
};

function runNode(args, env = commonEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with ${signal ?? `exit code ${code ?? "unknown"}`}.`));
    });
  });
}

async function waitForHealth(server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Production server stopped before becoming healthy.");
    try {
      const response = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the production health endpoint.");
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5_000).then(() => {
      if (server.exitCode === null) server.kill("SIGKILL");
    }),
  ]);
}

if (process.env.WEYRA_PWA_SKIP_BUILD !== "1") {
  await runNode([nextBin, "build"]);
}

const server = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", String(port)], {
  env: commonEnv,
  stdio: "inherit",
});

try {
  await waitForHealth(server);
  await runNode(
    [
      playwrightBin,
      "test",
      "tests/e2e/pwa-and-legal.spec.ts",
      "--project=chromium",
      "--grep=registers the production worker",
    ],
    {
      ...commonEnv,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_EXTERNAL_SERVER: "1",
      PLAYWRIGHT_PWA_PRODUCTION: "1",
    },
  );
} finally {
  await stopServer(server);
}
