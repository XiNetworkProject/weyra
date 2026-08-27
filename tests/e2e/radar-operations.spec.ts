import { expect, test } from "@playwright/test";

test("health API exposes safe radar freshness metrics", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const payload = await response.json();

  expect(payload.service).toBe("weyra");
  expect(payload.radar).toBeTruthy();
  expect(payload.radar.latestScan).toHaveProperty("ageSeconds");
  expect(payload.radar.worker).toHaveProperty("responsive");
  expect(JSON.stringify(payload).toLowerCase()).not.toContain("meteogate_api_key");
  expect(JSON.stringify(payload).toLowerCase()).not.toContain("apikey");
});

test("radar status dashboard renders on desktop and mobile", async ({ page }) => {
  await page.goto("/status/radar");
  await expect(page.getByRole("heading", { name: "Sante du radar" })).toBeVisible();
  await expect(page.getByText("Age du scan")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /Actualiser|Verification/ })).toBeVisible();
});
