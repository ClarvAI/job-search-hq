import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { alerts, jobs, leads } from './data';
import { body, c, display, mono } from './theme';
import {
  AppWindow, Btn, Callout, Card, ClaudeMsg, LayoutContext, PanelShell, Pill, Pointer, RecreatedTag, UserMsg, ease, enter, useSpring, useTyped,
} from './components/ui';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const BAND = 'Pipeline: 2 waiting to hear back · 1 interviewing · 1 offer · 2 to apply · 3 due or overdue · 3 in Outbox';

// 1. Opener: title on the plain background, the text-free desk illustration beside it (hero-art.png is the
// right part of docs/images/hero.jpg, cropped so the image's own title isn't shown twice). Frame 0 is already
// fully composed, so it works as a first frame / thumbnail.
export const Hero: React.FC = () => {
  const f = useCurrentFrame();
  const tall = React.useContext(LayoutContext) === 'tall';
  const drift = interpolate(f, [0, 150], [1, 1.04], clamp);
  const rise = interpolate(f, [0, 30], [10, 0], { ...clamp, easing: ease });
  const tag = interpolate(f, [18, 36], [0, 1], { ...clamp, easing: ease });
  const BG = '#f3e2d0'; // the illustration's own background
  if (tall) {
    return (
      <AbsoluteFill style={{ background: BG, alignItems: 'center', fontFamily: body }}>
        <Img
          src={staticFile('hero-art.png')}
          style={{ marginTop: 330, width: 1060, transform: `scale(${drift})`, WebkitMaskImage: 'radial-gradient(ellipse 72% 70% at 50% 50%, #000 62%, transparent 100%)' }}
        />
        <div style={{ marginTop: 70, textAlign: 'center', transform: `translateY(${rise}px)` }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 132, color: c.a12, letterSpacing: -3 }}>Job Search HQ</div>
          <div style={{ fontSize: 46, color: c.n11, marginTop: 18, opacity: tag }}>Looking for work is a second job.</div>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: body }}>
      <Img
        src={staticFile('hero-art.png')}
        style={{
          position: 'absolute', right: 0, bottom: 0, width: 1040, transformOrigin: '100% 100%', transform: `scale(${drift})`,
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 22%), linear-gradient(to bottom, transparent 0%, #000 14%)',
          WebkitMaskComposite: 'source-in',
        }}
      />
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 120, transform: `translateY(${rise}px)` }}>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 116, lineHeight: 1, color: c.a12, letterSpacing: -3, whiteSpace: 'nowrap' }}>Job Search HQ</div>
        <div style={{ fontSize: 42, color: c.n11, marginTop: 28, opacity: tag }}>Looking for work is a second job.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 2. Due alerts + status band
