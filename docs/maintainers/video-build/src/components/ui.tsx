import React from 'react';
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { body, c, display, mono } from '../theme';

export const ease = Easing.bezier(0.22, 1, 0.36, 1);

// 'wide' = 16:9, 'tall' = 9:16 (the vertical wrapper draws its own callouts, so scenes hide theirs).
export const LayoutContext = React.createContext<'wide' | 'tall'>('wide');

// Fade + rise in at `at` frames. Pure, so it is safe inside loops and conditionals.
export const enter = (f: number, at = 0, dur = 14) => {
  const p = interpolate(f, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { opacity: p, transform: `translateY(${(1 - p) * 18}px)` };
};

export const useEnter = (at = 0, dur = 14) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { opacity: p, transform: `translateY(${(1 - p) * 18}px)` };
};

export const useSpring = (at = 0, damping = 18) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping, mass: 0.7 } });
};

// A rough Claude-desktop-style window: chrome, chat column, side panel, status band and prompt.
export const AppWindow: React.FC<{
  chat?: React.ReactNode;
  panel?: React.ReactNode;
  band?: React.ReactNode;
  prompt?: string;
  zoom?: number;
  focus?: [number, number];
}> = ({ chat, panel, band, prompt = '', zoom = 1, focus = [50, 50] }) => {
  if (React.useContext(LayoutContext) === 'tall') return <TallWindow chat={chat} panel={panel} prompt={prompt} />;
  return (
    <AbsoluteFill style={{ background: c.n3, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1680,
          height: 940,
          borderRadius: 18,
          background: c.n1,
          boxShadow: '0 30px 80px rgba(39,34,27,.18), 0 2px 6px rgba(39,34,27,.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transform: `scale(${zoom})`,
          transformOrigin: `${focus[0]}% ${focus[1]}%`,
          fontFamily: body,
          color: c.n12,
        }}
      >
        <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 9, borderBottom: `1px solid ${c.n4}`, background: c.n2 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(col => (
            <div key={col} style={{ width: 13, height: 13, borderRadius: 7, background: col }} />
          ))}
          <div style={{ marginLeft: 18, fontSize: 18, color: c.n11, fontWeight: 600 }}>Job Search HQ</div>
          <div style={{ marginLeft: 'auto', fontSize: 15, color: c.n9 }}>Code</div>
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 1, padding: '34px 46px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 18 }}>{chat}</div>
            <div style={{ padding: '0 34px 26px' }}>
              {band ? (
                <div style={{ fontSize: 17, color: c.n11, padding: '8px 14px', marginBottom: 10, background: c.n3, borderRadius: 10 }}>{band}</div>
              ) : null}
              <div style={{ border: `1.5px solid ${c.n6}`, borderRadius: 16, padding: '18px 20px', fontSize: 22, minHeight: 64, background: '#fff', color: prompt ? c.n12 : c.n9 }}>
                {prompt || 'Ask Claude…'}
                {prompt ? <Caret /> : null}
              </div>
            </div>
          </div>
          {panel ? (
            <div style={{ width: 640, borderLeft: `1px solid ${c.n4}`, background: c.n2, padding: 26, overflow: 'hidden' }}>{panel}</div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Vertical cut: the scene area is TALL_W x TALL_H. A panel scene shows just the panel (640 x 942 in the wide
// frame, origin PANEL_X, PANEL_Y), scaled to fit; a chat-only scene shows the chat column, narrower and larger.
export const TALL_W = 1080;
export const TALL_H = 1340;
const PANEL_X = 1160;
const PANEL_Y = 122;
const PANEL_W = 640;
const PANEL_H = 942;
export const PANEL_K = Math.min(TALL_W / PANEL_W, TALL_H / PANEL_H);
const PANEL_OX = (TALL_W - PANEL_W * PANEL_K) / 2;
// Maps a point in the wide frame's panel to the vertical scene area (used by Pointer).
export const toTall = (x: number, y: number) => ({ x: (x - PANEL_X) * PANEL_K + PANEL_OX, y: (y - PANEL_Y) * PANEL_K });

const TallWindow: React.FC<{ chat?: React.ReactNode; panel?: React.ReactNode; prompt: string }> = ({ chat, panel, prompt }) => {
  if (panel) {
    return (
      <AbsoluteFill style={{ background: c.n2 }}>
        <div style={{ position: 'absolute', left: PANEL_OX, top: 0, width: PANEL_W, height: PANEL_H, transform: `scale(${PANEL_K})`, transformOrigin: '0 0', padding: 26, fontFamily: body, color: c.n12, overflow: 'hidden' }}>
          {panel}
        </div>
      </AbsoluteFill>
    );
  }
  const W = 780;
  const k = TALL_W / W;
  return (
    <AbsoluteFill style={{ background: c.n1 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: TALL_H / k, transform: `scale(${k})`, transformOrigin: '0 0', fontFamily: body, color: c.n12, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '30px 30px', display: 'flex', flexDirection: 'column', gap: 18, overflow: 'hidden' }}>{chat}</div>
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ border: `1.5px solid ${c.n6}`, borderRadius: 16, padding: '16px 18px', fontSize: 22, background: '#fff', color: prompt ? c.n12 : c.n9 }}>
            {prompt || 'Ask Claude…'}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Caret: React.FC = () => {
  const f = useCurrentFrame();
  return <span style={{ display: 'inline-block', width: 2, height: 24, marginLeft: 2, verticalAlign: 'middle', background: c.n12, opacity: Math.floor(f / 15) % 2 ? 0 : 1 }} />;
};

// Types a string from frame `at`, `cps` characters per second.
export const useTyped = (text: string, at: number, cps = 28) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor(((f - at) / 30) * cps));
  return text.slice(0, n);
};

export const PanelShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <div style={{ fontFamily: display, fontWeight: 650, fontSize: 30, color: c.n12 }}>{title}</div>
      <div style={{ marginLeft: 'auto', fontSize: 14, color: c.n9 }}>Refresh · Close</div>
    </div>
    {children}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; highlight?: number }> = ({ children, style, highlight = 0 }) => (
  <div
    style={{
      background: '#fff',
      border: `1.5px solid ${highlight > 0 ? c.a9 : c.n4}`,
      boxShadow: highlight > 0 ? `0 0 0 ${4 * highlight}px ${c.a3}` : 'none',
      borderRadius: 14,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Btn: React.FC<{ children: React.ReactNode; primary?: boolean; pressed?: number }> = ({ children, primary, pressed = 0 }) => (
  <span
    style={{
      display: 'inline-block',
      fontSize: 16,
      fontWeight: 600,
      padding: '7px 13px',
      borderRadius: 9,
      border: `1.5px solid ${primary ? c.a9 : c.n6}`,
      background: primary ? c.a9 : '#fff',
      color: primary ? '#fff' : c.n12,
      transform: `scale(${1 - 0.06 * pressed})`,
      boxShadow: pressed > 0 ? `0 0 0 ${5 * pressed}px ${c.a3}` : 'none',
    }}
  >
    {children}
  </span>
);

export const Pill: React.FC<{ children: React.ReactNode; tone?: 'teal' | 'amber' | 'green' | 'grey' }> = ({ children, tone = 'grey' }) => {
  const map = { teal: [c.a3, c.a11], amber: [c.amberBg, c.amber], green: [c.greenBg, c.green], grey: [c.n3, c.n11] } as const;
  const [bg, fg] = map[tone];
  return <span style={{ fontSize: 14, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: bg, color: fg }}>{children}</span>;
};

// Chat bubbles.
export const UserMsg: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ alignSelf: 'flex-end', background: c.n3, borderRadius: 16, padding: '12px 18px', fontSize: 22, maxWidth: 760, ...style }}>{children}</div>
);
export const ClaudeMsg: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 22, lineHeight: 1.45, maxWidth: 900, color: c.n12, ...style }}>{children}</div>
);

