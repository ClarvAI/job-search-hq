import React from 'react';
import { AbsoluteFill, Audio, Sequence, Series, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { body, c, display, mono, s } from './theme';
import { ApplyKit, Dashboard, DueAlerts, EndCard, Flashcards, Hero, InterviewRoom, JobInbox, Outbox, Pipeline, Resume } from './scenes';
import { LayoutContext, TALL_H, TALL_W, ease } from './components/ui';
import vo from './vo.json';

// One row per shot (docs/maintainers/video-kit/scripts/00-trailer.md). Shot i plays narration line i.
// min: seconds the animation needs. callout: the vertical cut's headline. full: the scene fills the whole vertical
// frame (no headline band).
type Shot = { Scene: React.FC; min: number; callout: string; full?: boolean; noCaption?: boolean };

export const SHOTS: Shot[] = [
  { Scene: Hero, min: 4, callout: 'Job Search HQ', full: true, noCaption: true },
  { Scene: DueAlerts, min: 5, callout: "What's due, the moment you open it" },
  { Scene: Pipeline, min: 6, callout: 'Your job board' },
  { Scene: JobInbox, min: 6, callout: 'Openings that fit you' },
  { Scene: Resume, min: 9, callout: 'Nothing invented' },
  { Scene: ApplyKit, min: 6, callout: 'Every answer, ready to copy' },
  { Scene: Outbox, min: 8, callout: 'It drafts. You send.' },
  { Scene: InterviewRoom, min: 9, callout: 'Practice out loud' },
  { Scene: Flashcards, min: 5, callout: 'Take your prep with you' },
  { Scene: Dashboard, min: 6, callout: 'Your whole search, at a glance' },
  { Scene: EndCard, min: 6, callout: 'Try it with sample data first', full: true },
];

// Seconds into a shot before its line starts, and breathing room after. scripts/make-srt.py uses the same numbers.
export const LEAD = 0.45;
export const TAIL = 0.6;

type Line = { file: string; text: string; seconds: number };
const lines = (vo as { lines: Line[] }).lines;

export const shotFrames = SHOTS.map((sh, i) => {
  const line = lines[i];
  return s(Math.max(sh.min, line ? LEAD + line.seconds + TAIL : 0));
});
export const TRAILER_FRAMES = shotFrames.reduce((a, b) => a + b, 0);

const Narration: React.FC<{ i: number }> = ({ i }) => {
  const line = lines[i];
  if (!line) return null;
  return (
    <Sequence from={s(LEAD)} layout="none">
      <Audio src={staticFile(line.file)} />
    </Sequence>
  );
};

// Burned-in caption for the line playing in this shot.
const Caption: React.FC<{ i: number; tall: boolean }> = ({ i, tall }) => {
  const f = useCurrentFrame();
  const line = lines[i];
  if (!line || SHOTS[i].noCaption) return null; // noCaption: the words are already on screen
  const start = s(LEAD);
  const end = start + s(line.seconds) + 6;
  const o = interpolate(f, [start - 4, start + 2, end - 4, end + 2], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: tall ? 80 : 140, pointerEvents: 'none' }}>
      <div style={{ opacity: o, maxWidth: tall ? 960 : 1400, textAlign: 'center', fontFamily: body, fontWeight: 600, fontSize: tall ? 44 : 34, lineHeight: 1.3, color: '#fff', background: 'rgba(0,0,0,.66)', padding: tall ? '14px 26px' : '8px 20px', borderRadius: 12 }}>
        {line.text.replace(/\.\.\.$/, '')}
      </div>
    </AbsoluteFill>
  );
};

export const Trailer: React.FC<{ captions?: boolean }> = ({ captions = false }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Series>
      {SHOTS.map(({ Scene }, i) => (
        <Series.Sequence key={i} durationInFrames={shotFrames[i]}>
          <Scene />
          <Narration i={i} />
          {captions ? <Caption i={i} tall={false} /> : null}
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

// 9:16 cut: headline band (BAND_H), the scene's own vertical layout (TALL_W x TALL_H), then a caption strip.
const BAND_H = 300;
const TallShot: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const { Scene, callout, full } = SHOTS[i];
  const tIn = interpolate(f, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <AbsoluteFill style={{ background: c.n3 }}>
      {full ? (
        <Scene />
      ) : (
        <>
          <div style={{ position: 'absolute', left: 0, top: BAND_H, width: TALL_W, height: TALL_H, overflow: 'hidden' }}>
            <Scene />
          </div>
          <AbsoluteFill style={{ height: BAND_H, background: c.a12, justifyContent: 'center', alignItems: 'center', padding: '0 60px' }}>
            <div style={{ opacity: tIn, transform: `translateY(${(1 - tIn) * 16}px)`, fontFamily: display, fontWeight: 700, fontSize: 70, lineHeight: 1.1, color: '#fff', textAlign: 'center', letterSpacing: -1 }}>{callout}</div>
          </AbsoluteFill>
          <AbsoluteFill style={{ top: BAND_H + TALL_H, background: c.n3 }} />
        </>
      )}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 26 }}>
        <div style={{ fontFamily: mono, fontSize: 22, color: full && i > 0 ? '#9fc9cb' : c.n9 }}>Illustration · made-up sample data</div>
      </AbsoluteFill>
      <Narration i={i} />
      <Caption i={i} tall />
    </AbsoluteFill>
  );
};

export const TrailerVertical: React.FC = () => (
  <LayoutContext.Provider value="tall">
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        {SHOTS.map((_, i) => (
          <Series.Sequence key={i} durationInFrames={shotFrames[i]}>
            <TallShot i={i} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  </LayoutContext.Provider>
);
