import "server-only";
import type { EphemerisParams } from "../api/params";
import { approximateState } from "../astro/kepler";
import { msToJd, MS_PER_DAY } from "../astro/time";
import {
  EPHEMERIS_FRAME,
  HORIZONS_SOURCE_NAME,
  HORIZONS_SOURCE_URL,
  HorizonsParseError,
  buildHorizonsUrl,
  parseHorizonsEnvelope,
} from "../data/horizons";
import { SOLAR_BODIES, type EphemerisResponse, type SolarBodyId, type StateSample } from "../types/astro";
import { TtlCache } from "./cache";
import { serverConfig } from "./config";
import { UpstreamError, fetchWithTimeout } from "./http";

/** Ephemeris for a fixed window does not change; cache for a day. */
const cache = new TtlCache<EphemerisResponse>(24 * 60 * 60 * 1000, 60);

/**
 * Horizons rejects concurrent requests from one client with HTTP 503, so every
 * Horizons call in this server process goes through a single serial queue
 * (including overlapping route invocations, e.g. a chunk plus its prefetch).
 */
let horizonsQueue: Promise<unknown> = Promise.resolve();
function enqueueHorizons<T>(task: () => Promise<T>): Promise<T> {
  const run = horizonsQueue.then(task, task);
  horizonsQueue = run.catch(() => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [400, 1200];

async function fetchBody(body: SolarBodyId, p: EphemerisParams): Promise<StateSample[]> {
  const url = buildHorizonsUrl(body, p.startMs, p.stopMs, p.stepHours);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, serverConfig().upstreamTimeoutMs);
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new UpstreamError("Horizons returned invalid JSON");
      }
      return parseHorizonsEnvelope(json);
    } catch (err) {
      const busy = err instanceof UpstreamError && err.status === 503;
      if (!busy || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function fetchLive(p: EphemerisParams): Promise<EphemerisResponse> {
  const results: StateSample[][] = [];
  for (const b of SOLAR_BODIES) results.push(await enqueueHorizons(() => fetchBody(b, p)));
  const bodies = Object.fromEntries(SOLAR_BODIES.map((b, i) => [b, results[i]])) as Record<SolarBodyId, StateSample[]>;
  return {
    start: new Date(p.startMs).toISOString(),
    stop: new Date(p.stopMs).toISOString(),
    stepHours: p.stepHours,
    frame: { ...EPHEMERIS_FRAME },
    bodies,
    source: {
      name: HORIZONS_SOURCE_NAME,
      url: HORIZONS_SOURCE_URL,
      origin: "live",
      fetchedAt: new Date().toISOString(),
      note: "Geometric heliocentric state vectors; positions between samples are Hermite-interpolated.",
    },
    warnings: [],
  };
}

/** Approximate fallback: same shape, computed from the analytic model in lib/astro/kepler. */
export function modelEphemeris(p: EphemerisParams, reason: string): EphemerisResponse {
  const n = Math.round((p.days * 24) / p.stepHours);
  const bodies = {} as Record<SolarBodyId, StateSample[]>;
  for (const b of SOLAR_BODIES) {
    bodies[b] = [];
    for (let i = 0; i <= n; i++) {
      const ms = p.startMs + (i * p.stepHours * MS_PER_DAY) / 24;
      bodies[b].push(approximateState(b, msToJd(ms)));
    }
  }
  return {
    start: new Date(p.startMs).toISOString(),
    stop: new Date(p.stopMs).toISOString(),
    stepHours: p.stepHours,
    frame: { ...EPHEMERIS_FRAME, center: "Sun centre (approximate model)", timeScale: "UTC (UTC−TDB offset ignored)" },
    bodies,
    source: {
      name: "Approximate model: JPL Keplerian elements (Standish) + low-precision lunar series",
      url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
      origin: "model",
      fetchedAt: new Date().toISOString(),
      note: "Not ephemeris data. Accuracy ≈ arcminutes for planets (1800–2050), ≈0.3° for the Moon.",
    },
    warnings: [reason],
  };
}

export async function getEphemeris(p: EphemerisParams): Promise<EphemerisResponse> {
  if (serverConfig().offline) return modelEphemeris(p, "DATA_MODE=sample: using the approximate model");
  const key = `${p.startMs}:${p.days}:${p.stepHours}`;
  try {
    return await cache.getOrCreate(key, () => fetchLive(p));
  } catch (err) {
    const reason = err instanceof UpstreamError || err instanceof HorizonsParseError ? err.message : "unknown error";
    return modelEphemeris(p, `JPL Horizons unavailable (${reason}); showing approximate model positions`);
  }
}

export function __clearEphemerisCache() {
  cache.clear();
}