// Animated pointer that moves between points (in 1920x1080 space) and "clicks".
export const Pointer: React.FC<{ path: { at: number; x: number; y: number; click?: boolean }[] }> = ({ path: widePath }) => {
  const f = useCurrentFrame();
  const tall = React.useContext(LayoutContext) === 'tall';
  const path = tall ? widePath.map(p => ({ ...p, ...toTall(p.x, p.y) })) : widePath;
  if (path.length === 0) return null;
  let x = path[0].x;
  let y = path[0].y;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (f >= a.at) {
      const p = interpolate(f, [a.at, b.at], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
      x = a.x + (b.x - a.x) * p;
      y = a.y + (b.y - a.y) * p;
    }
  }
  const clicking = path.some(p => p.click && f >= p.at && f < p.at + 8);
  const ring = path.find(p => p.click && f >= p.at && f < p.at + 16);
  const r = ring ? interpolate(f - ring.at, [0, 16], [8, 40]) : 0;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {path.filter(p => p.click).map(p => (
        <Sequence key={`click-${p.at}`} from={p.at} durationInFrames={6} layout="none">
          <Audio src={staticFile('audio/click.wav')} volume={0.55} />
        </Sequence>
      ))}
      {ring ? (
        <div style={{ position: 'absolute', left: ring.x - r, top: ring.y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `3px solid ${c.a9}`, opacity: 1 - (f - ring.at) / 16 }} />
      ) : null}
      <svg width="34" height="40" viewBox="0 0 34 40" style={{ position: 'absolute', left: x - 4, top: y - 2, transformOrigin: '4px 2px', transform: `scale(${(clicking ? 0.88 : 1) * (tall ? 1.4 : 1)})` }}>
        <path d="M4 2 L4 32 L12 25 L18 38 L23 36 L17 23 L28 23 Z" fill="#111" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};

// Callout chip, bottom center.
export const Callout: React.FC<{ text: string; at?: number; until?: number }> = ({ text, at = 0, until = 99999 }) => {
  const f = useCurrentFrame();
  const layout = React.useContext(LayoutContext);
  if (layout === 'tall') return null;
  const inP = interpolate(f, [at, at + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const outP = interpolate(f, [until - 8, until], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const o = Math.min(inP, outP);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 46, pointerEvents: 'none' }}>
      <div
        style={{
          opacity: o,
          transform: `translateY(${(1 - inP) * 20}px)`,
          background: 'rgba(24,38,38,.92)',
          color: '#fff',
          fontFamily: display,
          fontWeight: 600,
          fontSize: 44,
          padding: '16px 34px',
          borderRadius: 18,
          letterSpacing: -0.5,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Small honesty label shown on every recreated-interface shot.
export const RecreatedTag: React.FC = () => React.useContext(LayoutContext) === 'tall' ? null : (
  <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: 22, pointerEvents: 'none' }}>
    <div style={{ fontFamily: mono, fontSize: 15, color: c.n9, background: 'rgba(255,255,255,.7)', padding: '4px 10px', borderRadius: 8 }}>
      Illustration · made-up sample data
    </div>
  </AbsoluteFill>
);
