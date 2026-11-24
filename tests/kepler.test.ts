import { describe, expect, it } from "vitest";
import fixture from "./fixtures/horizons.sample.json";
import { approximatePositionAu, approximateState, moonGeocentricAu, orbitPathAu, solveKepler } from "@/lib/astro/kepler";
import { msToJd } from "@/lib/astro/time";
import { SOLAR_BODIES, type SolarBodyId } from "@/lib/types/astro";
import { RAD2DEG } from "@/lib/astro/units";

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V) => Math.hypot(...a);
const angleDeg = (a: V, b: V) => Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (norm(a) * norm(b)))) * RAD2DEG;

const jd = msToJd(Date.parse(fixture.epochUtc));
const horizons = fixture.bodies as unknown as Record<SolarBodyId, { position: V }>;

describe("solveKepler", () => {
  it("satisfies Kepler's equation", () => {
    for (const e of [0, 0.0167, 0.2056, 0.6, 0.95]) {
      for (const M of [-3, -1, 0, 0.5, 2, 3.1]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });
});

describe("approximate planetary model vs JPL Horizons (DE441)", () => {
  it.each(SOLAR_BODIES.filter((b) => b !== "sun" && b !== "moon"))("%s heliocentric direction within 0.2° and distance within 1%%", (body) => {
    const approx = approximatePositionAu(body, jd) as V;
    const truth = horizons[body].position;
    expect(angleDeg(approx, truth)).toBeLessThan(0.2);
    expect(Math.abs(norm(approx) - norm(truth)) / norm(truth)).toBeLessThan(0.01);
  });

  it("puts the Sun at the heliocentric origin", () => {
    expect(approximatePositionAu("sun", jd)).toEqual([0, 0, 0]);
  });

  it("Moon geocentric direction within 0.5° and distance within 1%", () => {
    const truth = sub(horizons.moon.position, horizons.earth.position);
    const approx = moonGeocentricAu(jd) as V;
    expect(angleDeg(approx, truth)).toBeLessThan(0.5);
    expect(Math.abs(norm(approx) - norm(truth)) / norm(truth)).toBeLessThan(0.01);
  });

  it("returns velocities of the right magnitude (Earth ≈ 0.0172 au/day)", () => {
    const s = approximateState("earth", jd);
    expect(Math.hypot(s[4], s[5], s[6])).toBeCloseTo(0.0172, 3);
  });

  it("orbit paths are closed ellipses near the semi-major axis", () => {
    const path = orbitPathAu("mars", jd, 64);
    expect(path).toHaveLength(65);
    expect(norm(path[0] as V)).toBeGreaterThan(1.3);
    expect(norm(path[32] as V)).toBeLessThan(1.7);
    expect(orbitPathAu("moon", jd)).toEqual([]);
  });
});
