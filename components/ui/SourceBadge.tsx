import type { DataOrigin, SourceInfo } from "@/lib/types/astro";
import styles from "./ui.module.css";

const LABELS: Record<DataOrigin, string> = {
  live: "Live",
  sample: "Sample data",
  model: "Approximate model",
};

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  return <span className={`${styles.badge} ${styles[`badge_${origin}`]}`}>{LABELS[origin]}</span>;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Source line: name (linked), origin badge and fetch timestamp. */
export function SourceLine({ source, label = "Source" }: { source: SourceInfo; label?: string }) {
  return (
    <div className={styles.sourceLine}>
      <div>
        <span className={styles.dim}>{label}: </span>
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.name}
        </a>{" "}
        <OriginBadge origin={source.origin} />
      </div>
      <div className={styles.dim}>
        {source.origin === "sample" ? "Snapshot taken" : source.origin === "model" ? "Computed" : "Fetched"}: {formatTimestamp(source.fetchedAt)}
      </div>
      {source.note && <div className={styles.faint}>{source.note}</div>}
    </div>
  );
}
