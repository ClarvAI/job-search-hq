# Third-party notices

Job Search HQ is released under the PolyForm Noncommercial License 1.0.0 (see `LICENSE`); that license covers only Job Search HQ itself, not the pieces listed here, which keep their own licenses. It bundles the open-source fonts and three small libraries its pages use, unmodified, in `templates/assets/`, each with its license file; pages fall back to the same pinned files on public CDNs only when they can't find the local copy (a page moved elsewhere, or a published copy). Some features can use optional tools you install yourself. Their licenses are listed here. `templates/assets/manifest.json` gives each bundled file's source package, version and SHA-256.

## Images in the docs

`docs/images/hero.jpg` and `docs/images/social-preview.jpg`: illustration generated for this project with OpenAI's image model (gpt-image-2, through Codex image generation, on the maintainer's account); the wordmark is set in a system font. The screenshots in `docs/images/` are of Job Search HQ itself, with fictional sample data. All are the project's own and covered by its license.

## The trailer

The trailer video was built with [Remotion](https://www.remotion.dev) (free for individuals under its license; the build source is in `docs/maintainers/video-build/`, not part of the app's download). Its narration was generated with ElevenLabs on the maintainer's paid plan, which includes commercial use; its click and pop sound effects were generated for this project with Claude; it uses the fonts listed below and made-up sample data.

## Libraries used by the pages (bundled in `templates/assets/lib/`)

Each one is pinned to an exact version. The CDN fallback (cdn.jsdelivr.net) is checked with a Subresource Integrity hash, so the browser refuses a changed file.

| Library | Version | Used by | License | Project |
|---|---|---|---|---|
| @tailwindcss/browser | 4.1.13 | every page (styling) | MIT | https://github.com/tailwindlabs/tailwindcss |
| ts-fsrs | 5.4.2 | flashcards (spaced repetition) | MIT | https://github.com/open-spaced-repetition/ts-fsrs |
| canvas-confetti | 1.9.3 | dashboard (offer celebration) | ISC | https://github.com/catdad/canvas-confetti |

The full license text of each is next to it (`templates/assets/lib/LICENSE-*.txt`), in its package on npm, and in the repository linked above. The pages still work offline without them: they fall back to plain styling, a simple review schedule, and no confetti.

## Fonts (bundled in `templates/assets/fonts/`)

All are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org); each family's folder holds its license file. They are the publishers' unmodified web font files:

- From Fontsource (5.3.0; Source Serif 4: 5.3.1): Bricolage Grotesque, Inter, JetBrains Mono, Fraunces, Source Serif 4, DM Sans, Space Grotesk, Work Sans, EB Garamond, Roboto, Open Sans.
- From Adobe: Source Sans 3 (`source-sans` 3.52.0), Source Code Pro (`source-code-pro` 2.42.0).
- From IBM: IBM Plex Sans (`@ibm/plex-sans` 1.1.0), IBM Plex Serif (`@ibm/plex-serif` 2.0.0), IBM Plex Mono (`@ibm/plex-mono` 2.5.0).

Still loaded from Google Fonts (fonts.googleapis.com, also OFL 1.1): Lexend (the high-contrast preset) and Lato (a resume font option), whose licenses reserve their names so no unmodified web file is published to bundle, and any other font you choose for a custom theme (Lora, Merriweather, Playfair Display, Noto Serif, Manrope, Public Sans, Libre Franklin, Montserrat, Poppins, Noto Sans, Roboto Mono).

The resume and cover-letter templates use fonts already on your computer (Arial and similar) and load nothing.

Google Fonts and jsDelivr receive your IP address and the page address only when a page loads something from them (the fonts above that aren't bundled, a published copy, or a page that can't find `templates/assets/`), as with any website that uses them.

## Optional tools (not included; you install them only if you want them)

| Tool | Used for | License |
|---|---|---|
| RenderCV | an alternative typeset resume PDF | MIT (https://github.com/rendercv/rendercv) |
| Google Chrome or Microsoft Edge | making PDFs from the HTML templates (headless print) | proprietary; free to use |
| Node.js | page theming and some checks | MIT and others (https://github.com/nodejs/node/blob/main/LICENSE) |
| pdftotext (Poppler) | checking that a PDF's text can be read | GPL-2.0 or later; run as a separate program, not included |

## Formats and data sources

- `/my-data` backups include a copy of your resume in the JSON Resume format (schema: MIT, https://jsonresume.org/schema).
- Pay research reads public data from the U.S. Bureau of Labor Statistics and O*NET (U.S. government works) and similar public sources in other countries; nothing from them is copied into this project.
- Writing guides in the skills cite their sources by name and link. They summarize; they don't reproduce copyrighted text.

All company names, people and numbers in the examples are made up.
