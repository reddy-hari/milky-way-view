/**
 * Cubic Hermite interpolation of state-vector samples.
 *
 * Horizons returns positions *and* velocities at each sample, so a cubic
 * Hermite spline reproduces both exactly at the nodes and is smooth between
 * them. With 12-hour sampling the interpolation error is far below what the
 * visualisation can show (even for the Moon).
 */
import type { StateSample } from "../types/astro";
import type { Vec3 } from "./coords";

/**
 * Interpolate position (same units as the samples) at Julian Date `jd`.
 * Samples must be sorted by time. Returns null outside the sampled range —
 * we never extrapolate ephemeris data.
 */
export function interpolatePosition(samples: readonly StateSample[], jd: number): Vec3 | null {
  const n = samples.length;
  if (n === 0) return null;
  if (n === 1) return samples[0][0] === jd ? [samples[0][1], samples[0][2], samples[0][3]] : null;
  if (jd < samples[0][0] || jd > samples[n - 1][0]) return null;

  // Binary search for the interval [lo, lo + 1] containing jd.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= jd) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const h = b[0] - a[0];
  if (h <= 0) return [a[1], a[2], a[3]];
  const s = (jd - a[0]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = h00 * a[1 + k] + h10 * h * a[4 + k] + h01 * b[1 + k] + h11 * h * b[4 + k];
  }
  return out;
}

/** Linear interpolation of velocity (au/day) — adequate for display of speed. */
export function interpolateVelocity(samples: readonly StateSample[], jd: number): Vec3 | null {
  const n = samples.length;
  if (n === 0 || jd < samples[0][0] || jd > samples[n - 1][0]) return null;
  let i = 0;
  while (i < n - 2 && samples[i + 1][0] <= jd) i++;
  const a = samples[i];
  const b = samples[Math.min(i + 1, n - 1)];
  const h = b[0] - a[0];
  const s = h > 0 ? (jd - a[0]) / h : 0;
  return [a[4] + (b[4] - a[4]) * s, a[5] + (b[5] - a[5]) * s, a[6] + (b[6] - a[6]) * s];
}
