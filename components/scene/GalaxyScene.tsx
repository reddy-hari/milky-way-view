"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { zUpToScene, type Vec3 } from "@/lib/astro/coords";
import { SUN_GALAXY_SCENE, galaxyScenePosition, type CatalogPoint } from "@/lib/scene/catalog";
import { generateGalaxyModel } from "@/lib/scene/galaxyModel";
import type { LabelSink, LabelSpec } from "./labels";
import { buildMarkerArrays } from "./markers";
import { PointCloud } from "./PointCloud";
import { ScreenPicker, type HoverEvent, type PickTargets } from "./ScreenPicker";

interface Props {
  hosts: CatalogPoint[];
  selectedKey: string | null;
  hoveredKey: string | null;
  nameFor: (key: string) => string;
  onHover: (e: HoverEvent | null) => void;
  onSelect: (key: string | null) => void;
  onLabels: LabelSink;
}

const SUN: Vec3 = SUN_GALAXY_SCENE;
const SUN_THREE = new THREE.Vector3(...SUN);
const ORIGIN: Vec3 = [0, 0, 0];

/**
 * Galaxy overview (1 unit = 1 kpc, Galactic Centre at origin).
 * Level of detail: the illustrative galaxy model dominates when zoomed out;
 * catalogue host markers fade in as the camera approaches the solar
 * neighbourhood, and the model dims so it is not mistaken for catalogue stars.
 */
export function GalaxyScene({ hosts, selectedKey, hoveredKey, nameFor, onHover, onSelect, onLabels }: Props) {
  const camera = useThree((s) => s.camera);

  const model = useMemo(() => {
    const m = generateGalaxyModel();
    // Convert galactocentric Z-up → scene Y-up in place (freshly generated arrays).
    for (let i = 0; i < m.count; i++) {
      const [x, y, z] = zUpToScene([m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);
      m.positions[i * 3] = x;
      m.positions[i * 3 + 1] = y;
      m.positions[i * 3 + 2] = z;
    }
    return m;
  }, []);

  const markers = useMemo(() => buildMarkerArrays(hosts, galaxyScenePosition, 0.8), [hosts]);
  const targetsRef = useRef<PickTargets | null>(null);
  useEffect(() => {
    targetsRef.current = markers;
  }, [markers]);
  const pickEnabled = useRef(false);

  const modelMat = useRef<THREE.ShaderMaterial | null>(null);
  const hostMat = useRef<THREE.ShaderMaterial | null>(null);
  const [showHostLabels, setShowHostLabels] = useState(false);

  useFrame(() => {
    const d = camera.position.distanceTo(SUN_THREE);
    const hostOpacity = THREE.MathUtils.clamp((9 - d) / 5, 0, 1);
    if (hostMat.current) hostMat.current.uniforms.uOpacity.value = hostOpacity;
    if (modelMat.current) modelMat.current.uniforms.uOpacity.value = THREE.MathUtils.clamp(0.25 + (d - 0.5) / 4, 0.25, 0.9);
    pickEnabled.current = hostOpacity > 0.3;
    const show = hostOpacity > 0.3;
    if (show !== showHostLabels) setShowHostLabels(show);
  });

  const sunMarker = useMemo(
    () => ({ positions: new Float32Array(SUN), colors: new Float32Array([1, 0.85, 0.45]), sizes: new Float32Array([9]) }),
    [],
  );

  const labels = useMemo(() => {
    const out: LabelSpec[] = [
      { key: "sun", text: "Sun — you are here", variant: "default", pos: SUN },
      { key: "gc", text: "Galactic Centre (Sgr A*)", variant: "muted", pos: ORIGIN },
    ];
    const hoveredPos = hoveredKey ? markers.byKey.get(hoveredKey) : undefined;
    const selectedPos = selectedKey ? markers.byKey.get(selectedKey) : undefined;
    if (showHostLabels && hoveredKey && hoveredPos && hoveredKey !== selectedKey) {
      out.push({ key: `h:${hoveredKey}`, text: nameFor(hoveredKey), variant: "hover", ring: true, pos: hoveredPos });
    }
    if (selectedKey && selectedPos) out.push({ key: `s:${selectedKey}`, text: nameFor(selectedKey), variant: "selected", ring: true, pos: selectedPos });
    return out;
  }, [hoveredKey, selectedKey, markers, nameFor, showHostLabels]);

  useEffect(() => {
    onLabels(labels);
  }, [labels, onLabels]);

  return (
    <>
      <PointCloud {...model} materialRef={modelMat} softness={1} attenuation={18} sizeScale={1.6} additive opacity={0.9} />
      <PointCloud {...markers} materialRef={hostMat} opacity={0} renderOrder={2} />
      <PointCloud {...sunMarker} softness={0.4} renderOrder={3} />
      <ScreenPicker targetsRef={targetsRef} enabledRef={pickEnabled} onHover={onHover} onSelect={onSelect} />
    </>
  );
}
