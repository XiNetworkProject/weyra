import "server-only";

import path from "path";

const configuredCacheRoot = process.env.WEYRA_RADAR_CACHE_DIR?.trim();

// The cache is persistent runtime data, never a build input for Next file tracing.
export const RADAR_CACHE_ROOT = configuredCacheRoot
  ? path.resolve(/* turbopackIgnore: true */ configuredCacheRoot)
  : path.join(/* turbopackIgnore: true */ process.cwd(), ".radar-cache");

export function readBoundedPositiveIntEnv(
  name: string,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}
