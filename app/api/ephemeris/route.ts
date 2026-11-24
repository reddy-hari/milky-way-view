import { parseEphemerisParams } from "@/lib/api/params";
import { getEphemeris } from "@/lib/server/ephemeris-service";
import { jsonError, jsonOk } from "@/lib/server/http";

/**
 * GET /api/ephemeris?start=2026-01-01T00:00:00Z&days=60&step=12
 * Heliocentric ecliptic-J2000 state vectors (au, au/day; UTC time tags) for the
 * Sun, planets and Moon from JPL Horizons. Falls back to an approximate
 * analytic model (`source.origin === "model"`) when Horizons is unavailable.
 *
 * start: ISO 8601 with timezone (required); days: 1–120 (default 60);
 * step: hours, one of 1, 2, 3, 6, 12, 24 (default 12). Window must lie within
 * 1900–2100 UTC and contain at most 721 samples.
 */
export async function GET(request: Request): Promise<Response> {
  const parsed = parseEphemerisParams(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(400, "invalid_parameter", parsed.message);
  try {
    const data = await getEphemeris(parsed.value);
    return jsonOk(data, data.source.origin === "live" ? 86400 : 60);
  } catch {
    return jsonError(500, "internal_error", "Could not compute ephemeris");
  }
}
