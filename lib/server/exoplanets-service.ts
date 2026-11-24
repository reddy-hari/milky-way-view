import "server-only";
import sample from "../data/fixtures/exoplanets.sample.json";
import {
  EXOPLANET_SOURCE_NAME,
  EXOPLANET_SOURCE_URL,
  buildExoplanetUrl,
  normalizeExoplanetRows,
} from "../data/exoplanets";
import type { ExoplanetsResponse } from "../types/astro";
import { TtlCache } from "./cache";
import { serverConfig } from "./config";
import { UpstreamError, fetchWithTimeout } from "./http";

/** The archive updates at most daily; cache the full normalised set for 6 hours. */
const cache = new TtlCache<ExoplanetsResponse>(6 * 60 * 60 * 1000, 2);

export function sampleExoplanets(reason: string): ExoplanetsResponse {
  const { systems, planetCount } = normalizeExoplanetRows(sample.rows);
  return {
    systems,
    planetCount,
    source: { name: EXOPLANET_SOURCE_NAME, url: EXOPLANET_SOURCE_URL, origin: "sample", fetchedAt: sample.fetchedAt, note: sample.note },
    warnings: [reason],
  };
}

async function fetchLive(): Promise<ExoplanetsResponse> {
  const res = await fetchWithTimeout(buildExoplanetUrl(), serverConfig().upstreamTimeoutMs);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new UpstreamError("Exoplanet Archive returned invalid JSON");
  }
  const { systems, planetCount, skipped } = normalizeExoplanetRows(json);
  if (systems.length === 0) throw new UpstreamError("Exoplanet Archive returned no systems");
  return {
    systems,
    planetCount,
    source: { name: EXOPLANET_SOURCE_NAME, url: EXOPLANET_SOURCE_URL, origin: "live", fetchedAt: new Date().toISOString() },
    warnings: skipped > 0 ? [`${skipped} archive rows without a host name were skipped`] : [],
  };
}

/** Live data (cached) with automatic fallback to the bundled real-data sample. */
export async function getExoplanets(): Promise<ExoplanetsResponse> {
  if (serverConfig().offline) return sampleExoplanets("DATA_MODE=sample: using bundled sample data");
  try {
    return await cache.getOrCreate("all", fetchLive);
  } catch (err) {
    const reason = err instanceof UpstreamError || err instanceof TypeError ? err.message : "unknown error";
    return sampleExoplanets(`Live Exoplanet Archive request failed (${reason}); showing bundled sample subset`);
  }
}

export function __clearExoplanetCache() {
  cache.clear();
}
