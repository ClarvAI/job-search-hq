# Windows version of make-sample.sh (keep the two in step). Makes a SEPARATE sample workspace filled with
# made-up data (Alex Rivera), so someone can try the panels and pages before entering anything about themselves.
# The user's own workspace is never written to: the sample is a new folder next to it, holding a copy of the app
# (no personal files, no .git) plus the sample data from templates\sample\ (dates moved to today), with the rest
# of the personal files from templates\blank\.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\tour\scripts\make-sample.ps1 [-DryRun] [-Parent <folder>] [-Name <folder name>]
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\tour\scripts\make-sample.ps1 -Remove [-Parent <folder>] [-Name <folder name>]
#   (-Today YYYY-MM-DD sets the day the sample dates count from; for tests.)
# Default folder: "<this workspace's folder name> (sample - Alex Rivera)", next to this workspace.
# Refuses: a target that exists (then prints "suggest: <a free name>"), a parent folder that is a link or is
# inside this workspace, and running from inside a sample workspace. -Remove deletes only a folder this script
# made (its .sample-workspace marker) that still holds the sample person, never a link.
# Output ends with "sample: made <path>", "sample: removed <path>", "sample: dry-run ..." or "error: ...".
[CmdletBinding()]
param([switch]$DryRun, [switch]$Remove, [string]$Parent = '', [string]$Name = '', [string]$Today = '')
$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Output "error: $msg"; exit 1 }

$MarkLine = 'Job Search HQ sample workspace (made by make-sample)'
$SampleNameLine = 'name: Alex Rivera (sample)'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Culture = [Globalization.CultureInfo]::InvariantCulture
$sep = [IO.Path]::DirectorySeparatorChar

