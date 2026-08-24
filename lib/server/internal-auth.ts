import "server-only";

import { timingSafeEqual } from "crypto";

function equalSecret(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isRadarMaintenanceRequestAuthorized(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const expected = process.env.WEYRA_RADAR_MAINTENANCE_TOKEN?.trim();
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!expected || !authorization.startsWith("Bearer ")) return false;

  return equalSecret(authorization.slice("Bearer ".length).trim(), expected);
}
