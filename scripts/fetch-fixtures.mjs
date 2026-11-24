#!/usr/bin/env node
/**
 * Regenerates the offline fixtures in lib/data/fixtures/ and tests/fixtures/
 * from the real upstream services. Fixtures are *real* archive responses
 * (trimmed subsets), never invented values.
 *
 *   node scripts/fetch-fixtures.mjs
 *
 * - Exoplanets: NASA Exoplanet Archive TAP, table `pscomppars`, systems within
 *   25 pc plus a few well-known distant systems.
 * - Gaia: Gaia DR3 TAP, stars with parallax > 80 mas (≈ 12.5 pc).
 * - Horizons: heliocentric ecliptic-J2000 state vectors for the Sun, planets
 *   and Moon at one epoch (used by tests to validate the approximate model).
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fetchedAt = new Date().toISOString();

const PLANET_COLUMNS = [
  "pl_name", "hostname", "pl_letter", "ra", "dec",
  "sy_dist", "sy_disterr1", "sy_disterr2", "sy_plx", "sy_plxerr1", "sy_plxerr2",
  "sy_snum", "sy_pnum", "st_spectype", "st_teff", "st_mass", "st_rad", "sy_vmag",
  "gaia_dr3_id", "hd_name", "hip_name",
  "pl_orbper", "pl_orbsmax", "pl_rade", "pl_bmasse", "pl_orbeccen", "pl_eqt",
  "disc_year", "discoverymethod", "disc_facility",
];

async function tap(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`${u.host} HTTP ${res.status}`);
  return res.json();
}

async function exoplanets() {
  const notable = ["Kepler-90", "Kepler-452", "Kepler-186", "TRAPPIST-1", "KELT-9", "HR 8799", "51 Peg", "WASP-12", "OGLE-2005-BLG-390L"];
  const where = `sy_dist < 25 or hostname in (${notable.map((n) => `'${n}'`).join(",")})`;
  const query = `select ${PLANET_COLUMNS.join(",")} from pscomppars where ${where}`;
  const rows = await tap("https://exoplanetarchive.ipac.caltech.edu/TAP/sync", { query, format: "json" });
  const out = {
    source: "NASA Exoplanet Archive TAP (pscomppars)",
    fetchedAt,
    note: "Offline sample: a real but partial subset of confirmed planets (hosts within 25 pc plus a few notable systems).",
    query,
    rows,
  };
  await writeFile(path.join(root, "lib/data/fixtures/exoplanets.sample.json"), JSON.stringify(out));
  console.log(`exoplanets: ${rows.length} planets`);
}

async function gaia() {
  const query =
    "SELECT TOP 1000 designation, ra, dec, parallax, parallax_error, phot_g_mean_mag, bp_rp, ref_epoch " +
    "FROM gaiadr3.gaia_source WHERE parallax > 80 AND parallax_over_error > 10 ORDER BY parallax DESC";
  const json = await tap("https://gea.esac.esa.int/tap-server/tap/sync", {
    REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: query,
  });
  const out = {
    source: "ESA Gaia Archive TAP (gaiadr3.gaia_source)",
    fetchedAt,
    note: "Offline sample: Gaia DR3 sources with parallax > 80 mas (≈ 12.5 pc), parallax_over_error > 10.",
    query,
    metadata: json.metadata.map((m) => ({ name: m.name, unit: m.unit })),
    data: json.data,
  };
  await writeFile(path.join(root, "lib/data/fixtures/gaia.sample.json"), JSON.stringify(out));
  console.log(`gaia: ${json.data.length} stars`);
}

async function horizons() {
  const bodies = { sun: "10", mercury: "199", venus: "299", earth: "399", moon: "301", mars: "499", jupiter: "599", saturn: "699", uranus: "799", neptune: "899" };
  const result = { epochUtc: "2026-11-24T00:00:00Z", fetchedAt, frame: "ecliptic J2000 (ICRF), heliocentric, au and au/day", bodies: {}, sampleText: "" };
  for (const [name, id] of Object.entries(bodies)) {
    const json = await tap("https://ssd.jpl.nasa.gov/api/horizons.api", {
      format: "json", COMMAND: id, EPHEM_TYPE: "VECTORS", CENTER: "500@10", REF_PLANE: "ECLIPTIC", REF_SYSTEM: "ICRF",
      OUT_UNITS: "AU-D", VEC_TABLE: "2", CSV_FORMAT: "YES", TIME_TYPE: "UT", OBJ_DATA: "NO", MAKE_EPHEM: "YES",
      START_TIME: "2026-11-24 00:00", STOP_TIME: "2026-11-25 00:00", STEP_SIZE: "12 h",
    });
    if (name === "moon") result.sampleText = json.result;
    const line = json.result.split("$$SOE")[1].trim().split("\n")[0];
    const f = line.split(",").map((s) => s.trim());
    result.bodies[name] = { position: [Number(f[2]), Number(f[3]), Number(f[4])], velocity: [Number(f[5]), Number(f[6]), Number(f[7])] };
  }
  await writeFile(path.join(root, "tests/fixtures/horizons.sample.json"), JSON.stringify(result, null, 1));
  console.log("horizons: ok");
}

await mkdir(path.join(root, "lib/data/fixtures"), { recursive: true });
await mkdir(path.join(root, "tests/fixtures"), { recursive: true });
await exoplanets();
await gaia();
await horizons();
