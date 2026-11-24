"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Efficient point rendering: one draw call for thousands of markers via a
 * single THREE.Points with per-point colour and size attributes.
 */

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uPixelRatio;
  uniform float uAttenuation; // 0 = constant pixel size, >0 = perspective scaling factor
  uniform float uSizeScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = aSize * uSizeScale * uPixelRatio;
    if (uAttenuation > 0.0) size *= clamp(uAttenuation / -mv.z, 0.15, 3.0);
    gl_PointSize = max(size, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uSoftness; // 0 = crisp disc, 1 = soft glow
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float crisp = 1.0 - smoothstep(0.32, 0.5, d);
    float soft = pow(1.0 - d * 2.0, 1.6);
    float a = mix(crisp, soft, uSoftness);
    gl_FragColor = vec4(vColor, a * uOpacity);
  }
`;

export interface PointCloudProps {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  opacity?: number;
  softness?: number;
  attenuation?: number;
  sizeScale?: number;
  additive?: boolean;
  /** Receives the material so callers can animate uniforms in useFrame without re-rendering. */
  materialRef?: React.RefObject<THREE.ShaderMaterial | null>;
  renderOrder?: number;
}

const makeUniforms = () => ({
  uOpacity: { value: 1 },
  uSoftness: { value: 0 },
  uAttenuation: { value: 0 },
  uSizeScale: { value: 1 },
  uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1 },
});

export function PointCloud({
  positions,
  colors,
  sizes,
  opacity = 1,
  softness = 0,
  attenuation = 0,
  sizeScale = 1,
  additive = false,
  materialRef,
  renderOrder,
}: PointCloudProps) {
  const mat = useRef<THREE.ShaderMaterial | null>(null);
  // Stable constructor args: the material is created once per instance.
  const [materialArgs] = useState(() => [{ vertexShader, fragmentShader, uniforms: makeUniforms() }] as const);

  useEffect(() => {
    const m = mat.current;
    if (!m) return;
    m.uniforms.uOpacity.value = opacity;
    m.uniforms.uSoftness.value = softness;
    m.uniforms.uAttenuation.value = attenuation;
    m.uniforms.uSizeScale.value = sizeScale;
    if (materialRef) materialRef.current = m;
  }, [opacity, softness, attenuation, sizeScale, materialRef]);

  return (
    <points frustumCulled={false} renderOrder={renderOrder}>
      <bufferGeometry key={positions.length}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        args={materialArgs}
        transparent
        depthWrite={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}
