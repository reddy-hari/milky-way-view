/**
 * JPL Horizons adapter (pure parts: request building and response parsing).
 *
 * Request choices (documented in the UI too):
 * - EPHEM_TYPE=VECTORS, VEC_TABLE=2 → geometric position + velocity, no aberration.
 * - CENTER=500@10 → Sun body centre (heliocentric, not barycentric).
 * - REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF → "Ecliptic of J2000.0" axes.
 * - OUT_UNITS=AU-D → positions in au, velocities in au/day.
 * - TIME_TYPE=UT → input and output time tags are UT (UTC after 1962), so the
 *   returned JD column is JDUT and maps directly onto JavaScript Dates.
 * - CSV_FORMAT=YES for robust parsing between $$SOE / $$EOE markers.
 *
 * API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html (no key required).
 */
import type { SolarBodyId, StateSample } from "../types/astro";

export const HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const HORIZONS_SOURCE_NAME = "JPL Horizons (DE441 ephemeris)";
export const HORIZONS_SOURCE_URL = "https://ssd.jpl.nasa.gov/horizons/";

export const HORIZONS_BODY_IDS: Record<SolarBodyId, string> = {
  sun: "10",
  mercury: "199",
  venus: "299",
  earth: "399",
  moon: "301",
  mars: "499",
  jupiter: "599",
  saturn: "699",
  uranus: "799",
  neptune: "899",
};

export const EPHEMERIS_FRAME = {
  center: "Sun body centre (Horizons 500@10)",
  plane: "Ecliptic of J2000.0",
  reference: "ICRF",
  positionUnit: "au",
  velocityUnit: "au/day",
  timeScale: "UTC (Horizons TIME_TYPE=UT; JDUT time tags)",
} as const;

export class HorizonsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HorizonsParseError";
  }
}

/** Horizons accepts "YYYY-MM-DD HH:MM" calendar strings. */
export function horizonsTime(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function buildHorizonsUrl(body: SolarBodyId, startMs: number, stopMs: number, stepHours: number): URL {
  const url = new URL(HORIZONS_API_URL);
  const p = url.searchParams;
  p.set("format", "json");
  p.set("COMMAND", HORIZONS_BODY_IDS[body]);
  p.set("OBJ_DATA", "NO");
  p.set("MAKE_EPHEM", "YES");
  p.set("EPHEM_TYPE", "VECTORS");
  p.set("VEC_TABLE", "2");
  p.set("CENTER", "500@10");
  p.set("REF_PLANE", "ECLIPTIC");
  p.set("REF_SYSTEM", "ICRF");
  p.set("OUT_UNITS", "AU-D");
  p.set("CSV_FORMAT", "YES");
  p.set("TIME_TYPE", "UT");
  p.set("START_TIME", horizonsTime(startMs));
  p.set("STOP_TIME", horizonsTime(stopMs));
  p.set("STEP_SIZE", `${stepHours} h`);
  return url;
}

/**
 * Parse the `result` text of a Horizons VECTORS/CSV response into samples.
 * Throws HorizonsParseError with a safe message when the text contains no
 * ephemeris block (Horizons reports most errors in-band as text).
 */
export function parseHorizonsVectors(result: string): StateSample[] {
  if (typeof result !== "string") throw new HorizonsParseError("Horizons returned no result text");
  const start = result.indexOf("$$SOE");
  const end = result.indexOf("$$EOE");
  if (start < 0 || end < 0 || end < start) {
    const hint = /no ephemeris|not available|cannot|error/i.exec(result)?.[0];
    throw new HorizonsParseError(hint ? `Horizons reported: ${hint}` : "Horizons response contained no ephemeris table");
  }
  if (!/JDUT/.test(result.slice(0, start))) {
    throw new HorizonsParseError("Horizons table is not in UT time tags");
  }
  const samples: StateSample[] = [];
  for (const line of result.slice(start + 5, end).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const f = trimmed.split(",").map((s) => s.trim());
    // JDUT, Calendar date, X, Y, Z, VX, VY, VZ, (trailing empty)
    const nums = [f[0], f[2], f[3], f[4], f[5], f[6], f[7]].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) throw new HorizonsParseError("Malformed Horizons vector row");
    samples.push(nums as StateSample);
  }
  if (samples.length === 0) throw new HorizonsParseError("Horizons ephemeris table was empty");
  return samples;
}

/** Parse the JSON envelope ({ result } or { error }) returned by the Horizons API. */
export function parseHorizonsEnvelope(json: unknown): StateSample[] {
  const env = json as { result?: unknown; error?: unknown };
  if (env && typeof env.error === "string") throw new HorizonsParseError(`Horizons error: ${env.error.slice(0, 200)}`);
  if (!env || typeof env.result !== "string") throw new HorizonsParseError("Unexpected Horizons response envelope");
  return parseHorizonsVectors(env.result);
}
