import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import horizonsFixture from "./fixtures/horizons.sample.json";
import { GET as getEphemeris } from "@/app/api/ephemeris/route";
import { GET as getExoplanets } from "@/app/api/exoplanets/route";
import { GET as getStars } from "@/app/api/stars/route";
import { parseEphemerisParams, parseStarsParams } from "@/lib/api/params";
import { __clearEphemerisCache } from "@/lib/server/ephemeris-service";
import { __clearExoplanetCache } from "@/lib/server/exoplanets-service";
import { __clearStarsCache } from "@/lib/server/stars-service";
import type { EphemerisResponse, ExoplanetsResponse, StarsResponse } from "@/lib/types/astro";

const req = (path: string) => new Request(`http://localhost${path}`);
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  __clearEphemerisCache();
  __clearExoplanetCache();
  __clearStarsCache();
  delete process.env.DATA_MODE;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parameter validation (pure)", () => {
  const p = (q: string) => parseEphemerisParams(new URLSearchParams(q));

  it("accepts a valid ephemeris request and applies defaults", () => {
    const r = p("start=2026-01-01T00:00:00Z");
    expect(r).toEqual({ ok: true, value: { startMs: Date.UTC(2026, 0, 1), stopMs: Date.UTC(2026, 2, 2), days: 60, stepHours: 12 } });
    expect(p("start=2026-01-01").ok).toBe(true);
  });

  it.each([
    ["", /required/],
    ["start=yesterday", /ISO 8601/],
    ["start=2026-01-01T00:00", /ISO 8601/], // no timezone: ambiguous
    ["start=2026-13-45T00:00:00Z", /not a valid date/],
    ["start=1850-01-01T00:00:00Z", /1900/],
    ["start=2100-12-01T00:00:00Z&days=60", /2100/],
    ["start=2026-01-01T00:00:00Z&days=0", /between 1 and 120/],
    ["start=2026-01-01T00:00:00Z&days=1.5", /integer/],
    ["start=2026-01-01T00:00:00Z&step=5", /one of/],
    ["start=2026-01-01T00:00:00Z&days=120&step=1", /Too many samples/],
  ])("rejects %s", (q, msg) => {
    const r = p(q);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(msg);
  });

  it("validates star query bounds", () => {
    expect(parseStarsParams(new URLSearchParams(""))).toEqual({ ok: true, value: { minParallaxMas: 40, limit: 3000 } });
    expect(parseStarsParams(new URLSearchParams("minParallax=5")).ok).toBe(false); // would be ≥ 200 pc: too large
    expect(parseStarsParams(new URLSearchParams("limit=999999")).ok).toBe(false);
    expect(parseStarsParams(new URLSearchParams("minParallax=abc")).ok).toBe(false);
  });
});

describe("GET /api/ephemeris", () => {
  it("returns 400 with a safe error body for invalid parameters", async () => {
    const res = await getEphemeris(req("/api/ephemeris?start=garbage"));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error.code).toBe("invalid_parameter");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses live Horizons responses for every body", async () => {
    fetchMock.mockImplementation(async () => Response.json({ result: horizonsFixture.sampleText }));
    const res = await getEphemeris(req("/api/ephemeris?start=2026-11-24T00:00:00Z&days=1&step=12"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EphemerisResponse;
    expect(body.source.origin).toBe("live");
    expect(body.frame.positionUnit).toBe("au");
    expect(body.frame.timeScale).toMatch(/UTC/);
    expect(Object.keys(body.bodies)).toHaveLength(10);
    expect(body.bodies.mars).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.hostname).toBe("ssd.jpl.nasa.gov");

    // Second identical request is served from the server cache.
    await getEphemeris(req("/api/ephemeris?start=2026-11-24T00:00:00Z&days=1&step=12"));
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("falls back to the labelled approximate model when Horizons fails", async () => {
    fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
    const res = await getEphemeris(req("/api/ephemeris?start=2026-11-24T00:00:00Z&days=2&step=12"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EphemerisResponse;
    expect(body.source.origin).toBe("model");
    expect(body.warnings[0]).toMatch(/Horizons unavailable \(Upstream responded with HTTP 503\)/);
    expect(body.bodies.earth).toHaveLength(5);
    // 503 ("busy") is retried twice before giving up; the remaining bodies are not requested.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back when Horizons reports an in-band error", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: "Invalid COMMAND" }));
    const body = (await (await getEphemeris(req("/api/ephemeris?start=2026-11-24T00:00:00Z&days=1"))).json()) as EphemerisResponse;
    expect(body.source.origin).toBe("model");
  });

  it("uses only the model in DATA_MODE=sample", async () => {
    process.env.DATA_MODE = "sample";
    const body = (await (await getEphemeris(req("/api/ephemeris?start=2026-11-24T00:00:00Z&days=1"))).json()) as EphemerisResponse;
    expect(body.source.origin).toBe("model");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/exoplanets", () => {
  const liveRows = [
    { pl_name: "A b", hostname: "A", ra: 1, dec: 2, sy_dist: 3 },
    { pl_name: "A c", hostname: "A", ra: 1, dec: 2, sy_dist: 3 },
  ];

  it("rejects unexpected parameters", async () => {
    const res = await getExoplanets(req("/api/exoplanets?table=ps"));
    expect(res.status).toBe(400);
  });

  it("returns normalised live data", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(liveRows));
    const res = await getExoplanets(req("/api/exoplanets"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/max-age=3600/);
    const body = (await res.json()) as ExoplanetsResponse;
    expect(body.source.origin).toBe("live");
    expect(body.systems).toHaveLength(1);
    expect(body.planetCount).toBe(2);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.hostname).toBe("exoplanetarchive.ipac.caltech.edu");
    expect(url.searchParams.get("query")).toContain("from pscomppars");
  });

  it("falls back to the bundled sample on network errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const body = (await (await getExoplanets(req("/api/exoplanets"))).json()) as ExoplanetsResponse;
    expect(body.source.origin).toBe("sample");
    expect(body.warnings[0]).toMatch(/Upstream request failed/);
    expect(body.systems.length).toBeGreaterThan(50);
  });

  it("falls back on malformed upstream payloads", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ unexpected: true }));
    const body = (await (await getExoplanets(req("/api/exoplanets"))).json()) as ExoplanetsResponse;
    expect(body.source.origin).toBe("sample");
  });
});

describe("GET /api/stars", () => {
  it("returns 400 for out-of-range bounds", async () => {
    const res = await getStars(req("/api/stars?minParallax=1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/minParallax/);
  });

  it("sends a bounded query and normalises the TAP result", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ metadata: [{ name: "designation" }, { name: "ra" }, { name: "dec" }, { name: "parallax" }], data: [["Gaia DR3 9", 1, 2, 500]] }),
    );
    const body = (await (await getStars(req("/api/stars?minParallax=100&limit=10"))).json()) as StarsResponse;
    expect(body.source.origin).toBe("live");
    expect(body.stars[0]).toMatchObject({ id: "Gaia DR3 9", distancePc: 2 });
    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("QUERY");
    expect(query).toContain("TOP 10");
    expect(query).toContain("parallax > 100");
  });

  it("falls back to the sample, respecting the requested bound", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    const body = (await (await getStars(req("/api/stars?minParallax=200"))).json()) as StarsResponse;
    expect(body.source.origin).toBe("sample");
    expect(body.stars.length).toBeGreaterThan(0);
    expect(body.stars.every((s) => s.parallaxMas > 200)).toBe(true);
  });
});
