"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { zUpToScene, type Vec3 } from "@/lib/astro/coords";
import { orbitPathAu } from "@/lib/astro/kepler";
import { EPHEMERIS_MAX_MS, EPHEMERIS_MIN_MS, MS_PER_DAY, msToJd } from "@/lib/astro/time";
import { BODY_INFO, displayPositionAu } from "@/lib/scene/solar";
import { SOLAR_BODIES, type SolarBodyId } from "@/lib/types/astro";
import type { LabelSink, LabelSpec } from "./labels";
import { PointCloud } from "./PointCloud";
import { ScreenPicker, type HoverEvent, type PickTargets } from "./ScreenPicker";

export type PositionLookup = (ms: number) => Partial<Record<SolarBodyId, Vec3>> | null;

interface Props {
  timeRef: React.RefObject<number>;
  playingRef: React.RefObject<boolean>;
  /** Simulation speed in days per real second (negative = backwards). */
  speedRef: React.RefObject<number>;
  getPositions: PositionLookup;
  /** Throttled callback with the current simulation time and whether playback is waiting for data. */
  onTick: (ms: number, waiting: boolean) => void;
  orbitEpochMs: number;
  selectedKey: string | null;
  hoveredKey: string | null;
  onHover: (e: HoverEvent | null) => void;
  onSelect: (key: string | null) => void;
  onLabels: LabelSink;
}

const BODY_KEYS = SOLAR_BODIES.map((b) => `body:${b}`);
const LABEL_ORDER: SolarBodyId[] = ["sun", "earth", "jupiter", "saturn", "mars", "venus", "mercury", "uranus", "neptune", "moon"];

/**
 * Solar System (1 unit = 1 au, heliocentric ecliptic J2000; ecliptic plane
 * horizontal). Positions come from the ephemeris lookup each frame and are
 * applied imperatively so playback does not re-render React.
 */
export function SolarScene({ timeRef, playingRef, speedRef, getPositions, onTick, orbitEpochMs, selectedKey, hoveredKey, onHover, onSelect, onLabels }: Props) {
  const groups = useRef<Partial<Record<SolarBodyId, THREE.Group | null>>>({});
  const targetsRef = useRef<PickTargets | null>({ positions: new Float32Array(SOLAR_BODIES.length * 3), keys: BODY_KEYS });
  const lastTick = useRef(0);
  /** Mutable label anchors, updated with the body positions every frame. */
  const labelPos = useRef(Object.fromEntries(SOLAR_BODIES.map((b) => [b, [0, 0, 0] as Vec3])) as Record<SolarBodyId, Vec3>);

  useEffect(() => {
    // List order = label priority when decluttering overlapping labels.
    const labels: LabelSpec[] = LABEL_ORDER.map((b) => {
      const key = `body:${b}`;
      const variant = key === selectedKey ? "selected" : key === hoveredKey ? "hover" : "default";
      return { key, text: BODY_INFO[b].name, variant, ring: variant !== "default", pos: labelPos.current[b] };
    });
    onLabels(labels);
  }, [selectedKey, hoveredKey, onLabels]);

  const orbits = useMemo(() => {
    const jd = msToJd(orbitEpochMs);
    return SOLAR_BODIES.filter((b) => b !== "sun" && b !== "moon").map((b) => ({
      id: b,
      points: orbitPathAu(b, jd, 256).map((p) => zUpToScene(p)),
    }));
  }, [orbitEpochMs]);

  const dots = useMemo(
    () =>
      Object.fromEntries(
        SOLAR_BODIES.map((b) => {
          const c = new THREE.Color(BODY_INFO[b].color);
          return [b, { positions: new Float32Array(3), colors: new Float32Array([c.r, c.g, c.b]), sizes: new Float32Array([b === "sun" ? 10 : 6]) }];
        }),
      ) as Record<SolarBodyId, { positions: Float32Array; colors: Float32Array; sizes: Float32Array }>,
    [],
  );

  useFrame((_, delta) => {
    let t = timeRef.current;
    let waiting = false;
    if (playingRef.current) {
      const candidate = t + Math.min(delta, 0.1) * speedRef.current * MS_PER_DAY;
      if (candidate >= EPHEMERIS_MIN_MS && candidate <= EPHEMERIS_MAX_MS && getPositions(candidate)) {
        t = candidate;
        timeRef.current = t;
      } else {
        waiting = true; // hold until the next ephemeris window has loaded
      }
    }
    const pos = getPositions(t);
    if (pos) {
      const targets = targetsRef.current!;
      SOLAR_BODIES.forEach((b, i) => {
        const d = displayPositionAu(b, pos);
        const g = groups.current[b];
        if (!d || !g) return;
        const s = zUpToScene(d);
        g.position.set(s[0], s[1], s[2]);
        targets.positions.set(s, i * 3);
        const lp = labelPos.current[b];
        lp[0] = s[0];
        lp[1] = s[1];
        lp[2] = s[2];
      });
    } else {
      waiting = true;
    }
    const now = performance.now();
    if (now - lastTick.current > 100) {
      lastTick.current = now;
      onTick(t, waiting);
    }
  });

  return (
    <>
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} intensity={2.2} decay={0} />

      {orbits.map((o) => (
        <Line key={o.id} points={o.points} color={BODY_INFO[o.id].color} lineWidth={1} transparent opacity={0.28} />
      ))}

      {SOLAR_BODIES.map((b) => {
        const info = BODY_INFO[b];
        return (
          <group key={b} ref={(g) => { groups.current[b] = g; }}>
            <mesh>
              <sphereGeometry args={[info.displayRadiusAu, 32, 16]} />
              {b === "sun" ? <meshBasicMaterial color={info.color} /> : <meshStandardMaterial color={info.color} roughness={0.9} />}
            </mesh>
            <PointCloud {...dots[b]} softness={b === "sun" ? 0.6 : 0.1} renderOrder={2} />
          </group>
        );
      })}

      <ScreenPicker targetsRef={targetsRef} onHover={onHover} onSelect={onSelect} radiusPx={14} />
    </>
  );
}
