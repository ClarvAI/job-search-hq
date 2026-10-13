# Read-only health check for this workspace (PowerShell version of health.sh, plus Windows-only checks).
# Changes nothing: it only looks, and prints one line per check:
#   OK: <check>: <what's fine>
#   FIX: <check>: <plain fix>
#   NOTE: <check>: <worth knowing; nothing is broken>
#   SKIP: <check>: <why it wasn't checked>
# then "summary: ..." and "most important: ..." (or "most important: nothing").
# Usage (from the workspace folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\health\scripts\health.ps1 [-App claude|codex]
# Works in Windows PowerShell 5.1 and PowerShell 7 (Windows, macOS, Linux).
param([string]$App = 'claude')
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

$script:ok = 0; $script:fix = 0; $script:note = 0; $script:skip = 0
$script:top = ''; $script:topRank = 999
function Say-Ok([string]$Check, [string]$Text)   { $script:ok++;   Write-Output "OK: ${Check}: $Text" }
function Say-Note([string]$Check, [string]$Text) { $script:note++; Write-Output "NOTE: ${Check}: $Text" }
function Say-Skip([string]$Check, [string]$Text) { $script:skip++; Write-Output "SKIP: ${Check}: $Text" }
function Say-Fix([int]$Rank, [string]$Check, [string]$Text) {
    $script:fix++; Write-Output "FIX: ${Check}: $Text"
    if ($Rank -lt $script:topRank) { $script:topRank = $Rank; $script:top = "${Check}: $Text" }
}
function Has-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }
function Read-Text([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) { try { return [IO.File]::ReadAllText($Path) } catch {} }
    return ''
}

