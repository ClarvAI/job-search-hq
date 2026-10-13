# Windows version of reset.sh: wipes the user's personal job-search data (every user-owned path in
# DATA_CONTRACT.md) and the local-only leftovers (.backup\ update copies, *.local edited app files set aside by
# updates, .claude\settings.local.json, .claude\.health\), then puts the blank starting files back by running the
# first-run script (.claude\skills\start\scripts\init-data.ps1, which copies templates\blank\). Afterwards the
# folder matches a fresh download after its first run. The app's own files (skills, settings, playbook,
# templates\) are kept. Refuses while an Office lock file (~$...) shows a file is open in Excel or Word.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\my-data\scripts\reset.ps1 -DryRun      list what would change; changes nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\my-data\scripts\reset.ps1 -YesDelete   do it (only after the user typed the confirm phrase)
# Works only on the workspace this script lives in (four levels up), and only if AGENTS.md and a
# complete templates\blank\ are there. Output ends with "reset: done" or "error: ...".
[CmdletBinding()]
param(
  [switch]$YesDelete,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Output "error: $msg"; exit 1 }

if (-not $YesDelete -and -not $DryRun) { Fail "refusing to run: add -DryRun to preview, or -YesDelete to really delete (only after the user confirms)" }
$dry = -not $YesDelete

