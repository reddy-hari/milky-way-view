/**
 * Query-parameter validation for the Route Handlers. Pure functions so they can
 * be unit tested; each returns either a typed value or a safe error message.
 */
import { EPHEMERIS_MAX_MS, EPHEMERIS_MIN_MS, MS_PER_DAY } from "../astro/time";
import { STARS_LIMITS } from "../data/gaia";
import type { StarsQuery } from "../types/astro";

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export const EPHEMERIS_LIMITS = {
  days: { min: 1, max: 120, default: 60 },
  stepHours: { allowed: [1, 2, 3, 6, 12, 24] as const, default: 12 },
  maxSamples: 721,
} as const;

export interface EphemerisParams {
  startMs: number;
  stopMs: number;
  days: number;
  stepHours: number;
}

function parseIntParam(raw: string | null, name: string, min: number, max: number, def: number): Parsed<number> {
  if (raw == null || raw === "") return { ok: true, value: def };
  if (!/^-?\d+$/.test(raw)) return { ok: false, message: `"${name}" must be an integer` };
  const n = Number(raw);
  if (n < min || n > max) return { ok: false, message: `"${name}" must be between ${min} and ${max}` };
  return { ok: true, value: n };
}

function parseNumberParam(raw: string | null, name: string, min: number, max: number, def: number): Parsed<number> {
  if (raw == null || raw === "") return { ok: true, value: def };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, message: `"${name}" must be a number` };
  if (n < min || n > max) return { ok: false, message: `"${name}" must be between ${min} and ${max}` };
  return { ok: true, value: n };
}

/** ISO 8601 date-time with explicit UTC ("Z") or offset, or a bare date (treated as 00:00 UTC). */
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

export function parseEphemerisParams(params: URLSearchParams): Parsed<EphemerisParams> {
  const start = params.get("start");
  if (!start) return { ok: false, message: '"start" is required (ISO 8601, e.g. 2026-01-01T00:00:00Z)' };
  if (!ISO_RE.test(start)) return { ok: false, message: '"start" must be an ISO 8601 date-time with a timezone (e.g. 2026-01-01T00:00:00Z)' };
  const startMs = Date.parse(start.length === 10 ? `${start}T00:00:00Z` : start);
  if (!Number.isFinite(startMs)) return { ok: false, message: '"start" is not a valid date' };

  const days = parseIntParam(params.get("days"), "days", EPHEMERIS_LIMITS.days.min, EPHEMERIS_LIMITS.days.max, EPHEMERIS_LIMITS.days.default);
  if (!days.ok) return days;

  const stepRaw = params.get("step");
  const stepHours = stepRaw == null || stepRaw === "" ? EPHEMERIS_LIMITS.stepHours.default : Number(stepRaw);
  if (!(EPHEMERIS_LIMITS.stepHours.allowed as readonly number[]).includes(stepHours)) {
    return { ok: false, message: `"step" must be one of ${EPHEMERIS_LIMITS.stepHours.allowed.join(", ")} (hours)` };
  }

  const samples = (days.value * 24) / stepHours + 1;
  if (samples > EPHEMERIS_LIMITS.maxSamples) {
    return { ok: false, message: `Too many samples (${samples}); increase "step" or reduce "days" (max ${EPHEMERIS_LIMITS.maxSamples})` };
  }

  const stopMs = startMs + days.value * MS_PER_DAY;
  if (startMs < EPHEMERIS_MIN_MS || stopMs > EPHEMERIS_MAX_MS) {
    return { ok: false, message: "Requested window must lie between 1900-01-01 and 2100-12-31 UTC" };
  }
  return { ok: true, value: { startMs, stopMs, days: days.value, stepHours } };
}

export function parseStarsParams(params: URLSearchParams): Parsed<StarsQuery> {
  const p = STARS_LIMITS;
  const minParallax = parseNumberParam(params.get("minParallax"), "minParallax", p.minParallaxMas.min, p.minParallaxMas.max, p.minParallaxMas.default);
  if (!minParallax.ok) return minParallax;
  const limit = parseIntParam(params.get("limit"), "limit", p.limit.min, p.limit.max, p.limit.default);
  if (!limit.ok) return limit;
  return { ok: true, value: { minParallaxMas: minParallax.value, limit: limit.value } };
}
