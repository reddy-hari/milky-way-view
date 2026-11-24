import { describe, expect, it } from "vitest";
import fixture from "./fixtures/horizons.sample.json";
import { interpolatePosition, interpolateVelocity } from "@/lib/astro/interpolate";
import { parseHorizonsVectors } from "@/lib/data/horizons";
import { MOON_DISTANCE_EXAGGERATION, chunkIndexFor, chunkStartMs, displayPositionAu, ephemerisUrl, CHUNK_MS } from "@/lib/scene/solar";
import type { StateSample } from "@/lib/types/astro";

describe("Hermite interpolation", () => {
  it("is exact for a cubic trajectory", () => {
    const f = (t: number) => 2 * t ** 3 - t ** 2 + 3 * t + 1;
    const df = (t: number) => 6 * t ** 2 - 2 * t + 3;
    const samples: StateSample[] = [0, 1, 2].map((t) => [t, f(t), 0, 0, df(t), 0, 0]);
    for (const t of [0, 0.25, 0.5, 1.7, 2]) {
      expect(interpolatePosition(samples, t)![0]).toBeCloseTo(f(t), 10);
    }
  });

  it("never extrapolates outside the sampled window", () => {
    const samples: StateSample[] = [[10, 0, 0, 0, 0, 0, 0], [11, 1, 1, 1, 0, 0, 0]];
    expect(interpolatePosition(samples, 9.99)).toBeNull();
    expect(interpolatePosition(samples, 11.01)).toBeNull();
    expect(interpolatePosition([], 10)).toBeNull();
    expect(interpolateVelocity(samples, 12)).toBeNull();
  });

  it("reproduces a real Horizons mid-point for the Moon from 24 h-spaced samples to < 1e-6 au", () => {
    const s = parseHorizonsVectors(fixture.sampleText); // 12 h samples
    const sparse = [s[0], s[2]]; // drop the middle sample
    const mid = interpolatePosition(sparse, s[1][0])!;
    const err = Math.hypot(mid[0] - s[1][1], mid[1] - s[1][2], mid[2] - s[1][3]);
    expect(err).toBeLessThan(1e-6); // ≈150 km
  });
});

describe("ephemeris chunking", () => {
  it("aligns chunks to fixed windows", () => {
    const t = Date.UTC(2026, 10, 24, 7);
    const i = chunkIndexFor(t);
    expect(chunkStartMs(i)).toBeLessThanOrEqual(t);
    expect(chunkStartMs(i + 1)).toBeGreaterThan(t);
    expect(chunkStartMs(i + 1) - chunkStartMs(i)).toBe(CHUNK_MS);
    expect(ephemerisUrl(i)).toMatch(/^\/api\/ephemeris\?start=\d{4}-\d{2}-\d{2}T00%3A00%3A00Z&days=60&step=12$/);
  });
});

describe("display positions", () => {
  it("exaggerates only the Moon's geocentric offset", () => {
    const pos = { earth: [1, 0, 0] as [number, number, number], moon: [1.0025, 0, 0] as [number, number, number], mars: [1.5, 0, 0] as [number, number, number] };
    expect(displayPositionAu("mars", pos)).toEqual([1.5, 0, 0]);
    expect(displayPositionAu("moon", pos)![0]).toBeCloseTo(1 + 0.0025 * MOON_DISTANCE_EXAGGERATION, 10);
    expect(displayPositionAu("venus", pos)).toBeNull();
  });
});
