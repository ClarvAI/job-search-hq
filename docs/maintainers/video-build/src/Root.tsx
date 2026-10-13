import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './theme';
import { Trailer, TrailerVertical, TRAILER_FRAMES } from './Trailer';

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ captions: false }} />
    <Composition id="TrailerCaptioned" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ captions: true }} />
    <Composition id="TrailerVertical" component={TrailerVertical} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1080} height={1920} />
  </>
);
