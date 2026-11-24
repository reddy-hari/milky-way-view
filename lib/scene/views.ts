/**
 * View modes, camera poses and selection keys shared by the scene and the UI.
 *
 * Each mode is a *separate* scene with its own unit — there is no single
 * physical scale in which planets are visible at galaxy scale.
 */
import type { Vec3 } from "../astro/coords";
import type { SolarBodyId } from "../types/astro";
import { SUN_GALAXY_SCENE } from "./catalog";

export type ViewMode = "galaxy" | "local" | "solar";

export const VIEW_ORDER: ViewMode[] = ["galaxy", "local", "solar"];

export interface ViewInfo {
  label: string;
  unit: string;
  scaleNote: string;
  minDistance: number;
  maxDistance: number;
  near: number;
  far: number;
}

export const VIEWS: Record<ViewMode, ViewInfo> = {
  galaxy: {
    label: "Milky Way",
    unit: "1 unit = 1 kiloparsec",
    scaleNote: "Galaxy structure is an illustrative model. Exoplanet host markers are catalogue positions, enlarged for visibility.",
    minDistance: 0.05,
    maxDistance: 90,
    near: 0.001,
    far: 1000,
  },
  local: {
    label: "Nearby stars",
    unit: "1 unit = 1 parsec (3.26 ly)",
    scaleNote: "Distances are to scale (linear, parsecs). Marker sizes are stylised and not star sizes.",
    minDistance: 0.3,
    maxDistance: 4000,
    near: 0.01,
    far: 50000,
  },
  solar: {
    label: "Solar System",
    unit: "1 unit = 1 au",
    scaleNote: "Orbital distances are to scale; body sizes are enlarged and the Moon's distance from Earth is exaggerated ×40.",
    minDistance: 0.05,
    maxDistance: 400,
    near: 0.001,
    far: 5000,
  },
};

export interface Pose {
  position: Vec3;
  target: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const DEFAULT_POSES: Record<ViewMode, Pose> = {
  galaxy: { target: [0, 0, 0], position: [4, 24, 22] },
  local: { target: [0, 0, 0], position: [0, 22, 38] },
  solar: { target: [0, 0, 0], position: [0, 14, 24] },
};

/** Pose used when zooming "into" the Sun from a mode (exit downwards / entry upwards). */
export const CLOSE_POSES: Record<ViewMode, Pose> = {
  galaxy: { target: SUN_GALAXY_SCENE, position: add(SUN_GALAXY_SCENE, [0, 0.12, 0.2]) },
  local: { target: [0, 0, 0], position: [0, 0.25, 0.45] },
  solar: { target: [0, 0, 0], position: [0, 0.3, 0.5] },
};

/** Pose used when zooming "out" of a mode (exit upwards / entry downwards). */
export const FAR_POSES: Record<ViewMode, Pose> = {
  galaxy: { target: [0, 0, 0], position: [8, 60, 60] },
  local: { target: [0, 0, 0], position: [0, 600, 1000] },
  solar: { target: [0, 0, 0], position: [0, 150, 260] },
};

/** Exit pose for leaving `from` towards `to`, and entry pose for arriving in `to`. */
export function transitionPoses(from: ViewMode, to: ViewMode): { exit: Pose; entry: Pose } {
  const down = VIEW_ORDER.indexOf(to) > VIEW_ORDER.indexOf(from);
  return down ? { exit: CLOSE_POSES[from], entry: FAR_POSES[to] } : { exit: FAR_POSES[from], entry: CLOSE_POSES[to] };
}

export type Selection =
  | { kind: "system"; id: string }
  | { kind: "star"; id: string }
  | { kind: "body"; id: SolarBodyId };

export const selectionKey = (s: Selection): string => `${s.kind}:${s.id}`;

export function parseSelectionKey(key: string): Selection | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if (kind === "system" || kind === "star") return { kind, id };
  if (kind === "body") return { kind, id: id as SolarBodyId };
  return null;
}

export interface CameraApi {
  orbit(deltaAzimuthRad: number, deltaPolarRad: number): void;
  zoom(factor: number): void;
  flyTo(pose: Pose, durationMs: number, onDone?: () => void): void;
  jumpTo(pose: Pose): void;
  /** Fly so that `target` is centred at the given viewing distance. */
  focus(target: Vec3, distance: number, onDone?: () => void): void;
}
