# Windows version of restore.sh: brings a /my-data backup back into this workspace, from the UNPACKED backup
# (Expand-Archive it into a new folder outside the workspace first).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\my-data\scripts\restore.ps1 -From <unpacked folder> [-DryRun] [-AddOnly]
#   -From     the job-search-backup-<date> folder, or the new folder it was unzipped into
#   -DryRun   list what would happen; change nothing
#   -AddOnly  only copy files that are missing here; change nothing that exists (not even blank starter files)
# For each file in the backup's user folders (profile jobs contacts outbox interviews history knowledge\field pages
# imports):
#   missing here                                -> copied            "restored: <path>"
#   here, still the blank starter (same as templates\blank\<path>, carriage returns ignored)
#                                               -> replaced          "replaced starter: <path>"
#   history\activity.md                         -> the backup's log, then any line here it doesn't have
#                                                                    "merged: history/activity.md"
#   here and different                          -> left as it is     "differs: <path>" (the assistant asks)
#   here and identical                          -> nothing
# Links are never followed or copied ("skipped link: <path>"). Nothing outside those folders is written; the backup's
# templates\, app files, READ-ME.txt and resume.json are never copied ("ignored: <name>" for unexpected top-level items).
# Refuses while an Office lock file (~$...) is in a user folder, or if a user folder here is a link.
# Output: last line "restore: done (N restored, N replaced starter, N merged, N differ)" or "error: ..." and exit 1.
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$From = "",
  [switch]$DryRun,
  [switch]$AddOnly
)
$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Output "error: $msg"; exit 1 }

