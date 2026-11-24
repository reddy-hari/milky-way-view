/**
 * Unit constants and conversions. All constants are IAU / CODATA values.
 */

/** Astronomical unit in kilometres (IAU 2012, exact). */
export const AU_KM = 149_597_870.7;
/** Parsec in astronomical units (648000 / π, exact by IAU 2015 definition). */
export const PC_AU = 648_000 / Math.PI;
/** Parsec in light-years (Julian year). */
export const PC_LY = 3.261_563_777;
/** Seconds per day. */
export const DAY_S = 86_400;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const degToRad = (deg: number): number => deg * DEG2RAD;
export const radToDeg = (rad: number): number => rad * RAD2DEG;

export const pcToLy = (pc: number): number => pc * PC_LY;
export const pcToKpc = (pc: number): number => pc / 1000;
export const pcToAu = (pc: number): number => pc * PC_AU;

/** au/day → km/s */
export const auPerDayToKmPerS = (v: number): number => (v * AU_KM) / DAY_S;

/**
 * Distance in parsecs from a parallax in milliarcseconds (d = 1000 / ϖ).
 * Returns null for non-positive or non-finite parallaxes: a naive inversion is
 * meaningless there and we do not invent a distance.
 */
export function parallaxMasToPc(parallaxMas: number | null | undefined): number | null {
  if (parallaxMas == null || !Number.isFinite(parallaxMas) || parallaxMas <= 0) return null;
  return 1000 / parallaxMas;
}

/** Normalise an angle in degrees to [0, 360). */
export function wrapDeg360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Format RA (degrees) as sexagesimal hours "hh h mm m ss.s s". */
export function formatRa(raDeg: number): string {
  const totalSeconds = (wrapDeg360(raDeg) / 15) * 3600;
  let h = Math.floor(totalSeconds / 3600);
  let m = Math.floor((totalSeconds - h * 3600) / 60);
  let s = Math.round((totalSeconds - h * 3600 - m * 60) * 10) / 10;
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; h = (h + 1) % 24; }
  return `${pad2(h)}h ${pad2(m)}m ${s.toFixed(1).padStart(4, "0")}s`;
}

/** Format Dec (degrees) as sexagesimal "±dd° mm′ ss″". */
export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? "−" : "+";
  const total = Math.abs(decDeg) * 3600;
  let d = Math.floor(total / 3600);
  let m = Math.floor((total - d * 3600) / 60);
  let s = Math.round(total - d * 3600 - m * 60);
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return `${sign}${pad2(d)}° ${pad2(m)}′ ${pad2(s)}″`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a distance in parsecs with a light-year equivalent. */
export function formatDistancePc(pc: number | null): string {
  if (pc == null) return "Distance not available";
  const digits = pc < 10 ? 2 : pc < 100 ? 1 : 0;
  return `${pc.toFixed(digits)} pc (${pcToLy(pc).toFixed(digits)} ly)`;
}
