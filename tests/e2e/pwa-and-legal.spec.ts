import { expect, test } from "@playwright/test";

test("serves a controlled PWA shell and offline fallback", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  await expect(manifest.json()).resolves.toMatchObject({
    name: "Weyra - le ciel près de toi",
    start_url: "/",
    display: "standalone",
  });

  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(worker.headers()["cache-control"]).toContain("no-cache");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: /Le ciel est toujours là/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/");
});

test("registers the production worker and serves an offline navigation", async ({ context, page }) => {
  test.skip(process.env.PLAYWRIGHT_PWA_PRODUCTION !== "1", "Requires a production Next.js server");

  await page.goto("/");
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      });
    }

    const activeWorker = registration.active;
    if (activeWorker && activeWorker.state !== "activated") {
      await new Promise<void>((resolve) => {
        activeWorker.addEventListener(
          "statechange",
          () => {
            if (activeWorker.state === "activated") resolve();
          },
          { once: false },
        );
      });
    }

    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      scope: registration.scope,
      state: activeWorker?.state ?? null,
      script: activeWorker?.scriptURL ?? null,
    };
  });

  expect(worker).toMatchObject({
    controlled: true,
    state: "activated",
  });
  expect(worker.scope).toMatch(/\/$/);
  expect(worker.script).toMatch(/\/sw\.js$/);

  await context.setOffline(true);
  await page.goto("/pwa-offline-probe", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Le ciel est toujours là/i })).toBeVisible();
  await context.setOffline(false);
});

test("publishes the beta trust documents without changing Atlas", async ({ page }) => {
  await page.goto("/legal");
  await expect(page.getByRole("heading", { name: /Des règles lisibles/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Politique de confidentialité/i })).toBeVisible();

  await page.goto("/legal/confidentialite");
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByText(/Document de pré-bêta/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /CNIL - droits des personnes/i })).toHaveAttribute("href", /cnil\.fr/);
});
