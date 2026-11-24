/**
 * Approximate (fallback) Solar System positions.
 *
 * Used ONLY when JPL Horizons is unreachable; the UI labels the result as an
 * approximate model, not ephemeris data.
 *
 * Planets: "Keplerian Elements for Approximate Positions of the Major Planets",
 * E. M. Standish (JPL Solar System Dynamics), Table 1 (valid 1800 AD – 2050 AD).
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 * Output frame: heliocentric, ecliptic & equinox of J2000, au.
 * Typical accuracy: arcseconds–arcminutes for the inner planets, up to ~10′ for
 * the outer planets inside the validity window; degrading outside it.
 *
 * Moon: low-precision geocentric series from the Astronomical Almanac
 * (section D, "Low-precision formulae for geocentric coordinates of the Moon"),
 * ≈0.3° in longitude, ≈0.2° in latitude. The series yields ecliptic-of-date
 * coordinates; we subtract general precession in longitude (1.3970°/century)
 * to approximate the J2000 ecliptic.
 *
 * Time: inputs are JD(UTC); the ≈69 s UTC→TDB offset is ignored (negligible at
 * this accuracy).
 */
import type { SolarBodyId, StateSample } from "../types/astro";
import type { Vec3 } from "./coords";
import { DEG2RAD } from "./units";
import { julianCenturiesSinceJ2000 } from "./time";

type PlanetId = Exclude<SolarBodyId, "sun" | "moon" | "earth"> | "emb";

/** [value at J2000, rate per Julian century] */
type Element = readonly [number, number];
interface Elements {
  a: Element; // au
  e: Element; // —
  I: Element; // deg
  L: Element; // mean longitude, deg
  varpi: Element; // longitude of perihelion, deg
  node: Element; // longitude of ascending node, deg
}

/** Standish Table 1 (1800–2050). */
export const STANDISH_ELEMENTS: Record<PlanetId, Elements> = {
  mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], varpi: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
  venus: { a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], varpi: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  emb: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], varpi: [102.93768193, 0.32327364], node: [0, 0] },
  mars: { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], varpi: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
  jupiter: { a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], varpi: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
  saturn: { a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], varpi: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
  uranus: { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], varpi: [170.9542763, 0.40805281], node: [74.01692503, 0.04240589] },
  neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], varpi: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664] },
};

/** Earth/Moon mass ratio (DE440). */
const EARTH_MOON_MASS_RATIO = 81.30056907;
/** Earth equatorial radius, au. */
const EARTH_RADIUS_AU = 6378.137 / 149_597_870.7;

/** Solve Kepler's equation E − e·sin E = M (radians) by Newton iteration. */
export function solveKepler(M: number, e: number, tol = 1e-12): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function elementsAt(id: PlanetId, T: number) {
  const el = STANDISH_ELEMENTS[id];
  const v = (x: Element) => x[0] + x[1] * T;
  return { a: v(el.a), e: v(el.e), I: v(el.I) * DEG2RAD, L: v(el.L) * DEG2RAD, varpi: v(el.varpi) * DEG2RAD, node: v(el.node) * DEG2RAD };
}

/** Rotate orbital-plane coordinates (x′, y′) into the J2000 ecliptic frame. */
function orbitalToEcliptic(xp: number, yp: number, omega: number, node: number, I: number): Vec3 {
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

/** Heliocentric ecliptic-J2000 position (au) of a planet or the Earth–Moon barycentre. */
export function planetPositionAu(id: PlanetId, jd: number): Vec3 {
  const T = julianCenturiesSinceJ2000(jd);
  const { a, e, I, L, varpi, node } = elementsAt(id, T);
  const omega = varpi - node;
  const M = normalizeRad(L - varpi);
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, omega, node, I);
}

/** Geocentric Moon position, ecliptic J2000 (approx.), au. */
export function moonGeocentricAu(jd: number): Vec3 {
  const T = julianCenturiesSinceJ2000(jd);
  const s = (deg: number) => Math.sin(deg * DEG2RAD);
  const c = (deg: number) => Math.cos(deg * DEG2RAD);
  const lambda =
    218.32 + 481267.881 * T +
    6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T) +
    0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T) -
    0.19 * s(357.5 + 35999.05 * T) - 0.11 * s(186.5 + 966404.03 * T) -
    1.396971 * T; // remove precession: of-date → J2000 ecliptic (approx.)
  const beta =
    5.13 * s(93.3 + 483202.02 * T) + 0.28 * s(228.2 + 960400.89 * T) -
    0.28 * s(318.3 + 6003.15 * T) - 0.17 * s(217.6 - 407332.21 * T);
  const parallax =
    0.9508 + 0.0518 * c(135.0 + 477198.87 * T) + 0.0095 * c(259.3 - 413335.36 * T) +
    0.0078 * c(235.7 + 890534.22 * T) + 0.0028 * c(269.9 + 954397.74 * T);
  const r = EARTH_RADIUS_AU / Math.sin(parallax * DEG2RAD);
  const cb = c(beta);
  return [r * cb * c(lambda), r * cb * s(lambda), r * s(beta)];
}

/** Heliocentric ecliptic-J2000 position (au) of any supported body from the approximate model. */
export function approximatePositionAu(body: SolarBodyId, jd: number): Vec3 {
  switch (body) {
    case "sun":
      return [0, 0, 0];
    case "earth":
    case "moon": {
      const emb = planetPositionAu("emb", jd);
      const moon = moonGeocentricAu(jd);
      const f = 1 / (1 + EARTH_MOON_MASS_RATIO);
      const earth: Vec3 = [emb[0] - moon[0] * f, emb[1] - moon[1] * f, emb[2] - moon[2] * f];
      return body === "earth" ? earth : [earth[0] + moon[0], earth[1] + moon[1], earth[2] + moon[2]];
    }
    default:
      return planetPositionAu(body, jd);
  }
}

/** Approximate state sample (velocity by central difference, au/day). */
export function approximateState(body: SolarBodyId, jd: number): StateSample {
  const h = 0.01;
  const p = approximatePositionAu(body, jd);
  const a = approximatePositionAu(body, jd - h);
  const b = approximatePositionAu(body, jd + h);
  return [jd, p[0], p[1], p[2], (b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h), (b[2] - a[2]) / (2 * h)];
}

/**
 * Points along the osculating Keplerian ellipse at `jd` (au, ecliptic J2000).
 * Used only to draw orbit guides; labelled as approximate in the UI.
 */
export function orbitPathAu(body: SolarBodyId, jd: number, segments = 256): Vec3[] {
  if (body === "sun" || body === "moon") return [];
  const id: PlanetId = body === "earth" ? "emb" : body;
  const { a, e, I, varpi, node } = elementsAt(id, julianCenturiesSinceJ2000(jd));
  const omega = varpi - node;
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * 2 * Math.PI;
    pts.push(orbitalToEcliptic(a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), omega, node, I));
  }
  return pts;
}

function normalizeRad(x: number): number {
  const t = 2 * Math.PI;
  let r = x % t;
  if (r > Math.PI) r -= t;
  if (r < -Math.PI) r += t;
  return r;
}