export const DueAlerts: React.FC = () => {
  const f = useCurrentFrame();
  const pop = useSpring(10);
  const bandIn = enter(f, 48);
  if (React.useContext(LayoutContext) === 'tall') {
    return (
      <AbsoluteFill style={{ background: c.n2, alignItems: 'center', paddingTop: 70, gap: 40, fontFamily: body }}>
        <Sequence from={10} durationInFrames={15} layout="none"><Audio src={staticFile('audio/pop.wav')} volume={0.5} /></Sequence>
        <div style={{ width: 940, background: '#fff', borderRadius: 26, border: `2px solid ${c.n4}`, boxShadow: '0 24px 60px rgba(39,34,27,.16)', padding: 36, transform: `translateY(${(1 - pop) * -40}px)`, opacity: pop }}>
          <div style={{ fontFamily: display, fontWeight: 650, fontSize: 44, marginBottom: 16 }}>Due today or tomorrow</div>
          {alerts.map((a, i) => (
            <div key={a} style={{ ...enter(f, 22 + i * 6), fontSize: 36, lineHeight: 1.3, padding: '16px 0', borderTop: i ? `2px solid ${c.n3}` : 'none' }}>{a}</div>
          ))}
        </div>
        <div style={{ ...bandIn, width: 940, background: c.n3, borderRadius: 20, padding: '22px 28px', fontSize: 31, lineHeight: 1.4, color: c.n11 }}>{BAND}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AppWindow
        band={<span style={bandIn}>{BAND}</span>}
        chat={<ClaudeMsg style={{ color: c.n9 }}>Good morning, Alex.</ClaudeMsg>}
      />
      <AbsoluteFill style={{ alignItems: 'flex-end', padding: '104px 150px' }}>
        <div style={{ width: 560, background: '#fff', borderRadius: 16, border: `1.5px solid ${c.n4}`, boxShadow: '0 20px 50px rgba(39,34,27,.18)', padding: 22, fontFamily: body, transform: `translateY(${(1 - pop) * -30}px)`, opacity: pop }}>
          <div style={{ fontFamily: display, fontWeight: 650, fontSize: 24, marginBottom: 10 }}>Due today or tomorrow</div>
          {alerts.map((a, i) => (
            <div key={a} style={{ ...enter(f, 22 + i * 6), fontSize: 20, padding: '8px 0', borderTop: i ? `1px solid ${c.n3}` : 'none' }}>{a}</div>
          ))}
        </div>
      </AbsoluteFill>
      <Sequence from={10} durationInFrames={15} layout="none"><Audio src={staticFile('audio/pop.wav')} volume={0.5} /></Sequence>
      <Callout text="What's due, the moment you open it" at={20} until={150} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 3. Pipeline board, Update… on Initech
export const Pipeline: React.FC = () => {
  const f = useCurrentFrame();
  const pressed = f >= 48 && f < 58 ? 1 : 0;
  const menu = f >= 52 && f < 92;
  const moved = f >= 92;
  const saved = enter(f, 96);
  const list = jobs.slice(0, 4);
  return (
    <AbsoluteFill>
      <AppWindow
        band={BAND}
        prompt=""
        chat={<UserMsg>/pipeline</UserMsg>}
        panel={
          <PanelShell title="Pipeline">
            {list.map((j, i) => {
              const isTarget = j.company === 'Initech';
              const stage = isTarget && moved ? 'Interviewing' : j.stage;
              return (
                <Card key={j.company + j.role} highlight={isTarget && f > 30 ? 1 : 0}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 20 }}>{j.company}</div>
                    <Pill tone={stage === 'Interviewing' ? 'teal' : stage === 'Offer' ? 'green' : 'grey'}>{stage}</Pill>
                    <div style={{ marginLeft: 'auto', fontSize: 15, color: j.due === 'due today' ? c.amber : c.n9, fontWeight: 600 }}>
                      {isTarget && moved ? 'in 3 days' : j.due}
                    </div>
                  </div>
                  <div style={{ fontSize: 17, color: c.n11 }}>{j.role}</div>
                  <div style={{ fontSize: 17 }}>Next: {isTarget && moved ? 'Prep for Initech interview' : j.next}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn pressed={isTarget ? pressed : 0}>Update…</Btn>
                    <Btn>Mark next step done</Btn>
                    <Btn>Push back a week</Btn>
                  </div>
                  {isTarget && menu ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...enter(f, 52, 8) }}>
                      {['To apply', 'Applied', 'Screening', 'Interviewing', 'Offer'].map(s => (
                        <Pill key={s} tone={s === 'Interviewing' && f > 74 ? 'teal' : 'grey'}>{s}</Pill>
                      ))}
                    </div>
                  ) : null}
                  {i === 1 && moved ? <div style={{ ...saved, fontSize: 15, color: c.green, fontWeight: 700 }}>Saved to your tracker</div> : null}
                </Card>
              );
            })}
          </PanelShell>
        }
      />
      <Pointer path={[{ at: 0, x: 900, y: 700 }, { at: 40, x: 1256, y: 526 }, { at: 48, x: 1256, y: 526, click: true }, { at: 68, x: 1530, y: 584 }, { at: 76, x: 1530, y: 584, click: true }, { at: 120, x: 1400, y: 700 }]} />
      <Callout text="Your job board, saved to a spreadsheet you own" at={10} until={170} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 4. Job Inbox: Save / Not for me…
