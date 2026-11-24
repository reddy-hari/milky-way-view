"use client";

import { Line } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { Vec3 } from "@/lib/astro/coords";
import { localScenePosition, type CatalogPoint } from "@/lib/scene/catalog";
import type { LabelSink, LabelSpec } from "./labels";
import { buildMarkerArrays } from "./markers";
import { PointCloud } from "./PointCloud";
import { ScreenPicker, type HoverEvent, type PickTargets } from "./ScreenPicker";

interface Props {
  points: CatalogPoint[];
  labelPoints: CatalogPoint[];
  maxDistancePc: number;
  selectedKey: string | null;
  hoveredKey: string | null;
  nameFor: (key: string) => string;
  onHover: (e: HoverEvent | null) => void;
  onSelect: (key: string | null) => void;
  onLabels: LabelSink;
}

const RING_RADII = [5, 10, 25, 50, 100, 250, 500, 1000];
const ORIGIN: Vec3 = [0, 0, 0];

/** Circle in the Galactic plane (scene XZ plane), radius in pc. */
function ringPoints(r: number, segments = 128): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [r * Math.cos(a), 0, r * Math.sin(a)] as Vec3;
  });
}

/**
 * Nearby-star view (1 unit = 1 pc, Sun at origin, Galactic plane horizontal,
 * +X toward the Galactic Centre). Distances are linear and unadjusted.
 */
export function LocalScene({ points, labelPoints, maxDistancePc, selectedKey, hoveredKey, nameFor, onHover, onSelect, onLabels }: Props) {
  const markers = useMemo(() => buildMarkerArrays(points, localScenePosition), [points]);
  const targetsRef = useRef<PickTargets | null>(null);
  useEffect(() => {
    targetsRef.current = markers;
  }, [markers]);

  const rings = useMemo(() => RING_RADII.filter((r) => r <= Math.max(maxDistancePc, 10)).map((r) => ({ r, pts: ringPoints(r) })), [maxDistancePc]);
  const sun = useMemo(() => ({ positions: new Float32Array([0, 0, 0]), colors: new Float32Array([1, 0.85, 0.45]), sizes: new Float32Array([9]) }), []);
  const gcArrowLength = Math.min(Math.max(maxDistancePc, 10), 1000) * 0.3;

  const labels = useMemo(() => {
    const out: LabelSpec[] = rings.map(({ r }) => ({ key: `ring:${r}`, text: `${r} pc`, variant: "muted" as const, pos: [r * Math.SQRT1_2, 0, r * Math.SQRT1_2] as Vec3 }));
    out.push({ key: "gc", text: "→ toward Galactic Centre", variant: "muted", pos: [gcArrowLength, 0, 0] });
    out.push({ key: "sun", text: "Sun", variant: "default", pos: ORIGIN });
    for (const p of labelPoints) {
      const pos = markers.byKey.get(p.key);
      if (pos && p.key !== selectedKey && p.key !== hoveredKey) out.push({ key: `p:${p.key}`, text: p.name, variant: "default", pos });
    }
    const hoveredPos = hoveredKey ? markers.byKey.get(hoveredKey) : undefined;
    const selectedPos = selectedKey ? markers.byKey.get(selectedKey) : undefined;
    if (hoveredKey && hoveredPos && hoveredKey !== selectedKey) out.push({ key: `h:${hoveredKey}`, text: nameFor(hoveredKey), variant: "hover", ring: true, pos: hoveredPos });
    if (selectedKey && selectedPos) out.push({ key: `s:${selectedKey}`, text: nameFor(selectedKey), variant: "selected", ring: true, pos: selectedPos });
    return out;
  }, [rings, gcArrowLength, labelPoints, markers, selectedKey, hoveredKey, nameFor]);

  useEffect(() => {
    onLabels(labels);
  }, [labels, onLabels]);

  return (
    <>
      {rings.map(({ r, pts }) => (
        <Line key={r} points={pts} color="#2b3a5c" lineWidth={1} transparent opacity={0.6} />
      ))}
      <Line points={[[0, 0, 0], [gcArrowLength, 0, 0]]} color="#46608f" lineWidth={1} dashed dashSize={gcArrowLength / 20} gapSize={gcArrowLength / 30} />
      <PointCloud {...markers} renderOrder={2} />
      <PointCloud {...sun} softness={0.4} renderOrder={3} />
      <ScreenPicker targetsRef={targetsRef} onHover={onHover} onSelect={onSelect} />
    </>
  );
}