$isWin = ($env:OS -eq 'Windows_NT')
$start = '/start'; if ($App -eq 'codex') { $start = '$start' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..')).TrimEnd('\', '/')
$rootName = Split-Path -Leaf $root
# "1 minute", "2 minutes"
function Get-Plural([long]$N, [string]$Word) { if ($N -eq 1) { return "$N $Word" } else { return "$N ${Word}s" } }
# What to suggest when product files are broken: /update needs the VERSION file.
if (Test-Path -LiteralPath (Join-Path $root 'VERSION') -PathType Leaf) { $repair = 'Update the workspace (/update) or download a fresh copy' }
else { $repair = 'Download a fresh copy of the workspace and move your data into it (/my-data explains how)' }

# ---- 1. Folder opened at the root ----
$cwd = (Get-Location).ProviderPath.TrimEnd('\', '/')
$same = if ($isWin) { $cwd -ieq $root } else { $cwd -ceq $root }
if (-not (Test-Path -LiteralPath (Join-Path $root 'AGENTS.md'))) {
    Say-Fix 1 'folder' 'this copy of the workspace is incomplete (AGENTS.md is missing). Download a fresh copy, then move your data into it with /my-data.'
} elseif (-not $same) {
    Say-Fix 1 'folder' "the app is open on $cwd, not on the workspace folder itself. Close it and open the folder `"$rootName`" (the one with AGENTS.md in it); the safety checks and commands only load from there."
} elseif (-not (Test-Path -LiteralPath (Join-Path $root '.claude/settings.json'))) {
    Say-Fix 1 'folder' "the file .claude/settings.json is missing, so Claude Code has no safety checks here. $repair."
} else {
    Say-Ok 'folder' "opened at the workspace root ($rootName)"
}
Set-Location -LiteralPath $root

function Version-AtLeast([string]$A, [string]$B) {
    $pa = @($A.Split('.')); $pb = @($B.Split('.'))
    for ($i = 0; $i -lt 4; $i++) {
        $x = 0; $y = 0
        if ($i -lt $pa.Count) { $null = [int]::TryParse(($pa[$i] -replace '[^0-9].*$', ''), [ref]$x) }
        if ($i -lt $pb.Count) { $null = [int]::TryParse(($pb[$i] -replace '[^0-9].*$', ''), [ref]$y) }
        if ($x -gt $y) { return $true }
        if ($x -lt $y) { return $false }
    }
    return $true
}

# ---- 2. App versions ----
if (Has-Command 'claude') {
    $cv = ''
    try { $cv = (@(& claude --version 2>$null) | Select-Object -First 1) } catch {}
    $cvn = ("$cv").Split(' ')[0]
    if (-not $cvn) {
        Say-Skip 'Claude Code version' "the claude command didn't report a version"
    } elseif (Version-AtLeast $cvn '2.1.287') {
        Say-Ok 'Claude Code version' "$cvn (the panels need 2.1.287 or later in the terminal, 2.1.286 or later in the desktop app)"
    } elseif ($App -eq 'codex') {
        Say-Note 'Claude Code version' "$cvn is too old for the Claude panels. That only matters if you also use Claude Code: run 'claude update' there."
    } else {
        Say-Fix 5 'Claude Code version' "$cvn is too old for the panels (Outbox, Pipeline, Interview Room need 2.1.287 or later). Update Claude Code: run 'claude update' in a terminal, or update the desktop app. Everything else works without them."
    }
} else {
    Say-Skip 'Claude Code version' "the claude command isn't installed here (fine if you use the desktop app or Codex; the desktop app needs version 2.1.286 or later for panels)"
}
if (Has-Command 'codex') {
    $xv = ''
    try { $xv = (@(& codex --version 2>$null) | Select-Object -First 1) } catch {}
    $xvn = ("$xv").Trim().Split(' ')[-1]
    if (-not $xvn) {
        Say-Skip 'Codex version' "the codex command didn't report a version"
    } elseif (Version-AtLeast $xvn '0.160') {
        Say-Ok 'Codex version' "$xvn (0.160 or later is needed for this folder's safety checks)"
    } elseif ($App -eq 'codex') {
        Say-Fix 2 'Codex version' "$xvn is too old: this folder's safety checks need Codex 0.160 or later. Update Codex (run 'codex update', or update the Codex app), then type /hooks and trust the hooks again."
    } else {
        Say-Note 'Codex version' "$xvn is too old for this folder's safety checks (they need 0.160 or later). That only matters if you also use Codex: run 'codex update' there."
    }
} else {
    Say-Skip 'Codex version' "Codex isn't installed here (fine if you only use Claude)"
}

# ---- 3. Hooks wired up and not switched off ----
$settings = Read-Text (Join-Path $root '.claude/settings.json')
$codexHooks = Read-Text (Join-Path $root '.codex/hooks.json')
if (-not ($settings.Contains('guard.sh') -and $settings.Contains('session-start.sh') -and $codexHooks.Contains('guard.sh') -and $codexHooks.Contains('session-start'))) {
    Say-Fix 2 'hook setup' "the safety checks are missing from .claude/settings.json or .codex/hooks.json. $repair."
} else {
    $off = ''; $managed = ''
    foreach ($f in @((Join-Path $HOME '.claude/settings.json'), (Join-Path $root '.claude/settings.json'), (Join-Path $root '.claude/settings.local.json'))) {
        if ((Read-Text $f) -match '"disableAllHooks"\s*:\s*true') { $off = $f }
    }
    $managedFiles = @('/Library/Application Support/ClaudeCode/managed-settings.json', '/etc/claude-code/managed-settings.json')
    if ($env:ProgramData) { $managedFiles += (Join-Path $env:ProgramData 'ClaudeCode\managed-settings.json') }
    foreach ($f in $managedFiles) {
        # disableAllHooks turns every hook off; allowManagedHooksOnly turns off this folder's own hooks.
        if ((Read-Text $f) -match '"(disableAllHooks|allowManagedHooksOnly)"\s*:\s*true') { $managed = $f }
    }
    if ($managed) {
        Say-Fix 2 'hook setup' "this computer's managed settings ($managed) switch off this folder's hooks, so in Claude Code nothing blocks email sending. Only whoever manages this computer can change that; until then, don't connect Gmail in Claude Code."
    } elseif ($off) {
        Say-Fix 2 'hook setup' "hooks are switched off in $off (`"disableAllHooks`": true), so nothing blocks email sending. Remove that line, then restart the app."
    } else {
        Say-Ok 'hook setup' 'safety checks and the daily greeting are set up for Claude and Codex'
    }
}

