# Milky Way View

An interactive 3D explorer for three distinct scales:

1. **Milky Way.** An *illustrative* galaxy model with catalogue-backed exoplanet host systems placed at their real positions.
2. **Nearby stars.** Gaia DR3 stars and known exoplanet hosts around the Sun, at linear distances in parsecs.
3. **Solar System.** The Sun, planets and Moon at a chosen date and time, from JPL Horizons ephemerides.

Built with Next.js 16 (App Router), TypeScript, React Three Fiber / three.js and TanStack Query. Styling uses CSS Modules.

## Setup

```bash
npm install
cp .env.example .env.local   # optional; defaults work without it
npm run dev                  # http://localhost:3000
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit, route and UI tests |
| `npm run fixtures` | Re-download the offline sample fixtures from the real services |

Requires Node.js ≥ 20.9 (developed on Node 24).

### Environment

All configuration is server-side, and none of it is secret. See [`.env.example`](.env.example).

- `DATA_MODE=live` (the default) queries the upstream services. With `DATA_MODE=sample`, the app never calls them and uses the bundled fixtures and the approximate model instead, which is useful offline.
- `UPSTREAM_TIMEOUT_MS` is the per-request timeout for upstream calls (default 20000).

## Architecture

```
app/
  page.tsx, layout.tsx, providers.tsx   server shell + TanStack Query provider
  api/exoplanets/route.ts               GET  → NASA Exoplanet Archive (TAP)
  api/stars/route.ts                    GET  → Gaia DR3 (TAP), bounded query
  api/ephemeris/route.ts                GET  → JPL Horizons vectors
components/
  Explorer.tsx                          client orchestrator: state, transitions, keyboard
  scene/                                R3F: SceneCanvas, CameraRig, Galaxy/Local/SolarScene,
                                        PointCloud (instanced points), ScreenPicker, labels
  ui/                                   SearchBox, DetailsPanel, TimeControl, DataStatus
lib/
  types/astro.ts                        shared response types (stable JSON contract)
  astro/                                units, time, coordinate transforms, Kepler model, interpolation
  data/                                 pure query builders + normalisers per source; fixtures/
  server/                               fetch with timeout, TTL cache, services with fallbacks
  api/params.ts                         query-parameter validation
  client/                               TanStack Query hooks, browser hooks
  scene/                                catalogue → scene points, views/poses, solar helpers
