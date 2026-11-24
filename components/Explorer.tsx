"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zUpToScene, type Vec3 } from "@/lib/astro/coords";
import { EPHEMERIS_MAX_MS, EPHEMERIS_MIN_MS, MS_PER_DAY } from "@/lib/astro/time";
import { formatDistancePc } from "@/lib/astro/units";
import { usePrefersReducedMotion, useWebGLSupport } from "@/lib/client/hooks";
import { queryKeys, useEphemerisChunks, useExoplanets, useStars } from "@/lib/client/queries";
import {
  buildCatalogPoints,
  filterPoints,
  galaxyScenePosition,
  localScenePosition,
  prioritizedLabels,
  starKey,
  systemKey,
  type CatalogPoint,
} from "@/lib/scene/catalog";
import { BODY_INFO, bodyStateAt, chunkIndexFor, displayPositionAu } from "@/lib/scene/solar";
import {
  DEFAULT_POSES,
  VIEWS,
  VIEW_ORDER,
  parseSelectionKey,
  selectionKey,
  transitionPoses,
  type CameraApi,
  type Pose,
  type Selection,
  type ViewMode,
} from "@/lib/scene/views";
import { SOLAR_BODIES, type EphemerisResponse, type SolarBodyId } from "@/lib/types/astro";
import LazySceneCanvas from "./scene/LazySceneCanvas";
import type { HoverEvent } from "./scene/ScreenPicker";
import { DataStatus } from "./ui/DataStatus";
import { DetailsPanel } from "./ui/DetailsPanel";
import { SearchBox, type SearchItem } from "./ui/SearchBox";
import { TimeControl } from "./ui/TimeControl";
import styles from "./ui/ui.module.css";

const RADIUS_OPTIONS = [10, 25, 50, 100, 250, 1000];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName);
}

