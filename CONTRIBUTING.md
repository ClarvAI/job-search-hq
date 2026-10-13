# Contributing

Thanks for helping improve Job Search HQ. This page is for people changing the app itself: its skills, safety checks, panels, templates and docs. If you're using it for your own job search, you don't need any of this; start with [README.md](README.md).

## Never include personal data

Develop in a clean copy of the app that has never held anyone's real job search. Your own `profile/`, `jobs/`, `contacts/`, `outbox/` and the other user-owned folders ([DATA_CONTRACT.md](DATA_CONTRACT.md)) are git-ignored, but don't rely on that alone: no real resumes, names, email addresses, phone numbers or contact lists in commits, issues, test fixtures or screenshots. Use made-up people at `example.com` and 555 phone numbers. To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Licensing of contributions

Job Search HQ is licensed under the PolyForm Noncommercial License 1.0.0 (see [LICENSE](LICENSE)), and Sam Clarvit also offers it under commercial licenses. By sending a contribution (a pull request, patch or suggested text), you agree that it is licensed under the same PolyForm Noncommercial terms, and that Sam Clarvit may also license it to others under other terms, including commercial ones. Only send work you have the right to give on these terms.

## Run the checks

From the top folder:

```
bash scripts/ci/run-all.sh
```

Set `PS_EXE=pwsh` (or `PS_EXE=powershell` on Windows) to include the PowerShell checks; without a PowerShell it skips them and says so. It exits 1 if anything that ran failed. The end-to-end tests (`scripts/ci/e2e-*.py`) need Python 3.8 or newer (standard library only) and work on copies in a temp folder, never on your workspace; each takes `--impl sh|ps|both` and `--keep` (leave the temp folder for debugging).