try { $Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path.TrimEnd('\', '/') } catch { Fail "cannot find the workspace" }
$homeDir = (Resolve-Path -LiteralPath $HOME).Path.TrimEnd('\', '/')
if ($Root.Length -lt 4 -or $Root -ieq $homeDir) { Fail "unsafe workspace path: $Root" }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md'))) { Fail "AGENTS.md not found in $Root; this is not a Job Search HQ workspace" }
$expected = Join-Path $Root '.claude\skills\my-data\scripts'
if ((Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\', '/') -ine $expected.TrimEnd('\', '/')) { Fail "script is not where it should be inside the workspace" }

$Blank = Join-Path $Root 'templates\blank'
$Init = Join-Path $Root '.claude\skills\start\scripts\init-data.ps1'
if (-not (Test-Path -LiteralPath $Init -PathType Leaf)) { Fail "the starter-file script is missing (.claude\skills\start\scripts\init-data.ps1); nothing was changed" }
# A symbolic link or junction (a shortcut to another folder) is a link; cloud-storage placeholders are not.
function Test-Link($item) { return ($item -and ($item.LinkType -eq 'SymbolicLink' -or $item.LinkType -eq 'Junction')) }
$bi = Get-Item -LiteralPath $Blank -Force -ErrorAction SilentlyContinue
if (-not $bi -or -not $bi.PSIsContainer -or (Test-Link $bi)) { Fail "templates\blank\ is missing or a link (nothing was changed)" }
# Every blank copy the init will restore (all of templates\blank\ except its README), checked BEFORE touching anything.
$prefix = $bi.FullName.TrimEnd('\', '/').Length + 1
$BlankFiles = @(Get-ChildItem -LiteralPath $Blank -Recurse -File -Force | ForEach-Object { $_.FullName.Substring($prefix).Replace('\', '/') } |
  Where-Object { $_ -ne 'README.md' } | Sort-Object)
if (@(Get-ChildItem -LiteralPath $Blank -Recurse -Force | Where-Object { Test-Link $_ }).Count -gt 0) { Fail "something inside templates/blank/ is a link to another place; reset only works on real files and folders (nothing was changed)" }
# Every blank copy the app shipped (product-manifest.json) must be there; without a manifest, at least these.
$Required = @()
$man = Join-Path $Root 'product-manifest.json'
if (Test-Path -LiteralPath $man -PathType Leaf) {
  foreach ($line in [IO.File]::ReadAllLines($man)) {
    if ($line -cmatch '^    "templates/blank/(.+)": "[0-9a-f]{64}",?\r?$' -and $Matches[1] -ne 'README.md') { $Required += $Matches[1] }
  }
}
if ($Required.Count -eq 0) { $Required = @('profile/preferences.md', 'profile/master-resume.md', 'history/activity.md', 'jobs/tracker.csv', 'jobs/leads.csv', 'contacts/contacts.csv') }
foreach ($f in $Required) {
  if ($BlankFiles -notcontains $f) { Fail "blank copy missing: templates/blank/$f (nothing was changed)" }
}
foreach ($f in $BlankFiles) {
  if ((Split-Path -Leaf $f) -ne '.gitkeep' -and (Get-Item -LiteralPath (Join-Path $Blank $f) -Force).Length -eq 0) { Fail "blank copy missing: templates/blank/$f (nothing was changed)" }
}
foreach ($f in @('jobs\tracker.csv', 'jobs\leads.csv', 'contacts\contacts.csv')) {
  $n = @(Get-Content -LiteralPath (Join-Path $Blank $f) | Where-Object { $_ -ne '' }).Count
  if ($n -ne 1) { Fail "templates\blank\$f is not header-only (nothing was changed)" }
}
# A folder that is a link to somewhere else would make the reset delete or overwrite files outside
# the workspace. Refuse before touching anything.
$checkDirs = @('jobs', 'contacts', 'outbox', 'outbox\sent', 'outbox\discarded', 'interviews', 'imports', 'profile', 'history',
               'pages', 'knowledge', 'knowledge\field', 'templates', 'templates\blank')
$checkDirs += @(Get-ChildItem -LiteralPath $Blank -Recurse -Directory -Force | ForEach-Object { 'templates\blank\' + $_.FullName.Substring($prefix) })
foreach ($d in $checkDirs) {
  if (Test-Link (Get-Item -LiteralPath (Join-Path $Root $d) -Force -ErrorAction SilentlyContinue)) {
    Fail "$($d.Replace('\', '/')) is a link to another folder; reset only works on real folders (nothing was changed)"
  }
}
# Walk the workspace without following links or going into .git (and, when $skip is given, the personal folders).
function Get-WorkspaceFiles([string]$pattern, [string[]]$skip) {
  $found = New-Object System.Collections.Generic.List[string]
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($Root)
  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    foreach ($c in @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop)) {
      $rel = $c.FullName.Substring($Root.Length + 1).Replace('\', '/')
      if ($c.PSIsContainer -and -not (Test-Link $c)) {
        if ($rel -eq '.git' -or ($skip -contains $rel)) { continue }
        $stack.Push($c.FullName)
      }
      if ($c.Name -like $pattern -and ((-not $c.PSIsContainer) -or (Test-Link $c))) { $found.Add($rel) }
    }
  }
  return @($found | Sort-Object { $_ } -CaseSensitive)
}
# Excel and Word leave a ~$<name> lock file next to a file while it's open. Deleting the tracker under an open
# Excel would let Excel save its copy back later, so stop until it's closed.
try { $locks = @(Get-WorkspaceFiles '~$*' @()) } catch { Fail "could not check for open files (nothing was changed)" }
$lockNote = $false
if ($locks.Count -gt 0) {
  foreach ($l in $locks) { Write-Output "open: $l" }
  if ($dry) { $lockNote = $true }
  else { Fail "a file is open in Excel or Word (see the open: lines; each ~`$ file is its lock). Close it, then run the reset again. If Excel and Word aren't running, the lock file is a leftover and can be deleted. (nothing was changed)" }
}

$script:nDel = 0
# Not named "Del": PowerShell runs its built-in del alias (Remove-Item) before a function of that name.
function Remove-Entry($p) {
  if (-not $p.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { Fail "refusing to delete outside the workspace: $p" }
  $item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue  # also finds a link whose target is gone
  if (-not $item) { return }
  $isLink = Test-Link $item
  $script:nDel++
  if ($dry) { Write-Output ("delete: " + $p.Substring($Root.Length + 1)); return }
  # .NET, not Remove-Item: Windows PowerShell 5.1's Remove-Item -Recurse can follow a link inside a
  # folder and delete what it points to. Directory.Delete removes links without following them.
  try {
    if ($item.PSIsContainer) { [IO.Directory]::Delete($p, -not $isLink) }   # a link: remove the link only
    else { if (-not $isLink) { $item.Attributes = 'Normal' }; [IO.File]::Delete($p) }
  } catch { Fail ("could not delete " + $p.Substring($Root.Length + 1) + "; the reset is incomplete (" + $_.Exception.Message + ")") }
  if (Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue) { Fail ("could not delete " + $p.Substring($Root.Length + 1) + "; the reset is incomplete") }
}
function ClearDir($rel, [string[]]$keep) {
  $dir = Join-Path $Root $rel
  if (-not (Test-Path -LiteralPath $dir)) { return }
  foreach ($c in @(Get-ChildItem -LiteralPath $dir -Force)) {
    if ($keep -notcontains $c.Name) { Remove-Entry $c.FullName }
  }
}

try {
  # 1. Personal folders: delete their contents (keeping the folder guides and placeholders that ship with the app).
  ClearDir 'profile' @('README.md')
  ClearDir 'jobs' @('README.md')
  ClearDir 'contacts' @('README.md')
  ClearDir 'outbox' @('sent', 'discarded')
  ClearDir 'outbox\sent' @('.gitkeep')
  ClearDir 'outbox\discarded' @('.gitkeep')
  ClearDir 'interviews' @('.gitkeep')
  ClearDir 'imports' @('README.md')
  ClearDir 'history' @()
  ClearDir 'pages' @('README.md')
  Remove-Entry (Join-Path $Root 'knowledge\field')
  # Local-only leftovers (never part of the app's download): update backups, edited app files set aside by an
  # update, local settings and the health marker. Personal folders are already handled above.
  Remove-Entry (Join-Path $Root '.backup')
  Remove-Entry (Join-Path $Root '.claude\settings.local.json')
  Remove-Entry (Join-Path $Root '.claude\.health')
  $personal = @('.backup', 'profile', 'jobs', 'contacts', 'outbox', 'interviews', 'history', 'imports', 'pages', 'knowledge/field')
  foreach ($l in @(Get-WorkspaceFiles '*.local' $personal)) { Remove-Entry (Join-Path $Root $l) }

  # 2. Put the blank starter files back (the same first-run script the session-start hook uses).
  $nReset = $BlankFiles.Count
  if ($dry) {
    foreach ($f in $BlankFiles) { Write-Output "reset: $f" }
  } else {
    $out = @(& $Init 2>&1 | ForEach-Object { [string]$_ })
    if ($LASTEXITCODE -ne 0 -or ($out -match '^error:')) {
      $first = @($out | Where-Object { $_ -match '^error:' })[0]
      Fail "personal data was deleted, but the blank files could not all be put back ($first); the reset is incomplete. Run .claude\skills\start\scripts\init-data.ps1"
    }
    $nReset = @($out | Where-Object { $_ -like 'created: *' }).Count
    foreach ($d in @('interviews', 'outbox\sent', 'outbox\discarded')) {
      $dp = Join-Path $Root $d
      New-Item -ItemType Directory -Path $dp -Force | Out-Null
      $gk = Join-Path $dp '.gitkeep'
      if (-not (Test-Path -LiteralPath $gk)) { New-Item -ItemType File -Path $gk | Out-Null }
    }
  }
} catch {
  Fail $_.Exception.Message
}

if ($dry) {
  Write-Output "would delete: $($script:nDel) item(s); would reset: $nReset file(s)"
  if ($lockNote) { Write-Output 'note: the real reset will refuse until the open: files above are closed' }
  Write-Output "reset: dry-run (nothing changed)"
  exit 0
}
$dot = [char]0x00B7  # kept out of the source text so Windows PowerShell 5.1 reads this file correctly
$line = "- $(Get-Date -Format 'yyyy-MM-dd HH:mm') $dot Reset $dot Personal data cleared; workspace back to blank."
[IO.File]::AppendAllText((Join-Path $Root 'history\activity.md'), $line + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output "deleted: $($script:nDel) item(s); reset: $nReset file(s)"
Write-Output "reset: done"
