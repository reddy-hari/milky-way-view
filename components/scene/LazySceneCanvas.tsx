"use client";

import dynamic from "next/dynamic";

/** The WebGL scene is client-only: three.js needs the DOM and a GPU context. */
const LazySceneCanvas = dynamic(() => import("./SceneCanvas"), {
  ssr: false,
  loading: () => (
    <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--text-dim)" }}>
      Loading 3D scene…
    </div>
  ),
});

export default LazySceneCanvas;
