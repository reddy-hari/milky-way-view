import { describe, expect, it } from "vitest";
import exoFixture from "@/lib/data/fixtures/exoplanets.sample.json";
import gaiaFixture from "@/lib/data/fixtures/gaia.sample.json";
import horizonsFixture from "./fixtures/horizons.sample.json";
import { buildExoplanetQuery, normalizeExoplanetRows, num, str } from "@/lib/data/exoplanets";
import { buildGaiaQuery, normalizeGaiaTap } from "@/lib/data/gaia";
import { HorizonsParseError, buildHorizonsUrl, parseHorizonsEnvelope, parseHorizonsVectors } from "@/lib/data/horizons";
import { buildCatalogPoints, filterPoints, prioritizedLabels, systemKey } from "@/lib/scene/catalog";

describe("value coercion", () => {
  it("keeps missing values missing", () => {
    expect(num(null)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    expect(num("1.5")).toBe(1.5);
    expect(num(0)).toBe(0);
    expect(str("  ")).toBeNull();
    expect(str(5)).toBeNull();
    expect(str(" HD 1 ")).toBe("HD 1");
  });
});

describe("Exoplanet Archive normalisation", () => {
  it("queries only the needed pscomppars columns", () => {
    const q = buildExoplanetQuery();
    expect(q).toMatch(/^select .* from pscomppars$/);
    expect(q).toContain("hostname");
    expect(q).toContain("sy_dist");
    expect(q).not.toContain("*");
  });

  it("groups planets by host and preserves nulls", () => {
    const rows = [
      { pl_name: "X b", hostname: "X", pl_letter: "b", ra: 10, dec: -5, sy_dist: 12.5, sy_disterr1: 0.1, sy_disterr2: -0.2, sy_pnum: 2, pl_orbper: 3.2, pl_rade: null },
      { pl_name: "X c", hostname: "X", pl_letter: "c", ra: 10, dec: -5, sy_dist: 12.5, sy_pnum: 2, pl_orbper: null, st_spectype: "M5 V" },
      { pl_name: "Y b", hostname: "Y", ra: 20, dec: 5, sy_dist: null },
      { pl_name: "orphan" },
      null,
    ];
    const { systems, planetCount, skipped } = normalizeExoplanetRows(rows);
    expect(planetCount).toBe(3);
    expect(skipped).toBe(2);
    expect(systems.map((s) => s.id)).toEqual(["X", "Y"]); // sorted by distance, missing last
    const x = systems[0];
    expect(x.planets.map((p) => p.letter)).toEqual(["b", "c"]);
    expect(x.distancePc).toEqual({ value: 12.5, errPlus: 0.1, errMinus: 0.2 });
    expect(x.spectralType).toBe("M5 V"); // filled from a later row
    expect(x.planets[0].radiusEarth).toBeNull();
    expect(x.planets[1].orbitalPeriodDays).toBeNull();
    expect(systems[1].distancePc.value).toBeNull(); // never invented
  });

  it("rejects non-array responses", () => {
    expect(() => normalizeExoplanetRows({ error: "x" })).toThrow(TypeError);
  });

  it("normalises the real fixture", () => {
    const { systems, planetCount } = normalizeExoplanetRows(exoFixture.rows);
    expect(planetCount).toBe(exoFixture.rows.length);
    const trappist = systems.find((s) => s.id === "TRAPPIST-1")!;
    expect(trappist.planets).toHaveLength(7);
    expect(trappist.distancePc.value).toBeGreaterThan(12);
    expect(trappist.distancePc.value).toBeLessThan(13);
  });
});

describe("Gaia normalisation", () => {
  it("builds a bounded ADQL query", () => {
    const q = buildGaiaQuery({ minParallaxMas: 40, limit: 3000 });
    expect(q).toContain("SELECT TOP 3000");
    expect(q).toContain("parallax > 40");
    expect(q).toContain("designation");
    expect(() => buildGaiaQuery({ minParallaxMas: Number.NaN, limit: 1 })).toThrow(RangeError);
  });

  it("maps columns by metadata and drops rows with incomplete astrometry", () => {
    const json = {
      metadata: [{ name: "ra" }, { name: "dec" }, { name: "designation" }, { name: "parallax" }, { name: "bp_rp" }],
      data: [
        [10, 20, "Gaia DR3 1", 100, 1.2],
        [10, 20, "Gaia DR3 2", null, 1.2],
        [10, 20, "Gaia DR3 3", -5, null],
      ],
    };
    const stars = normalizeGaiaTap(json);
    expect(stars.map((s) => s.id)).toEqual(["Gaia DR3 1", "Gaia DR3 3"]);
    expect(stars[0].distancePc).toBe(10);
    expect(stars[1].distancePc).toBeNull(); // negative parallax: no distance
    expect(stars[0].gMag).toBeNull(); // column absent
  });

  it("rejects malformed responses", () => {
    expect(() => normalizeGaiaTap({})).toThrow(TypeError);
    expect(() => normalizeGaiaTap({ metadata: [{ name: "ra" }], data: [] })).toThrow(/missing required columns/);
  });

  it("normalises the real fixture", () => {
    const stars = normalizeGaiaTap(gaiaFixture);
    expect(stars.length).toBe(gaiaFixture.data.length);
    expect(stars.every((s) => s.parallaxMas > 80 && s.distancePc! < 12.5)).toBe(true);
    expect(stars[0].refEpoch).toBe(2016);
  });
});

describe("Horizons parsing", () => {
  it("requests heliocentric ecliptic vectors in UT", () => {
    const u = buildHorizonsUrl("mars", Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2), 12);
    expect(u.searchParams.get("COMMAND")).toBe("499");
    expect(u.searchParams.get("CENTER")).toBe("500@10");
    expect(u.searchParams.get("REF_PLANE")).toBe("ECLIPTIC");
    expect(u.searchParams.get("OUT_UNITS")).toBe("AU-D");
    expect(u.searchParams.get("TIME_TYPE")).toBe("UT");
    expect(u.searchParams.get("START_TIME")).toBe("2026-01-01 00:00");
    expect(u.searchParams.get("STEP_SIZE")).toBe("12 h");
  });

  it("parses a real vector table", () => {
    const s = parseHorizonsVectors(horizonsFixture.sampleText);
    expect(s).toHaveLength(3);
    expect(s[0][0]).toBe(2461368.5);
    expect(s[0][1]).toBeCloseTo(horizonsFixture.bodies.moon.position[0], 12);
    expect(s[1][0] - s[0][0]).toBeCloseTo(0.5, 9);
  });

  it("reports in-band errors safely", () => {
    expect(() => parseHorizonsVectors("Cannot find object 'foo'")).toThrow(HorizonsParseError);
    expect(() => parseHorizonsEnvelope({ error: "Bad parameter" })).toThrow(/Horizons error: Bad parameter/);
    expect(() => parseHorizonsEnvelope({})).toThrow(HorizonsParseError);
    const notUt = horizonsFixture.sampleText.replace("JDUT", "JDTDB");
    expect(() => parseHorizonsVectors(notUt)).toThrow(/UT time tags/);
    const malformed = "JDUT\n$$SOE\n2461368.5, A.D., x, 1, 2, 3, 4, 5,\n$$EOE";
    expect(() => parseHorizonsVectors(malformed)).toThrow(/Malformed/);
  });
});

describe("catalogue → scene points", () => {
  const { systems } = normalizeExoplanetRows(exoFixture.rows);
  const stars = normalizeGaiaTap(gaiaFixture);
  const built = buildCatalogPoints(systems, stars);

  it("places hosts and stars, merging Gaia duplicates of hosts", () => {
    expect(built.points.some((p) => p.key === systemKey("TRAPPIST-1"))).toBe(true);
    expect(built.mergedStars).toBeGreaterThan(0); // e.g. Proxima Cen appears once, as a host
    const ids = built.points.map((p) => p.key);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters by host flag and distance", () => {
    const hosts = filterPoints(built.points, { hostsOnly: true, maxDistancePc: 10 });
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.every((p) => p.kind === "system" && p.distancePc! <= 10)).toBe(true);
  });

  it("labels a small, nearest-first set", () => {
    const labels = prioritizedLabels(built.points, 5);
    expect(labels).toHaveLength(5);
    expect(labels[0].distancePc!).toBeLessThanOrEqual(labels[4].distancePc!);
  });
});