export function Explorer() {
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useWebGLSupport();
  const [renderFailed, setRenderFailed] = useState(false);
  const show3d = webgl === "supported" && !renderFailed;

  const queryClient = useQueryClient();
  const exo = useExoplanets();
  const stars = useStars();

  // --- view / camera state -------------------------------------------------
  const [mode, setMode] = useState<ViewMode>("galaxy");
  const [entryPose, setEntryPose] = useState<Pose | null>(null);
  const [transitionTo, setTransitionTo] = useState<ViewMode | null>(null);
  const pendingAfter = useRef<(() => void) | null>(null);
  const cameraApi = useRef<CameraApi | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // --- selection / filters ----------------------------------------------------
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hover, setHover] = useState<HoverEvent | null>(null);
  const [hostsOnly, setHostsOnly] = useState(false);
  const [maxDistancePc, setMaxDistancePc] = useState(50);

  // --- Solar System time (ref drives the render loop; state drives the UI) ------
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    // Initialise "now" on the client only (avoids a server/client clock mismatch).
    const now = Date.now();
    timeRef.current = now;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeMs(now);
  }, []);

  const setTime = useCallback((ms: number) => {
    const clamped = Math.min(EPHEMERIS_MAX_MS, Math.max(EPHEMERIS_MIN_MS, ms));
    timeRef.current = clamped;
    setTimeMs(clamped);
  }, []);
  const setPlayingBoth = useCallback((p: boolean) => {
    playingRef.current = p;
    setPlaying(p);
  }, []);
  const setSpeedBoth = useCallback((s: number) => {
    speedRef.current = s;
    setSpeed(s);
  }, []);

  const needEphemeris = timeMs != null && (mode === "solar" || selection?.kind === "body");
  const eph = useEphemerisChunks(timeMs ?? 0, needEphemeris, speed < 0 ? -1 : 1);
  const ephemeris: EphemerisResponse | undefined = eph.current.data;

  const getPositions = useCallback(
    (ms: number) => {
      const data = queryClient.getQueryData<EphemerisResponse>(queryKeys.ephemeris(chunkIndexFor(ms)));
      if (!data) return null;
      const out: Partial<Record<SolarBodyId, Vec3>> = {};
      for (const b of SOLAR_BODIES) {
        const s = bodyStateAt(data, b, ms);
        if (!s) return null;
        out[b] = s.positionAu;
      }
      return out;
    },
    [queryClient],
  );

  const onTick = useCallback((ms: number, w: boolean) => {
    setTimeMs((prev) => (prev === ms ? prev : ms));
    setWaiting((prev) => (prev === w ? prev : w));
  }, []);

  // --- catalogue-derived data --------------------------------------------------
  const systems = useMemo(() => exo.data?.systems ?? [], [exo.data]);
  const starList = useMemo(() => stars.data?.stars ?? [], [stars.data]);
  const catalog = useMemo(() => buildCatalogPoints(systems, starList), [systems, starList]);
  const galaxyHosts = useMemo(() => catalog.points.filter((p) => p.kind === "system"), [catalog]);
  const localPoints = useMemo(() => filterPoints(catalog.points, { hostsOnly, maxDistancePc }), [catalog, hostsOnly, maxDistancePc]);
  const labelPoints = useMemo(() => prioritizedLabels(localPoints, 8), [localPoints]);
  const systemsById = useMemo(() => new Map(systems.map((s) => [s.id, s])), [systems]);
  const starsById = useMemo(() => new Map(starList.map((s) => [s.id, s])), [starList]);
  const pointsByKey = useMemo(() => new Map(catalog.points.map((p) => [p.key, p])), [catalog]);

  const nameFor = useCallback(
    (key: string) => {
      const p = pointsByKey.get(key);
      if (p) return p.name;
      const sel = parseSelectionKey(key);
      return sel?.kind === "body" ? BODY_INFO[sel.id].name : key;
    },
    [pointsByKey],
  );

  const searchItemsList = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = SOLAR_BODIES.map((b) => ({
      key: `body:${b}`,
      label: BODY_INFO[b].name,
      sublabel: `Solar System · ${BODY_INFO[b].kind}`,
      terms: [BODY_INFO[b].name.toLowerCase()],
      rank: 10000,
    }));
    for (const s of systems) {
      items.push({
        key: systemKey(s.id),
        label: s.name,
        sublabel: `${plural(s.planets.length, "planet")} · ${s.distancePc.value != null ? `${s.distancePc.value.toFixed(1)} pc` : "distance n/a"}`,
        terms: [s.name, ...s.altNames, ...s.planets.map((p) => p.name)].map((t) => t.toLowerCase()),
        rank: 100 + s.planets.length,
      });
    }
    for (const st of starList) {
      if (!pointsByKey.has(starKey(st.id))) continue; // merged with a host system
      items.push({ key: starKey(st.id), label: st.name, sublabel: `Gaia star · ${st.distancePc?.toFixed(1) ?? "?"} pc`, terms: [st.name.toLowerCase()], rank: 0 });
    }
    return items;
  }, [systems, starList, pointsByKey]);

  // --- transitions ------------------------------------------------------------
  const goToMode = useCallback(
    (target: ViewMode, after?: () => void) => {
      setHover(null);
      if (target === mode) {
        after?.();
        return;
      }
      if (transitionTo) return;
      const api = cameraApi.current;
      if (!show3d || !api || reducedMotion) {
        pendingAfter.current = after ?? null;
        setEntryPose(null);
        setMode(target);
        if (!show3d) {
          pendingAfter.current = null;
        }
        return;
      }
      const { exit, entry } = transitionPoses(mode, target);
      setTransitionTo(target);
      api.flyTo(exit, 900, () => {
        pendingAfter.current = after ?? null;
        setEntryPose(entry);
        setMode(target);
      });
    },
    [mode, transitionTo, show3d, reducedMotion],
  );

  const onEntryDone = useCallback(() => {
    setTransitionTo(null);
    setEntryPose(null);
    const after = pendingAfter.current;
    pendingAfter.current = null;
    after?.();
  }, []);

  const focusPoint = useCallback((p: CatalogPoint, view: ViewMode) => {
    const api = cameraApi.current;
    if (!api) return;
    if (view === "local") api.focus(localScenePosition(p), Math.max(4, Math.min(40, (p.distancePc ?? 10) * 0.6)));
    else api.focus(galaxyScenePosition(p), 0.6);
  }, []);

  const focusBody = useCallback(
    (id: SolarBodyId) => {
      const api = cameraApi.current;
      const pos = getPositions(timeRef.current);
      const d = pos ? displayPositionAu(id, pos) : null;
      if (!api || !d) return;
      api.focus(zUpToScene(d), Math.max(0.35, BODY_INFO[id].displayRadiusAu * 14));
    },
    [getPositions],
  );

  const choose = useCallback(
    (key: string) => {
      const sel = parseSelectionKey(key);
      if (!sel) return;
      setSelection(sel);
      if (sel.kind === "body") {
        goToMode("solar", () => focusBody(sel.id));
        return;
      }
      const p = pointsByKey.get(key);
      if (!p) return; // not placed (missing distance) — details panel explains
      if (sel.kind === "star" && hostsOnly) setHostsOnly(false);
      const target: ViewMode = sel.kind === "star" || (p.distancePc ?? Infinity) <= maxDistancePc ? "local" : "galaxy";
      goToMode(target, () => focusPoint(p, target));
    },
    [goToMode, focusBody, focusPoint, pointsByKey, hostsOnly, maxDistancePc],
  );

  const onSceneSelect = useCallback((key: string | null) => {
    setSelection(key ? parseSelectionKey(key) : null);
  }, []);

  const resetView = useCallback(() => {
    cameraApi.current?.flyTo(DEFAULT_POSES[mode], 900);
  }, [mode]);

  const focusSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "body") return focusBody(selection.id);
    const p = pointsByKey.get(selectionKey(selection));
    if (!p) return;
    if (mode === "solar") goToMode("local", () => focusPoint(p, "local"));
    else focusPoint(p, mode);
  }, [selection, pointsByKey, mode, focusBody, focusPoint, goToMode]);

  // --- keyboard controls ---------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTypingTarget(e.target)) return;
      const api = cameraApi.current;
      const step = 0.08;
      switch (e.key) {
        case "ArrowLeft": api?.orbit(step, 0); break;
        case "ArrowRight": api?.orbit(-step, 0); break;
        case "ArrowUp": api?.orbit(0, -step); break;
        case "ArrowDown": api?.orbit(0, step); break;
        case "+": case "=": api?.zoom(0.85); break;
        case "-": case "_": api?.zoom(1 / 0.85); break;
        case "r": case "R": resetView(); break;
        case "1": goToMode("galaxy"); break;
        case "2": goToMode("local"); break;
        case "3": goToMode("solar"); break;
        case "Escape": setSelection(null); break;
        case " ":
          if (mode !== "solar") return;
          setPlayingBoth(!playingRef.current);
          break;
        case ",": if (mode === "solar") setTime(timeRef.current - MS_PER_DAY); else return; break;
        case ".": if (mode === "solar") setTime(timeRef.current + MS_PER_DAY); else return; break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToMode, resetView, mode, setPlayingBoth, setTime]);

  // --- derived UI bits --------------------------------------------------------------
  const selectedKey = selection ? selectionKey(selection) : null;
  const hoveredKey = hover?.key ?? null;
  const selectedPoint = selectedKey ? pointsByKey.get(selectedKey) : undefined;
  const visibleCounts = useMemo(() => {
    let sys = 0;
    let st = 0;
    for (const p of localPoints) {
      if (p.kind === "system") sys++;
      else st++;
    }
    return { sys, st };
  }, [localPoints]);

  const tooltip = hover ? renderTooltip(hover.key) : null;
  function renderTooltip(key: string) {
    const sel = parseSelectionKey(key);
    if (!sel) return null;
    if (sel.kind === "body") {
      const pos = timeMs != null ? getPositions(timeMs) : null;
      const p = pos?.[sel.id];
      return (
        <>
          <strong>{BODY_INFO[sel.id].name}</strong>
          <span>{sel.id === "sun" ? "Star" : p ? `${Math.hypot(...p).toFixed(3)} au from the Sun` : BODY_INFO[sel.id].kind}</span>
        </>
      );
    }
    const p = pointsByKey.get(key);
    if (!p) return null;
    return (
      <>
        <strong>{p.name}</strong>
        <span>{formatDistancePc(p.distancePc)}</span>
        <span>{p.planetCount > 0 ? `${plural(p.planetCount, "confirmed planet")}` : "No confirmed planets in this dataset"}</span>
      </>
    );
  }

  const exoStatus = exo.isPending ? "pending" : exo.isError ? "error" : "success";
  const starStatus = stars.isPending ? "pending" : stars.isError ? "error" : "success";
  const ephStatus = eph.current.isPending ? "pending" : eph.current.isError ? "error" : "success";
  const view = VIEWS[mode];

  return (
    <main className={styles.app}>
      <h1 className="sr-only">Milky Way View: interactive galaxy, nearby stars and Solar System explorer</h1>

      <div className={styles.stage} aria-describedby="keyboard-help">
        {webgl === "checking" && (
          <div className={styles.centerNote} role="status">
            Preparing 3D view…
          </div>
        )}
        {show3d && (
          <LazySceneCanvas
            mode={mode}
            entryPose={entryPose}
            onEntryDone={onEntryDone}
            reducedMotion={reducedMotion}
            cameraApiRef={cameraApi}
            galaxyHosts={galaxyHosts}
            localPoints={localPoints}
            labelPoints={labelPoints}
            maxDistancePc={maxDistancePc}
            selectedKey={selectedKey}
            hoveredKey={hoveredKey}
            nameFor={nameFor}
            onHover={setHover}
            onSelect={onSceneSelect}
            onRenderError={() => setRenderFailed(true)}
            solar={{ timeRef, playingRef, speedRef, getPositions, onTick, orbitEpochMs: timeMs != null ? Math.floor(timeMs / (365 * MS_PER_DAY)) * 365 * MS_PER_DAY : 0 }}
          />
        )}
        {(webgl === "unsupported" || renderFailed) && (
          <div className={styles.fallback} role="alert">
            <h2>3D view unavailable</h2>
            <p>
              {renderFailed ? "The 3D renderer failed to start." : "This browser or device does not support WebGL."} You can still search the catalogues and
              open details for any system, star or Solar System body.
            </p>
            {systems.length > 0 && (
              <>
                <h3>Nearest known exoplanet host systems</h3>
                <ul className={styles.fallbackList}>
                  {systems.slice(0, 12).map((s) => (
                    <li key={s.id}>
                      <button type="button" className={styles.linkBtn} onClick={() => setSelection({ kind: "system", id: s.id })}>
                        {s.name}
                      </button>{" "}
                      <span className={styles.faint}>
                        {formatDistancePc(s.distancePc.value)} · {plural(s.planets.length, "planet")}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {tooltip && hover && (
          <div className={styles.tooltip} style={{ left: hover.x + 14, top: hover.y + 14 }} role="tooltip">
            {tooltip}
          </div>
        )}

        {transitionTo && (
          <div className={styles.transition} role="status" aria-live="polite">
            Entering {VIEWS[transitionTo].label} · {VIEWS[transitionTo].unit}
          </div>
        )}

        {show3d && mode === "local" && catalog.points.length > 0 && localPoints.length === 0 && (
          <div className={styles.centerNote} role="status">
            No objects match the current filters. Try a larger radius.
          </div>
        )}
        {show3d && mode !== "solar" && exo.isSuccess && systems.length === 0 && (
          <div className={styles.centerNote} role="status">
            The exoplanet dataset is empty.
          </div>
        )}
      </div>

      {/* ---------------- Control panel ---------------- */}
      <section className={styles.panel} aria-label="Controls">
        <header className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">✦</span>
          <div>
            <div className={styles.title}>Milky Way View</div>
            <div className={styles.subtitle}>Milky Way · nearby stars · Solar System</div>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Scale">
          {VIEW_ORDER.map((m, i) => (
            <button
              key={m}
              type="button"
              className={`${styles.tab} ${m === mode ? styles.tabActive : ""}`}
              aria-pressed={m === mode}
              onClick={() => goToMode(m)}
              disabled={!!transitionTo}
              title={`${VIEWS[m].label} (${i + 1})`}
            >
              {VIEWS[m].label}
            </button>
          ))}
        </nav>
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={resetView} disabled={!show3d}>
            Reset view
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => goToMode("solar")} disabled={mode === "solar" || !!transitionTo}>
            Go to Solar System
          </button>
        </div>

        <SearchBox items={searchItemsList} onChoose={choose} inputRef={searchRef} />

        {mode !== "solar" && (
          <section className={styles.section} aria-label="Filters">
            <h2 className={styles.sectionTitle}>Filters</h2>
            <label className={styles.check}>
              <input type="checkbox" checked={hostsOnly} onChange={(e) => setHostsOnly(e.target.checked)} />
              Known exoplanet host systems only
            </label>
            <label className={styles.field}>
              <span>Nearby view radius</span>
              <select className={styles.select} value={maxDistancePc} onChange={(e) => setMaxDistancePc(Number(e.target.value))}>
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} pc ({Math.round(r * 3.26)} ly)
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.faint}>
              {mode === "local"
                ? `Showing ${plural(visibleCounts.sys, "host system")}${hostsOnly ? "" : ` and ${plural(visibleCounts.st, "Gaia star")}`} within ${maxDistancePc} pc.`
                : `Showing ${plural(galaxyHosts.length, "host system")} (zoom toward the Sun to reveal them).`}
              {stars.data && ` Gaia stars come from a bounded query (≤ ${Math.round(1000 / stars.data.query.minParallaxMas)} pc).`}
              {catalog.unplacedSystems > 0 && ` ${plural(catalog.unplacedSystems, "system")} without a published distance are searchable but not plotted.`}
            </p>
          </section>
        )}

        <section className={styles.section} aria-label="Legend">
          <h2 className={styles.sectionTitle}>Legend · {view.unit}</h2>
          <ul className={styles.legend}>
            {mode === "galaxy" && (
              <>
                <li><span className={styles.swatchGalaxy} /> Illustrative galaxy model (not individual stars)</li>
                <li><span className={styles.swatchHost} /> Known exoplanet host system (catalogue)</li>
                <li><span className={styles.swatchSun} /> Sun</li>
              </>
            )}
            {mode === "local" && (
              <>
                <li><span className={styles.swatchHost} /> Known exoplanet host system</li>
                <li><span className={styles.swatchStar} /> Gaia DR3 star (no confirmed planets in this dataset), tinted by colour</li>
                <li><span className={styles.swatchSun} /> Sun · rings mark distance in the Galactic plane</li>
              </>
            )}
            {mode === "solar" && (
              <>
                <li><span className={styles.swatchSun} /> Sun, planets and Moon at the selected time</li>
                <li><span className={styles.swatchOrbit} /> Orbit guides: approximate Keplerian ellipses</li>
              </>
            )}
          </ul>
        </section>

        <DataStatus
          items={[
            {
              label: "Exoplanet host systems",
              status: exoStatus,
              source: exo.data?.source,
              summary: exo.data ? `${exo.data.systems.length} systems, ${exo.data.planetCount} planets` : undefined,
              warnings: exo.data?.warnings,
              errorMessage: exo.error?.message,
              onRetry: () => exo.refetch(),
            },
            {
              label: "Nearby stars (Gaia)",
              status: starStatus,
              source: stars.data?.source,
              summary: stars.data ? `${stars.data.stars.length} stars` : undefined,
              warnings: stars.data?.warnings,
              errorMessage: stars.error?.message,
              onRetry: () => stars.refetch(),
            },
            ...(needEphemeris || ephemeris
              ? [
                  {
                    label: "Solar System ephemeris",
                    status: ephStatus,
                    source: ephemeris?.source,
                    summary: ephemeris ? `window ${ephemeris.start.slice(0, 10)} → ${ephemeris.stop.slice(0, 10)}` : undefined,
                    warnings: ephemeris?.warnings,
                    errorMessage: eph.current.error?.message,
                    onRetry: () => eph.current.refetch(),
                  } as const,
                ]
              : []),
          ]}
        />

        <details className={styles.section} id="keyboard-help">
          <summary className={styles.sectionTitle}>Keyboard &amp; mouse</summary>
          <ul className={styles.keys}>
            <li><kbd>Drag</kbd> rotate · <kbd>Right-drag</kbd> pan · <kbd>Wheel</kbd>/pinch zoom</li>
            <li><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> orbit · <kbd>+</kbd>/<kbd>−</kbd> zoom · <kbd>R</kbd> reset</li>
            <li><kbd>1</kbd> Milky Way · <kbd>2</kbd> Nearby stars · <kbd>3</kbd> Solar System</li>
            <li><kbd>/</kbd> search · <kbd>Esc</kbd> clear selection</li>
            <li><kbd>Space</kbd> play/pause · <kbd>,</kbd>/<kbd>.</kbd> ±1 day (Solar System)</li>
          </ul>
          {reducedMotion && <p className={styles.faint}>Reduced motion is on: camera transitions are instant.</p>}
        </details>
      </section>

      {selection && (
        <DetailsPanel
          selection={selection}
          system={selection.kind === "system" ? systemsById.get(selection.id) : undefined}
          star={selection.kind === "star" ? starsById.get(selection.id) : undefined}
          placed={selection.kind === "body" || !!selectedPoint}
          exoplanetSource={exo.data?.source}
          starSource={stars.data?.source}
          ephemeris={ephemeris}
          timeMs={timeMs}
          onClose={() => setSelection(null)}
          onFocus={show3d && (selection.kind === "body" || selectedPoint) ? focusSelection : undefined}
        />
      )}

      {mode === "solar" && (
        <TimeControl
          timeMs={timeMs}
          playing={playing}
          speed={speed}
          waiting={waiting}
          origin={ephemeris?.source.origin ?? null}
          status={ephStatus}
          errorMessage={eph.current.error?.message}
          onRetry={() => eph.current.refetch()}
          onTimeChange={setTime}
          onNow={() => setTime(Date.now())}
          onTogglePlay={() => setPlayingBoth(!playingRef.current)}
          onSpeedChange={setSpeedBoth}
          onStep={(days) => setTime(timeRef.current + days * MS_PER_DAY)}
        />
      )}

      <footer className={styles.note} role="note">
        <strong>Scale note:</strong> distances, marker sizes and the galaxy&apos;s appearance may be stylised or adjusted for usability. {view.scaleNote}
      </footer>
    </main>
  );
}
