import { expect, test } from "@playwright/test";

test("Atlas switches physical layers, exposes incomplete windows and ignores an old response", async ({ page }) => {
  const timestamp = "2026-09-13T12:00:00Z";
  const coverage = { west: -6, south: 40, east: 12, north: 55 };
  const pack = (product: string) => ({
    timestamp,
    key: "2026-09-13T120000Z-mf",
    status: "ready",
    product,
    version: "layers-v1",
    provider: "Météo-France",
    attribution: "Source : Météo-France",
    coverage,
    tileSize: 256,
    minZoom: 3,
    maxZoom: 8,
    tileCount: 100,
    unit: product === "reflectivity" ? "dBZ" : "mm",
    durationMinutes: product === "reflectivity" ? null : 60,
    intervalStart: product === "reflectivity" ? null : "2026-09-13T11:00:00Z",
  });
  await page.route("**/tiles.openfreemap.org/styles/dark", (route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );
  const transparent = Buffer.from("UklGRiIAAABXRUJQVlA4TBUAAAAv/8A/EAcQEREAUKT//ymi/6n//QcA", "base64");
  await page.route("**/api/radar/layers/*/*/*/*/*", (route) =>
    route.fulfill({ contentType: "image/webp", body: transparent }),
  );
  await page.route("**/api/radar/opera/packs", (route) =>
    route.fulfill({ json: { ok: true, packs: [], maintenance: { running: true } } }),
  );
  let delay = false;
  let unblock: (() => void) | undefined;
  let started: (() => void) | undefined;
  await page.route("**/api/radar/layers", async (route) => {
    if (delay) {
      started?.();
      await new Promise<void>((resolve) => {
        unblock = resolve;
      });
    }
    await route
      .fulfill({
        json: {
          ok: true,
          errors: [],
          layers: {
            reflectivity: { packs: [pack("reflectivity")], receivedSamples: 0, expectedSamples: null },
            "accumulation-1h": { packs: [pack("accumulation-1h")], receivedSamples: 12, expectedSamples: 12 },
            "accumulation-3h": { packs: [], receivedSamples: 12, expectedSamples: 36 },
          },
        },
      })
      .catch(() => {});
  });
  await page.goto("/?vue=atlas");
  await page.getByRole("button", { name: "Afficher les couches", exact: true }).click();
  await page.getByRole("button", { name: /Réflectivité Les échos/ }).click();
  await expect(page.getByLabel("Échelle en dBZ", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Cumuls de pluie La quantité/ }).click();
  await expect(page.getByLabel("Échelle en mm", { exact: true })).toBeVisible();
  await expect(page.getByText("CUMUL DE PLUIE · 1 H", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "3 h", exact: true }).click();
  await expect(page.locator(".radar-layer-notice")).toContainText("60 min reçues sur 3 h");
  await expect(page.getByRole("button", { name: "Lire les images radar" })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "3 h", exact: true })).toBeInViewport();
  delay = true;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.getByRole("button", { name: /Réflectivité Les échos/ }).click();
  await waiting;
  const resumed = page.waitForResponse("**/api/radar/opera/packs");
  await page.getByRole("button", { name: /Précipitations La pluie/ }).click();
  unblock?.();
  await resumed;
  await expect(page.getByText("RADAR DES PRÉCIPITATIONS", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Échelle en dBZ", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Précipitations La pluie/ })).toHaveAttribute("aria-pressed", "true");
});