# ---- 4. Hooks actually firing (the startup hook leaves a time stamp) ----
$mark = Join-Path $root '.claude/.health/last-session-start'
$hooksOff = 'Claude: close and reopen this folder and click Trust. Codex: type /hooks, trust them, then start a new chat.'
if (-not ((Read-Text (Join-Path $root '.claude/hooks/session-start.sh')).Contains('.health'))) {
    Say-Skip 'hooks running' "this version's startup hook doesn't record when it runs"
} elseif (-not (Test-Path -LiteralPath $mark -PathType Leaf)) {
    Say-Fix 3 'hooks running' "the startup hook has never run in this folder, so the safety checks are probably off too. $hooksOff"
} else {
    # The marker is "<time> <app> <session id>". Only a marker from this app counts, and when the app
    # tells us its session (Claude Code does), only one from this very session proves hooks run now.
    $parts = @(((Read-Text $mark).Trim()) -split '\s+')
    $ts = [long]0; $null = [long]::TryParse(($parts[0] -replace '[^0-9]', ''), [ref]$ts)
    $who = ''; if ($parts.Count -gt 1 -and $parts[1]) { $who = $parts[1] }
    $sid = ''; if ($parts.Count -gt 2 -and $parts[2]) { $sid = $parts[2] }
    $now = [long](([DateTime]::UtcNow - (New-Object DateTime 1970, 1, 1, 0, 0, 0, ([DateTimeKind]::Utc))).TotalSeconds)
    $age = [long][Math]::Max(0, [Math]::Floor(($now - $ts) / 60))
    if ($age -lt 1) { $ago = 'just now' }
    elseif ($age -lt 60) { $ago = "$(Get-Plural $age 'minute') ago" }
    elseif ($age -lt 2880) { $ago = "$(Get-Plural ([Math]::Floor($age / 60)) 'hour') ago" }
    else { $ago = "$(Get-Plural ([Math]::Floor($age / 1440)) 'day') ago" }
    $hereSid = ''; if ($App -eq 'claude' -and $env:CLAUDE_CODE_SESSION_ID) { $hereSid = $env:CLAUDE_CODE_SESSION_ID }
    if ($who -and $who -ne $App -and $age -le 720) {
        Say-Note 'hooks running' "not confirmed for ${App}: the startup hook last ran $ago in $who. If this chat didn't open with the daily greeting, hooks aren't running here, so the safety checks are off too. $hooksOff"
    } elseif ($hereSid -and $sid -and $hereSid -eq $sid) {
        Say-Ok 'hooks running' "the startup hook ran in this session ($ago)"
    } elseif ($hereSid -and $sid -and $age -le 720) {
        Say-Note 'hooks running' "not confirmed for this session: the startup hook last ran $ago in another session. If this chat didn't open with the daily greeting, hooks aren't running, so the safety checks are off too. Reopen this folder and click Trust."
    } elseif ($age -le 720) {
        if (-not $who) { $who = 'unknown app' }
        Say-Ok 'hooks running' "the startup hook last ran $ago ($who)"
    } else {
        Say-Fix 3 'hooks running' "the startup hook last ran $ago ($(if ($who) { $who } else { 'unknown app' })). If you started this chat just now, hooks aren't running, so the safety checks are off too. $hooksOff"
    }
}

