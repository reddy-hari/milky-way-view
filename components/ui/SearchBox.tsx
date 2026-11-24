"use client";

import { useId, useMemo, useState } from "react";
import styles from "./ui.module.css";

export interface SearchItem {
  key: string;
  label: string;
  sublabel: string;
  /** Lower-cased names and aliases to match against. */
  terms: string[];
  /** Higher ranks first among equal matches. */
  rank: number;
}

const squash = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");

export function searchItems(items: readonly SearchItem[], query: string, max = 8): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const qs = squash(q);
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    let score = 0;
    for (const t of item.terms) {
      const ts = squash(t);
      if (t === q || ts === qs) score = Math.max(score, 3);
      else if (t.startsWith(q) || ts.startsWith(qs)) score = Math.max(score, 2);
      else if (t.includes(q) || ts.includes(qs)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || b.item.rank - a.item.rank || a.item.label.localeCompare(b.item.label));
  return scored.slice(0, max).map((s) => s.item);
}

interface Props {
  items: readonly SearchItem[];
  onChoose: (key: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
}

/** Accessible combobox (WAI-ARIA 1.2 pattern) for star / system / body names. */
export function SearchBox({ items, onChoose, inputRef, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchItems(items, query), [items, query]);
  const expanded = open && query.trim().length > 0;

  const choose = (item: SearchItem) => {
    onChoose(item.key);
    setQuery(item.label);
    setOpen(false);
  };

  return (
    <div className={styles.search}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search stars, exoplanet systems and Solar System bodies
      </label>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        className={styles.searchInput}
        type="search"
        placeholder="Search systems, stars, planets…  ( / )"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && results[active] ? `${listId}-opt-${active}` : undefined}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <ul id={listId} role="listbox" className={styles.searchList} aria-label="Search results">
          {results.length === 0 ? (
            <li className={styles.searchEmpty} role="presentation">
              No matching names in the loaded datasets
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.key}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`${styles.searchOption} ${i === active ? styles.searchOptionActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{r.label}</span>
                <span className={styles.searchSub}>{r.sublabel}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
