/**
 * Builds renderable point sets from catalogue data. Pure functions: no React,
 * no three.js, so they are unit-testable and cheap to memoise.
 *
 * Positions are stored in heliocentric Galactic cartesian parsecs (Z-up), then
 * converted to scene units per view:
 * - Nearby view: 1 scene unit = 1 pc, Sun at origin.
 * - Galaxy view: 1 scene unit = 1 kpc, Galactic Centre at origin, Sun at (−R₀, 0, 0).
 */
import { R0_KPC, equatorialToGalacticCartesianPc, galacticPcToGalactocentricKpc, zUpToScene, type Vec3 } from "../astro/coords";
import type { CatalogStar, ExoplanetSystem } from "../types/astro";

export type CatalogKind = "system" | "star";

export interface CatalogPoint {
  key: string;
  kind: CatalogKind;
  id: string;
  name: string;
  distancePc: number | null;
  /** Confirmed planets in this dataset (0 for Gaia stars without a matched host). */
  planetCount: number;
  /** Heliocentric Galactic cartesian, pc (Z-up). */
  galacticPc: Vec3;
  /** Gaia BP−RP colour, if known (for tinting). */
  bpRp: number | null;
}

export interface CatalogBuild {
  points: CatalogPoint[];
  /** Host systems that could not be placed because RA/Dec/distance is missing. */
  unplacedSystems: number;
  /** Gaia stars hidden because they are the same object as a listed host system. */
  mergedStars: number;
}

export const systemKey = (id: string) => `system:${id}`;
export const starKey = (id: string) => `star:${id}`;

export function buildCatalogPoints(systems: readonly ExoplanetSystem[], stars: readonly CatalogStar[]): CatalogBuild {
  const points: CatalogPoint[] = [];
  let unplacedSystems = 0;
  const hostGaiaIds = new Set<string>();

  for (const s of systems) {
    if (s.gaiaDr3Id) hostGaiaIds.add(s.gaiaDr3Id);
    const pos = equatorialToGalacticCartesianPc(s.raDeg, s.decDeg, s.distancePc.value);
    if (!pos) {
      unplacedSystems++;
      continue;
    }
    points.push({
      key: systemKey(s.id),
      kind: "system",
      id: s.id,
      name: s.name,
      distancePc: s.distancePc.value,
      planetCount: s.planets.length,
      galacticPc: pos,
      bpRp: null,
    });
  }

  let mergedStars = 0;
  for (const st of stars) {
    if (hostGaiaIds.has(st.id)) {
      mergedStars++;
      continue;
    }
    const pos = equatorialToGalacticCartesianPc(st.raDeg, st.decDeg, st.distancePc);
    if (!pos) continue;
    points.push({
      key: starKey(st.id),
      kind: "star",
      id: st.id,
      name: st.name,
      distancePc: st.distancePc,
      planetCount: 0,
      galacticPc: pos,
      bpRp: st.bpRp,
    });
  }
  return { points, unplacedSystems, mergedStars };
}

export interface PointFilter {
  hostsOnly: boolean;
  /** Maximum distance from the Sun in pc (Infinity for no limit). */
  maxDistancePc: number;
}

export function filterPoints(points: readonly CatalogPoint[], f: PointFilter): CatalogPoint[] {
  return points.filter((p) => (!f.hostsOnly || p.kind === "system") && (p.distancePc ?? Infinity) <= f.maxDistancePc);
}

/** Scene position for the nearby (pc) view. */
export const localScenePosition = (p: CatalogPoint): Vec3 => zUpToScene(p.galacticPc);

/** Scene position for the galaxy (kpc) view. */
export const galaxyScenePosition = (p: CatalogPoint): Vec3 => zUpToScene(galacticPcToGalactocentricKpc(p.galacticPc));

/** The Sun in galaxy-view scene coordinates. */
export const SUN_GALAXY_SCENE: Vec3 = zUpToScene([-R0_KPC, 0, 0]);

/**
 * A small prioritised set of systems to label by default (avoids clutter):
 * nearest hosts first, ties broken by planet count.
 */
export function prioritizedLabels(points: readonly CatalogPoint[], max = 8): CatalogPoint[] {
  return points
    .filter((p) => p.kind === "system")
    .sort((a, b) => (a.distancePc ?? Infinity) - (b.distancePc ?? Infinity) || b.planetCount - a.planetCount)
    .slice(0, max);
}

/** Approximate star colour from Gaia BP−RP (blue-white → orange-red). Returns linear RGB 0..1. */
export function colorFromBpRp(bpRp: number | null): Vec3 {
  if (bpRp == null) return [0.75, 0.78, 0.85];
  const t = Math.min(1, Math.max(0, (bpRp + 0.2) / 3.5));
  return [0.65 + 0.35 * Math.min(1, t * 2), 0.75 - 0.25 * t, 1.0 - 0.75 * t];
}