# ---- 5. Guard self-test ----
# Runs the guard as a separate process with sample input; returns '' if all three came out right.
function Invoke-Guard([string]$Exe, [string[]]$GuardArgs, [string]$InputText) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = (($GuardArgs | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.WorkingDirectory = $root
    $psi.EnvironmentVariables['CLAUDE_PROJECT_DIR'] = $root
    $p = [Diagnostics.Process]::Start($psi)
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($InputText)
    try { $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length) } catch {}   # a guard may exit before reading
    try { $p.StandardInput.Close() } catch {}
    $errTask = $p.StandardError.ReadToEndAsync()
    $out = $p.StandardOutput.ReadToEnd()
    if (-not $p.WaitForExit(30000)) { try { $p.Kill() } catch {}; return @{ Out = ''; Code = -1 } }
    $null = $errTask.Result
    return @{ Out = $out; Code = $p.ExitCode }
}
function Test-Guard([string]$Exe, [string[]]$GuardArgs) {
    $bad = @()
    $denyRe = '"permissionDecision"\s*:\s*"deny"'
    $r = Invoke-Guard $Exe $GuardArgs '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":{"to":"a@example.com"}}'
    if ($r.Out -notmatch $denyRe) { $bad += 'a Gmail send was not blocked' }
    $r = Invoke-Guard $Exe $GuardArgs '{"tool_name":"mcp__claude_ai_Gmail__search_threads","tool_input":{"query":"from:recruiter"}}'
    if ($r.Code -ne 0) { $bad += 'it crashed on a Gmail search' } elseif ($r.Out -match 'deny') { $bad += 'a Gmail search was blocked' }
    $r = Invoke-Guard $Exe $GuardArgs ''
    if ($r.Out -notmatch $denyRe) { $bad += 'empty input was not blocked' }
    return ($bad -join '; ')
}
$bashExe = ''
if ($isWin) {
    $cands = @()
    if ($env:CLAUDE_CODE_GIT_BASH_PATH) { $cands += $env:CLAUDE_CODE_GIT_BASH_PATH }
    foreach ($b in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($b) { $cands += (Join-Path $b 'Git\bin\bash.exe'); $cands += (Join-Path $b 'Programs\Git\bin\bash.exe') }
    }
    foreach ($c in $cands) { if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) { $bashExe = $c; break } }
    if (-not $bashExe) {
        $g = Get-Command git -ErrorAction SilentlyContinue
        if ($g) { $c = Join-Path (Split-Path (Split-Path $g.Source)) 'bin\bash.exe'; if (Test-Path -LiteralPath $c) { $bashExe = $c } }
    }
} else {
    $b = Get-Command bash -ErrorAction SilentlyContinue
    if ($b) { $bashExe = $b.Source }
}
$guardSh = (Join-Path $root '.claude/hooks/guard.sh').Replace('\', '/')   # bash wants forward slashes
$guardPs = Join-Path $root '.claude/hooks/guard.ps1'
if (-not (Test-Path -LiteralPath $guardSh)) {
    Say-Fix 2 'safety check (bash)' "the safety check file .claude/hooks/guard.sh is missing. $repair."
} elseif (-not $bashExe) {
    Say-Skip 'safety check (bash)' 'bash is not installed (see the Git Bash line)'
} else {
    $r = Test-Guard $bashExe @($guardSh)
    # Codex mode blocks with exit 2 and the reason on stderr.
    $c = Invoke-Guard $bashExe @($guardSh, 'codex') '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
    if ($c.Code -ne 2) { $r = (@($r, 'a Gmail send was not blocked in Codex mode') | Where-Object { $_ }) -join '; ' }
    if (-not $r) { Say-Ok 'safety check (bash)' 'blocks a Gmail send, allows a Gmail search, blocks empty input' }
    else { Say-Fix 2 'safety check (bash)' "the self-test failed ($r). $repair; until then, don't connect Gmail." }
}
$psExe = ''
if ($isWin -and (Has-Command 'powershell')) { $psExe = (Get-Command powershell).Source }
elseif (Has-Command 'pwsh') { $psExe = (Get-Command pwsh).Source }
if (-not (Test-Path -LiteralPath $guardPs)) {
    Say-Fix 2 'safety check (PowerShell)' "the file .claude/hooks/guard.ps1 is missing. $repair."
} elseif (-not $psExe) {
    Say-Skip 'safety check (PowerShell)' 'PowerShell could not be started'
} else {
    $r = Test-Guard $psExe @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $guardPs)
    if (-not $r) { Say-Ok 'safety check (PowerShell)' 'blocks a Gmail send, allows a Gmail search, blocks empty input' }
    else { Say-Fix 2 'safety check (PowerShell)' "the self-test failed ($r). $repair; until then, don't connect Gmail in Codex." }
}

