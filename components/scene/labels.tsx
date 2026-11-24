"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/astro/coords";
import styles from "./scene.module.css";

export type LabelVariant = "default" | "hover" | "selected" | "muted";

/**
 * A label anchored to a 3D point. `pos` may be mutated in place by its owner
 * (e.g. moving planets); the projector reads it every frame.
 */
export interface LabelSpec {
  key: string;
  text: string;
  variant: LabelVariant;
  ring?: boolean;
  pos: Vec3;
}

export type LabelSink = (labels: LabelSpec[]) => void;

export interface LabelRefs {
  labels: React.RefObject<LabelSpec[]>;
  elements: React.RefObject<Map<string, HTMLDivElement>>;
}

/**
 * Inside the Canvas: projects each label's 3D anchor to screen space every
 * frame and moves its DOM element (no React re-render, no extra React roots).
 */
const PRIORITY: Record<LabelVariant, number> = { selected: 0, hover: 1, default: 2, muted: 3 };

export function LabelProjector({ refs }: { refs: LabelRefs }) {
  const v = useRef(new THREE.Vector3());
  useFrame(({ camera, size }) => {
    const els = refs.elements.current;
    // Declutter: place labels in priority order (selected, hover, then list
    // order) and hide default/muted labels that would overlap placed ones.
    const ordered = [...refs.labels.current].sort((a, b) => PRIORITY[a.variant] - PRIORITY[b.variant]);
    const placed: [number, number, number, number][] = [];
    for (const l of ordered) {
      const el = els.get(l.key);
      if (!el) continue;
      v.current.set(l.pos[0], l.pos[1], l.pos[2]).project(camera);
      const visible = v.current.z > -1 && v.current.z < 1 && Math.abs(v.current.x) < 1.2 && Math.abs(v.current.y) < 1.2;
      if (!visible) {
        el.style.display = "none";
        continue;
      }
      const x = ((v.current.x + 1) / 2) * size.width;
      const y = ((1 - v.current.y) / 2) * size.height;
      const w = (el.lastElementChild as HTMLElement | null)?.offsetWidth || 60;
      const rect: [number, number, number, number] = [x + 8, y - 10, x + 14 + w, y + 10];
      const overlaps = placed.some((p) => rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1]);
      if (overlaps && PRIORITY[l.variant] >= 2) {
        el.style.display = "none";
        continue;
      }
      placed.push(rect);
      el.style.display = "block";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // Nearer labels on top.
      el.style.zIndex = String(Math.round((1 - v.current.z) * 1000) + (l.variant === "selected" ? 3000 : l.variant === "hover" ? 2000 : 0));
    }
  });
  return null;
}

/** Outside the Canvas: the DOM layer that holds the labels. */
export function LabelOverlay({ labels, refs }: { labels: LabelSpec[]; refs: LabelRefs }) {
  return (
    <div className={styles.overlay} aria-hidden="true">
      {labels.map((l) => (
        <div
          key={l.key}
          className={styles.anchor}
          style={{ display: "none" }}
          ref={(el) => {
            if (el) refs.elements.current.set(l.key, el);
            else refs.elements.current.delete(l.key);
          }}
        >
          {l.ring && <span className={`${styles.ring} ${l.variant === "selected" ? styles.ringSelected : ""}`} />}
          <span className={`${styles.label} ${styles[l.variant]}`}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}