export const JobInbox: React.FC = () => {
  const f = useCurrentFrame();
  const saveOut = interpolate(f, [44, 60], [0, 1], { ...clamp, easing: ease });
  const reasons = f >= 92 && f < 140;
  const nfmOut = interpolate(f, [130, 146], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <AppWindow
        band={BAND}
        chat={<UserMsg>/job-inbox</UserMsg>}
        panel={
          <PanelShell title="Job Inbox">
            {leads.map((l, i) => {
              const out = i === 0 ? saveOut : i === 2 ? nfmOut : 0;
              return (
                <div key={l.role} style={{ opacity: 1 - out, transform: `translateX(${out * 120}px)`, height: out > 0.98 ? 0 : undefined, overflow: 'hidden' }}>
                  <Card>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 20 }}>{l.company}</div>
                      <Pill tone={l.fit === 'A' ? 'green' : l.fit === 'B' ? 'teal' : 'grey'}>Fit {l.fit}</Pill>
                    </div>
                    <div style={{ fontSize: 17 }}>{l.role}</div>
                    <div style={{ fontSize: 15, color: c.n9 }}>{l.where} · {l.pay}</div>
                    <div style={{ fontSize: 16, color: c.n11 }}>Why: {l.why}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn primary pressed={i === 0 && f >= 36 && f < 46 ? 1 : 0}>Save</Btn>
                      <Btn>Skip</Btn>
                      <Btn pressed={i === 2 && f >= 84 && f < 94 ? 1 : 0}>Not for me…</Btn>
                    </div>
                    {i === 2 && reasons ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {['Too junior', 'Too senior', 'Wrong location', 'Pay too low', 'Not my field'].map(r => (
                          <Pill key={r} tone={r === 'Too junior' && f > 116 ? 'teal' : 'grey'}>{r}</Pill>
                        ))}
                      </div>
                    ) : null}
                  </Card>
                </div>
              );
            })}
          </PanelShell>
        }
      />
      <Pointer path={[{ at: 0, x: 900, y: 650 }, { at: 30, x: 1214, y: 360 }, { at: 36, x: 1214, y: 360, click: true }, { at: 70, x: 1406, y: 596 }, { at: 84, x: 1406, y: 596, click: true }, { at: 106, x: 1246, y: 636 }, { at: 116, x: 1246, y: 636, click: true }]} />
      <Callout text="Openings that fit you" at={8} until={170} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 5. Tailored resume, fact-checked