# ---- 6. Script line endings ----
$crlf = @()
# Every bash script the app runs: hooks, the git hook, skill scripts and maintenance scripts.
$shFiles = @()
foreach ($d in @('.claude/hooks', '.claude/skills', 'scripts')) {
    $p = Join-Path $root $d
    if (Test-Path -LiteralPath $p) { $shFiles += @(Get-ChildItem -LiteralPath $p -Recurse -Filter '*.sh' -File -ErrorAction SilentlyContinue) }
}
foreach ($h in @('.githooks/pre-push', '.githooks/commit-msg')) { $pp = Join-Path $root $h; if (Test-Path -LiteralPath $pp) { $shFiles += Get-Item -LiteralPath $pp } }
foreach ($f in $shFiles) { if ((Read-Text $f.FullName).Contains("`r")) { $crlf += $f.FullName.Substring($root.Length + 1).Replace('\', '/') } }
if ($crlf.Count -gt 0) {
    Say-Fix 2 'script line endings' "these scripts have Windows line endings, which stops them running: $($crlf -join ', '). Download a fresh copy as a zip (or re-clone with git config core.autocrlf false)."
} else {
    Say-Ok 'script line endings' 'fine'
}

# ---- 7. Windows-only checks ----
if ($isWin) {
    if ($bashExe) { Say-Ok 'Git Bash' "found ($bashExe); Claude Code's safety checks run in it" }
    elseif ($App -eq 'codex') { Say-Note 'Git Bash' "not found. Codex doesn't need it; only Claude Code's safety checks do, so install Git for Windows from git-scm.com only if you also use Claude Code." }
    else { Say-Fix 2 'Git Bash' "not found. Claude Code's safety checks need it: install Git for Windows from git-scm.com (the default options are fine), then restart Claude. Codex doesn't need it." }
    $blocked = @()
    $dirs = @('.claude', '.agents', '.codex', '.githooks') | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path -LiteralPath $_ }
    foreach ($f in @(Get-ChildItem -LiteralPath $dirs -Recurse -File -Include '*.ps1', '*.sh', '*.mjs', '*.js', '*.ts', '*.tsx', 'pre-push', 'commit-msg' -ErrorAction SilentlyContinue)) {
        if (Get-Item -LiteralPath $f.FullName -Stream 'Zone.Identifier' -ErrorAction SilentlyContinue) { $blocked += $f }
    }
    if ($blocked.Count -gt 0) {
        Say-Fix 2 'blocked downloaded files' "$($blocked.Count) of this folder's scripts are marked as downloaded from the internet (for example $($blocked[0].Name)), so Windows may refuse to run them. To unblock them, run this once in PowerShell in this folder: Get-ChildItem -Recurse | Unblock-File"
    } else {
        Say-Ok 'blocked downloaded files' 'none'
    }
} else {
    Say-Skip 'Git Bash' 'only needed on Windows'
    Say-Skip 'blocked downloaded files' 'only a Windows issue'
}

# ---- 8. Synced folder (warning only) ----
# Whole folder names only, so a folder that merely mentions one (like "dropbox-notes") doesn't count.
$synced = ''
foreach ($seg in ($root -split '[\\/]')) {
    if ($seg -cmatch '^(OneDrive|OneDrive - .*|OneDrive-.*|Dropbox|Dropbox \(.*|iCloud|iCloud Drive.*|Mobile Documents|Google Drive|GoogleDrive.*|My Drive|CloudStorage|Box|Box Sync)$') { $synced = $seg }
}
if ($synced) {
    Say-Note 'synced folder' "this folder is in a cloud-synced location ($synced), so your job-search files (with other people's contact details) are uploaded to that account too. That's fine if you're comfortable with it. If the app ever says a file changed by itself or seems slow, set the folder to 'always keep on this device'."
} else {
    Say-Ok 'synced folder' 'not in a cloud-synced folder'
}

# ---- 9. Optional tools ----
if (Has-Command 'node') {
    $nv = ''; try { $nv = (@(& node --version 2>$null) | Select-Object -First 1) } catch {}
    Say-Ok 'Node.js' "$nv (lets the assistant restyle your pages and preview themes)"
} else {
    Say-Note 'Node.js' 'not installed. Only changing the look of your pages needs it (nodejs.org, the LTS version); everything else works.'
}
$browser = ''
$bc = @(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium')
foreach ($b in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($b) { $bc += (Join-Path $b 'Google\Chrome\Application\chrome.exe'); $bc += (Join-Path $b 'Microsoft\Edge\Application\msedge.exe') }
}
foreach ($b in $bc) { if (Test-Path -LiteralPath $b -PathType Leaf) { $browser = $b; break } }
if (-not $browser) {
    foreach ($c in @('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable')) {
        if (Has-Command $c) { $browser = $c; break }
    }
}
if ($browser) { Say-Ok 'Chrome or Edge' 'found (lets the assistant make your resume PDFs and check they fit on one page)' }
else { Say-Note 'Chrome or Edge' 'not found. Without it you make resume PDFs yourself (open the .html, Print, Save as PDF) and check the page count by eye.' }
if (Has-Command 'pdftotext') {
    Say-Ok 'pdftotext' 'found (lets the assistant check that resume PDFs read back cleanly for applicant tracking systems)'
} else {
    Say-Note 'pdftotext' "not installed, so the read-back check on resume PDFs is skipped. Optional (it comes with Poppler)."
}

# ---- 10. Git push safety hook ----
if ((Test-Path -LiteralPath (Join-Path $root '.git')) -and (Has-Command 'git')) {
    $hp = $null; try { $hp = @(& git -C $root config --get core.hooksPath 2>$null) | Select-Object -First 1 } catch {}
    $hpn = ("$hp").Trim().TrimEnd('\', '/')
    if ($hpn -eq '.githooks' -or $hpn -eq (Join-Path $root '.githooks') -or $hpn -eq ($root.Replace('\', '/') + '/.githooks')) {
        if (-not (Test-Path -LiteralPath (Join-Path $root '.githooks/pre-push') -PathType Leaf)) {
            Say-Fix 3 'git push check' "it's turned on (core.hooksPath is .githooks) but .githooks/pre-push is missing, so pushes aren't actually checked. $repair."
        } else {
            Say-Ok 'git push check' 'on (stops pushes to a public GitHub repository, and keeps AI attribution lines out of commit messages)'
        }
    } else {
        Say-Note 'git push check' "this folder uses git, and the extra check that stops pushes to a public GitHub repository isn't turned on. The assistant can turn it on for you (it runs: git config core.hooksPath .githooks). It also catches pushes the built-in safety check can't see, like ones made through scripts, and keeps AI attribution lines out of commit messages."
    }
} else {
    Say-Skip 'git push check' "this folder doesn't use git (that's fine)"
}

# ---- 11. Excel lock files ----
$locks = @()
foreach ($d in @('jobs', 'contacts')) {
    $p = Join-Path $root $d
    if (Test-Path -LiteralPath $p) {
        $locks += @(Get-ChildItem -LiteralPath $p -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Name.StartsWith('~$') } | ForEach-Object { "$d/$($_.Name)" })
    }
}
if ($locks.Count -gt 0) {
    Say-Fix 4 'Excel' "a sheet is open in Excel ($($locks -join ', ')). Save and close it in Excel before the assistant updates it, or Excel will later put back its older copy."
} else {
    Say-Ok 'Excel' "no Excel lock file found (Excel doesn't always leave one, so if the tracker or contacts sheet is open in Excel, save and close it before the assistant updates it)"
}

# ---- 12. Setup and starter files ----
$prefs = Join-Path $root 'profile/preferences.md'
$setupDone = $false
if (-not (Test-Path -LiteralPath $prefs -PathType Leaf) -or ((Read-Text $prefs) -cmatch '(?m)^SETUP: not done')) {
    Say-Fix 4 'setup' "setup not done: type $start (about 15 to 20 minutes)."
} else {
    $setupDone = $true; Say-Ok 'setup' 'done'
}
$blank = Join-Path $root 'templates/blank'
if (Test-Path -LiteralPath $blank -PathType Container) {
    $missing = 0; $first = ''
    $blankFull = (Get-Item -LiteralPath $blank).FullName.TrimEnd('\', '/')
    foreach ($f in @(Get-ChildItem -LiteralPath $blank -Recurse -File -Force -ErrorAction SilentlyContinue)) {
        if ($f.Name -eq '.DS_Store') { continue }
        $rel = $f.FullName.Substring($blankFull.Length + 1).Replace('\', '/')
        if ($rel -eq 'README.md') { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) { $missing++; if (-not $first) { $first = $rel } }
    }
    if ($missing -eq 0) { Say-Ok 'starter files' 'all in place' }
    elseif (-not $setupDone) { Say-Note 'starter files' "$missing starter file(s) not created yet (normal before setup; $start creates them)" }
    else { Say-Fix 4 'starter files' "$missing starter file(s) are missing (for example $first). Type ${start}: it puts back only what's missing and never overwrites your files." }
} else {
    Say-Fix 2 'starter files' "templates/blank is missing, so this copy of the workspace is incomplete. $repair."
}

# ---- 13. App templates unchanged (a theme belongs in profile/templates/) ----
# Same fingerprint as scripts/build-manifest.sh: sha256 of the file with carriage returns removed.
$manifestText = Read-Text (Join-Path $root 'product-manifest.json')
if (-not $manifestText) {
    Say-Skip 'app templates' 'no product-manifest.json to compare with'
} else {
    $edited = @()
    $sha = [Security.Cryptography.SHA256]::Create()
    foreach ($f in @(Get-ChildItem -LiteralPath (Join-Path $root 'templates') -Filter '*.html' -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
        $rel = 'templates/' + $f.Name
        $m = [regex]::Match($manifestText, '"' + [regex]::Escape($rel) + '":\s*"([0-9a-f]{64})"')
        if (-not $m.Success) { continue }
        $bytes = [IO.File]::ReadAllBytes($f.FullName) | Where-Object { $_ -ne 13 }
        $got = -join ($sha.ComputeHash([byte[]]@($bytes)) | ForEach-Object { $_.ToString('x2') })
        if ($got -ne $m.Groups[1].Value) { $edited += $rel }
    }
    if ($edited.Count -gt 0) {
        Say-Note 'app templates' "the app's own template was edited ($($edited -join ', ')). Your look belongs in profile/templates/, where updates never touch it: ask the assistant to re-apply your theme there (it keeps any hand edits). Until then, an update or git pull may stop or replace these files."
    } else {
        Say-Ok 'app templates' 'unchanged (your theme, if any, lives in profile/templates/)'
    }
}

# ---- 14. Version ----
$vf = Join-Path $root 'VERSION'
if (Test-Path -LiteralPath $vf -PathType Leaf) {
    Say-Ok 'version' (((Read-Text $vf).Split("`n")[0].Trim()) -replace '^version:\s*', '')
} else {
    Say-Note 'version' "no VERSION file, so this copy can't tell which release it is, and /update can't run on it. To get the current version, download a fresh copy and move your data into it (/my-data explains how)."
}

Write-Output "summary: $($script:ok) ok, $($script:fix) to fix, $($script:note) notes, $($script:skip) skipped"
if ($script:top) { Write-Output "most important: $($script:top)" } else { Write-Output 'most important: nothing' }
exit 0
