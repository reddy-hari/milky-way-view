"use client";

import { Canvas } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogPoint } from "@/lib/scene/catalog";
import { DEFAULT_POSES, VIEWS, type CameraApi, type Pose, type ViewMode } from "@/lib/scene/views";
import { CameraRig } from "./CameraRig";
import { GalaxyScene } from "./GalaxyScene";
import { LabelOverlay, LabelProjector, type LabelRefs, type LabelSpec } from "./labels";
import { LocalScene } from "./LocalScene";
import type { HoverEvent } from "./ScreenPicker";
import { SolarScene, type PositionLookup } from "./SolarScene";

export interface SolarControls {
  timeRef: React.RefObject<number>;
  playingRef: React.RefObject<boolean>;
  speedRef: React.RefObject<number>;
  getPositions: PositionLookup;
  onTick: (ms: number, waiting: boolean) => void;
  orbitEpochMs: number;
}

export interface SceneCanvasProps {
  mode: ViewMode;
  /** If set when `mode` changes, the camera starts here and flies to the mode's default pose. */
  entryPose: Pose | null;
  onEntryDone: () => void;
  reducedMotion: boolean;
  cameraApiRef: React.RefObject<CameraApi | null>;
  galaxyHosts: CatalogPoint[];
  localPoints: CatalogPoint[];
  labelPoints: CatalogPoint[];
  maxDistancePc: number;
  selectedKey: string | null;
  hoveredKey: string | null;
  nameFor: (key: string) => string;
  onHover: (e: HoverEvent | null) => void;
  onSelect: (key: string | null) => void;
  solar: SolarControls;
  onRenderError: () => void;
}

/** Positions the camera whenever the mode changes (guided entry or instant default). */
function ModeEntry({ mode, entryPose, onEntryDone, apiRef }: { mode: ViewMode; entryPose: Pose | null; onEntryDone: () => void; apiRef: React.RefObject<CameraApi | null> }) {
  const latest = useRef({ entryPose, onEntryDone });
  useEffect(() => {
    latest.current = { entryPose, onEntryDone };
  });
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const { entryPose: entry, onEntryDone: done } = latest.current;
    if (entry) {
      api.jumpTo(entry);
      api.flyTo(DEFAULT_POSES[mode], 1300, done);
    } else {
      api.jumpTo(DEFAULT_POSES[mode]);
      done();
    }
  }, [mode, apiRef]);
  return null;
}

class RenderErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function SceneCanvas(props: SceneCanvasProps) {
  const { mode, reducedMotion, cameraApiRef } = props;
  const [labels, setLabels] = useState<LabelSpec[]>([]);
  const labelsRef = useRef<LabelSpec[]>([]);
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const labelRefs = useMemo<LabelRefs>(() => ({ labels: labelsRef, elements: elementsRef }), []);
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  return (
    <RenderErrorBoundary onError={props.onRenderError}>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 50, position: DEFAULT_POSES[mode].position, near: VIEWS[mode].near, far: VIEWS[mode].far }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        aria-label={`Interactive 3D view: ${VIEWS[mode].label}`}
        role="img"
      >
        <color attach="background" args={["#03050c"]} />
        <CameraRig view={VIEWS[mode]} reducedMotion={reducedMotion} apiRef={cameraApiRef} />
        <ModeEntry mode={mode} entryPose={props.entryPose} onEntryDone={props.onEntryDone} apiRef={cameraApiRef} />
        {mode === "galaxy" && (
          <GalaxyScene
            hosts={props.galaxyHosts}
            selectedKey={props.selectedKey}
            hoveredKey={props.hoveredKey}
            nameFor={props.nameFor}
            onHover={props.onHover}
            onSelect={props.onSelect}
            onLabels={setLabels}
          />
        )}
        {mode === "local" && (
          <LocalScene
            points={props.localPoints}
            labelPoints={props.labelPoints}
            maxDistancePc={props.maxDistancePc}
            selectedKey={props.selectedKey}
            hoveredKey={props.hoveredKey}
            nameFor={props.nameFor}
            onHover={props.onHover}
            onSelect={props.onSelect}
            onLabels={setLabels}
          />
        )}
        {mode === "solar" && (
          <SolarScene
            {...props.solar}
            selectedKey={props.selectedKey}
            hoveredKey={props.hoveredKey}
            onHover={props.onHover}
            onSelect={props.onSelect}
            onLabels={setLabels}
          />
        )}
        <LabelProjector refs={labelRefs} />
      </Canvas>
      <LabelOverlay labels={labels} refs={labelRefs} />
    </RenderErrorBoundary>
  );
}
