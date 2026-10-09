## What this changes

<!-- One or two sentences, and why. Link the issue if there is one. -->

## Checklist

- [ ] **No personal data.** Nothing from a real person's `profile/`, `jobs/`, `contacts/`, `outbox/`, `interviews/`, `history/` or `pages/`; examples use made-up names and companies.
- [ ] **Tests pass** locally (the CI checks in `.github/workflows/`), and I added or updated tests for changed scripts or hooks.
- [ ] **Claude and Codex in step:** a changed skill in `.claude/skills/` has its `.agents/skills/` counterpart updated (and the reverse); `AGENTS.md` and `CLAUDE.md` still agree.
- [ ] **Mac and Windows in step:** every changed `.sh` script has the same change in its `.ps1` twin (and the reverse).
- [ ] **Blank templates updated:** a change to a page's structure or a starter file is also made in `templates/blank/` (structure only, no user data, `default` theme).
- [ ] **Safety rules unchanged**, or the change is explained above (guard hooks, permissions in `.claude/settings.json`, `.codex/hooks.json`, `.githooks/`).
- [ ] **CDN scripts** keep a pinned version, `integrity` hash and `crossorigin="anonymous"`.
- [ ] **User-facing text** is plain English, no emoji, and says "the user" in instructions.
- [ ] `CHANGELOG.md` updated, and `product-manifest.json` regenerated if shipped files changed.
