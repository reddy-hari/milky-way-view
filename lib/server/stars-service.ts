import "server-only";
import sample from "../data/fixtures/gaia.sample.json";
import {
  GAIA_SOURCE_NAME,
  GAIA_SOURCE_URL,
  GAIA_TAP_URL,
  buildGaiaQuery,
  normalizeGaiaTap,
  type StarCatalogAdapter,
} from "../data/gaia";
import type { CatalogStar, StarsQuery, StarsResponse } from "../types/astro";
import { TtlCache } from "./cache";
import { serverConfig } from "./config";
import { UpstreamError, fetchWithTimeout } from "./http";

/** Live adapter: bounded synchronous TAP query against the ESA Gaia Archive. */
export const gaiaTapAdapter: StarCatalogAdapter = {
  id: "gaia-dr3-tap",
  async fetchStars(query: StarsQuery): Promise<CatalogStar[]> {
    const url = new URL(GAIA_TAP_URL);
    url.searchParams.set("REQUEST", "doQuery");
    url.searchParams.set("LANG", "ADQL");
    url.searchParams.set("FORMAT", "json");
    url.searchParams.set("QUERY", buildGaiaQuery(query));
    const res = await fetchWithTimeout(url, serverConfig().upstreamTimeoutMs);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new UpstreamError("Gaia Archive returned invalid JSON");
    }
    return normalizeGaiaTap(json);
  },
};

/** Offline adapter: the bundled real Gaia DR3 snapshot (parallax > 80 mas). */
export const gaiaSampleAdapter: StarCatalogAdapter = {
  id: "gaia-dr3-sample",
  async fetchStars({ minParallaxMas, limit }: StarsQuery): Promise<CatalogStar[]> {
    return normalizeGaiaTap(sample)
      .filter((s) => s.parallaxMas > minParallaxMas)
      .slice(0, limit);
  },
};

/** Star lists change only with new data releases; cache for a day. */
const cache = new TtlCache<StarsResponse>(24 * 60 * 60 * 1000, 20);

async function fromSample(query: StarsQuery, reason: string): Promise<StarsResponse> {
  const stars = await gaiaSampleAdapter.fetchStars(query);
  return {
    stars,
    query,
    source: { name: GAIA_SOURCE_NAME, url: GAIA_SOURCE_URL, origin: "sample", fetchedAt: sample.fetchedAt, note: sample.note },
    warnings: [reason],
  };
}

export async function getStars(query: StarsQuery, adapter: StarCatalogAdapter = gaiaTapAdapter): Promise<StarsResponse> {
  if (serverConfig().offline) return fromSample(query, "DATA_MODE=sample: using bundled Gaia sample");
  const key = `${adapter.id}:${query.minParallaxMas}:${query.limit}`;
  try {
    return await cache.getOrCreate(key, async () => {
      const stars = await adapter.fetchStars(query);
      return {
        stars,
        query,
        source: { name: GAIA_SOURCE_NAME, url: GAIA_SOURCE_URL, origin: "live", fetchedAt: new Date().toISOString() },
        warnings: stars.length >= query.limit ? [`Result truncated at ${query.limit} stars (row limit)`] : [],
      };
    });
  } catch (err) {
    const reason = err instanceof UpstreamError || err instanceof TypeError ? err.message : "unknown error";
    return fromSample(query, `Live Gaia query failed (${reason}); showing bundled sample (≤ 12.5 pc)`);
  }
}

export function __clearStarsCache() {
  cache.clear();
}
