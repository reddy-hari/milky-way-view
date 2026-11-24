import type { Vec3 } from "@/lib/astro/coords";
import { colorFromBpRp, type CatalogPoint } from "@/lib/scene/catalog";
import type { PickTargets } from "./ScreenPicker";

const HOST_COLOR: Vec3 = [0.37, 0.92, 0.83]; // teal: known exoplanet host

export interface MarkerArrays extends PickTargets {
  colors: Float32Array;
  sizes: Float32Array;
  byKey: Map<string, Vec3>;
}

/** Pack catalogue points into GPU-ready arrays (one Points draw call) plus a key→position map. */
export function buildMarkerArrays(points: readonly CatalogPoint[], toScene: (p: CatalogPoint) => Vec3, hostScale = 1): MarkerArrays {
  const n = points.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const keys: string[] = new Array(n);
  const byKey = new Map<string, Vec3>();
  points.forEach((p, i) => {
    const s = toScene(p);
    positions.set(s, i * 3);
    keys[i] = p.key;
    byKey.set(p.key, s);
    if (p.kind === "system") {
      colors.set(HOST_COLOR, i * 3);
      sizes[i] = (5 + Math.min(p.planetCount, 7) * 0.7) * hostScale;
    } else {
      colors.set(colorFromBpRp(p.bpRp), i * 3);
      sizes[i] = 3.2;
    }
  });
  return { positions, colors, sizes, keys, byKey };
}
