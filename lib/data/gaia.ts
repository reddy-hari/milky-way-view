/**
 * Gaia catalogue adapter (pure parts: interface, query, normalisation).
 *
 * The app never downloads the whole catalogue. A `StarCatalogAdapter` answers a
 * bounded query (here: a parallax cut = a sphere around the Sun, plus a row
 * cap). The live implementation queries the ESA Gaia Archive TAP service
 * server-side; it can be swapped for a spatial index or preprocessed tiles
 * without touching the UI, which only sees `CatalogStar[]`.
 *
 * Docs: https://www.cosmos.esa.int/web/gaia-users/archive/programmatic-access
 *       https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html
 */
import type { CatalogStar, StarsQuery } from "../types/astro";
import { parallaxMasToPc } from "../astro/units";
import { num, str } from "./exoplanets";

export interface StarCatalogAdapter {
  readonly id: string;
  fetchStars(query: StarsQuery): Promise<CatalogStar[]>;
}

export const GAIA_TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync";
export const GAIA_SOURCE_NAME = "ESA Gaia DR3 (gaiadr3.gaia_source)";
export const GAIA_SOURCE_URL = "https://www.cosmos.esa.int/web/gaia/dr3";

/** Bounds enforced by the Route Handler. */
export const STARS_LIMITS = {
  minParallaxMas: { min: 20, max: 1000, default: 40 }, // 20 mas ⇒ ≤ 50 pc
  limit: { min: 1, max: 5000, default: 3000 },
} as const;

/**
 * ADQL for a bounded local-region query. `designation` is used as the id
 * because `source_id` is a 64-bit integer that would lose precision in JSON.
 * Inputs are validated numbers, so interpolation is safe.
 */
export function buildGaiaQuery({ minParallaxMas, limit }: StarsQuery): string {
  if (!Number.isFinite(minParallaxMas) || !Number.isInteger(limit)) throw new RangeError("Invalid Gaia query bounds");
  return (
    `SELECT TOP ${limit} designation, ra, dec, parallax, parallax_error, phot_g_mean_mag, bp_rp, ref_epoch ` +
    `FROM gaiadr3.gaia_source WHERE parallax > ${minParallaxMas} AND parallax_over_error > 10 ORDER BY parallax DESC`
  );
}

interface TapJson {
  metadata: { name: string }[];
  data: unknown[][];
}

/** Normalise a TAP JSON result (column metadata + row arrays) into CatalogStar records. */
export function normalizeGaiaTap(json: unknown): CatalogStar[] {
  const t = json as TapJson;
  if (!t || !Array.isArray(t.metadata) || !Array.isArray(t.data)) throw new TypeError("Gaia TAP response has an unexpected shape");
  const idx = (name: string) => t.metadata.findIndex((m) => m?.name === name);
  const col = {
    designation: idx("designation"), ra: idx("ra"), dec: idx("dec"), parallax: idx("parallax"),
    parallaxError: idx("parallax_error"), g: idx("phot_g_mean_mag"), bpRp: idx("bp_rp"), refEpoch: idx("ref_epoch"),
  };
  if (col.designation < 0 || col.ra < 0 || col.dec < 0 || col.parallax < 0) throw new TypeError("Gaia TAP response is missing required columns");

  const stars: CatalogStar[] = [];
  for (const row of t.data) {
    if (!Array.isArray(row)) continue;
    const id = str(row[col.designation]);
    const ra = num(row[col.ra]);
    const dec = num(row[col.dec]);
    const plx = num(row[col.parallax]);
    if (!id || ra == null || dec == null || plx == null) continue; // drop incomplete astrometry rather than guess
    stars.push({
      id,
      name: id,
      raDeg: ra,
      decDeg: dec,
      parallaxMas: plx,
      parallaxErrorMas: col.parallaxError >= 0 ? num(row[col.parallaxError]) : null,
      distancePc: parallaxMasToPc(plx),
      gMag: col.g >= 0 ? num(row[col.g]) : null,
      bpRp: col.bpRp >= 0 ? num(row[col.bpRp]) : null,
      refEpoch: col.refEpoch >= 0 ? num(row[col.refEpoch]) : null,
    });
  }
  return stars;
}