tests/                                  Vitest suites + fixtures
scripts/fetch-fixtures.mjs              regenerates fixtures from the real services
```

**Data flow:** the browser calls only `/api/*` through TanStack Query, which handles caching, loading and error states. The Route Handlers validate their parameters and call service modules in `lib/server`. Those modules fetch the upstream data, normalise it with the pure functions in `lib/data`, cache it in memory, and fall back to a labelled sample when a fetch fails. Every response carries `source: { name, url, origin: "live" | "sample" | "model", fetchedAt, note }`, and the UI shows it.

**Rendering:**

- **Point markers.** Each marker set is one `THREE.Points` draw call with per-point colour and size attributes (about 4,800 hosts and 3,000 stars; 60,000 points for the galaxy model).
- **Picking.** Hover and click picking runs in screen space (`ScreenPicker`), not one React component per star.
- **Labels.** Labels live in a single DOM overlay positioned each frame. Only the selected item, the hovered item and a small prioritised set are shown, and overlaps are hidden by priority.
- **Level of detail.** In the galaxy view, host markers fade in and the model dims as the camera approaches the Sun.

**Caching:**

| Data | Server memory | Browser `Cache-Control` | TanStack `staleTime` |
| --- | --- | --- | --- |
| Exoplanets | 6 h | 1 h | 1 h |
| Gaia | 24 h | 1 day | 1 day |
| Ephemeris windows | 24 h | 1 day | ∞ (fixed windows) |

## Data sources

| Dataset | Source | How it is used | Fallback |
| --- | --- | --- | --- |
| Confirmed planets and hosts | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) TAP, table `pscomppars` (one row per planet, composite parameters). Columns verified against `TAP_SCHEMA.columns`. | Grouped into host systems server-side. Only the needed columns are queried. | `lib/data/fixtures/exoplanets.sample.json`: a real subset (hosts within 25 pc plus a few notable systems) |
| Nearby stars | [ESA Gaia DR3](https://www.cosmos.esa.int/web/gaia/dr3) TAP `gaiadr3.gaia_source`. Bounded query: `parallax > 40 mas` (≤ 25 pc), `parallax_over_error > 10`, `TOP 3000`. | Distance = 1000/parallax, which is reasonable at this precision. `designation` is the ID, because the 64-bit `source_id` would lose precision in JSON. Gaia stars matching an archive host's `gaia_dr3_id` are merged into that host. | `gaia.sample.json`: real DR3 rows with parallax > 80 mas |
| Solar System | [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), `EPHEM_TYPE=VECTORS` | See the frame details below. | Approximate model: JPL [Keplerian elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html) (Standish, valid 1800–2050) plus the Astronomical Almanac low-precision lunar series. Labelled "Approximate model". The test suite checks it against Horizons (planets < 0.2°, Moon < 0.5°). |

Galaxy structure is a procedural model. It is **not** a catalogue: it uses R₀ = 8.2 kpc, a bar at about 27°, four trailing logarithmic arms with a pitch of about 12°, and a scale height of about 0.3 kpc. The UI labels it as illustrative.

### Horizons request and time handling

The ephemeris route requests the following from Horizons:

| Parameter | Value | Meaning |
| --- | --- | --- |
| `CENTER` | `500@10` | Heliocentric, measured from the Sun's body centre |
| `REF_PLANE`, `REF_SYSTEM` | `ECLIPTIC`, `ICRF` | Ecliptic-of-J2000 axes |
| `OUT_UNITS` | `AU-D` | Positions in au, velocities in au/day |
| `TIME_TYPE` | `UT` | Time tags are JD(UT), so they map directly onto JavaScript `Date` |

The client fetches fixed 60-day windows at 12-hour steps, aligned to the Unix epoch so the cache keys are stable, and prefetches the next window during playback. Positions in between are found by cubic Hermite interpolation using the returned velocities; the interpolation error is far below what the view can show. Horizons rejects concurrent requests from one client (HTTP 503), so the server serialises all Horizons calls and retries 503 responses with backoff.

## Coordinate frames and transforms

Implemented in `lib/astro/coords.ts`. Frames are converted only through these functions; they are never mixed silently.

- **ICRS (RA, Dec, distance)** is the catalogue input. It converts to **heliocentric Galactic cartesian** (X toward the Galactic Centre, Z toward the North Galactic Pole) using the Hipparcos/Gaia rotation matrix.
- **Galactocentric (simplified)** subtracts R₀ so the Sun sits at (−8.2, 0, 0) kpc. The Sun's ≈20 pc height above the plane is ignored.
- **Ecliptic J2000** (from Horizons) is used only in the Solar System view.
- **Scene axes:** three.js is Y-up, so every Z-up frame is mapped (x, y, z) → (x, z, −y). This is a proper rotation that preserves handedness.

Units:

| View | Scene unit |
| --- | --- |
| Galaxy | 1 kpc |
| Nearby stars | 1 pc |
| Solar System | 1 au |

## Scientific honesty: limitations and stylisation

- **Galaxy model.** The galaxy cloud is illustrative. Its dots are not individual stars, and the UI says so.
- **Host markers.** An exoplanet host appears as a single star-system marker. Planet orbits are not drawn, because their 3D orientation is generally unknown; planet data appears in the details panel.
- **Missing values.** Hosts without a published distance (28 at the time of writing) are searchable but not plotted. Missing values are shown as missing, never estimated.
- **Astrometric epoch.** Coordinates are used as published: archive values are mostly Gaia-based (J2016.0), and Gaia rows are at J2016.0. No proper-motion propagation is applied, which is irrelevant at these scales.
- **Marker sizes and the Moon.** Marker sizes are stylised. In the Solar System view, body sizes are enlarged and the Moon's distance from Earth is exaggerated ×40 (true distances are shown in the panel). A visible scale note states this.
- **Orbit guides.** Orbit lines are approximate Keplerian ellipses for orientation, not ephemeris data.
- **Ephemeris precision.** Positions are interpolated from 12-hour samples and are not live to the second. The approximate fallback ignores the UTC→TDB offset (about 69 s).
- **Gaia coverage.** The live Gaia query is capped at 3,000 rows, and the "result truncated" warning is shown in the UI. Larger regions would need server-side spatial queries or preprocessed tiles. `StarCatalogAdapter` in `lib/data/gaia.ts` is the place to plug these in.
- **Server cache.** The cache is in-memory and per process. Use a shared cache if you deploy more than one instance.

## Accessibility

- **Keyboard:** arrow keys orbit, `+` and `−` zoom, `R` resets the view, `1`, `2` and `3` switch scales, `/` focuses search and `Esc` clears the selection. In the Solar System view, `Space` plays or pauses and `,` and `.` step one day.
- **Search:** follows the ARIA combobox pattern. The details panel is a labelled landmark.
- **Reduced motion:** `prefers-reduced-motion` makes camera transitions instant and disables orbit damping.
- **No WebGL:** if WebGL is unavailable or the renderer fails, a fallback lists the nearest systems, and search and details still work.

## Tests

`npm test` runs these suites:

| Suite | Covers |
| --- | --- |
| `units-coords` | Unit conversions, the Galactic Centre, North Galactic Pole and Sirius checks, handedness |
| `kepler` | The approximate model against real Horizons vectors |
| `interpolate-solar` | Hermite interpolation (exact for cubics; real Moon mid-point < 1e-6 au), chunking |
| `normalize` | Archive, Gaia and Horizons normalisation and parsing, including error and missing-value handling |
| `routes` | Route Handler validation (400s), live parsing, server caching, fallbacks on HTTP errors, network errors and malformed payloads, `DATA_MODE=sample` |
| `explorer` (jsdom) | Searching for and selecting a system shows its details and source; a Gaia star shows "no confirmed planets"; the no-WebGL fallback |
