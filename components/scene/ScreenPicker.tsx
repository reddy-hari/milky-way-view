"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface PickTargets {
  /** xyz triplets in scene units; may be mutated in place by the owner each frame. */
  positions: Float32Array;
  keys: string[];
}

export interface HoverEvent {
  key: string;
  /** Pointer position relative to the canvas, CSS px. */
  x: number;
  y: number;
}

interface Props {
  targetsRef: React.RefObject<PickTargets | null>;
  /** Returns false to disable picking (e.g. markers faded out at this zoom). */
  enabledRef?: React.RefObject<boolean>;
  radiusPx?: number;
  onHover: (e: HoverEvent | null) => void;
  onSelect: (key: string | null) => void;
}

/**
 * Screen-space picking for point markers: projects all targets and picks the
 * nearest within `radiusPx` of the pointer. Accurate for constant-pixel-size
 * markers (unlike world-space ray thresholds) and cheap for a few thousand
 * points. Distinguishes clicks from orbit drags by pointer travel.
 */
export function ScreenPicker({ targetsRef, enabledRef, radiusPx = 10, onHover, onSelect }: Props) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const matrix = useRef(new THREE.Matrix4());
  const handlers = useRef({ onHover, onSelect });
  useEffect(() => {
    handlers.current = { onHover, onSelect };
  }, [onHover, onSelect]);

  useEffect(() => {
    const el = gl.domElement;
    let raf = 0;
    let last: { x: number; y: number } | null = null;
    let down: { x: number; y: number } | null = null;
    let hovered: string | null = null;

    const pick = (x: number, y: number): string | null => {
      const t = targetsRef.current;
      if (!t || (enabledRef && !enabledRef.current)) return null;
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.updateMatrixWorld();
      const m = matrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
      const p = t.positions;
      const n = Math.min(t.keys.length, p.length / 3);
      let best = -1;
      let bestD2 = radiusPx * radiusPx;
      for (let i = 0; i < n; i++) {
        const px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2];
        const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
        if (cw <= 0) continue; // behind camera
        const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / cw + 1) * 0.5 * w;
        const sy = (1 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / cw) * 0.5 * h;
        const d2 = (sx - x) ** 2 + (sy - y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      return best >= 0 ? t.keys[best] : null;
    };

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      last = local(e);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        const key = down ? null : pick(last.x, last.y); // no hover while dragging
        if (key !== hovered || key) {
          hovered = key;
          handlers.current.onHover(key ? { key, x: last.x, y: last.y } : null);
        }
        el.style.cursor = key ? "pointer" : "";
      });
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = local(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !down) return;
      const up = local(e);
      const moved = Math.hypot(up.x - down.x, up.y - down.y);
      down = null;
      if (moved < 5) handlers.current.onSelect(pick(up.x, up.y));
    };
    const onLeave = () => {
      last = null;
      hovered = null;
      handlers.current.onHover(null);
      el.style.cursor = "";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [camera, gl, targetsRef, enabledRef, radiusPx]);

  return null;
}