function Test-Link([string]$Path) {
  $i = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if (-not $i) { return $false }
  return [bool]($i.LinkType -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint))
}
function Test-There([string]$Path) { return [bool](Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue) }
# The real path of an existing folder, every link on the way resolved (like pwd -P).
function Get-RealDir([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  if ($full -eq '') { $full = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path)) }
  $root = [IO.Path]::GetPathRoot($full)
  $cur = $root
  foreach ($part in $full.Substring($root.Length).Split(@('\', '/'), [StringSplitOptions]::RemoveEmptyEntries)) {
    $next = Join-Path $cur $part
    $item = Get-Item -LiteralPath $next -Force -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -and $item.Target) {
      $t = @($item.Target)[0]
      if (-not [IO.Path]::IsPathRooted($t)) { $t = Join-Path $cur $t }
      $next = Get-RealDir $t
    }
    $cur = $next
  }
  return $cur.TrimEnd('\', '/')
}
# True if Path is Folder itself or somewhere under it (case-insensitive, like macOS and Windows).
function Test-Inside([string]$Path, [string]$Folder) {
  $p = ($Path.Replace('\', '/').TrimEnd('/') + '/').ToLowerInvariant()
  $f = ($Folder.Replace('\', '/').TrimEnd('/') + '/').ToLowerInvariant()
  return $p.StartsWith($f)
}

try { $Here = Get-RealDir $PSScriptRoot; $Root = Get-RealDir (Join-Path $PSScriptRoot '..\..\..\..') } catch { Fail 'cannot find the workspace' }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md') -PathType Leaf)) { Fail "AGENTS.md not found in $Root; this is not a Job Search HQ workspace" }
if ((Join-Path $Root '.claude/skills/tour/scripts').Replace('\', '/').TrimEnd('/') -ne $Here.Replace('\', '/')) { Fail 'script is not where it should be inside the workspace' }
$homeDir = [Environment]::GetFolderPath('UserProfile')
if ($Root -eq $homeDir -or $Root -eq [IO.Path]::GetPathRoot($Root).TrimEnd('\', '/')) { Fail "unsafe workspace path: $Root" }
if (-not $Remove -and (Test-There (Join-Path $Root '.sample-workspace'))) { Fail 'this folder is already a sample workspace. Make a sample from your own workspace instead.' }

# ---- Where the sample goes
if ($Parent -eq '') { $Parent = Split-Path -Parent $Root }
if (-not [IO.Path]::IsPathRooted($Parent)) { $Parent = Join-Path (Get-Location).ProviderPath $Parent }
$Parent = [IO.Path]::GetFullPath($Parent)
if ($Parent.Length -gt [IO.Path]::GetPathRoot($Parent).Length) { $Parent = $Parent.TrimEnd('\', '/') }
if (Test-Link $Parent) { Fail "the folder $Parent is a link (shortcut) to another place; choose a real folder" }
if (-not (Test-Path -LiteralPath $Parent -PathType Container)) { Fail "the folder $Parent does not exist" }
try { $ParentReal = Get-RealDir $Parent } catch { Fail "cannot open the folder $Parent" }
if ($Name -eq '') { $Name = (Split-Path -Leaf $Root) + ' (sample - Alex Rivera)' }
if ($Name -eq '' -or $Name -eq '.' -or $Name -eq '..' -or $Name.StartsWith('.') -or $Name -match '[\\/:*?"<>|\r\n]') { Fail "not a usable folder name: $Name" }
$Target = Join-Path $ParentReal $Name
if (Test-Inside $Target $Root) { Fail "the sample can't go inside your own workspace ($Root); choose a folder outside it" }
if (Test-Inside $Root $Target) { Fail "the sample can't be a folder that holds your own workspace" }
if ($Target -eq $homeDir) { Fail "unsafe sample folder: $Target" }

# ---- Remove a sample this script made
if ($Remove) {
  if (-not (Test-There $Target)) { Fail "there is no sample folder at $Target" }
  if (Test-Link $Target) { Fail "$Target is a link (shortcut), not a sample folder; nothing was deleted" }
  if (-not (Test-Path -LiteralPath $Target -PathType Container)) { Fail "$Target is not a folder; nothing was deleted" }
  $m = Join-Path $Target '.sample-workspace'
  $first = ''
  if ((Test-Path -LiteralPath $m -PathType Leaf) -and -not (Test-Link $m)) { $first = ([IO.File]::ReadAllLines($m, $Utf8) | Select-Object -First 1) }
  if ($first -ne $MarkLine) { Fail "$Target was not made by make-sample (no sample marker), so it was not deleted. Delete it yourself if you're sure." }
  $p = Join-Path $Target 'profile/preferences.md'
  $named = $false
  if ((Test-Path -LiteralPath $p -PathType Leaf) -and -not (Test-Link $p)) { $named = @([IO.File]::ReadAllLines($p, $Utf8) | Where-Object { $_.TrimEnd("`r") -ceq $SampleNameLine }).Count -gt 0 }
  if (-not $named) { Fail "$Target no longer looks like the sample (its preferences don't name the sample person), so it was not deleted: someone may have put real details in it. Delete it yourself if you're sure." }
  if (Test-There (Join-Path $Target '.git')) { Fail "$Target has its own git history now, so it was not deleted. Delete it yourself if you're sure." }
  $lock = Get-ChildItem -LiteralPath $Target -Recurse -Force -Filter '~$*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($lock) { Fail "a file in the sample is open in Excel or Word ($($lock.Name)). Close it, then try again." }
  # Delete links as links (never what they point to), then files, then folders, deepest first.
  function Remove-Tree([string]$Dir) {
    foreach ($e in @(Get-ChildItem -LiteralPath $Dir -Force)) {
      if ($e.LinkType -or ($e.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        if ($e.PSIsContainer) { [IO.Directory]::Delete($e.FullName, $false) } else { [IO.File]::Delete($e.FullName) }
      } elseif ($e.PSIsContainer) { Remove-Tree $e.FullName }
      else { $e.Attributes = 'Normal'; [IO.File]::Delete($e.FullName) }
    }
    [IO.Directory]::Delete($Dir, $false)
  }
  try { Remove-Tree $Target } catch { Fail "could not delete everything in $Target" }
  if (Test-There $Target) { Fail "could not delete everything in $Target" }
  Write-Output "sample: removed $Target"
  exit 0
}

# ---- Make a new sample
$Sample = Join-Path $Root 'templates/sample'
foreach ($d in @($Sample, (Join-Path $Sample 'workspace'), (Join-Path $Sample 'page-data'))) {
  if (-not (Test-Path -LiteralPath $d -PathType Container) -or (Test-Link $d)) { Fail 'the sample data (templates\sample\) is missing or incomplete; nothing was made' }
}
foreach ($f in @('dashboard', 'flashcards', 'interview-brief')) {
  if (-not (Test-Path -LiteralPath (Join-Path $Sample "page-data/$f.json") -PathType Leaf)) { Fail "templates\sample\page-data\$f.json is missing; nothing was made" }
}

if (Test-There $Target) {
  Write-Output "error: $Target already exists, so nothing was made. It may be a sample from before: open it, or remove it first (-Remove)."
  for ($n = 2; $n -lt 100; $n++) {
    if (-not (Test-There (Join-Path $ParentReal "$Name $n"))) { Write-Output "suggest: $Name $n"; break }
  }
  exit 1
}

if ($Today -eq '') { $Today = (Get-Date).ToString('yyyy-MM-dd', $Culture) }
try { $Base = [datetime]::ParseExact($Today, 'yyyy-MM-dd', $Culture) } catch { Fail '-Today must be YYYY-MM-DD' }
$Unclear = ''
for ($k = 7; $k -lt 60; $k++) {
  $d = $Base.AddDays($k)
  if ($d.Day -le 12 -and $d.Day -ne $d.Month) { $Unclear = $d.ToString('MM/dd/yyyy', $Culture); break }
}
$TokenRx = New-Object System.Text.RegularExpressions.Regex('\{\{(D[-+][0-9]+|N[-+][0-9]+|UNCLEAR)\}\}')
# Replaces the date tokens (see templates\sample\README.md); everything else stays exactly as it was.
function Render([string]$Text) {
  return $TokenRx.Replace($Text, [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $tok = $m.Groups[1].Value
    if ($tok -eq 'UNCLEAR') { return $Unclear }
    $off = [int]$tok.Substring(2); if ($tok[1] -eq '-') { $off = -$off }
    if ($tok[0] -eq 'D') { return $Base.AddDays($off).ToString('yyyy-MM-dd', $Culture) }
    return $Base.AddDays($off).ToString('yyyyMMdd', $Culture)
  })
}
function Read-Text([string]$Path) { return $Utf8.GetString([IO.File]::ReadAllBytes($Path)) }   # keeps a byte-order mark
function Write-Text([string]$Path, [string]$Text) { [IO.File]::WriteAllBytes($Path, $Utf8.GetBytes($Text)) }
function Test-SafeRel([string]$Rel) {
  if ($Rel -eq '' -or $Rel.StartsWith('/') -or $Rel.Contains('\') -or $Rel.Contains(':')) { return $false }
  foreach ($seg in $Rel.Split('/')) { if ($seg -eq '..' -or $seg -eq '.' -or $seg -eq '') { return $false } }
  return $true
}
# User-owned and local-only paths (DATA_CONTRACT.md; update.ps1 Test-Protected) and maintainer-only paths
# (build-manifest.sh is_maintainer): never copied into the sample.
$Guides = @('profile/readme.md', 'jobs/readme.md', 'contacts/readme.md', 'imports/readme.md', 'pages/readme.md', 'interviews/.gitkeep', 'outbox/sent/.gitkeep', 'outbox/discarded/.gitkeep')
function Test-SkipApp([string]$Rel) {
  $p = $Rel.ToLowerInvariant()
  if ($Guides -contains $p) { return $false }
  foreach ($pre in @('profile/', 'jobs/', 'contacts/', 'outbox/', 'interviews/', 'history/', 'imports/', 'pages/', 'knowledge/field/',
                     '.git/', '.backup/', '.claude/.health/', 'docs/maintainers/', '.github/', 'scripts/ci/')) {
    if ($p.StartsWith($pre)) { return $true }
  }
  if ($p -eq '.claude/settings.local.json' -or $p -eq '.sample-workspace' -or $p -eq 'contributing.md' -or $p.EndsWith('.local')) { return $true }
  if ($p -match '^\.claude/skills/[^/]+/tests/') { return $true }
  if (-not $p.Contains('/') -and ($p.EndsWith('.pdf') -or $p.EndsWith('.zip'))) { return $true }
  $leaf = $p.Substring($p.LastIndexOf('/') + 1)
  if ($leaf -eq '.ds_store' -or $leaf -eq 'thumbs.db' -or $leaf.StartsWith('~$')) { return $true }
  return $false
}
# Every regular file under Dir (relative, with /), never following a link into another folder.
function Get-Files([string]$Dir, [string]$Prefix) {
  foreach ($e in @(Get-ChildItem -LiteralPath $Dir -Force)) {
    if ($e.LinkType -or ($e.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
    $rel = if ($Prefix) { "$Prefix/$($e.Name)" } else { $e.Name }
    if ($e.PSIsContainer) {
      if ($Prefix -eq '' -and $e.Name -eq '.git') { continue }
      Get-Files $e.FullName $rel
    } else { $rel }
  }
}
try {
  $appList = @(Get-Files $Root '' | Where-Object { -not (Test-SkipApp $_) } | Sort-Object)
  $sampleList = @(Get-Files (Join-Path $Sample 'workspace') '' | Where-Object { $_ -notmatch '(^|/)\.DS_Store$' } | Sort-Object)
} catch { Fail "could not list the app's files; nothing was made" }
if (@(Get-ChildItem -LiteralPath $Sample -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.LinkType -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }).Count -gt 0) { Fail 'something inside templates\sample\ is a link; nothing was made' }
if ($sampleList.Count -eq 0) { Fail 'templates\sample\workspace\ is empty; nothing was made' }

if ($DryRun) {
  Write-Output "would make: $Target"
  Write-Output "would copy: $($appList.Count) app file(s); would add: $($sampleList.Count) sample file(s), dates counted from $Today"
  Write-Output 'sample: dry-run (nothing changed)'
  exit 0
}

# CreateDirectory would quietly accept an existing folder, so check again right before (and refuse links).
if (Test-There $Target) { Fail "$Target appeared while this ran; nothing was made" }
try { [IO.Directory]::CreateDirectory($Target) | Out-Null } catch { Fail "could not make $Target (is the folder writable?)" }
try {
  Write-Text (Join-Path $Target '.sample-workspace') ("$MarkLine`nMade from: $Root`nEverything here is made up. Delete this whole folder when you're done (make-sample -Remove), or just move it to the Recycle Bin.`n")
} catch { Fail "could not write in $Target" }
function Stop-Half($msg) { Write-Output "error: $msg"; Write-Output "note: the half-made sample is at $Target; remove it with -Remove"; exit 1 }

$nApp = 0
foreach ($rel in $appList) {
  if (-not (Test-SafeRel $rel)) { continue }
  $dst = Join-Path $Target $rel
  try {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $dst)) | Out-Null
    [IO.File]::Copy((Join-Path $Root $rel), $dst, $false)
  } catch { Stop-Half "could not copy $rel" }
  $nApp++
}
if (-not (Test-Path -LiteralPath (Join-Path $Target 'AGENTS.md')) -or -not (Test-Path -LiteralPath (Join-Path $Target '.claude/skills/start/scripts/init-data.ps1'))) { Stop-Half 'the app files were not all copied' }

$nS = 0
foreach ($rel in $sampleList) {
  $outRel = Render $rel
  if (-not (Test-SafeRel $outRel)) { Stop-Half "bad sample file name: $rel" }
  $dst = Join-Path $Target $outRel
  if (Test-There $dst) { Stop-Half "two sample files would land on $outRel" }
  try {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $dst)) | Out-Null
    Write-Text $dst (Render (Read-Text (Join-Path $Sample "workspace/$rel")))
  } catch { Stop-Half "could not write $outRel" }
  $nS++
}

# Everything the sample doesn't provide comes from templates\blank\ through the sample's own first-run script.
$initOut = @(& (Join-Path $Target '.claude/skills/start/scripts/init-data.ps1') 2>&1 | ForEach-Object { "$_" })
if ($LASTEXITCODE -ne 0 -or ($initOut -match '^error:')) { Stop-Half "the starter files could not be set up ($(@($initOut -match '^error:')[0]))" }

$OpenTag = '<script type="application/json" id="data">'
function Fill([string]$Page, [string]$JsonFile) {
  $json = (Render (Read-Text $JsonFile)).TrimEnd("`r", "`n")
  if ($json.Contains('<')) { throw "$JsonFile contains a < character" }
  $html = Read-Text $Page
  $at = $html.IndexOf($OpenTag)
  if ($at -lt 0 -or $html.IndexOf($OpenTag, $at + 1) -ge 0) { throw "no single data block in $Page" }
  $lineEnd = $html.IndexOf("`n", $at)
  $close = $html.IndexOf('</script>', $at)
  if ($lineEnd -lt 0 -or $close -lt $lineEnd) { throw "could not fill $Page" }
  $closeLine = $html.LastIndexOf("`n", $close) + 1
  Write-Text $Page ($html.Substring(0, $lineEnd + 1) + $json + "`n" + $html.Substring($closeLine))
}
try {
  Fill (Join-Path $Target 'pages/dashboard.html') (Join-Path $Sample 'page-data/dashboard.json')
  Fill (Join-Path $Target 'pages/flashcards.html') (Join-Path $Sample 'page-data/flashcards.json')
  $brief = Join-Path $Target 'jobs/acme-senior-product-marketing-manager/interview-brief.html'
  [IO.File]::Copy((Join-Path $Target 'pages/interview-brief.html'), $brief, $false)
  Fill $brief (Join-Path $Sample 'page-data/interview-brief.json')
} catch { Stop-Half "the sample pages could not be filled ($($_.Exception.Message))" }

foreach ($d in @('profile', 'jobs', 'contacts', 'outbox', 'interviews', 'history', 'knowledge/field', 'pages')) {
  $dir = Join-Path $Target $d
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { continue }
  foreach ($rel in @(Get-Files $dir '')) {
    if ($TokenRx.IsMatch((Read-Text (Join-Path $dir $rel)))) { Stop-Half "a date was not filled in: $d/$rel" }
  }
}

Write-Output "copied: $nApp app file(s); added: $nS sample file(s); dates counted from $Today"
Write-Output "open: $Target"
Write-Output "sample: made $Target"
exit 0
