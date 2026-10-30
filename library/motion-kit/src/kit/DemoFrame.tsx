// © 2026 Gen Labs — All rights reserved.
// Shared stage for component demos: camera rig + backdrop with depth + post.
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop, Mood, Post } from "./Backdrop";
import { CamKey, CameraRig, Depth } from "./Camera";
import { C } from "./theme";

export const DemoFrame: React.FC<{ mood?: Mood; keys?: CamKey[]; handheld?: number; children: React.ReactNode }> = ({ mood = "calm", keys, handheld = 4, children }) => (
  <AbsoluteFill style={{ background: C.ink }}>
    <CameraRig keys={keys ?? [{ t: 0, zoom: 1 }, { t: 600, zoom: 1.04 }]} handheld={handheld}>
      <Backdrop mood={mood} />
      <Depth z={1}>{children}</Depth>
    </CameraRig>
    <Post />
  </AbsoluteFill>
);