CI (`.github/workflows/ci.yml`) runs the same scripts on every push and pull request, on Linux, macOS (the system bash 3.2, as on users' Macs) and Windows (Windows PowerShell 5.1, PowerShell 7 and Git Bash). It needs no secrets and no sign-in. The checks:

| Check | Script |
|---|---|
| Shell scripts parse and pass shellcheck | `scripts/ci/lint-shell.sh` |
| JSON files parse | `scripts/ci/check-json.sh` |
| JavaScript modules parse | `scripts/ci/check-node.sh` |
| Every Claude skill has a Codex wrapper with the same description, and every review agent a Codex twin; `AGENTS.md` is under 30,000 bytes; blank starter files hold no real-looking contact details; the blank CSVs are header-only with a BOM; no data block in the blank pages holds a raw `</` | `scripts/ci/check-parity.sh` |
| `product-manifest.json` matches the app files | `bash scripts/build-manifest.sh --check` |
| Blank pages are still on the Default theme | `node .claude/skills/page-design/scripts/apply-theme.mjs --check-blank` |
| The safety guard blocks and allows what it should (bash and PowerShell), and both versions agree | `scripts/ci/guard-fixtures.sh`, `scripts/ci/guard-parity.sh` |
| PowerShell scripts parse | `scripts/ci/parse-powershell.ps1` |
| `/my-data` backup and reset work | `scripts/ci/mydata-smoke.sh` |
| `/health` runs on a fresh checkout | the health step in `ci.yml` |
| Claude Code panels validate and their tests pass | `scripts/ci/check-mods.sh` |
| A fresh clone has no user data, and first run, the startup hook and `/health` work on it | `scripts/ci/e2e-fresh.py` |
| `/update` installs, checks, rolls back, keeps user files and edited app files, and refuses bad releases | `scripts/ci/e2e-update.py` |
| `/my-data` backup, reset and restore round-trip every user file, skip links, respect Excel locks | `scripts/ci/e2e-mydata.py` |
| The sample workspace is made next to the user's folder, never inside it, and is complete and removable | `scripts/ci/e2e-sample.py` |
| A user's theme stays out of git, and `git pull` of a new version stays clean | `scripts/ci/e2e-theme-git.py` |
| Published dashboard copies hold only the job list, and the Claude Dashboard page takes every figure from its data | `scripts/ci/check-dashboard-type.py` |

### Journeys, skill evals and the token budget (manual; they cost model quota)

These are not part of `run-all.sh` or CI: they start real, headless Claude Code (and Codex) sessions on the account the CLI is signed in to, so every run spends that account's quota. Each session works on a throwaway copy of the workspace (Claude's shell commands also get a throwaway home folder), no connectors (only the harness's own fake Gmail and browser where a scenario needs them), and no user settings, memory, plugins, agents or skills. An isolation canary runs first for each app and model; if it fails, nothing else runs. Results go to a folder outside the repository.

- `python3 scripts/ci/journeys/run.py` runs the user journeys; `--suite evals` runs the skill evals in `evals.py` (risky flows pushed by a scripted user: injected instructions, exact phrases, made-up numbers, send requests). `--model` takes a comma-separated list, `--only a,b` picks scenarios, `--list` shows them.
- `python3 scripts/ci/journeys/rescore.py <results-dir>` re-runs the checks on saved results with no model call (for when a check itself was wrong).
- `python3 scripts/ci/journeys/budget.py` reports how much text every session loads at startup and each skill when it runs, with no model call; `--live` also measures real startup tokens (a few cents). `AGENTS.md` must stay under 30,000 bytes.

## Conventions

- **Plain English.** Users aren't programmers. Short sentences, no jargon, one clear next step. In instructions to the assistant, refer to the user as "the user" and they/them.
- **Claude and Codex stay in step.** Every `.claude/skills/<name>/SKILL.md` has a wrapper in `.agents/skills/<name>/SKILL.md` with the same `name` and the identical `description`, and every `.claude/agents/<name>.md` has a `.codex/agents/<name>.toml` with the same description. Behaviour rules shared by both apps go in `AGENTS.md`; Claude-only notes go in `CLAUDE.md`.
- **`AGENTS.md` stays under 30,000 bytes** (CI checks it). Codex reads at most 32 KiB of it by default and silently cuts off the rest, and the Codex section is at the end. `.codex/config.toml` raises Codex's limit, but only in trusted folders. Put procedures in the skill that runs them and keep only the rules in `AGENTS.md`.
- **Settings keys need a version check.** Before adding a key to `.claude/settings.json` or `.codex/`, confirm in the official docs which version introduced it and what older versions do with it. An invalid value in `.codex/config.toml` stops Codex from starting in the folder; a key an older Claude Code doesn't accept can make it skip the whole settings file, safety hooks included.
- **No AI attribution in commits.** Commit messages and pull requests made in this repository carry no `Co-authored-by: Claude…`/`Codex…` trailers, `Claude-Session:` lines or "Generated with…" lines. `.claude/settings.json` turns Claude Code's off; Codex's comes from your ChatGPT account, not from the folder. As a backstop, `.githooks/commit-msg` strips those lines. In the clone you use to maintain the product, install just that hook (`cp .githooks/commit-msg .git/hooks/commit-msg`) rather than setting `core.hooksPath`, which would also turn on the pre-push check that blocks pushes to the public repository.
- **Every script has both versions.** A `.sh` script (it must run on macOS bash 3.2 and Git Bash) has a `.ps1` twin (Windows PowerShell 5.1 and PowerShell 7) that behaves the same. Keep `guard.sh`, `guard.ps1` and `.githooks/pre-push` in step.
- **Starter files are blank.** New personal files go in `templates/blank/` as blank starting copies, never directly in a user-owned folder. They hold no real data, and `profile/preferences.md` starts as `SETUP: not done`. The blank CSVs are a header row saved as UTF-8 with a byte-order mark; keep it.
- **User data stays out of app files.** Anything made for one user (a theme, a template in their look, a preview) goes in a user-owned path (`profile/templates/`, `pages/.preview/`; see `DATA_CONTRACT.md`), never in a file the app ships, so updates and `git pull` never conflict with it.
- **Dates and CSVs are read one way everywhere.** Panels, hooks and skills follow the rules in `AGENTS.md` ("Reading dates someone else wrote", "CSV files"): never guess a date's order from where the user lives, never rewrite an unclear date, and never save over a CSV that looks damaged.
- **Statistics need a source.** Any number presented as fact (how long recruiters look at a resume, response rates, pay) cites where it comes from, with a date, or is left out.
- **Safety rules don't loosen quietly.** A change that lets the assistant send, submit, post, or reach Gmail, Outlook or LinkedIn needs a clear reason in the pull request and guard fixtures that cover it.

## Releasing (maintainers)

1. Work in a separate clone of the public product repository that has never held user data.
2. If a change alters the shape of a file users already have (a new line in `preferences.md`, a new tracker column, a new part of a page), add a note in `migrations/NNN-short-name.md` (see `migrations/README.md`). Its `version:` is the release that ships it.
3. Bump `VERSION` and turn the `CHANGELOG.md` "Unreleased" entries (for 1.0.0, the "not yet released" heading) into a dated `## X.Y.Z (YYYY-MM-DD)` entry, in plain English, for users (`/update` shows users the entries newer than theirs).
4. Before the first public release (and before building its zip, since `VERSION` goes in it), set `update_source:` in `VERSION` to a direct `https://` link to the latest release zip (for example a GitHub "latest release" asset link, which needs the asset to keep the same file name in every release, such as `job-search-hq.zip`). Until it's set, VERSION says `set by the maintainer before publishing`: `/update --status` shows `update_source: none`, and users are asked for a zip they downloaded. Anything that isn't an `https://` link is refused with a plain message. A download from `update_source` has no checksum to compare against unless the user passes one.
5. Rebuild the manifest with `bash scripts/build-manifest.sh`, then confirm with `bash scripts/build-manifest.sh --check` and `bash scripts/ci/run-all.sh` (with `PS_EXE` set). `scripts/ci/e2e-update.py` builds real release zips, installs one as a fresh user would, updates it to a test next version with `update.sh` and `update.ps1`, rolls it back, and checks that no maintainer-only file is ever shipped or installed.
6. Build the release zip with `bash scripts/build-manifest.sh --zip job-search-hq-X.Y.Z.zip` to look at it locally (the release workflow builds the published one the same way). It holds one folder, `job-search-hq-X.Y.Z/`, with exactly the files `product-manifest.json` lists: the maintainer-only paths (`docs/maintainers/`, `.github/`, `scripts/ci/`, `.claude/skills/*/tests/`, `CONTRIBUTING.md`; the list is in `DATA_CONTRACT.md`) are left out, and `--zip` refuses a manifest that lists one. Unzip it somewhere and look before publishing.
7. Commit, then push a tag `vX.Y.Z`. `.github/workflows/release.yml` checks that the tag matches `VERSION`, the changelog entry is dated, `update_source` is set and the manifest is current, then builds the zip (also as `job-search-hq.zip` for the latest-download link) and its SHA-256 and attaches them to a **draft** release with the changelog entry as notes. Review the draft, then press Publish; users can pass the SHA-256 to `/update` with `--sha256`.

A git clone has the maintainer-only files and a zip doesn't; `/update` never installs, removes or reports them, so a clone that updates from a zip keeps its copies, and `git pull` is still the normal way to update a clone.

`.githooks/pre-push` blocks pushing to a public GitHub repository when `git config core.hooksPath .githooks` is set; that's the safety net for users' folders. Don't turn it on in the clone you use to maintain the public product repository, or it will block your own pushes.
