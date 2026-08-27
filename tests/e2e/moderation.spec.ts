import { expect, test } from "@playwright/test";

test("shows a safe unavailable state when moderation storage is not configured", async ({ page }) => {
  await page.route("**/api/moderation/observations?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "supabase_not_configured", issues: [] }),
    }),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/moderation/observations");
  await expect(page.getByRole("heading", { name: "Accès indisponible" })).toBeVisible();
  await expect(page.getByText(/backend auto-hébergé de Weyra n’est pas encore configuré/i).first()).toBeVisible();

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
});

test("blocks publication until attached media rights are confirmed", async ({ page }) => {
  await page.route("**/api/moderation/observations?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        observations: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            authorId: "00000000-0000-4000-8000-000000000002",
            nickname: "Compte de test",
            primaryCategory: "orage",
            phenomena: ["orage", "foudre"],
            intensity: 4,
            details: "Observation utilisée uniquement par le test automatisé.",
            latitude: 50.633,
            longitude: 3.057,
            locationPrecisionM: 150,
            place: "Lille",
            createdAt: "2026-08-26T12:00:00.000Z",
            expiresAt: null,
            media: {
              url: null,
              mimeType: "image/webp",
              rightsConfirmed: false,
              status: "pending",
            },
          },
        ],
      }),
    }),
  );

  await page.goto("/moderation/observations");
  const reason = page.getByPlaceholder("Motif interne obligatoire");
  await reason.fill("Droits du média à confirmer");

  await expect(page.getByText(/Publication bloquée/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publier" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rejeter" })).toBeEnabled();
});
