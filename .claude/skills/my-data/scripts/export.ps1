# Windows version of export.sh: a dated zip backup of the user's own job-search data in a folder
# OUTSIDE the workspace.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\my-data\scripts\export.ps1 [-Destination <folder>] [-IncludeImports] [-IncludeTemplates]
#   -Destination  default: the user's Downloads folder (created if missing; must be outside the workspace)
# Includes: profile, jobs, contacts, outbox, interviews, history, knowledge, pages, plus resume.json at
# the top if profile\resume.json exists. Never .claude, .agents, .codex, .git; templates and imports only when asked.
# Links (shortcuts) are left out, each reported as "skipped link: <path>".
# Output: last line "saved: <path>" on success; "error: ..." and exit 1 otherwise.
param(
  [string]$Destination = "",
  [switch]$IncludeImports,
  [switch]$IncludeTemplates
)
$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Output "error: $msg"; exit 1 }

try { $Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path.TrimEnd('\', '/') } catch { Fail "cannot find the workspace" }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md')) -or -not (Test-Path -LiteralPath (Join-Path $Root 'profile'))) {
  Fail "this script is not inside a Job Search HQ workspace ($Root)"
}

if ([string]::IsNullOrWhiteSpace($Destination)) { $Destination = Join-Path $HOME 'Downloads' }
$made = $false
if (-not (Test-Path -LiteralPath $Destination)) {
  try { [IO.Directory]::CreateDirectory($Destination) | Out-Null; $made = $true } catch { Fail "cannot create the folder $Destination" }
}
$Dest = (Resolve-Path -LiteralPath $Destination).Path.TrimEnd('\', '/')
if (($Dest + '\').StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase) -or
    ($Dest + '/').StartsWith($Root + '/', [StringComparison]::OrdinalIgnoreCase)) {
  if ($made) { Remove-Item -LiteralPath $Dest -Force -ErrorAction SilentlyContinue }
  Fail "the backup folder must be outside the workspace (pick e.g. Downloads or Documents)"
}

$stamp = Get-Date -Format 'yyyy-MM-dd'
$name = "job-search-backup-$stamp"
if (Test-Path -LiteralPath (Join-Path $Dest "$name.zip")) { $name = "job-search-backup-$stamp-$(Get-Date -Format 'HHmmss')" }
$out = Join-Path $Dest "$name.zip"

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("jshq-" + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $tmp $name
# Copies a folder tree. Links (symbolic links, junctions) point outside the backup; they are left
# out and reported, like export.sh, rather than copying whatever they point to.
function Copy-Tree([string]$From, [string]$To) {
  $item = Get-Item -LiteralPath $From -Force
  if ($item.LinkType -eq 'SymbolicLink' -or $item.LinkType -eq 'Junction') {
    Write-Output ("skipped link: " + $From.Substring($Root.Length + 1).Replace('\', '/')); return
  }
  if ($item.PSIsContainer) {
    [IO.Directory]::CreateDirectory($To) | Out-Null
    foreach ($c in @(Get-ChildItem -LiteralPath $From -Force)) { Copy-Tree $c.FullName (Join-Path $To $c.Name) }
  } else {
    Copy-Item -LiteralPath $From -Destination $To -Force
  }
}
try {
  [IO.Directory]::CreateDirectory($stage) | Out-Null
  $dirs = @('profile', 'jobs', 'contacts', 'outbox', 'interviews', 'history', 'knowledge', 'pages')
  if ($IncludeImports) { $dirs += 'imports' }
  if ($IncludeTemplates) { $dirs += 'templates' }
  foreach ($d in $dirs) {
    $src = Join-Path $Root $d
    if (Get-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue) { Copy-Tree $src (Join-Path $stage $d) }
  }
  # Leave out throwaway files: publish copies, page-count PDFs, OS clutter, Office lock files.
  $pub = Join-Path $stage 'pages\.publish'
  if (Test-Path -LiteralPath $pub) { Remove-Item -LiteralPath $pub -Recurse -Force }
  Get-ChildItem -LiteralPath $stage -Recurse -Force -File |
    Where-Object { $_.Name -like '*.check.pdf' -or $_.Name -eq '.DS_Store' -or $_.Name -eq 'Thumbs.db' -or $_.Name -like '~$*' } |
    Remove-Item -Force
  $rj = Join-Path $Root 'profile\resume.json'
  $rji = Get-Item -LiteralPath $rj -Force -ErrorAction SilentlyContinue
  if ($rji -and -not $rji.PSIsContainer -and $rji.LinkType -ne 'SymbolicLink') { Copy-Item -LiteralPath $rj -Destination (Join-Path $stage 'resume.json') }

  $lines = @(
    "Job search backup made $stamp.",
    "",
    "profile/     your master resume, stories, preferences, writing style, references",
    "jobs/        tracker.csv (opens in Excel), leads.csv (openings found, not yet saved) and one folder per job",
    "contacts/    contacts.csv: people you met or wanted to meet",
    "outbox/      message drafts; sent/ holds what you sent",
    "interviews/  interview notes, mock-interview scorecards, weekly reviews",
    "history/     activity.md: what changed and when",
    "knowledge/   field notes and the job-search playbook",
    "pages/       dashboard, flashcards, portfolio (open in a browser)"
  )
  if (Test-Path -LiteralPath (Join-Path $stage 'resume.json')) {
    $lines += "resume.json  your resume in JSON Resume format (jsonresume.org), for tools that import it"
  }
  $lines += @(
    "",
    "This backup holds other people's names and contact details (contacts, references, interviewers).",
    "Keep it private: don't post it or share it, and delete old copies you no longer need.",
    "To restore, unzip it and copy the folders back into a Job Search HQ workspace."
  )
  Set-Content -LiteralPath (Join-Path $stage 'READ-ME.txt') -Value $lines -Encoding UTF8

  $count = (Get-ChildItem -LiteralPath $stage -Recurse -Force -File | Measure-Object).Count
  # Not Compress-Archive: it leaves out hidden files, and in Windows PowerShell 5.1 can write backslash paths.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::CreateFromDirectory($stage, $out, [IO.Compression.CompressionLevel]::Optimal, $true)
  if (-not (Test-Path -LiteralPath $out)) { throw "the backup file was not created" }
  $kb = [math]::Ceiling((Get-Item -LiteralPath $out).Length / 1KB)
  Write-Output "files: $count"
  Write-Output "size: ${kb}K"
  Write-Output "saved: $out"
} catch {
  Fail $_.Exception.Message
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
