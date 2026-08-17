import React from 'react';
import {Composition} from 'remotion';
import {VibeSpaceTrailer} from './VibeSpaceTrailer';

export const FPS = 30;
export const DURATION = 1080;

export const RemotionRoot = () => (
  <Composition
    id="VibeSpaceTrailer"
    component={VibeSpaceTrailer}
    durationInFrames={DURATION}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{}}
  />
);
