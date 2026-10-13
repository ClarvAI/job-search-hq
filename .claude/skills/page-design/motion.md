# Motion recipes (vanilla CSS/JS, verified on these pages)

All recipes assume the tokens in SKILL.md and sit inside `@media (prefers-reduced-motion: no-preference)` unless noted.

## Rules before any recipe

- **One signature moment per page, the same in every layout:** dashboard counters count up and funnel bars grow; flashcards flip and deal; the brief's pitch teleprompter; the portfolio hero fades up and its highlight counters count. Everything else is a color or opacity change of 150ms or less. Confetti only for an accepted offer. Nothing starts below opacity 0.4.
- **Budget by frequency.** Things the user does constantly (hover a row, flip through cards, switch a tab) get instant feedback or ≤ 150ms on opacity/color/scale. Expressive motion is for rare moments: first view, a win, an empty state.
- **Transitions for interaction, keyframes for one-shot sequences.** A transition can reverse mid-flight when the user changes their mind; a keyframe animation restarts or snaps.
- **Exits are quieter than entrances:** ~150ms vs ~300ms, a small fixed move (about −12px), never the full height. If the motion adds nothing (frequent action, reduced motion), just remove the element.
- **Stagger only rare entrances**, in meaningful chunks (title, text, actions). Our lists use 45ms steps; up to ~100ms between larger groups. Never stagger hovers or repeated actions.
- **Motion is never the only signal.** Every change it shows also leaves a color, word, icon or count behind for someone who has motion off or looked away.
- **Icon swaps** (copy → copied, play → pause): keep both icons in the DOM, one absolutely positioned on top, and cross-fade `opacity 0→1`, `scale 0.25→1`, `filter: blur(4px)→blur(0)` over 300ms with `cubic-bezier(0.2, 0, 0, 1)` (`--ease-out`).
- **`will-change`** only on `transform`, `opacity` or `filter`, and only if the first frame visibly stutters. Never `will-change: all`.
- **Theme flips** (the `data-theme` toggle): add `*,*::before,*::after{transition:none!important}` for the swap, read `document.body.offsetHeight`, remove it on the next-next animation frame, or every color transition smears at once.
- **Reduced motion:** turn off parallax, confetti, auto-scroll and anything spinning or crossing the screen; swap slides and flips for a crossfade or instant change; keep loading indicators, the button press and focus/hover color changes.
- **Timed things:** anything that moves or updates on its own for more than 5 seconds needs a visible Stop/Pause (the pitch teleprompter's Stop button). Status messages that carry an error or an action stay until the next action; never auto-hide them. Short confirmations ("Copied") may revert after 1.5s or more, with the same text also in a `role="status"` region.

## Press feedback
```css
.btn { transition-property: scale, border-color, background-color; transition-duration: 150ms; transition-timing-function: ease-out; }
.btn:active { scale: 0.96; }
```

## Enter once with @starting-style (bars, cards)
```css
.grow-in { transition: width 900ms var(--ease-out); }
@starting-style { .grow-in { width: 0 !important; } }
.deal { transition: opacity 400ms var(--ease-out), translate 400ms var(--ease-out); transition-delay: calc(var(--i, 0) * 45ms); }
@starting-style { .deal { opacity: 0.45; translate: 0 6px; } }   /* never start fully invisible */
```
Set `style="--i:N"` per item for a short stagger. Unsupported browsers just show the final state.

## Count-up numbers (JS, final value already in markup)
```js
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('[data-count]').forEach(el => {
  const target = +el.dataset.count, pre = el.dataset.pre || '', post = el.dataset.post || '', t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / 800); el.textContent = pre + Math.round(target * (1 - (1 - p) ** 3)) + post; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
});
```

## Scroll-driven reveal (portfolio sections)
```css
@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) {
  .reveal { animation: slide-up linear both; animation-timeline: view(); animation-range: entry 0% entry 65%; animation-duration: 1ms; }
  @keyframes slide-up { from { translate: 0 1rem; } to { translate: 0 0; } }
} }
```
Scroll-linked reveals move only; they never fade. A section waiting below the fold would otherwise sit part-transparent in a full-page screenshot, a link preview, a print or a contrast checker (axe flagged it). Never move text against scroll and never hijack scrolling. One-shot entrances on load (the hero) may fade from opacity 0.4 or more.

## Motion set to "reduced" in profile/design.md
The token block then carries `--motion: reduced` and one rule that turns off movement (animations, and transitions of anything but color, shadow and opacity) on every page, even when the device allows motion. Scripts that animate on their own (counters, confetti, card deals) read it too:
```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() === 'reduced';
```
Any new script-driven motion must check both.

## SVG draw-on
```html
<path class="draw" pathLength="1" d="..." />
```
```css
.draw { stroke-dasharray: 1; stroke-dashoffset: 0; transition: stroke-dashoffset 1100ms var(--ease-out); }
@starting-style { .draw { stroke-dashoffset: 1; } }
```

## 3D flip card (flashcards)
- Container `perspective: 1400px`; card `display: grid; transform-style: preserve-3d`; both faces `grid-area: 1/1; backface-visibility: hidden` (plus `-webkit-`); back face `rotateY(180deg)`; flipped card `rotateY(180deg)`.
- Never put `overflow: hidden`, `opacity < 1`, or `filter` on the rotating element; it flattens 3D.
- Reduced motion: no rotation; toggle `visibility` of the faces instead.

## Swipe (Pointer Events)
- `touch-action: pan-y` on the card so vertical scrolling still works; `setPointerCapture` on down; translate (plus at most a small tilt) while dragging; past ~110px commit, else snap back. A tap (under 6px of movement) flips. Buttons always offer the same actions for keyboard and screen-reader users.

## Spring easing (optional, for a single "deal" moment)
```css
--spring: linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.1, 1.078 30.6%, 1.019 35.7%, 0.998 39.4%, 0.987 42.6%, 0.989 47.6%, 1 61.1%, 1);
```
Use on one entrance, never on frequent interactions.
