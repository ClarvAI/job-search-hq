# Windows version of reset.sh: wipes the user's personal job-search data and puts the blank
# starting files back (from templates\blank\). Tools, skills, settings, the playbook and templates are kept.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\my-data\scripts\reset.ps1 -DryRun      list what would change; changes nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\my-data\scripts\reset.ps1 -YesDelete   do it (only after the user typed the confirm phrase)
# Works only on the workspace this script lives in (four levels up), and only if AGENTS.md and a
# complete templates\blank\ are there. Output ends with "reset: done" or "error: ...".
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
$BlankFiles = @(
  'profile\master-resume.md', 'profile\story-bank.md', 'profile\voice.md', 'profile\preferences.md',
  'profile\references.md', 'profile\published-pages.md', 'profile\design.md', 'knowledge\field-primer.md', 'knowledge\resume-keywords.md',
  'knowledge\target-employers.md', 'knowledge\background.md', 'knowledge\interview-questions.md', 'history\activity.md',
  'jobs\tracker.csv', 'jobs\leads.csv', 'contacts\contacts.csv', 'pages\dashboard.html', 'pages\flashcards.html', 'pages\interview-brief.html',
  'pages\portfolio.html'
)
# Check every blank copy BEFORE touching anything.
foreach ($f in $BlankFiles) {
  $p = Join-Path $Blank $f
  if (-not (Test-Path -LiteralPath $p) -or (Get-Item -LiteralPath $p).Length -eq 0) { Fail "blank copy missing: templates\blank\$f (nothing was changed)" }
}
foreach ($f in @('jobs\tracker.csv', 'jobs\leads.csv', 'contacts\contacts.csv')) {
  $n = @(Get-Content -LiteralPath (Join-Path $Blank $f) | Where-Object { $_ -ne '' }).Count
  if ($n -ne 1) { Fail "templates\blank\$f is not header-only (nothing was changed)" }
}
$BlankFull = $BlankFiles | ForEach-Object { (Join-Path $Root $_) }
# A symbolic link or junction (a shortcut to another folder) is a link; cloud-storage placeholders are not.
function Test-Link($item) { return ($item -and ($item.LinkType -eq 'SymbolicLink' -or $item.LinkType -eq 'Junction')) }
# A folder that is a link to somewhere else would make the reset delete or overwrite files outside
# the workspace. Refuse before touching anything.
foreach ($d in @('jobs', 'contacts', 'outbox', 'outbox\sent', 'outbox\discarded', 'interviews', 'imports', 'profile', 'history',
                 'pages', 'knowledge', 'templates', 'templates\blank', 'templates\blank\profile', 'templates\blank\knowledge',
                 'templates\blank\history', 'templates\blank\jobs', 'templates\blank\contacts', 'templates\blank\pages')) {
  if (Test-Link (Get-Item -LiteralPath (Join-Path $Root $d) -Force -ErrorAction SilentlyContinue)) {
    Fail "$d is a link to another folder; reset only works on real folders (nothing was changed)"
  }
}

$script:nDel = 0
# Not named "Del": PowerShell runs its built-in del alias (Remove-Item) before a function of that name.
function Remove-Entry($p) {
  if (-not $p.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { Fail "refusing to delete outside the workspace: $p" }
  $item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue  # also finds a link whose target is gone
  if (-not $item) { return }
  $isLink = Test-Link $item
  if (-not $item.PSIsContainer -and -not $isLink -and ($BlankFull -icontains $p)) { return }  # overwritten below (a link is removed first, like reset.sh)
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
  # 1. Personal folders: delete their contents (keeping placeholders and examples).
  ClearDir 'jobs' @('tracker.csv', 'leads.csv')
  ClearDir 'contacts' @('contacts.csv')
  ClearDir 'outbox' @('_example.md', 'sent', 'discarded')
  ClearDir 'outbox\sent' @('.gitkeep')
  ClearDir 'outbox\discarded' @('.gitkeep')
  ClearDir 'interviews' @('.gitkeep')
  ClearDir 'imports' @('README.md')
  ClearDir 'profile' @('signature.example.txt')
  ClearDir 'history' @()
  Remove-Entry (Join-Path $Root 'pages\.publish')

  # 2. Put the blank files back.
  $nReset = 0
  foreach ($f in $BlankFiles) {
    $nReset++
    if ($dry) { Write-Output "reset: $f"; continue }
    $target = Join-Path $Root $f
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    $ti = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    if ($ti -and ($ti.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $ti.Delete() }  # never write through a link to a file outside
    Copy-Item -LiteralPath (Join-Path $Blank $f) -Destination $target -Force
  }
  if (-not $dry) {
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
  Write-Output "reset: dry-run (nothing changed)"
  exit 0
}
$dot = [char]0x00B7  # kept out of the source text so Windows PowerShell 5.1 reads this file correctly
$line = "- $(Get-Date -Format 'yyyy-MM-dd HH:mm') $dot Reset $dot Personal data cleared; workspace back to blank."
[IO.File]::AppendAllText((Join-Path $Root 'history\activity.md'), $line + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output "deleted: $($script:nDel) item(s); reset: $nReset file(s)"
Write-Output "reset: done"
