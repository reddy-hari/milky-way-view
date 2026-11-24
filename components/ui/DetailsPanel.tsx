"use client";

import { cartesianToSpherical, equatorialToGalactic, type Vec3 } from "@/lib/astro/coords";
import { formatUtc } from "@/lib/astro/time";
import { AU_KM, auPerDayToKmPerS, formatDec, formatDistancePc, formatRa } from "@/lib/astro/units";
import { BODY_INFO, MOON_DISTANCE_EXAGGERATION, bodyStateAt } from "@/lib/scene/solar";
import type { Selection } from "@/lib/scene/views";
import type { CatalogStar, EphemerisResponse, ExoplanetSystem, Measurement, SourceInfo } from "@/lib/types/astro";
import { SourceLine } from "./SourceBadge";
import styles from "./ui.module.css";

interface Props {
  selection: Selection;
  system?: ExoplanetSystem;
  star?: CatalogStar;
  /** Whether the selected catalogue object has a 3D position in the scene. */
  placed: boolean;
  exoplanetSource?: SourceInfo;
  starSource?: SourceInfo;
  ephemeris?: EphemerisResponse;
  timeMs: number | null;
  onClose: () => void;
  onFocus?: () => void;
}

const missing = <span className={styles.missing}>Not available</span>;

function fmt(v: number | null | undefined, digits = 2, unit = ""): React.ReactNode {
  if (v == null) return <span className={styles.missing}>—</span>;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
}