if ([string]::IsNullOrWhiteSpace($From)) { Fail "give the unpacked backup folder (unzip the backup outside the workspace first)" }
try { $Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path.TrimEnd('\', '/') } catch { Fail "cannot find the workspace" }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md') -PathType Leaf)) { Fail "AGENTS.md not found in $Root; this is not a Job Search HQ workspace" }
$expected = Join-Path $Root '.claude\skills\my-data\scripts'
if ((Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\', '/') -ine $expected.TrimEnd('\', '/')) { Fail "script is not where it should be inside the workspace" }
$Blank = Join-Path $Root 'templates\blank'

function Test-Link($item) { return ($item -and ($item.LinkType -eq 'SymbolicLink' -or $item.LinkType -eq 'Junction')) }
function Get-Entry([string]$p) { return (Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue) }
# The real folder behind a path: every link (symbolic link, junction) on the way is followed.
function Get-RealPath([string]$Path) {
  $cur = [IO.Path]::GetPathRoot($Path)
  $todo = New-Object System.Collections.Generic.List[string]
  $todo.AddRange([string[]]@($Path.Substring($cur.Length) -split '[\\/]' | Where-Object { $_ -ne '' }))
  $hops = 0
  while ($todo.Count -gt 0) {
    $part = $todo[0]; $todo.RemoveAt(0)
    if ($part -eq '.') { continue }
    if ($part -eq '..') { $up = [IO.Path]::GetDirectoryName($cur.TrimEnd('\', '/')); if ($up) { $cur = $up }; continue }
    $next = Join-Path $cur $part
    $item = Get-Entry $next
    if ((Test-Link $item) -and $hops -lt 40) {
      $hops++
      $t = [string](@($item.Target)[0])
      if (-not [IO.Path]::IsPathRooted($t)) { $t = Join-Path $cur $t }
      $t = [IO.Path]::GetFullPath($t)
      $cur = [IO.Path]::GetPathRoot($t)
      $todo.InsertRange(0, [string[]]@($t.Substring($cur.Length) -split '[\\/]' | Where-Object { $_ -ne '' }))
    } else { $cur = $next }
  }
  return $cur.TrimEnd('\', '/')
}
function Test-Inside([string]$a, [string]$b) {
  foreach ($s in @('\', '/')) { if (($a + $s).StartsWith($b + $s, [StringComparison]::OrdinalIgnoreCase)) { return $true } }
  return $false
}

if ($From -eq '~' -or $From.StartsWith('~/') -or $From.StartsWith('~\')) { $From = $HOME + $From.Substring(1) }
$si = Get-Entry $From
if (-not $si -or -not $si.PSIsContainer) { Fail "no such folder: $From" }
$src = (Resolve-Path -LiteralPath $From).Path.TrimEnd('\', '/')

# The job-search-backup-<date> folder itself, or the folder it was unzipped into (holding exactly one).
$B = $null
if ((Split-Path -Leaf $src) -like 'job-search-backup-*' -and (Test-Path -LiteralPath (Join-Path $src 'READ-ME.txt') -PathType Leaf)) { $B = $src }
if (-not $B) {
  $found = @(Get-ChildItem -LiteralPath $src -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'job-search-backup-*' -and -not (Test-Link $_) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'READ-ME.txt') -PathType Leaf) })
  if ($found.Count -gt 1) { Fail "that folder holds more than one backup; give the job-search-backup-<date> folder to restore" }
  if ($found.Count -eq 1) { $B = $found[0].FullName.TrimEnd('\', '/') }
}
if (-not $B) { Fail "that folder is not an unpacked Job Search HQ backup (no job-search-backup-<date> folder with READ-ME.txt)" }
if ((Test-Inside $B $Root) -or (Test-Inside (Get-RealPath $B) (Get-RealPath $Root))) {
  Fail "the unpacked backup is inside the workspace; unzip it into a new folder outside it (e.g. in Downloads) and try again"
}

$Dirs = @('profile', 'jobs', 'contacts', 'outbox', 'interviews', 'history', 'knowledge/field', 'pages', 'imports')
function P([string]$base, [string]$rel) { return (Join-Path $base ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)) }
# A user folder here that is a link would make the restore write outside the workspace.
foreach ($x in ($Dirs + @('knowledge', 'outbox/sent', 'outbox/discarded'))) {
  if (Test-Link (Get-Entry (P $Root $x))) { Fail "$x is a link to another folder; restore only works on real folders (nothing was changed)" }
}

# Walks a folder without following links. Returns @{ rel = '<path with />'; link = $bool } for every file and link.
function Get-Tree([string]$base, [string]$top) {
  $found = New-Object System.Collections.Generic.List[object]
  $start = Get-Entry (P $base $top)
  if (-not $start) { return @() }
  if (Test-Link $start) { $found.Add(@{ rel = $top; link = $true }); return $found.ToArray() }
  if (-not $start.PSIsContainer) { $found.Add(@{ rel = $top; link = $false }); return $found.ToArray() }
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($start.FullName)
  $cut = $base.TrimEnd('\', '/').Length + 1
  while ($stack.Count -gt 0) {
    foreach ($c in @(Get-ChildItem -LiteralPath $stack.Pop() -Force)) {
      $rel = $c.FullName.Substring($cut).Replace('\', '/')
      if (Test-Link $c) { $found.Add(@{ rel = $rel; link = $true }) }
      elseif ($c.PSIsContainer) { $stack.Push($c.FullName) }
      else { $found.Add(@{ rel = $rel; link = $false }) }
    }
  }
  return $found.ToArray()
}

# Excel and Word leave a ~$<name> lock file next to an open file; writing under them loses the change.
$locks = New-Object System.Collections.Generic.List[string]
# A folder that can't be read throws (ErrorActionPreference Stop): stop before anything is changed, as restore.sh does.
try {
  foreach ($x in $Dirs) { foreach ($e in @(Get-Tree $Root $x)) { if ((Split-Path -Leaf $e.rel) -like '~$*') { $locks.Add($e.rel) } } }
} catch { Fail "could not look through the user folders here for open files (a folder can't be read; nothing was changed)" }
$lockList = [string[]]$locks.ToArray(); [Array]::Sort($lockList, [StringComparer]::Ordinal)
foreach ($l in $lockList) { Write-Output "open: $l" }
if ($lockList.Count -gt 0 -and -not $DryRun) { Fail "a file is open in Excel or Word (see the open: lines; each ~`$ file is its lock). Close it, then run the restore again. (nothing was changed)" }

# Top-level items of the backup that are never restored.
$known = @('profile', 'jobs', 'contacts', 'outbox', 'interviews', 'history', 'pages', 'imports', 'knowledge', 'knowledge/field', 'READ-ME.txt', 'resume.json')
$tops = @(Get-ChildItem -LiteralPath $B -Force | ForEach-Object { $_.Name })
$kn = Get-Entry (Join-Path $B 'knowledge')
if ($kn -and $kn.PSIsContainer) { $tops += @(Get-ChildItem -LiteralPath $kn.FullName -Force | ForEach-Object { 'knowledge/' + $_.Name }) }
$tops = [string[]]$tops; [Array]::Sort($tops, [StringComparer]::Ordinal)
foreach ($t in $tops) { if ($known -notcontains $t) { Write-Output "ignored: $t" } }
if (Test-Link $kn) { Write-Output "skipped link: knowledge" }

$entries = New-Object System.Collections.Generic.List[object]
try {
  foreach ($x in $Dirs) {
    if ($x -like 'knowledge/*' -and (Test-Link $kn)) { continue }
    foreach ($e in @(Get-Tree $B $x)) { $entries.Add($e) }
  }
} catch { Fail "could not list the backup's files (a folder in it can't be read; nothing was changed)" }
$keys = [string[]]@($entries | ForEach-Object { $_.rel }); $items = $entries.ToArray()
[Array]::Sort($keys, $items, [StringComparer]::Ordinal)

$latin1 = [Text.Encoding]::GetEncoding(28591)
function Get-Hash([string]$p) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($p))) } finally { $sha.Dispose() }
}
function Test-SameText([string]$a, [string]$b) {
  $x = $latin1.GetString([IO.File]::ReadAllBytes($a)).Replace("`r", '')
  $y = $latin1.GetString([IO.File]::ReadAllBytes($b)).Replace("`r", '')
  return [string]::Equals($x, $y, [StringComparison]::Ordinal)
}
function Get-ParentState([string]$rel) {   # 'link' if a folder between the workspace and this file is a link, 'file' if one is a file
  $q = Split-Path -Parent $rel
  while ($q) {
    $it = Get-Entry (P $Root $q)
    if (Test-Link $it) { return 'link' }
    if ($it -and -not $it.PSIsContainer) { return 'file' }
    $q = Split-Path -Parent $q
  }
  return ''
}
function Copy-In([string]$rel) {
  $s = P $B $rel; $d = P $Root $rel
  [IO.Directory]::CreateDirectory((Split-Path -Parent $d)) | Out-Null
  [IO.File]::Copy($s, $d, $true)
  [IO.File]::SetLastWriteTimeUtc($d, [IO.File]::GetLastWriteTimeUtc($s))
}
function Merge-Log([string]$rel) {   # the backup's log, then the lines here that it doesn't have
  $s = P $B $rel; $d = P $Root $rel
  $bb = [IO.File]::ReadAllBytes($s)
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($l in ([Text.Encoding]::UTF8.GetString($bb) -split "`n")) { [void]$seen.Add($l.TrimEnd("`r")) }
  $add = New-Object System.Text.StringBuilder
  foreach ($l in ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($d)) -split "`n")) {
    $l = $l.TrimEnd("`r")
    if ($l -ne '' -and -not $seen.Contains($l)) { [void]$add.Append($l).Append("`n") }
  }
  $ms = New-Object IO.MemoryStream
  $ms.Write($bb, 0, $bb.Length)
  if ($bb.Length -gt 0 -and $bb[$bb.Length - 1] -ne 10) { $ms.WriteByte(10) }
  $tail = (New-Object System.Text.UTF8Encoding($false)).GetBytes($add.ToString())
  $ms.Write($tail, 0, $tail.Length)
  [IO.File]::WriteAllBytes($d, $ms.ToArray())
}

$n = @{ restored = 0; 'replaced starter' = 0; merged = 0; differs = 0 }
try {
  foreach ($e in $items) {
    $r = $e.rel
    # Only plain relative paths inside the user folders: no "." or ".." parts, no line breaks.
    if ($r.Contains("`n") -or $r.Contains("`r")) { Write-Output ("skipped odd name: a file in " + $r.Split('/')[0] + "/ has a line break in its name"); continue }
    if (@($r.Split('/') | Where-Object { $_ -eq '' -or $_ -eq '.' -or $_ -eq '..' }).Count -gt 0) { Write-Output "skipped odd name: $r"; continue }
    if ($e.link) { Write-Output "skipped link: $r"; continue }
    $leaf = Split-Path -Leaf $r
    if ($leaf -like '~$*' -or $leaf -eq '.DS_Store' -or $leaf -eq 'Thumbs.db' -or $leaf -like '*.restore-tmp') { continue }
    $dst = P $Root $r
    $state = Get-ParentState $r
    $di = Get-Entry $dst
    if ($state -eq 'link' -or (Test-Link $di)) { Write-Output "skipped link: $r"; continue }
    $bl = P $Blank $r
    if ($state -eq 'file') { $act = 'differs' }
    elseif (-not $di) { $act = 'restored' }
    elseif ($di.PSIsContainer) { $act = 'differs' }
    elseif ((Get-Hash (P $B $r)) -eq (Get-Hash $dst)) { continue }
    elseif ($AddOnly) { $act = 'differs' }
    elseif ($r -eq 'history/activity.md') { $act = 'merged' }
    elseif ((Test-Path -LiteralPath $bl -PathType Leaf) -and (Test-SameText $dst $bl)) { $act = 'replaced starter' }
    else { $act = 'differs' }
    if (-not $DryRun) {
      try {
        if ($act -eq 'restored' -or $act -eq 'replaced starter') { Copy-In $r }
        elseif ($act -eq 'merged') { Merge-Log $r }
      } catch { Fail "could not copy $r; the restore is incomplete ($($_.Exception.Message))" }
    }
    Write-Output "${act}: $r"
    $n[$act]++
  }
} catch { Fail $_.Exception.Message }

$counts = "$($n['restored']) restored, $($n['replaced starter']) replaced starter, $($n['merged']) merged, $($n['differs']) differ"
if ($DryRun) {
  if ($lockList.Count -gt 0) { Write-Output 'note: the real restore will refuse until the open: files above are closed' }
  Write-Output "restore: dry-run ($counts; nothing changed)"
} else {
  Write-Output "restore: done ($counts)"
}
