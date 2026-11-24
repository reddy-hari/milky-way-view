/**
 * Shared, framework-free types used by Route Handlers, data adapters and UI.
 *
 * Conventions:
 * - Every numeric field documents its unit in its name or JSDoc.
 * - Missing upstream values are `null`, never a guessed default.
 */

/** Where a dataset came from. */
export type DataOrigin =
  /** Fetched from the upstream service on this request (or from a recent cache of it). */
  | "live"
  /** A bundled, real-but-partial snapshot used because the upstream was unavailable. */
  | "sample"
  /** Computed from an approximate analytic model (not a catalogue or ephemeris query). */
  | "model";

export interface SourceInfo {
  /** Human-readable source name, e.g. "NASA Exoplanet Archive (pscomppars)". */
  name: string;
  /** Documentation / landing page for the source. */
  url: string;
  origin: DataOrigin;
  /** ISO 8601 timestamp of when the data was fetched from upstream (or snapshot date). */
  fetchedAt: string;
  /** Extra caveats to show in the UI. */
  note?: string;
}

/** A measured value with optional asymmetric uncertainties (same unit as value). */
export interface Measurement {
  value: number | null;
  /** Upper uncertainty (positive number), if published. */
  errPlus: number | null;
  /** Lower uncertainty (positive number), if published. */
  errMinus: number | null;
}

// ---------------------------------------------------------------------------
// Exoplanets
// ---------------------------------------------------------------------------

export interface Exoplanet {
  name: string;
  letter: string | null;
  orbitalPeriodDays: number | null;
  semiMajorAxisAu: number | null;
  radiusEarth: number | null;
  massEarth: number | null;
  eccentricity: number | null;
  equilibriumTempK: number | null;
  discoveryYear: number | null;
  discoveryMethod: string | null;
  discoveryFacility: string | null;
}

/** A host star system with at least one confirmed planet. */
export interface ExoplanetSystem {
  /** Stable id: the archive `hostname`. */
  id: string;
  name: string;
  /** Other designations published by the archive (HD, HIP, Gaia DR3). */
  altNames: string[];
  /** ICRS right ascension, degrees (archive epoch J2000-equivalent; see README). */
  raDeg: number | null;
  /** ICRS declination, degrees. */
  decDeg: number | null;
  /** Distance from the Sun, parsecs (archive `sy_dist`). */
  distancePc: Measurement;
  /** Parallax, milliarcseconds (archive `sy_plx`). */
  parallaxMas: Measurement;
  /** Number of stars in the system (archive `sy_snum`). */
  starCount: number | null;
  /** Number of planets in the system as reported by the archive (`sy_pnum`). */
  reportedPlanetCount: number | null;
  spectralType: string | null;
  effectiveTempK: number | null;
  massSun: number | null;
  radiusSun: number | null;
  vMag: number | null;
  gaiaDr3Id: string | null;
  planets: Exoplanet[];
}

export interface ExoplanetsResponse {
  systems: ExoplanetSystem[];
  planetCount: number;
  source: SourceInfo;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Catalogue stars (Gaia)
// ---------------------------------------------------------------------------

export interface CatalogStar {
  /** Gaia designation, e.g. "Gaia DR3 4472832130942575872". */
  id: string;
  name: string;
  /** ICRS RA in degrees at the catalogue reference epoch (`refEpoch`). */
  raDeg: number;
  decDeg: number;
  parallaxMas: number;
  parallaxErrorMas: number | null;
  /**
   * Distance in parsecs computed as 1000 / parallax. Only reported when the
   * parallax is positive; the query constrains parallax_over_error > 10 so the
   * naive inversion is a reasonable estimate. `null` otherwise.
   */
  distancePc: number | null;
  /** G-band mean magnitude. */
  gMag: number | null;
  /** BP − RP colour index, mag. */
  bpRp: number | null;
  /** Julian-year reference epoch of the astrometry (2016.0 for DR3). */
  refEpoch: number | null;
}

export interface StarsQuery {
  /** Minimum parallax in milliarcseconds (bounds the region to d < 1000/minParallax pc). */
  minParallaxMas: number;
  /** Maximum number of rows. */
  limit: number;
}

export interface StarsResponse {
  stars: CatalogStar[];
  query: StarsQuery;
  source: SourceInfo;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Ephemerides
// ---------------------------------------------------------------------------

export const SOLAR_BODIES = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "moon",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

export type SolarBodyId = (typeof SOLAR_BODIES)[number];

/**
 * One state-vector sample, packed for compact JSON:
 * [jdUtc, x, y, z, vx, vy, vz]
 * Position in au, velocity in au/day, heliocentric, ecliptic-of-J2000 axes.
 */
export type StateSample = [number, number, number, number, number, number, number];

export interface EphemerisFrame {
  center: string;
  plane: string;
  reference: string;
  positionUnit: "au";
  velocityUnit: "au/day";
  timeScale: string;
}

export interface EphemerisResponse {
  /** ISO 8601 UTC start of the window. */
  start: string;
  /** ISO 8601 UTC end of the window (inclusive sample). */
  stop: string;
  stepHours: number;
  frame: EphemerisFrame;
  bodies: Record<SolarBodyId, StateSample[]>;
  source: SourceInfo;
  warnings: string[];
}

/** Structured error body returned by all API routes. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
