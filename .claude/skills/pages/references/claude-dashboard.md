# Claude Dashboard: the dashboard as a live Claude page (Claude only)

A second way to put the user's dashboard on their phone, beside the themed page. A **Claude Dashboard** is one of Claude's own page types: every number on it shows where it came from (tap or hover a number to see its source), and it warns the user when the data is more than 72 hours old. It can't use the user's theme from `profile/design.md`; it has Claude's own look, in light and dark. The user's `jobs/tracker.csv` and `pages/dashboard.html` stay the source; the Claude Dashboard is a private copy of part of it.

Codex has no Artifact tool: this route doesn't exist there (its wrapper already says publishing works from Claude).

## What goes up (both routes, every time)

Only the user's own job list: for each job, company, role, status and stage, the dates it was found and applied, its next step in the playbook's standard wording (so "Follow up with Pat" goes up as "Follow up"), that step's due date and the application or offer deadline; plus counts (open jobs, applications, replies, interviews, offers, the last seven days against the weekly goals, applications by week). **Never** contacts' names, notes, pay, links, locations, fit or priority, the activity log, or the user's name. A date whose meaning is unclear (the date rules in AGENTS.md) goes up as "date unclear", never guessed. The builder script below enforces all of this; don't add fields by hand.

## 1. Can this session do it?

Use this route only when all of these hold; otherwise publish the themed page as usual (`references/publishing.md`):

- The session has the **Artifact** tool and the user is signed in: `Artifact` `action: "list"`, `scope: "types"` works.
- That listing has a type titled **Dashboard**. Take its `type_url` from the listing; never type one in from memory.
- **Node** is installed (`node --version`). The datasets are built by a script so no number is assembled by hand; without Node, say in one line that the Claude Dashboard needs Node (`/health` explains how to get it) and publish the themed page instead.

If the registry (`profile/published-pages.md`) already has a Dashboard row of kind **Claude Dashboard** with a link, skip the offer and the consent question: just refresh it (step 5).

## 2. Offer it once

When the user asks to see their board or dashboard on their phone, or to publish it, and the checks above pass and no dashboard link exists yet, ask once, in plain words:

> I can put your dashboard on your phone two ways. A **Claude Dashboard**: every number shows where it came from, and it warns you when it's more than three days old, but it uses Claude's look rather than your theme. Or **your themed page**, looking just like it does now. Which would you like?

Themed page: follow `references/publishing.md`. Claude Dashboard: go on. Don't offer again once they've chosen; they can always ask to switch.

## 3. Ask before the first publish

Unless the registry already records a dated yes for the Claude Dashboard, ask once:

> Here's what goes up: your job list (company, role, stage, the dates you found and applied, your next step and when it's due) and the counts. No contacts, notes, pay or activity log. It's private to your claude.ai account, only you can open it, and you can delete it any time on claude.ai. OK?

Only on a clear yes: write `Claude Dashboard consent: yes, YYYY-MM-DD` (today) on the consent line of `profile/published-pages.md`, with a targeted edit. On a no, stop (offer the local page instead).

## 4. Build the files

1. Refresh `pages/dashboard.html` first (SKILL.md, "dashboard"), so its weekly counts are today's.
2. Run `node .claude/skills/pages/scripts/build-dashboard-data.mjs`. It reads `jobs/tracker.csv`, `profile/preferences.md` and the dashboard's data block, and writes to `pages/.publish/claude-dashboard/`: `jobs.json`, `week.json`, `history.json` (the three datasets), `datasets.json`, `doc-dash-meta.json` and `doc-index.json`.
   - Exit 3: the tracker looks damaged (saved with semicolons, or a quote that never closes). Tell the user what it printed and publish nothing, on either route, until it's fixed.
   - If it says some dates are "date unclear", tell the user which jobs and ask what the date means before relying on it (AGENTS.md); the published copy shows "date unclear" meanwhile.

## 5. Create it the first time, update it after

Everything is written to the dashboard's own store; the page itself (`.claude/skills/pages/assets/dashboard-type-index.html`) is fixed and shipped with the app. Never write figures into it.

**First time (no link in the registry):**

1. Create it: `Artifact` publish with the Dashboard `type_url`, `title: "My job search"`, `auto_open: "after_first_write"`, and nothing else (no `file_path`, no `pin`). Write the returned link into the registry **right away** (Kind `Claude Dashboard`, Who can see it `only you`, today's date), so a later failure can never lead to a second dashboard.
2. Attach the three files, one call each: `Artifact` publish with `url` = the link, `asset: true`, `file_path` = `pages/.publish/claude-dashboard/jobs.json` (then `week.json`, `history.json`). Note each result's `url` (`/_blob/...`).
3. Run `node .claude/skills/pages/scripts/build-dashboard-data.mjs --docs jobs=<url> week=<url> history=<url>` (the three urls as returned). It writes `doc-dataset-jobs.json`, `doc-dataset-week.json` and `doc-dataset-history.json`.
4. One `ArtifactData` `batch` on the link, five `set` writes, each with `file_path` from `pages/.publish/claude-dashboard/`: `dash`/`meta` ← `doc-dash-meta.json`; `datasets`/`jobs`, `datasets`/`week`, `datasets`/`history` ← the matching `doc-dataset-*.json`; `files`/`index.html` ← `doc-index.json`. They are new documents, so no `if_version`.

**Every time after (a link exists):**

1. `Artifact` `action: "read"` on the link first. If it's gone or the user can't edit it, tell them, remove the link from the registry with their OK, and offer to make a new one (consent stands).
2. `ArtifactData` `list` of `datasets`, and `get` of `files`/`index.html`, to learn each document's `version`.
3. Build (step 4), attach the three new files (as above), run `--docs` with the new urls.
4. One `ArtifactData` `batch`: `set` `datasets`/`jobs`, `week`, `history` from the new `doc-dataset-*.json`, and `files`/`index.html` from `doc-index.json`, each with its `if_version`. Leave `dash/meta` alone. If a version changed meanwhile, re-read and redo that write once.
5. Update the registry's "Last published" date.

Older attached files stay in the dashboard's private storage (only the user can open them) and go when the dashboard is deleted; don't delete them yourself.

## 6. When something fails

- No Artifact tool: "Publishing isn't available in this version of Claude; you can open the file instead." Open `pages/dashboard.html` locally.
- Signed out, or the type listing fails: say so in one line and open the local page; publishing needs a signed-in claude.ai account.
- No Dashboard type listed (some plans and organizations don't have it): publish the themed page, and say in one line why.
- A create, attach or write is refused (`write_db` refused, not an editor, a policy refusal): tell the user plainly what was refused. Don't retry and don't switch routes on your own; offer the themed page.
- Anything that would make it public or share it: never. Don't pin it unless the user asks.

## 7. Tell the user

In two or three plain sentences: the link; that it's private to their claude.ai account; that tapping a number shows where it came from; that it warns them when it's more than three days old and refreshes when you update their tracker; that it shows only their job list. Talk about "your dashboard", not datasets, stores or documents. Don't render, screenshot or browse to it to check it (the type asks not to); the user looks at it themselves.

## Switching kinds

If the user wants the other kind later, publish it as a new row in the registry (Page `Dashboard`, the new Kind) and tell them the old link still works but won't be updated any more; delete the old artifact only if they say so. Keep only the kind they use current.
