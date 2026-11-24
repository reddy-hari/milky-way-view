/**
 * Time conversions.
 *
 * Time scales: the app works in UTC throughout (JavaScript `Date` is UTC-based,
 * ignoring leap seconds). Horizons is queried with TIME_TYPE=UT so returned
 * time tags are JD(UT). The ≈69 s difference between UTC and TDB/TT is below
 * what the visualisation can show and is deliberately ignored in the
 * approximate fallback model (documented in the README).
 */

/** Julian Date of the Unix epoch 1970-01-01T00:00:00Z. */
export const JD_UNIX_EPOCH = 2_440_587.5;
/** Julian Date of J2000.0 (2000-01-01T12:00:00 TT; treated as UTC here). */
export const JD_J2000 = 2_451_545.0;
export const MS_PER_DAY = 86_400_000;

export const msToJd = (ms: number): number => ms / MS_PER_DAY + JD_UNIX_EPOCH;
export const jdToMs = (jd: number): number => (jd - JD_UNIX_EPOCH) * MS_PER_DAY;

/** Julian centuries since J2000.0. */
export const julianCenturiesSinceJ2000 = (jd: number): number => (jd - JD_J2000) / 36_525;

/** Supported date range for ephemeris requests (inclusive), as epoch ms. */
export const EPHEMERIS_MIN_MS = Date.UTC(1900, 0, 1);
export const EPHEMERIS_MAX_MS = Date.UTC(2100, 11, 31);

/** Format an epoch ms timestamp as "YYYY-MM-DD HH:MM UTC". */
export function formatUtc(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** Format ms as the value for an <input type="datetime-local">, interpreted as UTC. */
export function toDateTimeLocalUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/** Parse an <input type="datetime-local"> value as UTC. Returns null if invalid. */
export function fromDateTimeLocalUtc(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const ms = Date.parse(`${value}${value.length === 16 ? ":00" : ""}Z`);
  return Number.isFinite(ms) ? ms : null;
}
