"use client";

import type { SourceInfo } from "@/lib/types/astro";
import { OriginBadge, formatTimestamp } from "./SourceBadge";
import styles from "./ui.module.css";

export interface DatasetStatus {
  label: string;
  status: "pending" | "error" | "success";
  source?: SourceInfo;
  summary?: string;
  warnings?: string[];
  errorMessage?: string;
  onRetry?: () => void;
}

/** Compact list of the datasets in use, with origin (live / sample / model) and fetch time. */
export function DataStatus({ items }: { items: DatasetStatus[] }) {
  return (
    <section aria-label="Data sources" className={styles.section}>
      <h2 className={styles.sectionTitle}>Data sources</h2>
      <ul className={styles.statusList}>
        {items.map((it) => (
          <li key={it.label} className={styles.statusItem}>
            <div className={styles.statusHead}>
              <span>{it.label}</span>
              {it.status === "pending" && <span className={styles.dim} role="status">Loading…</span>}
              {it.status === "error" && <span className={styles.error}>Failed</span>}
              {it.status === "success" && it.source && <OriginBadge origin={it.source.origin} />}
            </div>
            {it.status === "success" && it.source && (
              <div className={styles.faint}>
                <a href={it.source.url} target="_blank" rel="noreferrer">
                  {it.source.name}
                </a>
                {" · "}
                {formatTimestamp(it.source.fetchedAt)}
                {it.summary && <> · {it.summary}</>}
              </div>
            )}
            {it.warnings?.map((w) => (
              <div key={w} className={styles.warnText}>
                {w}
              </div>
            ))}
            {it.status === "error" && (
              <div className={styles.error}>
                {it.errorMessage ?? "Could not load."}{" "}
                {it.onRetry && (
                  <button type="button" className={styles.linkBtn} onClick={it.onRetry}>
                    Retry
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
