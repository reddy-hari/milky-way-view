"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/** Tracks the user's prefers-reduced-motion setting. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false),
    () => false,
  );
}

export type WebGLSupport = "checking" | "supported" | "unsupported";

/** Detect WebGL once on the client. */
export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return !!ctx;
  } catch {
    return false;
  }
}

export function useWebGLSupport(): WebGLSupport {
  const [state, setState] = useState<WebGLSupport>("checking");
  useEffect(() => {
    // Detection needs the DOM, so it runs after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(detectWebGL() ? "supported" : "unsupported");
  }, []);
  return state;
}
