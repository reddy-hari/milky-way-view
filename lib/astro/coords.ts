/**
 * Coordinate transforms.
 *
 * Frames used in this app (never mixed without an explicit function below):
 *
 * 1. ICRS equatorial (RA, Dec, distance) — catalogue inputs (Exoplanet Archive, Gaia).
 * 2. Galactic cartesian, heliocentric — X toward the Galactic Centre (l=0, b=0),
 *    Y toward l=90° (direction of Galactic rotation), Z toward the North
 *    Galactic Pole. Obtained from ICRS with the standard Hipparcos/Gaia
 *    rotation matrix (ESA 1997, Vol. 1 §1.5.3; Gaia DR3 documentation §4.1.7).
 * 3. Galactocentric (simplified) — Galactic cartesian translated so the
 *    Galactic Centre is the origin and the Sun sits at (−R₀, 0, 0). We ignore
 *    the Sun's ≈20 pc height above the plane and the small tilt correction;
 *    adequate for a visual overview, not for kinematics.
 * 4. Ecliptic J2000 heliocentric — Horizons output (X toward the J2000 equinox,
 *    Z toward the ecliptic north pole). Used only in the Solar System view.
 *
 * Scene axes: three.js is Y-up. Every frame above is Z-up, so we map
 * (x, y, z) → (x, z, −y). This is a proper rotation (det = +1), so handedness
 * and orbital sense are preserved.
 */
import { DEG2RAD, RAD2DEG, wrapDeg360 } from "./units";

export type Vec3 = [number, number, number];

/** Sun–Galactic Centre distance used for the overview model, kpc (rounded GRAVITY 2019: 8.178 kpc). */
export const R0_KPC = 8.2;

/** Unit vector (or scaled by distance) from spherical equatorial coordinates. */
export function sphericalToCartesian(lonDeg: number, latDeg: number, r = 1): Vec3 {
  const lon = lonDeg * DEG2RAD;
  const lat = latDeg * DEG2RAD;
  const c = Math.cos(lat);
  return [r * c * Math.cos(lon), r * c * Math.sin(lon), r * Math.sin(lat)];
}

/** Inverse of sphericalToCartesian. Longitude in [0, 360). */
export function cartesianToSpherical([x, y, z]: Vec3): { lonDeg: number; latDeg: number; r: number } {
  const r = Math.hypot(x, y, z);
  if (r === 0) return { lonDeg: 0, latDeg: 0, r: 0 };
  return {
    lonDeg: wrapDeg360(Math.atan2(y, x) * RAD2DEG),
    latDeg: Math.asin(Math.max(-1, Math.min(1, z / r))) * RAD2DEG,
    r,
  };
}

/**
 * ICRS → Galactic rotation matrix A_G′ (rows are the Galactic axes expressed
 * in ICRS). Source: Hipparcos catalogue Vol. 1, eq. 1.5.11; reproduced in the
 * Gaia DR3 documentation.
 */
export const ICRS_TO_GALACTIC: readonly [Vec3, Vec3, Vec3] = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

function mulMat3(m: readonly [Vec3, Vec3, Vec3], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** ICRS cartesian → Galactic cartesian (same units, heliocentric). */
export function icrsToGalactic(v: Vec3): Vec3 {
  return mulMat3(ICRS_TO_GALACTIC, v);
}

/** (RA, Dec) in degrees → Galactic (l, b) in degrees. */
export function equatorialToGalactic(raDeg: number, decDeg: number): { lDeg: number; bDeg: number } {
  const g = cartesianToSpherical(icrsToGalactic(sphericalToCartesian(raDeg, decDeg)));
  return { lDeg: g.lonDeg, bDeg: g.latDeg };
}

/**
 * Heliocentric Galactic cartesian position (in parsecs) of an object at
 * (RA, Dec, distance). Returns null when any input is missing — we never
 * invent a distance.
 */
export function equatorialToGalacticCartesianPc(
  raDeg: number | null,
  decDeg: number | null,
  distancePc: number | null,
): Vec3 | null {
  if (raDeg == null || decDeg == null || distancePc == null) return null;
  if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg) || !Number.isFinite(distancePc) || distancePc < 0) return null;
  return icrsToGalactic(sphericalToCartesian(raDeg, decDeg, distancePc));
}

/** Heliocentric Galactic cartesian (pc) → simplified galactocentric (kpc), Sun at (−R₀, 0, 0). */
export function galacticPcToGalactocentricKpc([x, y, z]: Vec3, r0Kpc = R0_KPC): Vec3 {
  return [x / 1000 - r0Kpc, y / 1000, z / 1000];
}

/** Map any Z-up frame to three.js Y-up scene axes: (x, y, z) → (x, z, −y). */
export function zUpToScene([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

/** Inverse of zUpToScene. */
export function sceneToZUp([x, y, z]: Vec3): Vec3 {
  return [x, -z, y];
}