export const Resume: React.FC = () => {
  const f = useCurrentFrame();
  const typed = useTyped('Make my resume for Vandelay', 6, 30);
  const sent = f >= 44;
  const step = (i: number) => (f >= 60 + i * 22 ? '✓' : f >= 50 + i * 22 ? '…' : '');
  return (
    <AbsoluteFill>
      <AppWindow
        band={BAND}
        prompt={sent ? '' : typed}
        chat={
          sent ? (
            <>
              <UserMsg>Make my resume for Vandelay</UserMsg>
              <ClaudeMsg>
                <div style={enter(f, 48)}>Built from your master resume, then checked three ways:</div>
                {['Fact check against your real experience', 'Sounds like you, not like AI', 'Read like a recruiter (and screening software)'].map((t, i) => (
                  <div key={t} style={{ ...enter(f, 50 + i * 22), display: 'flex', gap: 12, marginTop: 6 }}>
                    <span style={{ width: 26, color: c.green, fontWeight: 800 }}>{step(i)}</span>
                    {t}
                  </div>
                ))}
                <div style={{ ...enter(f, 130), marginTop: 18, display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 28px', fontSize: 20, maxWidth: 820 }}>
                  {([['5+ years of B2B product marketing', 'met'], ['Launch experience with numbers', 'met'], ['Sales tools: battlecards, demo stories', 'met'], ['Win/loss interviews', 'met'], ['Logistics software', 'not met · not claimed']] as const).map(([k, v]) => (
                    <React.Fragment key={k}><span>{k}</span><span style={{ justifySelf: 'start' }}><Pill tone={v === 'met' ? 'green' : 'amber'}>{v}</Pill></span></React.Fragment>
                  ))}
                </div>
              </ClaudeMsg>
            </>
          ) : null
        }
      />
      <Callout text="Your real experience. Nothing invented." at={150} until={268} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 6. Apply Kit
export const ApplyKit: React.FC = () => {
  const f = useCurrentFrame();
  const copied = f >= 50;
  const rows: [string, string, boolean][] = [
    ['Name', 'Alex Rivera', true],
    ['Email', 'alex.rivera@example.com', true],
    ['Phone', '(555) 555-0142', true],
    ['Work authorization (US)', 'Yes', true],
    ['Needs sponsorship (US)', 'No', true],
  ];
  return (
    <AbsoluteFill>
      <AppWindow
        band={BAND}
        chat={<UserMsg>/apply-kit</UserMsg>}
        panel={
          <PanelShell title="Apply Kit">
            <div style={{ fontSize: 17, color: c.n11 }}>Vandelay Industries · Senior Product Marketing Manager</div>
            <Card>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Contact details</div>
              {rows.map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18 }}>
                  <span style={{ color: c.n9, width: 210 }}>{k}</span>
                  <span style={{ flex: 1 }}>{v}</span>
                  <Btn pressed={i === 1 && f >= 42 && f < 52 ? 1 : 0}>{i === 1 && copied ? 'Copied' : 'Copy'}</Btn>
                </div>
              ))}
            </Card>
            <Card highlight={f > 90 ? 1 : 0}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Salary expectation</div>
              <div style={{ fontSize: 18, color: c.n11 }}>Your minimum — don't type this</div>
            </Card>
            <Card>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Files to upload</div>
              <div style={{ fontFamily: mono, fontSize: 15 }}>Alex-Rivera-Resume-Vandelay-Industries.pdf</div>
            </Card>
            <div><Btn primary>Mark applied…</Btn></div>
          </PanelShell>
        }
      />
      <Pointer path={[{ at: 0, x: 900, y: 600 }, { at: 34, x: 1735, y: 368 }, { at: 42, x: 1735, y: 368, click: true }, { at: 80, x: 1500, y: 610 }]} />
      <Callout text="Every answer, ready to copy" at={8} until={170} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 7. Outbox
export const Outbox: React.FC = () => {
  const f = useCurrentFrame();
  const done = f >= 92;
  return (
    <AbsoluteFill>
      <AppWindow
        band={BAND}
        chat={<UserMsg>/outbox</UserMsg>}
        panel={
          <PanelShell title="Outbox">
            <Card highlight={1}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 19 }}>To Rae Fox</div>
                <Pill tone={done ? 'teal' : 'grey'}>{done ? 'In Gmail drafts · not sent' : 'Draft'}</Pill>
              </div>
              <div style={{ fontSize: 16, color: c.n11 }}>Hooli Senior Product Marketing Manager, quick follow-up</div>
              <div style={{ fontSize: 17, lineHeight: 1.45, background: c.n2, borderRadius: 10, padding: 12 }}>
                Hi Rae, thanks again for passing my resume along for the Senior Product Marketing Manager role. I applied 10 days ago and haven't heard back yet. Do you know if the team has started interviews?
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn primary pressed={f >= 50 && f < 60 ? 1 : 0}>Create Gmail draft…</Btn>
                <Btn>Copy</Btn>
                <Btn>Mark sent…</Btn>
                <Btn>Discard…</Btn>
              </div>
            </Card>
            <Card><div style={{ fontWeight: 700, fontSize: 18 }}>To Dana Cole · LinkedIn note</div><div style={{ fontSize: 15, color: c.n9 }}>164 of 200 characters</div></Card>
          </PanelShell>
        }
      />
      <Pointer path={[{ at: 0, x: 900, y: 600 }, { at: 42, x: 1292, y: 406 }, { at: 50, x: 1292, y: 406, click: true }, { at: 100, x: 1350, y: 700 }]} />
      <Callout text="It drafts. You send." at={10} until={230} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 8. Interview Room
export const InterviewRoom: React.FC = () => {
  const f = useCurrentFrame();
  const secs = Math.floor(interpolate(f, [30, 150], [0, 78], clamp)); // answer clock, sped up
  const answering = f >= 30 && f < 150;
  const scored = f >= 160;
  const words = 'At Northwind our old battlecards sat unread, so I rebuilt them around the questions reps actually got on calls…';
  const typed = useTyped(words, 40, 22);
  return (
    <AbsoluteFill>
      <AppWindow
        band={BAND}
        chat={
          <>
            <UserMsg>Mock interview for Acme, behavioral</UserMsg>
            <ClaudeMsg style={{ color: c.n11 }}>Interview Room is open. First question.</ClaudeMsg>
            {f >= 40 ? <UserMsg style={{ background: '#fff', border: `1.5px dashed ${c.n6}`, color: c.n11 }}>🎙 {typed}</UserMsg> : null}
          </>
        }
        panel={
          <PanelShell title="Interview Room">
            <Card>
              <div style={{ fontSize: 15, color: c.n9, fontWeight: 700 }}>QUESTION 1 OF 2</div>
              <div style={{ fontFamily: display, fontSize: 28, lineHeight: 1.25, fontWeight: 600 }}>Tell me about a time you improved a process.</div>
            </Card>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontFamily: mono, fontSize: 46, fontWeight: 600, color: answering ? c.a9 : c.n9 }}>
                  {`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}
                </div>
                <div style={{ flex: 1, height: 10, background: c.n3, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(secs / 120) * 100}%`, height: '100%', background: c.a9 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn primary pressed={f >= 142 && f < 152 ? 1 : 0}>Done answering</Btn>
                <Btn>Ask for a hint</Btn>
                <Btn>Read question again</Btn>
              </div>
            </Card>
            {scored ? (
              <Card highlight={1} style={enter(f, 160)}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Scorecard</div>
                <div style={{ fontSize: 19 }}>Q1 · 4 out of 5 <span style={{ color: c.a9, letterSpacing: 3 }}>●●●●○</span></div>
                <div style={{ fontSize: 17, color: c.n11 }}>Strong result. Say the win rate change (31% to 38%) earlier.</div>
              </Card>
            ) : null}
          </PanelShell>
        }
      />
      <Pointer path={[{ at: 0, x: 1000, y: 700 }, { at: 130, x: 1262, y: 470 }, { at: 142, x: 1262, y: 470, click: true }, { at: 180, x: 1400, y: 760 }]} />
      <Callout text="Practice out loud, with a clock and a scorecard" at={10} until={262} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 9. Flashcards on a phone
export const Flashcards: React.FC = () => {
  const f = useCurrentFrame();
  const flip = interpolate(f, [40, 62], [0, 180], { ...clamp, easing: ease });
  const swipe = interpolate(f, [110, 130], [0, 1], { ...clamp, easing: ease });
  const back = flip > 90;
  return (
    <AbsoluteFill style={{ background: c.n3, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${React.useContext(LayoutContext) === 'tall' ? 1.38 : 1})` }}>
      <div style={{ width: 430, height: 880, borderRadius: 64, background: c.n12, padding: 16, boxShadow: '0 40px 90px rgba(0,0,0,.25)' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 50, background: c.n2, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '70px 26px', gap: 22, fontFamily: body }}>
          <div style={{ fontFamily: display, fontSize: 30, fontWeight: 650 }}>My stories</div>
          <div style={{ perspective: 1200, width: '100%', flex: 1 }}>
            <div style={{ width: '100%', height: '100%', transform: `translateX(${swipe * 420}px) rotate(${swipe * 14}deg) rotateY(${flip}deg)`, transformStyle: 'preserve-3d', opacity: 1 - swipe }}>
              <div style={{ position: 'absolute', inset: 0, background: '#fff', borderRadius: 26, border: `1.5px solid ${c.n4}`, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', transform: back ? 'rotateY(180deg)' : 'none' }}>
                {back ? (
                  <div style={{ fontSize: 21, lineHeight: 1.45 }}>
                    <b>S</b> Sales had no clear story for the analytics add-on.<br /><b>A</b> 25 customer interviews, positioning, sales training.<br /><b>R</b> 1,200 paying accounts in two quarters.
                  </div>
                ) : (
                  <div style={{ fontFamily: display, fontSize: 32, fontWeight: 600, lineHeight: 1.25 }}>Tell me about a launch you're proud of.</div>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}><Pill>Practice again</Pill><Pill tone="green">Nailed it</Pill></div>
        </div>
      </div>
      </div>
      <Callout text="Take your prep with you" at={10} until={170} />
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 10. Dashboard snapshot (numbers from templates/sample/page-data/dashboard.json and the sample tracker)
export const Dashboard: React.FC = () => {
  const f = useCurrentFrame();
  const goals: [string, number, number][] = [['Applications', 1, 4], ['Networking conversations', 2, 2], ['Mock interviews', 1, 1]];
  if (React.useContext(LayoutContext) === 'tall') {
    return (
      <AbsoluteFill style={{ background: c.n2, padding: '50px 60px', fontFamily: body, color: c.n12, gap: 26 }}>
        <div style={{ ...enter(f, 0), background: c.a12, color: '#fff', borderRadius: 26, padding: '30px 34px' }}>
          <div style={{ fontFamily: display, fontSize: 58, fontWeight: 700, lineHeight: 1.1 }}>3 things need you today</div>
          <div style={{ fontSize: 31, opacity: 0.88, marginTop: 14, lineHeight: 1.35 }}>Schedule the Initech interview · Follow up with Rae Fox · Review the Vandelay package</div>
        </div>
        <div style={{ ...enter(f, 8), fontFamily: display, fontSize: 40, fontWeight: 650, marginTop: 6 }}>This week</div>
        {goals.map(([k, done, goal], i) => (
          <div key={k} style={{ ...enter(f, 12 + i * 5), background: '#fff', border: `2px solid ${c.n4}`, borderRadius: 22, padding: '22px 30px', display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ fontFamily: display, fontSize: 72, fontWeight: 700, color: c.a9, width: 200 }}>{done}<span style={{ fontSize: 38, color: c.n9 }}> of {goal}</span></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 32, color: c.n11 }}>{k}</div>
              <div style={{ height: 14, background: c.n3, borderRadius: 7, marginTop: 12, overflow: 'hidden' }}>
                <div style={{ width: `${interpolate(f, [20 + i * 5, 50 + i * 5], [0, (done / goal) * 100], clamp)}%`, height: '100%', background: c.a9 }} />
              </div>
            </div>
          </div>
        ))}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: c.n2, padding: '90px 150px', fontFamily: body, color: c.n12, gap: 30, justifyContent: 'center' }}>
      <div style={{ ...enter(f, 0), background: c.a12, color: '#fff', borderRadius: 24, padding: '30px 38px' }}>
        <div style={{ fontFamily: display, fontSize: 48, fontWeight: 700 }}>3 things need you today</div>
        <div style={{ fontSize: 24, opacity: 0.85, marginTop: 8 }}>Schedule the Initech interview · Follow up with Rae Fox · Review the Vandelay package</div>
      </div>
      <div style={{ ...enter(f, 8), fontFamily: display, fontSize: 30, fontWeight: 650 }}>This week</div>
      <div style={{ display: 'flex', gap: 24 }}>
        {goals.map(([k, done, goal], i) => (
          <div key={k} style={{ ...enter(f, 12 + i * 5), flex: 1, background: '#fff', border: `1.5px solid ${c.n4}`, borderRadius: 20, padding: 28 }}>
            <div style={{ fontFamily: display, fontSize: 64, fontWeight: 700, color: c.a9 }}>{done}<span style={{ fontSize: 36, color: c.n9 }}> of {goal}</span></div>
            <div style={{ fontSize: 24, color: c.n11 }}>{k}</div>
            <div style={{ height: 10, background: c.n3, borderRadius: 5, marginTop: 14, overflow: 'hidden' }}>
              <div style={{ width: `${interpolate(f, [20 + i * 5, 50 + i * 5], [0, (done / goal) * 100], clamp)}%`, height: '100%', background: c.a9 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...enter(f, 34), fontSize: 26, color: c.n11 }}>Works in Claude or ChatGPT, in plain words. No coding.</div>
      <RecreatedTag />
    </AbsoluteFill>
  );
};

// 11. End card
export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const tall = React.useContext(LayoutContext) === 'tall';
  const a = enter(f, 4, 18);
  const b = enter(f, 22, 18);
  return (
    <AbsoluteFill style={{ background: c.a12, justifyContent: 'center', alignItems: 'center', fontFamily: body, textAlign: 'center', padding: '0 70px' }}>
      <div style={{ ...a, fontFamily: display, fontWeight: 700, fontSize: tall ? 140 : 120, lineHeight: 1.05, color: '#fff', letterSpacing: -3 }}>Job Search HQ</div>
      <div style={{ ...b, fontSize: tall ? 50 : 36, lineHeight: 1.3, color: c.a3, marginTop: tall ? 30 : 14 }}>Works in Claude and ChatGPT · Try it with sample data first</div>
      <div style={{ ...b, fontSize: tall ? 42 : 30, color: '#9fc9cb', marginTop: 34 }}>It drafts. You send and submit.</div>
    </AbsoluteFill>
  );
};
