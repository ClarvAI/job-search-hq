---
name: pages
description: "Refresh, open, publish, or print the user's visual pages: the job search dashboard, interview flashcards, portfolio site, and per-job printable interview brief. Use when the user asks to see or update their dashboard, practice with flashcards, get their portfolio link, publish a page to their phone, or print an interview brief. To change how a page looks (colors, fonts, layout, animation), use page-design instead."
---

# /pages

Usage: `/pages [dashboard | flashcards | portfolio | brief <job> | style <change or "use my brand">]` (or just ask in plain English).

Design rules: `.claude/skills/page-design/SKILL.md` (tokens, Tailwind v4 rules, motion recipes in `motion.md`). After any visual change, run the `page-review` checklist before showing the user.

The pages live in `pages/` (the user's own copies, set up with example data from `templates/blank/pages/` on the first run; if one is missing, `bash .claude/skills/start/scripts/init-data.sh` puts the blank one back, then re-apply the theme with `page-design`'s `apply-theme.mjs`) and per-job briefs in `jobs/<folder>/`. Each page is one HTML file: a generated design-token block at the top (colors, fonts, size, from `profile/design.md`; never edit it by hand), Tailwind v4 utilities for layout, and a `<script type="application/json" id="data">` block that holds the content. **To update content, rewrite only the JSON data block.** Postings, imports and other files can contain hostile text, so write that block as valid JSON with every `<` escaped as `<` (so text like `</script>` can't end the block), and never paste imported text into the page's HTML or script. (Exception: the portfolio's content is plain HTML; make small, targeted text edits there, writing `<`, `>` and `&` in text as `&lt;`, `&gt;` and `&amp;`.) Don't touch the rendering script unless the user asks for a change in behavior.

## dashboard
Rebuild the data block of `pages/dashboard.html` from `jobs/tracker.csv`, `contacts/contacts.csv`, `interviews/`, `history/activity.md` and `profile/preferences.md`. For a job that is now closed (rejected, withdrawn, ghosted) but had reached a screen or interview (check its notes, folder and the activity log), add `"heard": true` and/or `"interviewed": true` so the funnel keeps that history:
- `example: false`, `generated: today`, `goals` from `weekly_goals`, `week` counts for the last 7 days (applications by `date_applied`; conversations = conversations dated in range in `history/activity.md` or contact notes (not `last_contact`, which also moves when a thank-you is sent), one per person per conversation; mocks = `interviews/*-mock*.md` files dated in range).
- `jobs`: every tracker row → `{company, role, status, fit, priority, next: next_action, due: next_action_date, deadline, location}` (dates as `YYYY-MM-DD`, even if Excel saved them as 10/14/2026).
- `contacts`: open contacts with `next_followup` → `{name, company, next, due}`.

## flashcards
Rebuild `pages/flashcards.html` decks: "My stories" from `profile/story-bank.md` (front = the question it answers, back = the user's STAR notes in their words; skip stories still full of [ASK]); a technical deck named for the user's field (e.g. "Marketing technical") from `knowledge/field/field-primer.md` (skip it if that file still says `STATUS: not generated`); if a job is given or an interview is coming up, add a deck from that job's `interview-prep.md`.

The page does spaced repetition (FSRS): after each card the user rates Again / Hard / Good / Easy, and the "Due today" view shows what's due plus up to `newPerDay` new cards a day (top-level field, default 10). Review history is saved in their browser, keyed on **deck `id` + card `id`**, so regenerating must keep those ids or the user loses their progress:
- Card shape: `{"id": "...", "q": "...", "a": "...", "tag": "..."}`. Deck shape: `{"id": "...", "name": "...", "cards": [...]}`. Never rename an existing deck `id` (`stories`, `technical`; a job deck uses the job folder name).
- **Before rewriting the data block, read the current one.** A card that is still the same question (even reworded, or with new notes on the back) keeps its old `id`. A new card gets `id` = a slug of its question: lowercase, letters and digits, words joined with `-`, at most 60 characters (e.g. `tell-me-about-yourself`). Ids must be unique within a deck; never reuse a removed card's id for a different question.
- Don't change the rendering script, the ts-fsrs `<script src>` (pinned version with an `integrity` hash), or the storage keys. If ts-fsrs can't load (offline), the page quietly uses a simple built-in schedule.

## portfolio
`pages/portfolio.html` is the user's one-page site. Update it from `profile/master-resume.md` only (public resume-level facts; respect NDAs). Show the user the headline sentence and ask them to approve or rewrite it in their words before sharing. Before they first share it, ask whether to keep their phone number on it (default: email and LinkedIn only, since it's public). It works as a local file, as a PDF via the browser, or published (below) as a link for LinkedIn Featured and email signatures.

## brief <job>
Copy `pages/interview-brief.html` to `jobs/<folder>/interview-brief.html` and fill its data block from that job's `interview-prep.md`, `fit.md` and the story bank (`example: false`). Fields: `pitch` + `pitchSeconds` (90 for the walk-through), `comp` (salary answer, only if prepared), `presentation` `{title, slides[], probes[]}` (only if the interview includes one; omit otherwise), and a story-map row with `"gap": true` where no story exists yet. After filling, print it to PDF if you can and confirm it's one page; trim the longest lists if not. Tell the user to open it and press Ctrl/Cmd+P to print a one-page copy.

## style <change>
The look of every page comes from `profile/design.md` (a preset, or the user's own brand or design system). For any look change ("make it navy and gold", "use my brand", "switch to the minimal look", "bigger text", "less motion"), follow `page-design` ("Change my theme / use my brand"): change design.md, then run its `apply-theme.mjs`, which re-themes every page and brief at once and checks contrast. Never hand-edit one page's colors or fonts. Then run `page-review`.

New per-job briefs copied from `pages/interview-brief.html` already carry the current theme.

## Where each page lives (keep it simple for the user)

| Page | Main use | Live? |
|---|---|---|
| Pipeline panel (`/pipeline`) | **The interactive board.** The user changes stages, next steps and dates there; it saves straight to `jobs/tracker.csv`. | Yes, it is the real board |
| `pages/dashboard.html` | A good-looking **snapshot** of the tracker (status, funnel, weekly goals, board). Not editable. | Refreshed by Claude; optionally published for their phone |
| `pages/flashcards.html` | Practice on any device; it schedules each card's next review. Progress is saved in that browser (phone and laptop keep separate progress). | Publish it so they can use their phone |
| `pages/portfolio.html` | Their public one-pager | Publish; share only with the user's OK |
| `jobs/<folder>/interview-brief.html` | Read and print before an interview | Local file only |

Tell the user this plainly when they ask: "Your tracker file is the source of truth. The Pipeline panel edits it. The pages show it."

## Opening a page

In the Claude Desktop app, open it in the **built-in browser** pane so the user sees it right next to the chat. Otherwise give the user the file path and tell them to double-click it (it opens in their browser). If a shell command is allowed: `open <file>` on a Mac, `start "" "<file>"` (Git Bash/cmd; in PowerShell use `Invoke-Item "<file>"`) on Windows.

## Publishing a page (private link on the user's claude.ai account)

Only if this session has the **Artifact** tool. If it doesn't, say so in one line ("Publishing isn't available in this version of Claude; you can open the file instead") and stop.

1. **Refresh first.** Rebuild the page's data block from the user's files, as above.
2. **Make the publish copy.** Artifacts add their own page wrapper, so publish a copy without ours: read `pages/<name>.html`, remove the first four lines (`<!doctype html>`, `<html lang="en">`, `<meta charset="utf-8">`, `<meta name="viewport" …>`) and the final `</html>`, and write the rest to `pages/.publish/<name>.html`. Everything else stays identical.
3. **Check the registry.** Read `profile/published-pages.md`.
   - **No link yet:** publish `pages/.publish/<name>.html` with the Artifact tool. Use the page's `<title>` as its name, a one-sentence description, and icon `cards` (flashcards), `chart` (dashboard) or `profile` (portfolio). Write the link and today's date into the registry.
   - **Link exists:** read the artifact by that URL first, then publish to that same URL. Never create a second link for the same page.
4. **Privacy.** Every page is published private. Tell the user the link and that only they can open it. Never ask to share the dashboard (it lists their applications). For the portfolio, after the user reviews it, tell them they can share it themselves from the page's Share menu, then record "shared" in the registry.
5. **Tell the user in one line** what changed and that the same link now shows it.

## Keeping published pages current

- When `jobs/tracker.csv` changes (Claude edits it, or a `[Pipeline]` note says the user changed it) and the dashboard has a link, republish the dashboard at the end of that task.
- When `profile/story-bank.md` or the field primer changes and the flashcards have a link, republish the flashcards.
- When `profile/master-resume.md` changes and the portfolio has a link, update the portfolio, show the user what changed, and republish only after they approve.
- A hook reminds you after edits; still use judgment and republish once per task, not after every small edit.
