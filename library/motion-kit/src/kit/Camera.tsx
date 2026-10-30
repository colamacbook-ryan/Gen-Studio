// © 2026 Gen Labs — All rights reserved.
// Camera rig: keyframed virtual camera (x, y, zoom, roll) + handheld drift + shake impulses,
// and <Depth z> layers that parallax against it (z<1 background, z=1 subject plane, z>1 foreground).
import React, { createContext, useContext } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { EASE, EaseFn, iv, noise1 } from "./anim";
import { H, W } from "./theme";

export type Cam = { x: number; y: number; zoom: number; rot: number };
export type CamKey = Partial<Cam> & { t: number; ease?: EaseFn };
export type Shake = { t: number; amp: number; tau?: number };

const CamCtx = createContext<Cam>({ x: 0, y: 0, zoom: 1, rot: 0 });
export const useCamera = () => useContext(CamCtx);

/** Evaluate keyframes at frame f. Each key holds its value until the next key; ease applies on the way INTO a key. */
export const cameraAt = (keys: CamKey[], f: number): Cam => {
  const base: Cam = { x: 0, y: 0, zoom: 1, rot: 0 };
  if (!keys.length) return base;
  const full: (Cam & { t: number; ease?: EaseFn })[] = [];
  let prev = { ...base };
  for (const k of keys) {
    prev = { x: k.x ?? prev.x, y: k.y ?? prev.y, zoom: k.zoom ?? prev.zoom, rot: k.rot ?? prev.rot };
    full.push({ ...prev, t: k.t, ease: k.ease });
  }
  if (f <= full[0].t) return full[0];
  for (let i = 1; i < full.length; i++) {
    const a = full[i - 1], b = full[i];
    if (f <= b.t) {
      const e = b.ease ?? EASE.inOut;
      const p = iv(f, [a.t, b.t], [0, 1], e);
      // zoom interpolates in log space so push-ins feel constant-speed
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * p), rot: a.rot + (b.rot - a.rot) * p };
    }
  }
  return full[full.length - 1];
};

export const CameraRig: React.FC<{
  keys?: CamKey[];
  /** handheld drift amplitude in px (0 = locked off). 4–8 feels alive, >12 is nervous */
  handheld?: number;
  shakes?: Shake[];
  /** frame offset if the rig lives inside a Sequence but keys are in parent time */
  offset?: number;
  children: React.ReactNode;
}> = ({ keys = [], handheld = 5, shakes = [], offset = 0, children }) => {
  const f = useCurrentFrame() + offset;
  const c = cameraAt(keys, f);
  let sx = noise1(f / 70, 11) * handheld, sy = noise1(f / 83, 12) * handheld * 0.7, sr = noise1(f / 97, 13) * handheld * 0.02;
  for (const s of shakes) {
    if (f < s.t) continue;
    const k = Math.exp(-(f - s.t) / (s.tau ?? 7));
    sx += noise1((f - s.t) * 0.9, s.t + 1) * s.amp * k;
    sy += noise1((f - s.t) * 0.9, s.t + 2) * s.amp * k;
    sr += noise1((f - s.t) * 0.7, s.t + 3) * s.amp * 0.04 * k;
  }
  return <CamCtx.Provider value={{ x: c.x + sx, y: c.y + sy, zoom: c.zoom, rot: c.rot + sr }}>{children}</CamCtx.Provider>;
};

/** A full-frame layer at depth z, transformed by the current camera. Children use normal 1920×1080 coordinates. */
export const Depth: React.FC<{ z?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ z = 1, style, children }) => {
  const cam = useCamera();
  const s = Math.exp(Math.log(cam.zoom) * z);
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${W / 2}px, ${H / 2}px) rotate(${cam.rot * z}deg) scale(${s}) translate(${-cam.x * z - W / 2}px, ${-cam.y * z - H / 2}px)`,
        transformOrigin: "0 0",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
