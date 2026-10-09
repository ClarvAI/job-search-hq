# Third-party notices

Job Search HQ is released under the MIT License (see `LICENSE`). It does not bundle third-party code. The pages it makes load a few open-source libraries and fonts from public CDNs when you open them in a browser, and some features can use optional tools you install yourself. Their licenses are listed here.

## Libraries loaded by the pages (from cdn.jsdelivr.net)

Each one is pinned to an exact version and checked with a Subresource Integrity hash, so the browser refuses a changed file.

| Library | Version | Used by | License | Project |
|---|---|---|---|---|
| @tailwindcss/browser | 4.1.13 | every page (styling) | MIT | https://github.com/tailwindlabs/tailwindcss |
| ts-fsrs | 5.4.2 | flashcards (spaced repetition) | MIT | https://github.com/open-spaced-repetition/ts-fsrs |
| canvas-confetti | 1.9.3 | dashboard (offer celebration) | ISC | https://github.com/catdad/canvas-confetti |

The full license text of each is in its package on npm and in the repository linked above. The pages still work offline without them: they fall back to plain styling, a simple review schedule, and no confetti.

## Fonts (from Google Fonts)

The page themes load fonts from fonts.googleapis.com. All of them are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), as listed on Google Fonts:

- Used by the built-in presets: Bricolage Grotesque, Source Sans 3, Source Code Pro (default); Inter, JetBrains Mono (modern); IBM Plex Sans, IBM Plex Serif, IBM Plex Mono (minimal); Lexend (high contrast).
- Offered for custom themes: Source Serif 4, Lora, Merriweather, Fraunces, Playfair Display, EB Garamond, Noto Serif, DM Sans, Work Sans, Manrope, Space Grotesk, Public Sans, Libre Franklin, Roboto, Open Sans, Lato, Montserrat, Poppins, Noto Sans, Roboto Mono.

The resume and cover-letter templates use fonts already on your computer (Arial and similar) and load nothing.

Google Fonts and jsDelivr receive your IP address and the page address when a page loads them, as with any website that uses them.

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
