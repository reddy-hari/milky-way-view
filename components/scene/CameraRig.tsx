"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/astro/coords";
import type { CameraApi, Pose, ViewInfo } from "@/lib/scene/views";

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
  onDone?: () => void;
}

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Props {
  view: ViewInfo;
  reducedMotion: boolean;
  apiRef: React.RefObject<CameraApi | null>;
}

/**
 * Orbit controls (drag = rotate, right-drag / two-finger = pan, wheel / pinch =
 * zoom) plus an imperative API for guided flights and keyboard control.
 * Flights are skipped (instant jumps) when reduced motion is preferred.
 */
export function CameraRig({ view, reducedMotion, apiRef }: Props) {
  // Read the camera via get() inside effects/frames: it is a mutable three.js object.
  const get = useThree((s) => s.get);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    const cam = get().camera as THREE.PerspectiveCamera;
    cam.near = view.near;
    cam.far = view.far;
    cam.updateProjectionMatrix();
  }, [get, view]);

  useEffect(() => {
    const camera = get().camera;
    const ctl = () => controls.current;
    const set = (pos: Vec3 | THREE.Vector3, target: Vec3 | THREE.Vector3) => {
      const c = ctl();
      if (Array.isArray(pos)) camera.position.set(...pos);
      else camera.position.copy(pos);
      if (c) {
        if (Array.isArray(target)) c.target.set(...target);
        else c.target.copy(target);
        c.update();
      } else {
        camera.lookAt(...(Array.isArray(target) ? target : target.toArray()));
      }
    };
    const currentTarget = () => ctl()?.target.clone() ?? new THREE.Vector3();
    const clampDistance = (d: number) => Math.min(view.maxDistance, Math.max(view.minDistance, d));

    const api: CameraApi = {
      jumpTo(pose: Pose) {
        flight.current = null;
        set(pose.position, pose.target);
      },
      flyTo(pose, durationMs, onDone) {
        if (reducedMotion || durationMs <= 0) {
          api.jumpTo(pose);
          onDone?.();
          return;
        }
        flight.current?.onDone?.();
        flight.current = {
          fromPos: camera.position.clone(),
          fromTarget: currentTarget(),
          toPos: new THREE.Vector3(...pose.position),
          toTarget: new THREE.Vector3(...pose.target),
          start: performance.now(),
          duration: durationMs,
          onDone,
        };
      },
      focus(target, distance, onDone) {
        const t = new THREE.Vector3(...target);
        const dir = camera.position.clone().sub(currentTarget());
        if (dir.lengthSq() === 0) dir.set(0, 0.5, 1);
        dir.normalize().multiplyScalar(clampDistance(distance));
        api.flyTo({ position: t.clone().add(dir).toArray() as Vec3, target }, 900, onDone);
      },
      orbit(dAz, dPolar) {
        const target = currentTarget();
        const offset = camera.position.clone().sub(target);
        const s = new THREE.Spherical().setFromVector3(offset);
        s.theta += dAz;
        s.phi = Math.min(Math.PI - 0.05, Math.max(0.05, s.phi + dPolar));
        offset.setFromSpherical(s);
        set(target.clone().add(offset), target);
      },
      zoom(factor) {
        const target = currentTarget();
        const offset = camera.position.clone().sub(target);
        offset.setLength(clampDistance(offset.length() * factor));
        set(target.clone().add(offset), target);
      },
    };
    apiRef.current = api;
    return () => {
      if (apiRef.current === api) apiRef.current = null;
    };
  }, [apiRef, get, reducedMotion, view]);

  useFrame(({ camera }) => {
    const f = flight.current;
    const c = controls.current;
    if (!f || !c) return;
    const t = Math.min(1, (performance.now() - f.start) / f.duration);
    const e = easeInOutCubic(t);
    camera.position.lerpVectors(f.fromPos, f.toPos, e);
    c.target.lerpVectors(f.fromTarget, f.toTarget, e);
    c.update();
    if (t >= 1) {
      flight.current = null;
      f.onDone?.();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minDistance={view.minDistance}
      maxDistance={view.maxDistance}
      zoomSpeed={1.1}
      rotateSpeed={0.6}
      screenSpacePanning
    />
  );
}
