import { describe, expect, it } from "vitest";
import {
  isObservationId,
  parseObservationModeration,
  parseObservationReport,
  parseObservationSubmission,
  roundObservationCoordinate,
  toObservationApiCategory,
} from "../../lib/observation-api";

const now = new Date("2026-08-26T12:00:00.000Z");

function validForm() {
  const form = new FormData();
  form.set("id", "d8f4dcb8-a082-4a8c-a8a5-4b6f10a38114");
  form.set("nickname", "Camille");
  form.set("primaryCategory", "orage");
  form.set("phenomena", JSON.stringify(["orage", "foudre", "grêle", "foudre"]));
  form.set("intensity", "4");
  form.set("details", "Cellule active vers le nord-est.");
  form.set("latitude", "50.632987");
  form.set("longitude", "3.057321");
  form.set("place", "Lille");
  form.set("expiresAt", "2026-08-26T15:00:00.000Z");
  form.set("rightsConfirmed", "true");
  return form;
}

describe("observation API contract", () => {
  it("normalizes phenomena and rounds public coordinates on the server contract", () => {
    const result = parseObservationSubmission(validForm(), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.phenomena).toEqual(["orage", "foudre", "grele"]);
    expect(result.value.latitude).toBe(50.633);
    expect(result.value.longitude).toBe(3.057);
    expect(result.value.locationPrecisionM).toBe(150);
    expect(result.value.expiresAt).toBe("2026-08-26T15:00:00.000Z");
    expect(result.value.rightsConfirmed).toBe(true);
  });

  it("rejects invalid categories, intensity and coordinates together", () => {
    const form = validForm();
    form.set("primaryCategory", "pluie");
    form.set("intensity", "7");
    form.set("latitude", "98");
    const result = parseObservationSubmission(form, now);

    expect(result).toEqual({
      ok: false,
      code: "invalid_observation",
      issues: ["primaryCategoryNotInPhenomena", "intensity", "latitude"],
    });
  });

  it("rejects expired and excessively long-lived observations", () => {
    const expired = validForm();
    expired.set("expiresAt", "2026-08-26T11:00:00.000Z");
    const tooLong = validForm();
    tooLong.set("expiresAt", "2026-08-28T12:00:00.000Z");

    expect(parseObservationSubmission(expired, now)).toMatchObject({ ok: false, issues: ["expiresAt"] });
    expect(parseObservationSubmission(tooLong, now)).toMatchObject({ ok: false, issues: ["expiresAt"] });
  });

  it("validates report categories and lengths", () => {
    expect(parseObservationReport({ category: "privacy", details: "Position sensible" })).toEqual({
      ok: true,
      value: { category: "privacy", details: "Position sensible" },
    });
    expect(parseObservationReport({ category: "unknown", details: "x" })).toEqual({
      ok: false,
      code: "invalid_report",
      issues: ["category"],
    });
    expect(parseObservationReport(null)).toEqual({
      ok: false,
      code: "invalid_report",
      issues: ["body"],
    });
  });

  it("requires an explicit moderation decision and reason", () => {
    expect(parseObservationModeration({ decision: "approve", reason: "Image et position cohérentes." })).toEqual({
      ok: true,
      value: { decision: "approve", reason: "Image et position cohérentes." },
    });
    expect(parseObservationModeration({ decision: "publish", reason: "x" })).toEqual({
      ok: false,
      code: "invalid_moderation",
      issues: ["decision", "reason"],
    });
    expect(parseObservationModeration(undefined)).toEqual({
      ok: false,
      code: "invalid_moderation",
      issues: ["body"],
    });
  });

  it("exposes deterministic identifiers and category conversion helpers", () => {
    expect(isObservationId("d8f4dcb8-a082-4a8c-a8a5-4b6f10a38114")).toBe(true);
    expect(isObservationId("not-a-uuid")).toBe(false);
    expect(roundObservationCoordinate(-1.23456)).toBe(-1.235);
    expect(toObservationApiCategory("grêle")).toBe("grele");
  });
});
