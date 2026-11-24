/**
 * ILLUSTRATIVE Milky Way model for the galaxy overview.
 *
 * These points are NOT stars and NOT catalogue data. They are a procedural
 * sketch of the Galaxy's broad structure, loosely guided by published values:
 * - Sun–centre distance R₀ = 8.2 kpc (GRAVITY Collaboration 2019, rounded)
 * - central bar half-length ≈ 4–5 kpc, angle ≈ 27° to the Sun–centre line
 *   (e.g. Wegg, Gerhard & Portail 2015)
 * - four major logarithmic arms, pitch angle ≈ 12° (e.g. Vallée 2017)
 * - disc scale height ≈ 0.3 kpc, stellar disc radius ≈ 15 kpc
 * Arm placement is schematic. The Galaxy rotates clockwise as seen from the
 * North Galactic Pole, so arms are drawn trailing.
 *
 * Output: galactocentric, Z-up, kpc (convert with zUpToScene before rendering).
 */
import { R0_KPC } from "../astro/coords";

export interface GalaxyModel {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}

/** Deterministic PRNG so the model is identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGalaxyModel(count = 60000, seed = 42): GalaxyModel {
  const rand = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const pitch = (12 * Math.PI) / 180;
  const k = Math.tan(pitch);
  const barAngle = Math.PI - (27 * Math.PI) / 180; // relative to +X axis, Sun at φ = 180°
  const armStarts = [0, 0.5 * Math.PI, Math.PI, 1.5 * Math.PI].map((a) => a + barAngle);
  const rStart = 3.6;

  for (let i = 0; i < count; i++) {
    const r0 = rand();
    let x: number, y: number, z: number;
    let c: [number, number, number];
    let size: number;

    if (r0 < 0.2) {
      // Bulge + bar: elongated Gaussian along the bar axis.
      const a = gauss() * 1.9, b = gauss() * 0.75;
      z = gauss() * 0.35;
      x = a * Math.cos(barAngle) - b * Math.sin(barAngle);
      y = a * Math.sin(barAngle) + b * Math.cos(barAngle);
      c = [1.0, 0.82 + rand() * 0.08, 0.55 + rand() * 0.1];
      size = 1.2 + rand() * 1.4;
    } else if (r0 < 0.82) {
      // Spiral arms (trailing logarithmic spirals).
      const arm = Math.floor(rand() * 4);
      const turn = rand() * 1.55 * Math.PI;
      const r = rStart * Math.exp(k * turn);
      const phi = armStarts[arm] + turn;
      const spread = 0.25 + 0.05 * r;
      x = r * Math.cos(phi) + gauss() * spread;
      y = r * Math.sin(phi) + gauss() * spread;
      z = gauss() * 0.12;
      const hii = rand() < 0.04;
      c = hii ? [1.0, 0.55, 0.7] : [0.62 + rand() * 0.2, 0.72 + rand() * 0.15, 1.0];
      size = hii ? 2.2 : 0.9 + rand() * 1.3;
    } else {
      // Diffuse exponential disc (scale length ≈ 3 kpc).
      const r = Math.min(16, -3 * Math.log(Math.max(rand(), 1e-6)) + 1);
      const phi = rand() * 2 * Math.PI;
      x = r * Math.cos(phi);
      y = r * Math.sin(phi);
      z = gauss() * 0.3;
      c = [0.75, 0.75, 0.8];
      size = 0.7 + rand() * 0.8;
    }

    positions.set([x, y, z], i * 3);
    colors.set(c, i * 3);
    sizes[i] = size;
  }
  return { positions, colors, sizes, count };
}

export const GALAXY_MODEL_LABEL =
  "Illustrative model — procedural bar, bulge and spiral arms; not catalogued stars.";
export { R0_KPC };
