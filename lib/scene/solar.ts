/**
 * Solar System view helpers: body metadata (display only), ephemeris chunking
 * and position lookup. Pure, testable.
 *
 * Display exaggerations (stated in the UI):
 * - Body sizes are not to scale with orbital distances.
 * - The Moon's distance from Earth is multiplied by MOON_DISTANCE_EXAGGERATION.
 */
import { interpolatePosition, interpolateVelocity } from "../astro/interpolate";
import { msToJd, MS_PER_DAY } from "../astro/time";
import type { Vec3 } from "../astro/coords";
import type { EphemerisResponse, SolarBodyId } from "../types/astro";

export const MOON_DISTANCE_EXAGGERATION = 40;

export interface BodyInfo {
  id: SolarBodyId;
  name: string;
  kind: string;
  color: string;
  /** Display radius in au (stylised, not to scale). */
  displayRadiusAu: number;
}

export const BODY_INFO: Record<SolarBodyId, BodyInfo> = {
  sun: { id: "sun", name: "Sun", kind: "Star", color: "#ffd27a", displayRadiusAu: 0.12 },
  mercury: { id: "mercury", name: "Mercury", kind: "Planet", color: "#a9a39c", displayRadiusAu: 0.025 },
  venus: { id: "venus", name: "Venus", kind: "Planet", color: "#e8c98f", displayRadiusAu: 0.035 },
  earth: { id: "earth", name: "Earth", kind: "Planet", color: "#4f8fe8", displayRadiusAu: 0.037 },
  moon: { id: "moon", name: "Moon", kind: "Natural satellite of Earth", color: "#cfcfcf", displayRadiusAu: 0.012 },
  mars: { id: "mars", name: "Mars", kind: "Planet", color: "#d0643c", displayRadiusAu: 0.03 },
  jupiter: { id: "jupiter", name: "Jupiter", kind: "Planet", color: "#d9b38c", displayRadiusAu: 0.11 },
  saturn: { id: "saturn", name: "Saturn", kind: "Planet", color: "#e3d2a0", displayRadiusAu: 0.095 },
  uranus: { id: "uranus", name: "Uranus", kind: "Planet", color: "#9fd8e0", displayRadiusAu: 0.07 },
  neptune: { id: "neptune", name: "Neptune", kind: "Planet", color: "#5f7fe0", displayRadiusAu: 0.07 },
};

/** Client requests ephemeris in fixed, cacheable windows aligned to the Unix epoch. */
export const CHUNK_DAYS = 60;
export const CHUNK_STEP_HOURS = 12;
export const CHUNK_MS = CHUNK_DAYS * MS_PER_DAY;

export const chunkIndexFor = (ms: number) => Math.floor(ms / CHUNK_MS);
export const chunkStartMs = (index: number) => index * CHUNK_MS;

export function ephemerisUrl(index: number): string {
  const start = new Date(chunkStartMs(index)).toISOString().replace(".000Z", "Z");
  return `/api/ephemeris?start=${encodeURIComponent(start)}&days=${CHUNK_DAYS}&step=${CHUNK_STEP_HOURS}`;
}

export interface BodyState {
  /** True heliocentric position, au, ecliptic J2000. */
  positionAu: Vec3;
  velocityAuPerDay: Vec3 | null;
}

/** True (un-exaggerated) heliocentric state of a body at `ms`, or null if outside the data window. */
export function bodyStateAt(data: EphemerisResponse, body: SolarBodyId, ms: number): BodyState | null {
  const samples = data.bodies[body];
  if (!samples) return null;
  const jd = msToJd(ms);
  const p = interpolatePosition(samples, jd);
  if (!p) return null;
  return { positionAu: p, velocityAuPerDay: interpolateVelocity(samples, jd) };
}

/**
 * Display position (au, ecliptic J2000) — identical to the true position except
 * for the Moon, whose geocentric offset is exaggerated for visibility.
 */
export function displayPositionAu(body: SolarBodyId, positions: Partial<Record<SolarBodyId, Vec3>>): Vec3 | null {
  const p = positions[body];
  if (!p) return null;
  if (body !== "moon") return p;
  const e = positions.earth;
  if (!e) return null;
  const k = MOON_DISTANCE_EXAGGERATION;
  return [e[0] + (p[0] - e[0]) * k, e[1] + (p[1] - e[1]) * k, e[2] + (p[2] - e[2]) * k];
}
