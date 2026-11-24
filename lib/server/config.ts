import "server-only";

/**
 * Server-side configuration from environment variables. None of these are
 * secrets and none are exposed to the client (no NEXT_PUBLIC_ prefix).
 */
export function serverConfig() {
  const mode = (process.env.DATA_MODE ?? "live").toLowerCase();
  return {
    /** "live" (default) queries upstream services; "sample" uses bundled fixtures / the approximate model only. */
    offline: mode === "sample" || mode === "offline",
    upstreamTimeoutMs: clampInt(process.env.UPSTREAM_TIMEOUT_MS, 1000, 60000, 20000),
  };
}

function clampInt(raw: string | undefined, min: number, max: number, def: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
