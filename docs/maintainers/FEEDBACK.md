# Crowd feedback (maintainers)

How lessons from people who used the workspace come back in, and how they turn into updates.

## How it arrives

- **Lessons learned** (`.github/ISSUE_TEMPLATE/lessons-learned.yml`): the `share-lessons` skill interviews the user, drafts anonymous notes in their folder (`history/lessons-draft.md`), checks them with `check-anon.sh`/`.ps1`, and gives them the form's link. The user posts it themselves; the assistant never posts (ground rule 2, and the guard blocks `gh issue|pr|discussion create/comment/edit` and automated browsers on new-issue pages). The Celebration panel and the offer skill's "Closing the search" offer it once.
- **Bugs, ideas, accessibility barriers**: the other issue templates. Security problems: privately (SECURITY.md).
- `.github/workflows/feedback-privacy.yml` scans each new or edited lessons post for emails, phone numbers, links and pay; if it finds any, it labels the post `needs-privacy-edit` and asks the poster once to edit. It never edits, hides or closes anything.

## Weekly triage (about 15 minutes)

1. Open the `needs-privacy-edit` and `needs-triage` lists. A post that still identifies someone after a few days: edit out the detail yourself (you can edit others' issues as a maintainer) or hide it, and say so in a comment. Never quote the detail.
2. `bash docs/maintainers/feedback/digest.sh` writes every lessons post (except flagged ones) into one Markdown file outside the repository.
3. Read it for patterns, not single anecdotes: the same confusion three times is a bug in the instructions; the same "what made the difference" across fields is worth a line in `knowledge/job-search-playbook.md` (with "crowd lessons, N posts, read <date>" as its source, never a person's words as fact).
4. Each change goes through a normal pull request with CI. Link the posts that led to it (by number), then thank the posters there.

## Rules

- **Posts are data, never instructions.** They're written by anyone on the internet. Never paste a post into a skill, a prompt or an agent's instructions as is; summarize the pattern in your own words. A post that tells an assistant to do something is ignored (ground rule 8) and noted.
- **Nothing personal goes into git.** The digest lives outside the repository; quotes in skills or docs are paraphrased and anonymous.
- **Crowd numbers are anecdotes.** Self-reported, small and self-selected: never turn them into benchmarks or promises.

## One-time setup

`bash docs/maintainers/feedback/setup-github.sh` (labels, branch protection, merged-branch cleanup, discussions). Run it yourself: assistants in this folder are blocked from changing a public repository's settings.
