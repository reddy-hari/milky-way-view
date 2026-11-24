/**
 * NASA Exoplanet Archive: query definition and normalisation (pure, no I/O).
 *
 * Table: `pscomppars` (Planetary Systems Composite Parameters) — one row per
 * confirmed planet with a self-consistent set of "best" parameters. Column
 * names verified against TAP_SCHEMA.columns (see README).
 * Docs: https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
 *       https://exoplanetarchive.ipac.caltech.edu/docs/API_PSCompPars_columns.html
 */
import type { Exoplanet, ExoplanetSystem, Measurement } from "../types/astro";

export const EXOPLANET_TAP_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
export const EXOPLANET_SOURCE_NAME = "NASA Exoplanet Archive (pscomppars)";
export const EXOPLANET_SOURCE_URL = "https://exoplanetarchive.ipac.caltech.edu/";

/** Only the columns the app needs. */
export const EXOPLANET_COLUMNS = [
  "pl_name", "hostname", "pl_letter", "ra", "dec",
  "sy_dist", "sy_disterr1", "sy_disterr2", "sy_plx", "sy_plxerr1", "sy_plxerr2",
  "sy_snum", "sy_pnum", "st_spectype", "st_teff", "st_mass", "st_rad", "sy_vmag",
  "gaia_dr3_id", "hd_name", "hip_name",
  "pl_orbper", "pl_orbsmax", "pl_rade", "pl_bmasse", "pl_orbeccen", "pl_eqt",
  "disc_year", "discoverymethod", "disc_facility",
] as const;

export type ExoplanetRow = Partial<Record<(typeof EXOPLANET_COLUMNS)[number], unknown>>;

export function buildExoplanetQuery(): string {
  return `select ${EXOPLANET_COLUMNS.join(",")} from pscomppars`;
}

export function buildExoplanetUrl(): URL {
  const url = new URL(EXOPLANET_TAP_URL);
  url.searchParams.set("query", buildExoplanetQuery());
  url.searchParams.set("format", "json");
  return url;
}

// --- value coercion: anything that is not a finite number / non-empty string becomes null

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

/** Archive lower errors are negative numbers; store both as positive magnitudes. */
function measurement(value: unknown, err1: unknown, err2: unknown): Measurement {
  const e1 = num(err1);
  const e2 = num(err2);
  return { value: num(value), errPlus: e1 == null ? null : Math.abs(e1), errMinus: e2 == null ? null : Math.abs(e2) };
}

function toPlanet(row: ExoplanetRow): Exoplanet {
  return {
    name: str(row.pl_name) ?? "Unnamed planet",
    letter: str(row.pl_letter),
    orbitalPeriodDays: num(row.pl_orbper),
    semiMajorAxisAu: num(row.pl_orbsmax),
    radiusEarth: num(row.pl_rade),
    massEarth: num(row.pl_bmasse),
    eccentricity: num(row.pl_orbeccen),
    equilibriumTempK: num(row.pl_eqt),
    discoveryYear: num(row.disc_year),
    discoveryMethod: str(row.discoverymethod),
    discoveryFacility: str(row.disc_facility),
  };
}

/**
 * Group planet rows into host systems. Host-level fields are taken from the
 * first row that provides them (pscomppars repeats host values per planet).
 * Rows without a hostname are dropped and counted in `skipped`.
 */
export function normalizeExoplanetRows(rows: unknown): { systems: ExoplanetSystem[]; planetCount: number; skipped: number } {
  if (!Array.isArray(rows)) throw new TypeError("Exoplanet Archive response is not an array");
  const byHost = new Map<string, ExoplanetSystem>();
  let skipped = 0;
  let planetCount = 0;

  for (const raw of rows) {
    if (raw == null || typeof raw !== "object") { skipped++; continue; }
    const row = raw as ExoplanetRow;
    const host = str(row.hostname);
    if (!host) { skipped++; continue; }

    let sys = byHost.get(host);
    if (!sys) {
      const altNames = [str(row.hd_name), str(row.hip_name), str(row.gaia_dr3_id)].filter((n): n is string => !!n && n !== host);
      sys = {
        id: host,
        name: host,
        altNames,
        raDeg: num(row.ra),
        decDeg: num(row.dec),
        distancePc: measurement(row.sy_dist, row.sy_disterr1, row.sy_disterr2),
        parallaxMas: measurement(row.sy_plx, row.sy_plxerr1, row.sy_plxerr2),
        starCount: num(row.sy_snum),
        reportedPlanetCount: num(row.sy_pnum),
        spectralType: str(row.st_spectype),
        effectiveTempK: num(row.st_teff),
        massSun: num(row.st_mass),
        radiusSun: num(row.st_rad),
        vMag: num(row.sy_vmag),
        gaiaDr3Id: str(row.gaia_dr3_id),
        planets: [],
      };
      byHost.set(host, sys);
    } else {
      // Fill host-level gaps from later rows without overwriting published values.
      if (sys.spectralType == null) sys.spectralType = str(row.st_spectype);
      if (sys.effectiveTempK == null) sys.effectiveTempK = num(row.st_teff);
      if (sys.distancePc.value == null) sys.distancePc = measurement(row.sy_dist, row.sy_disterr1, row.sy_disterr2);
    }
    sys.planets.push(toPlanet(row));
    planetCount++;
  }

  const systems = [...byHost.values()];
  for (const s of systems) s.planets.sort((a, b) => (a.letter ?? a.name).localeCompare(b.letter ?? b.name));
  systems.sort((a, b) => (a.distancePc.value ?? Infinity) - (b.distancePc.value ?? Infinity));
  return { systems, planetCount, skipped };
}
