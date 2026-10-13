# scripts/ci (maintainer checks)

- Run everything with `bash scripts/ci/run-all.sh` (set `PS_EXE` to a PowerShell to include the `.ps1` checks). CONTRIBUTING.md lists what each script covers.
- Tests never touch the real workspace: they work on copies in a temp folder (`e2e_common.py`: `temp_dir()`, `make_workspace()`, `clone_workspace()`), and run the copies of product scripts, not the ones in the repo.
- Python is 3.8+ standard library only. Every behaviour is tested in both versions (`.sh` on macOS bash 3.2 and Git Bash, `.ps1` on Windows PowerShell 5.1 and PowerShell 7).
- Fixtures hold no personal data: the Alex Rivera persona, Acme/Globex/Initech/Northwind, `example.com`, 555 numbers.
- The project's safety guard reads shell command text, so a command that merely mentions a public push is blocked. Keep such fixtures in files, as `guard-fixtures.sh` does.
- Every bypass the guard closes gets a fixture, and `guard.sh`, `guard.ps1` and `.githooks/pre-push` stay in step (`guard-parity.sh`).
