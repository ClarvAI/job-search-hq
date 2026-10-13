# Job Search HQ explainer videos

Code-built explainer videos for Job Search HQ. Remotion 4.0.529 + ffmpeg. Maintainer-only: `docs/maintainers/`
is left out of the release zip and `/update`. `node_modules/` and `out/` are git-ignored: run `npm ci` here before
building, and publish rendered videos on the GitHub release (or as a README upload), never in git.

## Rules

- **Made-up data only.** Every name, number and label on screen comes from the repo's `templates/sample/`
  (Alex Rivera, example.com) or the panels' real button labels (`.claude/skills/<panel>/hooks/register.tsx`).
  Never invent a figure; never show a real person, employer or account.
- Every shot of the rebuilt app carries the "Illustration · made-up sample data" label (`RecreatedTag`).
- No price or "free" claims. The promise in every video: Claude drafts; you send and submit.
- Look: the app's default theme (`src/theme.ts`: teal #187075, stone neutrals, Bricolage Grotesque /
  Source Sans 3 / Source Code Pro).

## Layout

- `src/scenes.tsx` one component per shot; `src/components/ui.tsx` the window, panels, pointer, callouts.
- `src/Trailer.tsx` the shot table (`SHOTS`): scene, minimum length, vertical headline, `full` and `noCaption`. Shot i plays
  narration line i from `src/vo.json`; shots stretch if a line runs long.
- Compositions: `Trailer`, `TrailerCaptioned`, `TrailerVertical` (`src/Root.tsx`).
- Vertical cut: never crop the 16:9 frame. Scenes read `LayoutContext` ('wide' | 'tall') and lay themselves out
  for a 1080 x 1340 area (`TALL_W`, `TALL_H`) under a headline band; `AppWindow` shows just the panel (or the
  chat column) enlarged, and `Pointer` maps its wide coordinates with `toTall`. `full: true` shots fill 1080 x 1920.
- Opener: `public/hero-art.png` is the right part of the repo's `docs/images/hero.jpg`, cropped so the image's own
  "Job Search HQ" lettering is never shown (the title is set once in code).
- It works in Claude **and** ChatGPT (Codex): say both wherever the app is named; panels are Claude-only.
- Narration: ElevenLabs, voice "Megan - Warm & Trusted Training Voice" (`1FmDfZG0Nx2dCk793S1a`), model
  eleven_v4. Raw takes in `raw/`, cut per line into `public/audio/vo/` (split at pauses with ffmpeg
  `silencedetect`), timings in `src/vo.json`.
- `scripts/make-srt.py` writes `out/trailer.srt` with the same timing rules. `scripts/vertical-stills.mjs`
  renders one still per shot for checking framing.
- Line 9 was re-recorded (`raw/trailer-line09-claude-or-chatgpt.mp3`) to say Claude or ChatGPT.

## Build

```bash
npx remotion studio                      # preview
npx remotion render Trailer out/raw-Trailer.mp4
ffmpeg -i out/raw-Trailer.mp4 -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k out/job-search-hq-trailer.mp4
python3 scripts/make-srt.py
```

## Open items

- Restyle the window and panels to match real screenshots (`reference/`, not provided yet); the due-alerts
  pop-up wording and the band above the prompt are approximations until then.
- Music: none yet (needs the full ElevenLabs connector or a licensed track in `public/audio/music.mp3`).
- Videos 1–6 not started.
