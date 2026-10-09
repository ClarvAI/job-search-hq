# Color and contrast (read before changing any color)

Colors come from `profile/design.md` (the user's choices), `themes.mjs` (presets, and the fixer that adjusts lightness until every pair passes), `palette.mjs` (ramps + measurements) and `tokens.mjs` (the CSS block every page shares); `scripts/apply-theme.mjs` runs them all. These rules explain what those scripts already do, so a change keeps doing it. Never estimate a contrast value: run the script and read the number.

## The user names a color ("make it navy and gold")

- Put their color in `accent:` in `profile/design.md` (hex). The script takes its OKLCH **hue** and lightness; it lands on step **9** (solid fill: the filled button). A light color (yellow, cyan, light orange) gets near-black button text instead of white.
- If the button text still fails, the script makes the fill deeper or lighter (never a new hue) and says so in an `adjusted:` line. Tell the user in one line; never quietly change their brand.
- A second named color ("and gold") is decoration or a status hue, not a second accent. One accent per system.
- Keep accent and every status hue at least **15° apart**, or "Danger" and the main button read as the same color. The script moves a status hue away when needed (a `note:` line); if the user picks red, check the result side by side.
- Neutrals (`neutral:` in design.md, a hex or a hue): either near the accent's hue or a deliberate warm/cool gray, with tiny chroma (the Default preset uses warm stone, hue 75, under a deep teal accent). Warm (toward orange) reads editorial, cool (toward blue) reads technical. Whatever you pick, use it for the whole neutral ramp; a warm border on a cool background looks dirty.

## What a good ramp looks like (check the script output)

- Steps are evenly spaced in *perceived* lightness (OKLCH L), never HSL lightness.
- Hue is the same from step 1 to 12.
- Vividness peaks in the middle (steps 8–10) and falls off at both ends; steps 1–2 are almost neutral.
- Light-end steps (1–5) sit closer together than dark-end steps, so page, surface and hover still read as three surfaces.
- Neither end reaches pure white or black.
- Across hues, step N has the same lightness and the same **share of that hue's own maximum chroma** (that is the `VIVID` array). Copying one chroma number across hues makes yellow look weak beside red.
- Dark mode is its own ramp, not the light one flipped: a bit less vivid (`0.86×`), more separation between dark surfaces, and every pair re-measured. A pair that passes in light can fail in dark.

## Using tokens

- Components use only the semantic `--color-*` tokens (or their Tailwind aliases). A primitive like `--accent-9` in a component is a bug: it skips the seam that makes dark mode work.
- Use a token only for the job its name says. Border color as caption text "because it looked right" breaks the next time borders get lighter. If a role has no token, add one in `tokens.mjs`.
- One meaning per color, across every page and panel: accent = interactive or "look here"; green/amber/red = status only. Anything within ~15° of the accent counts as the accent, so don't use it for decoration that looks clickable. And the reverse: a clickable thing shown in plain neutral is just as misleading.
- One filled accent button per view. Peers are outline or plain. Several colored backgrounds are fine only when they mark different states or categories (pipeline stages), never competing actions.
- Color is never the only signal: pair it with a word, icon, shape or count.
- Theme switching uses one mechanism everywhere: the generated block sets everything under `prefers-color-scheme` and again under `[data-theme]`. Never set some tokens by media query and others by attribute.

## Contrast targets

Measure the text against the background it actually sits on (a card, a chip, a wash), not the page background.

| What | WCAG 2 (the legal floor) | APCA Lc (what we aim for) |
|---|---|---|
| Body text, paragraphs | 4.5:1 | 75 (90 preferred) |
| Labels, headings, small UI text | 4.5:1 (3:1 if ≥ 24px, or ≥ 18.5px bold) | 60 |
| Large display text (≥ 36px) | 3:1 | 45 |
| Focus ring, icons, chart marks, input borders | 3:1 | 30 |
| Disabled text | exempt, keep it legible | 30 |

Text pairs must pass both columns. Graphics (rings, fills, borders) must pass WCAG; their APCA value is an aim, shown as `note` when under it. The High-contrast preset raises text to 7:1 (APCA 90 body, 75 other text). Print colors (the designed resume's text, the documents accent) must reach 4.5:1 on white. These floors hold for every preset and every brand; no theme can lower them.

Fixing a failing pair:
- Change **lightness**, never hue. Hue barely moves contrast and turns a fix into a palette change.
- A mid-lightness background (around 60–75% L) caps contrast: even black text reaches only about Lc 60. Move the background toward an end instead.
- Rough guide for body text: on backgrounds above ~90% L, text below ~35% L; on backgrounds below ~25% L, text above ~90% L. Above ~73% background lightness dark text wins; below it, white text wins.
- Pushing lightness can push a color out of sRGB; `palette.mjs` reduces chroma to stay in gamut. Re-run it after every change.

Things the script can't measure (check the rendered page): text on gradients or images (measure the worst spot, or add a scrim), translucent overlays, `color-mix()` or opacity modifiers like `bg-accent/50` (never put text on those), and any hard-coded color outside the token block. When auditing a page, grep for stray hex/`rgb(`/`oklch(` literals, including SVG `fill`/`stroke`, and replace them with tokens.

## Charts, tracks and the hero gradient (generated)

- `--chart-1` … `--chart-5` are the only chart colors. The generator derives them from the accent (hue turned ±120°/±60°, same lightness and chroma, kept 15°+ from the status hues and out of the yellow/olive band, OKLCH hue 65–130, which reads as mustard or khaki at chart lightness) and darkens or lightens each until it is 3:1 on every surface in that theme; a near-gray accent gets an ordered lightness ramp of its own hue (chart 1 to 5 always lighter, or always darker). Status colors never encode a series, and a series never needs its color to be read: label it or print the number beside it.
- `--chart-track` is the empty part of a bar or ring (1.5:1 on surface, so a zero still shows as an empty track, not nothing).
- `--color-accent-gradient` is for one hero surface per page. Both stops are measured against the on-accent text; if a stop would fail, the generator falls back to the solid fill. Don't build other gradients by hand.
- A brand import supplies the accent, neutral, fonts and radius only; charts, track, gradient, inset and overlay follow from those automatically.

## Smaller choices

- Gradients: write `linear-gradient(in oklab, …)` for even brightness. Two far-apart hues in plain sRGB go gray in the middle; add a middle stop or use `in oklch` (vivid, may pass through unexpected hues). Big low-contrast gradients band; keep them small.
- An optional `@media (prefers-contrast: more)` block may darken text and borders further; if you add one, re-measure it.
- Notation: keep hex in the generated block (that is what `palette.mjs` emits). Wide-gamut P3 colors, if ever used, come after an sRGB fallback inside `@media (color-gamut: p3)`.
- Print is always the light palette; grayscale printers drop hue, so status must also be a word.