function fmtMeasurement(m: Measurement, digits: number, unit: string): React.ReactNode {
  if (m.value == null) return <span className={styles.missing}>Not available</span>;
  const v = m.value.toFixed(digits);
  if (m.errPlus == null && m.errMinus == null) return `${v} ${unit} (uncertainty not published)`;
  if (m.errPlus != null && m.errMinus != null && Math.abs(m.errPlus - m.errMinus) < 10 ** -digits) {
    return `${v} ± ${m.errPlus.toFixed(digits)} ${unit}`;
  }
  return (
    <>
      {v}
      <sup>+{m.errPlus?.toFixed(digits) ?? "?"}</sup>
      <sub>−{m.errMinus?.toFixed(digits) ?? "?"}</sub> {unit}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Coordinates({ ra, dec, epochNote }: { ra: number | null; dec: number | null; epochNote: string }) {
  if (ra == null || dec == null) return <Row k="Position">{missing}</Row>;
  const g = equatorialToGalactic(ra, dec);
  return (
    <>
      <Row k="RA (ICRS)">
        {formatRa(ra)} <span className={styles.faint}>({ra.toFixed(4)}°)</span>
      </Row>
      <Row k="Dec (ICRS)">
        {formatDec(dec)} <span className={styles.faint}>({dec.toFixed(4)}°)</span>
      </Row>
      <Row k="Galactic l, b">
        {g.lDeg.toFixed(2)}°, {g.bDeg.toFixed(2)}° <span className={styles.faint}>(derived)</span>
      </Row>
      <Row k="Astrometric epoch">{epochNote}</Row>
    </>
  );
}

function SystemDetails({ system, placed, source }: { system: ExoplanetSystem; placed: boolean; source?: SourceInfo }) {
  return (
    <>
      <p className={styles.kicker}>Known exoplanet host system</p>
      <h2 id="details-title" className={styles.detailsTitle}>{system.name}</h2>
      {system.altNames.length > 0 && <p className={styles.dim}>Also: {system.altNames.join(" · ")}</p>}
      {!placed && (
        <p className={styles.notice} role="note">
          Not placed in the 3D view: the archive does not list a distance (or position) for this system, and we do not estimate one.
        </p>
      )}
      <dl className={styles.dl}>
        <Row k="Distance">{system.distancePc.value == null ? missing : <>{fmtMeasurement(system.distancePc, 2, "pc")}<br /><span className={styles.faint}>{formatDistancePc(system.distancePc.value)}</span></>}</Row>
        <Row k="Parallax">{fmtMeasurement(system.parallaxMas, 4, "mas")}</Row>
        <Coordinates ra={system.raDeg} dec={system.decDeg} epochNote="As published by the archive (mostly Gaia DR3-based, J2016.0); not propagated" />
        <Row k="Spectral type">{system.spectralType ?? <span className={styles.missing}>—</span>}</Row>
        <Row k="Effective temp.">{fmt(system.effectiveTempK, 0, "K")}</Row>
        <Row k="Stellar mass">{fmt(system.massSun, 3, "M☉")}</Row>
        <Row k="Stellar radius">{fmt(system.radiusSun, 3, "R☉")}</Row>
        <Row k="V magnitude">{fmt(system.vMag, 2)}</Row>
        <Row k="Stars in system">{fmt(system.starCount, 0)}</Row>
      </dl>

      <h3 className={styles.h3}>
        Confirmed planets ({system.planets.length}
        {system.reportedPlanetCount != null && system.reportedPlanetCount !== system.planets.length ? ` of ${system.reportedPlanetCount} reported` : ""})
      </h3>
      <p className={styles.faint}>
        Only the host star position is plotted. Planet orbits are not drawn: their full 3D orientation is generally unknown.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Planet</th>
              <th scope="col">Period (d)</th>
              <th scope="col">a (au)</th>
              <th scope="col">Radius (R⊕)</th>
              <th scope="col">Mass (M⊕)</th>
              <th scope="col">Ecc.</th>
              <th scope="col">Discovered</th>
            </tr>
          </thead>
          <tbody>
            {system.planets.map((p) => (
              <tr key={p.name}>
                <th scope="row">{p.name}</th>
                <td>{fmt(p.orbitalPeriodDays, 3)}</td>
                <td>{fmt(p.semiMajorAxisAu, 4)}</td>
                <td>{fmt(p.radiusEarth, 2)}</td>
                <td>{fmt(p.massEarth, 2)}</td>
                <td>{fmt(p.eccentricity, 3)}</td>
                <td>
                  {p.discoveryYear ?? "—"}
                  {p.discoveryMethod && <span className={styles.faint}> · {p.discoveryMethod}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.faint}>Values are the archive&apos;s composite (pscomppars) parameters; “—” means not published.</p>
      {source && <SourceLine source={source} />}
    </>
  );
}

function StarDetails({ star, source }: { star: CatalogStar; source?: SourceInfo }) {
  return (
    <>
      <p className={styles.kicker}>Catalogued star (Gaia DR3)</p>
      <h2 id="details-title" className={styles.detailsTitle}>{star.name}</h2>
      <p className={styles.notice} role="note">No confirmed planets in this dataset.</p>
      <dl className={styles.dl}>
        <Row k="Parallax">
          {star.parallaxMas.toFixed(4)} {star.parallaxErrorMas != null ? `± ${star.parallaxErrorMas.toFixed(4)}` : ""} mas
        </Row>
        <Row k="Distance">
          {formatDistancePc(star.distancePc)}
          <br />
          <span className={styles.faint}>1 / parallax (parallax_over_error &gt; 10)</span>
        </Row>
        <Coordinates ra={star.raDeg} dec={star.decDeg} epochNote={star.refEpoch != null ? `J${star.refEpoch.toFixed(1)} (Gaia reference epoch)` : "Not available"} />
        <Row k="G magnitude">{fmt(star.gMag, 3)}</Row>
        <Row k="BP − RP colour">{fmt(star.bpRp, 3, "mag")}</Row>
      </dl>
      {source && <SourceLine source={source} />}
    </>
  );
}

function BodyDetails({ id, ephemeris, timeMs }: { id: keyof typeof BODY_INFO; ephemeris?: EphemerisResponse; timeMs: number | null }) {
  const info = BODY_INFO[id];
  const state = ephemeris && timeMs != null ? bodyStateAt(ephemeris, id, timeMs) : null;
  const earth = ephemeris && timeMs != null ? bodyStateAt(ephemeris, "earth", timeMs) : null;
  const helioDist = state ? Math.hypot(...state.positionAu) : null;
  const fromEarth =
    state && earth && id !== "earth" ? Math.hypot(...(state.positionAu.map((v, i) => v - earth.positionAu[i]) as Vec3)) : null;
  const ecl = state ? cartesianToSpherical(state.positionAu) : null;
  const speed = state?.velocityAuPerDay ? auPerDayToKmPerS(Math.hypot(...state.velocityAuPerDay)) : null;

  return (
    <>
      <p className={styles.kicker}>{info.kind}</p>
      <h2 id="details-title" className={styles.detailsTitle}>{info.name}</h2>
      {timeMs != null && <p className={styles.dim}>At {formatUtc(timeMs)}</p>}
      {!state ? (
        <p className={styles.dim} role="status">Ephemeris for this time is loading or unavailable.</p>
      ) : (
        <dl className={styles.dl}>
          {id !== "sun" && <Row k="Distance from Sun">{helioDist!.toFixed(5)} au <span className={styles.faint}>({((helioDist! * AU_KM) / 1e6).toFixed(2)} million km)</span></Row>}
          {fromEarth != null && (
            <Row k="Distance from Earth">
              {id === "moon" ? `${(fromEarth * AU_KM).toLocaleString("en-US", { maximumFractionDigits: 0 })} km` : `${fromEarth.toFixed(5)} au`}{" "}
              <span className={styles.faint}>(light time {((fromEarth * AU_KM) / 299792.458 / 60).toFixed(id === "moon" ? 3 : 1)} min)</span>
            </Row>
          )}
          {id !== "sun" && ecl && (
            <Row k="Heliocentric ecliptic lon, lat">
              {ecl.lonDeg.toFixed(3)}°, {ecl.latDeg.toFixed(3)}°
            </Row>
          )}
          {id !== "sun" && speed != null && <Row k="Heliocentric speed">{speed.toFixed(2)} km/s</Row>}
          <Row k="Position (x, y, z)">
            <span className={styles.mono}>{state.positionAu.map((v) => v.toFixed(6)).join(", ")}</span> au
          </Row>
          <Row k="Frame">{ephemeris!.frame.plane}, {ephemeris!.frame.center}</Row>
          <Row k="Time scale">{ephemeris!.frame.timeScale}</Row>
        </dl>
      )}
      {id === "moon" && (
        <p className={styles.faint}>In the view the Moon&apos;s distance from Earth is exaggerated ×{MOON_DISTANCE_EXAGGERATION}; values above are true distances.</p>
      )}
      <p className={styles.faint}>
        Positions are interpolated between {ephemeris?.stepHours ?? 12}-hour samples for display. They are not live to the second.
      </p>
      {ephemeris && <SourceLine source={ephemeris.source} />}
    </>
  );
}

export function DetailsPanel({ selection, system, star, placed, exoplanetSource, starSource, ephemeris, timeMs, onClose, onFocus }: Props) {
  return (
    <aside className={styles.details} aria-labelledby="details-title" aria-live="polite">
      <div className={styles.detailsActions}>
        {onFocus && (
          <button type="button" className={styles.btnSmall} onClick={onFocus}>
            Centre view
          </button>
        )}
        <button type="button" className={styles.btnSmall} onClick={onClose} aria-label="Close details (Esc)">
          ✕
        </button>
      </div>
      {selection.kind === "system" && (system ? <SystemDetails system={system} placed={placed} source={exoplanetSource} /> : <p>System not found in the loaded dataset.</p>)}
      {selection.kind === "star" && (star ? <StarDetails star={star} source={starSource} /> : <p>Star not found in the loaded dataset.</p>)}
      {selection.kind === "body" && <BodyDetails id={selection.id} ephemeris={ephemeris} timeMs={timeMs} />}
    </aside>
  );
}
