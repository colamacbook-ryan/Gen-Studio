// © 2026 Gen Labs — All rights reserved.
import React from "react";
import { Composition } from "remotion";
import { DEMOS } from "./demos";

export const FPS = 60;

export const RemotionRoot: React.FC = () => (
  <>
    {DEMOS.map((d) => (
      <Composition key={d.id} id={d.id} component={d.component} durationInFrames={d.frames ?? Math.round(d.sec * FPS)} fps={FPS} width={1920} height={1080} />
    ))}
  </>
);
