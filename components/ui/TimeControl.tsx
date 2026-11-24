"use client";

import { EPHEMERIS_MAX_MS, EPHEMERIS_MIN_MS, formatUtc, fromDateTimeLocalUtc, toDateTimeLocalUtc } from "@/lib/astro/time";
import type { DataOrigin } from "@/lib/types/astro";
import { OriginBadge } from "./SourceBadge";
import styles from "./ui.module.css";

export const SPEEDS: { value: number; label: string }[] = [
  { value: -30, label: "−30 days / s" },
  { value: -7, label: "−1 week / s" },
  { value: -1, label: "−1 day / s" },
  { value: 1 / 24, label: "1 hour / s" },
  { value: 1, label: "1 day / s" },
  { value: 7, label: "1 week / s" },
  { value: 30, label: "30 days / s" },
];

interface Props {
  timeMs: number | null;
  playing: boolean;
  speed: number;
  waiting: boolean;
  origin: DataOrigin | null;
  status: "pending" | "error" | "success";
  errorMessage?: string;
  onRetry: () => void;
  onTimeChange: (ms: number) => void;
  onNow: () => void;
  onTogglePlay: () => void;
  onSpeedChange: (daysPerSecond: number) => void;
  onStep: (days: number) => void;
}

export function TimeControl(p: Props) {
  const sourceText =
    p.origin === "live"
      ? "Positions calculated from JPL Horizons ephemeris data (12 h samples, interpolated)."
      : p.origin === "model"
        ? "Horizons unavailable: positions from an approximate analytic model."
        : "Ephemeris data";
  return (
    <section className={styles.timeBar} aria-label="Solar System time controls">
      <div className={styles.timeRow}>
        <button type="button" className={styles.btn} onClick={() => p.onStep(-1)} aria-label="Back one day (,)">
          ◀ 1d
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={p.onTogglePlay} aria-pressed={p.playing} aria-label={p.playing ? "Pause (Space)" : "Play (Space)"}>
          {p.playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button type="button" className={styles.btn} onClick={() => p.onStep(1)} aria-label="Forward one day (.)">
          1d ▶
        </button>
        <label className={styles.inline}>
          <span className="sr-only">Playback speed</span>
          <select className={styles.select} value={p.speed} onChange={(e) => p.onSpeedChange(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.inline}>
          <span className={styles.dim}>UTC</span>
          <input
            className={styles.dateInput}
            type="datetime-local"
            min={toDateTimeLocalUtc(EPHEMERIS_MIN_MS)}
            max={toDateTimeLocalUtc(EPHEMERIS_MAX_MS)}
            value={p.timeMs != null ? toDateTimeLocalUtc(p.timeMs) : ""}
            onChange={(e) => {
              const ms = fromDateTimeLocalUtc(e.target.value);
              if (ms != null && ms >= EPHEMERIS_MIN_MS && ms <= EPHEMERIS_MAX_MS) p.onTimeChange(ms);
            }}
            aria-label="Date and time (UTC)"
          />
        </label>
        <button type="button" className={styles.btn} onClick={p.onNow}>
          Now
        </button>
      </div>
      <div className={styles.timeStatus} role="status" aria-live="polite">
        <strong>{p.timeMs != null ? formatUtc(p.timeMs) : "—"}</strong>
        {p.origin && <OriginBadge origin={p.origin} />}
        {p.status === "pending" && <span className={styles.dim}>Loading ephemeris…</span>}
        {p.status === "error" && (
          <span className={styles.error}>
            {p.errorMessage ?? "Ephemeris failed to load."}{" "}
            <button type="button" className={styles.linkBtn} onClick={p.onRetry}>
              Retry
            </button>
          </span>
        )}
        {p.status === "success" && <span className={styles.dim}>{sourceText}</span>}
        {p.waiting && p.playing && <span className={styles.warnText}>Waiting for the next ephemeris window…</span>}
      </div>
    </section>
  );
}
