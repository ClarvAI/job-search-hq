# Windows version of update.sh: installs a new version of the app (Job Search HQ) from a release zip,
# without touching the user's own files. Works in Windows PowerShell 5.1 and PowerShell 7.
# Usage (the workspace is the folder four levels above this script):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\update\scripts\update.ps1 -Status
#   ... update.ps1 -Check [-Source <zip or https URL>]          what an update would change; changes nothing
#   ... update.ps1 [-Source <zip or https URL>] [-Sha256 <hex>]  install it (only after the user said yes)
#   ... update.ps1 -Rollback [-Name <backup folder>]            undo the last update (or the named one)
# Same rules and output lines as update.sh (see there and DATA_CONTRACT.md): the app's templates/*.html are plain
# app files; a user's themed copy in profile/templates/ is rebuilt when its app template changes (the old copy is
# kept as <name>.previous.html), and pages are never touched.
# Maintainer-only paths (Test-Maintainer: tests, CI, maintainer notes) are never installed, replaced, removed or
# reported, even if a manifest lists them: a release doesn't ship them, and a git clone's own copies stay as they are.
# With no -Source, the address in VERSION (update_source) is used; until the maintainer sets one it says "set by the
# maintainer before publishing", -Status prints "update_source: none ..." and an install stops with a plain error.
# Keep Test-Protected and Test-Maintainer in step with update.sh (is_protected, ship) and scripts/build-manifest.sh.
param(
  [string]$Source = '',
  [switch]$Status,
  [switch]$Check,
  [switch]$Rollback,
  [string]$Name = '',
  [string]$Sha256 = ''
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
function Fail($msg) { Write-Output "error: $msg"; exit 1 }
$utf8 = New-Object System.Text.UTF8Encoding($false)

try { $Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path.TrimEnd('\', '/') } catch { Fail 'cannot find the workspace' }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $Root 'VERSION') -PathType Leaf)) {
  Fail "AGENTS.md or VERSION not found in $Root; this is not a Job Search HQ workspace"
}
$expected = [IO.Path]::GetFullPath((Join-Path $Root '.claude/skills/update/scripts')).TrimEnd('\', '/')
if ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/') -ine $expected) { Fail 'script is not where it should be inside the workspace' }

function P([string]$rel) { return (Join-Path $Root $rel) }
function Get-Fp([string]$path) {   # fingerprint, as in product-manifest.json: SHA-256 with carriage returns removed
  $b = [IO.File]::ReadAllBytes($path)
  $ms = New-Object IO.MemoryStream
  foreach ($x in $b) { if ($x -ne 13) { $ms.WriteByte($x) } }
  $sha = [Security.Cryptography.SHA256]::Create()
  return (($sha.ComputeHash($ms.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join '')
}
function Get-RawSha([string]$path) {
  $sha = [Security.Cryptography.SHA256]::Create(); $s = [IO.File]::OpenRead($path)
  try { return (($sha.ComputeHash($s) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $s.Dispose() }
}
function Test-Protected([string]$p) {
  $l = $p.ToLowerInvariant()
  if ($l -in @('profile/readme.md', 'jobs/readme.md', 'contacts/readme.md', 'imports/readme.md', 'pages/readme.md',
               'interviews/.gitkeep', 'outbox/sent/.gitkeep', 'outbox/discarded/.gitkeep')) { return $false }
  if ($l -match '^(profile|jobs|contacts|outbox|interviews|history|imports|pages|knowledge/field)/') { return $true }
  if ($l -match '^(\.git|\.backup|\.claude/\.health)/' -or $l -eq '.claude/settings.local.json' -or $l.EndsWith('.local') -or $l -eq 'product-manifest.json') { return $true }
  return $false
}
# In the git repository, never in a release (the list and its reasons: scripts/build-manifest.sh, is_maintainer).
function Test-Maintainer([string]$p) {
  $l = $p.ToLowerInvariant()
  return ($l -match '^(docs/maintainers|\.github|scripts/ci)/' -or $l -match '^\.claude/skills/.*/tests/' -or $l -eq 'contributing.md')
}
function Test-SafePath([string]$p) {
  if ($p -eq '' -or $p.StartsWith('/') -or $p.Contains('\') -or $p.Contains(':') -or $p.Contains('"')) { return $false }
  foreach ($seg in $p.Split('/')) { if ($seg -eq '..' -or $seg -eq '.') { return $false } }
  return $true
}
function Read-Text([string]$path) { return [IO.File]::ReadAllText($path, $utf8).Replace("`r", '') }
function Get-ManFiles([string]$path) {   # ordered list of @{p; h}
  $list = New-Object 'System.Collections.Generic.List[object]'
  foreach ($line in (Read-Text $path).Split("`n")) {
    if ($line -cmatch '^    "([^"]+)": "([0-9a-f]{64})",?$') { $list.Add(@{ p = $Matches[1]; h = $Matches[2] }) }
  }
  return ,$list
}
# Which app must reload its hooks after these app files changed (Claude: .claude/settings.json is read when the
# folder opens; Codex: changed hooks in .codex/hooks.json stay off until trusted again).
function Write-HooksLines($paths) {
  if (@($paths) -contains '.claude/settings.json') { Write-Output 'hooks-changed: claude' }
  if (@($paths) -contains '.codex/hooks.json') { Write-Output 'hooks-changed: codex' }
}
# "themed": the app templates a user may have their own themed copy of (profile/templates/<file name>).
function Get-ManThemed([string]$path) {
  $out = @(); $in = $false
  foreach ($line in (Read-Text $path).Split("`n")) {
    if ($line -match '"themed": \[') { $in = $true; continue }
    if ($in -and $line -match '\]') { $in = $false }
    if ($in -and $line -cmatch '^    "([^"]+)",?$') { $out += $Matches[1] }
  }
  return $out
}
function Get-ManVersion([string]$path) {
  foreach ($line in (Read-Text $path).Split("`n")) { if ($line -cmatch '^  "version": "([0-9][0-9.]*)",?$') { return $Matches[1] } }
  return ''
}
function Get-Ver([string]$path) {
  foreach ($line in (Read-Text $path).Split("`n")) { if ($line -cmatch '^version:\s*([0-9][0-9.]*)') { return $Matches[1] } }
  return ''
}
function Compare-Ver([string]$a, [string]$b) {
  $x = $a.Split('.'); $y = $b.Split('.'); $n = [Math]::Max($x.Count, $y.Count)
  for ($i = 0; $i -lt $n; $i++) {
    $p = 0; $q = 0
    if ($i -lt $x.Count) { [void][int]::TryParse($x[$i], [ref]$p) }
    if ($i -lt $y.Count) { [void][int]::TryParse($y[$i], [ref]$q) }
    if ($p -lt $q) { return -1 }; if ($p -gt $q) { return 1 }
  }
  return 0
}
function Install-File([string]$src, [string]$rel) {
  $d = P $rel
  [IO.Directory]::CreateDirectory((Split-Path -Parent $d)) | Out-Null
  [IO.File]::Copy($src, "$d.update-tmp", $true)
  if (Test-Path -LiteralPath $d) { [IO.File]::Delete($d) }
  [IO.File]::Move("$d.update-tmp", $d)
}
function Add-Line([string]$file, [string]$line) { [IO.File]::AppendAllText($file, $line + "`n", $utf8) }
function Get-LinkedParent([string]$rel) {   # the outermost folder on the way to this path that is a link, or ''
  $found = ''; $q = $rel
  while ($q.Contains('/')) {
    $q = $q.Substring(0, $q.LastIndexOf('/'))
    $it = Get-Item -LiteralPath (P $q) -Force -ErrorAction SilentlyContinue
    if ($it -and ($it.LinkType -eq 'SymbolicLink' -or $it.LinkType -eq 'Junction')) { $found = $q }
  }
  return $found
}
function Read-Lines([string]$file) { if (Test-Path -LiteralPath $file) { return @((Read-Text $file).Split("`n") | Where-Object { $_ -ne '' }) } else { return @() } }

$OldV = Get-Ver (P 'VERSION'); if (-not $OldV) { Fail 'VERSION has no version: line' }
$SrcDefault = ''
foreach ($line in (Read-Text (P 'VERSION')).Split("`n")) { if ($line -match '^update_source:\s*(.*)$') { $SrcDefault = $Matches[1].Trim(); break } }
$Bk = P '.backup'

# ---------------------------------------------------------------- status
if ($Status) {
  Write-Output "version: $OldV"
  if ($SrcDefault -match '^https://') { Write-Output "update_source: $SrcDefault" }
  elseif (-not $SrcDefault -or $SrcDefault -match 'set by the maintainer') { Write-Output 'update_source: none (no download address is set yet; updates need a release zip you downloaded)' }
  else { Write-Output "update_source: $SrcDefault (not an https:// link, so it can't be used; updates need a release zip you downloaded)" }
  if (Test-Path -LiteralPath $Bk) {
    foreach ($d in @(Get-ChildItem -LiteralPath $Bk -Directory | Sort-Object Name)) {
      $info = Join-Path $d.FullName 'backup-info.txt'
      if (Test-Path -LiteralPath $info) { Write-Output ("backup: .backup/$($d.Name) (" + ((Read-Lines $info) -join ' ') + ')') }
    }
  }
  Write-Output 'status: done'; exit 0
}

# ---------------------------------------------------------------- rollback
function Restore-From([string]$b) {
  $bad = $false
  foreach ($p in (Read-Lines (Join-Path $b 'added.txt'))) {
    if (-not (Test-SafePath $p) -or (Test-Protected $p)) { continue }
    $pl = Get-LinkedParent $p
    if ($pl) { Write-Output "note: skipped $p ($pl/ is a link to another folder; nothing is changed through it)"; continue }
    if (Get-Item -LiteralPath (P $p) -Force -ErrorAction SilentlyContinue) {
      try { [IO.File]::Delete((P $p)); Write-Output "removed: $p" } catch { $bad = $true }
    }
  }
  foreach ($p in (Read-Lines (Join-Path $b 'changed.txt'))) {
    if (-not (Test-SafePath $p) -or (Test-Protected $p)) { continue }
    $copy = Join-Path (Join-Path $b 'files') $p
    if (-not (Test-Path -LiteralPath $copy -PathType Leaf)) { Write-Output "error: the backup has no copy of $p"; $bad = $true; continue }
    $pl = Get-LinkedParent $p
    if ($pl) { Write-Output "note: skipped $p ($pl/ is a link to another folder; nothing is changed through it)"; continue }
    # Already as it was (an update that failed before reaching it): nothing to write, so a file that
    # can't be written (open in another program) doesn't turn a clean undo into "could not put back".
    $cur = P $p
    if ((Test-Path -LiteralPath $cur -PathType Leaf) -and -not ((Get-Item -LiteralPath $cur -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -and ((Get-RawSha $cur) -eq (Get-RawSha $copy))) { Write-Output "restored: $p"; continue }
    try { Install-File $copy $p; Write-Output "restored: $p" } catch { $bad = $true }
  }
  foreach ($line in (Read-Lines (Join-Path $b 'local.txt'))) {
    $parts = $line.Split("`t"); if ($parts.Count -ne 2) { continue }
    $l = P $parts[1]; $o = P $parts[0]
    if ((Test-Path -LiteralPath $l -PathType Leaf) -and (Test-Path -LiteralPath $o -PathType Leaf) -and ((Get-RawSha $l) -eq (Get-RawSha $o))) { [IO.File]::Delete($l) }
  }
  $bm = Join-Path (Join-Path $b 'files') 'product-manifest.json'
  try {
    if (Test-Path -LiteralPath $bm) { Install-File $bm 'product-manifest.json' }
    elseif (Test-Path -LiteralPath (Join-Path $b 'added-manifest')) { [IO.File]::Delete((P 'product-manifest.json')) }
  } catch { $bad = $true }
  return (-not $bad)
}

if ($Rollback) {
  $b = $null
  if ($Name) {
    if ($Name -match '[\\/]' -or $Name -in @('.', '..')) { Fail 'backup name must be a folder name inside .backup' }
    $b = Join-Path $Bk $Name
  } elseif (Test-Path -LiteralPath $Bk) {
    foreach ($d in @(Get-ChildItem -LiteralPath $Bk -Directory | Sort-Object LastWriteTimeUtc -Descending)) {
      $info = Join-Path $d.FullName 'backup-info.txt'
      if ((Test-Path -LiteralPath $info) -and -not ((Read-Lines $info) -match '^rolled_back:')) { $b = $d.FullName; break }
    }
  }
  if (-not $b -or -not (Test-Path -LiteralPath (Join-Path $b 'backup-info.txt'))) { Fail 'no update backup to roll back to (.backup/ has none)' }
  $info = Read-Lines (Join-Path $b 'backup-info.txt')
  if ($info -match '^rolled_back:') { Fail 'that update was already rolled back' }
  if (-not ($info -match '^complete: yes')) { Fail "that backup is incomplete; restore by hand from $b\files" }
  $from = (($info -match '^from: ') | Select-Object -First 1) -replace '^from: ', ''
  $to = (($info -match '^to: ') | Select-Object -First 1) -replace '^to: ', ''
  $cur = Get-Ver (P 'VERSION')
  if ($cur -ne $to) { Fail "the installed version is $cur, not $to; roll back the newer update first" }
  # Restore-From writes its progress lines to the output; its last value is the result.
  $r = @(Restore-From $b)
  if ($r.Count -gt 1) { $r[0..($r.Count - 2)] | ForEach-Object { Write-Output $_ } }
  if ($r[-1] -ne $true) { Fail "some files could not be restored; the rest were (see above). Backup: $b" }
  Add-Line (Join-Path $b 'backup-info.txt') ("rolled_back: " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
  Write-HooksLines (@(Read-Lines (Join-Path $b 'added.txt')) + @(Read-Lines (Join-Path $b 'changed.txt')))
  foreach ($t in (Read-Lines (Join-Path $b 'templates.txt'))) {
    $prev = $t -replace '\.html$', '.previous.html'
    if (Test-Path -LiteralPath (P "profile/templates/$prev")) { Write-Output "note: that update refreshed your profile/templates/$t; your copy from before it is profile/templates/$prev" }
  }
  Write-Output "rollback: done ($to -> $from)"
  exit 0
}

# ---------------------------------------------------------------- get and check the release
$fromDefault = $false
if (-not $Source) { $Source = $SrcDefault; $fromDefault = $true }
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('jshq-update-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Tmp) | Out-Null
$exitCode = 0
try {
  if ($Source -match '^https://') {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
    $zip = Join-Path $Tmp 'release.zip'
    try { Invoke-WebRequest -Uri $Source -OutFile $zip -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 300 } catch { Fail "could not download $Source (nothing was changed)" }
  } elseif ($Source -match '^http://') { Fail 'only https:// addresses are allowed (nothing was changed)' }
  elseif (-not $Source -or $Source -match 'set by the maintainer') { Fail 'no download address for updates is set yet; download the latest release zip yourself and give its path (nothing was changed)' }
  elseif ($fromDefault) { Fail "the update address in VERSION ($Source) isn't an https:// link; download the latest release zip yourself and give its path (nothing was changed)" }
  else {
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { Fail "file not found: $Source (nothing was changed)" }
    $zip = (Resolve-Path -LiteralPath $Source).Path
  }
  if ($Sha256 -and (Get-RawSha $zip) -ne $Sha256.ToLowerInvariant()) { Fail "the downloaded file's SHA-256 doesn't match the one given; it may be damaged or changed (nothing was changed)" }

  # Unpack entry by entry, refusing unsafe paths (no ZipFile.ExtractToDirectory: it trusts the names).
  $X = Join-Path $Tmp 'x'; [IO.Directory]::CreateDirectory($X) | Out-Null
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  try { $za = [IO.Compression.ZipFile]::OpenRead($zip) } catch { Fail 'the update file is not a readable zip (nothing was changed)' }
  try {
    foreach ($en in $za.Entries) {
      $n = $en.FullName
      if ($n.StartsWith('/') -or $n.Contains('\') -or $n -match '^[A-Za-z]:' -or ($n.Split('/') -contains '..')) { Fail "the update file has an unsafe path ($n); refused (nothing was changed)" }
      # Unix symlink entries carry the link type in the high bits of ExternalAttributes (0xA000).
      if ((($en.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { Fail 'the update file contains links; refused (nothing was changed)' }
      if ($n.EndsWith('/')) { [IO.Directory]::CreateDirectory((Join-Path $X $n)) | Out-Null; continue }
      $dst = Join-Path $X $n
      [IO.Directory]::CreateDirectory((Split-Path -Parent $dst)) | Out-Null
      try { [IO.Compression.ZipFileExtensions]::ExtractToFile($en, $dst, $true) } catch { Fail 'the update file could not be unpacked; it may be damaged (nothing was changed)' }
    }
  } catch { if ($_.Exception.Message -notmatch '^error:') { Fail 'the update file could not be unpacked; it may be damaged (nothing was changed)' } else { throw } }
  finally { $za.Dispose() }
  $New = $null
  if (Test-Path -LiteralPath (Join-Path $X 'product-manifest.json')) { $New = $X }
  else {
    foreach ($d in @(Get-ChildItem -LiteralPath $X -Directory)) {
      if (Test-Path -LiteralPath (Join-Path $d.FullName 'product-manifest.json')) { if ($New) { Fail 'the zip holds more than one release' }; $New = $d.FullName }
    }
  }
  if (-not $New -or -not (Test-Path -LiteralPath (Join-Path $New 'VERSION'))) { Fail 'this zip is not a Job Search HQ release (no product-manifest.json and VERSION) (nothing was changed)' }
  $NewMan = Join-Path $New 'product-manifest.json'
  $NewV = Get-ManVersion $NewMan
  if (-not $NewV -or $NewV -ne (Get-Ver (Join-Path $New 'VERSION'))) { Fail "the release's version is unclear (manifest and VERSION disagree) (nothing was changed)" }
  $newFiles = Get-ManFiles $NewMan
  if ($newFiles.Count -eq 0) { Fail "the release's file list is empty or unreadable (nothing was changed)" }
  $themed = @(Get-ManThemed $NewMan)
  $newH = @{}; foreach ($f in $newFiles) { $newH[$f.p] = $f.h }
  foreach ($must in @('AGENTS.md', 'VERSION', '.claude/skills/update/scripts/update.sh')) {
    if (-not $newH.ContainsKey($must)) { Fail "the release's file list is missing $must (nothing was changed)" }
  }
  foreach ($f in $newFiles) {
    if (-not (Test-SafePath $f.p)) { Fail "the release lists an unsafe path ($($f.p)); refused (nothing was changed)" }
    if (Test-Protected $f.p) { Fail "the release lists one of your own files ($($f.p)); updates never touch those, so it was refused (nothing was changed)" }
    $nf = Join-Path $New $f.p
    if (-not (Test-Path -LiteralPath $nf -PathType Leaf)) { Fail "the update file is incomplete ($($f.p) is missing); it may be damaged (nothing was changed)" }
    if ((Get-Fp $nf) -ne $f.h) { Fail "the update file is damaged or was changed ($($f.p) doesn't match its fingerprint); refused (nothing was changed)" }
  }
  $c = Compare-Ver $NewV $OldV
  if ($c -eq 0 -and -not $Check -and -not $env:JSHQ_REINSTALL) { Write-Output "update: already up to date ($OldV)"; exit 0 }
  if ($c -lt 0) { Fail "that release ($NewV) is older than the installed version ($OldV); to go back, use -Rollback (nothing was changed)" }

  # ---------------------------------------------------------------- plan
  # Maintainer-only paths drop out of both lists here: never installed, and never removed because a release doesn't
  # ship them (an older manifest, such as a git clone's from before they were excluded, may still list them).
  $shipFiles = @($newFiles | Where-Object { -not (Test-Maintainer $_.p) })
  $oldH = @{}
  if (Test-Path -LiteralPath (P 'product-manifest.json')) { foreach ($f in (Get-ManFiles (P 'product-manifest.json'))) { if (-not (Test-Maintainer $f.p)) { $oldH[$f.p] = $f.h } } }
  function Get-LocalFp([string]$p) {
    if (-not (Test-SafePath $p) -or (Test-Protected $p)) { return $null }
    $it = Get-Item -LiteralPath (P $p) -Force -ErrorAction SilentlyContinue
    # A folder on the way that is a link: never write through it (PARENTLINKX when something is there).
    # PARENTLINKX:<fingerprint> when something is there (read through the link only to see whether it is already new).
    if (Get-LinkedParent $p) {
      if (-not $it) { return 'PARENTLINK' }
      if ($it.LinkType -or $it.PSIsContainer) { return 'PARENTLINKX:' }
      return ('PARENTLINKX:' + (Get-Fp $it.FullName))
    }
    if (-not $it) { return $null }
    if ($it.LinkType -or $it.PSIsContainer) { return 'LINK' }
    return (Get-Fp $it.FullName)
  }
  $plan = New-Object 'System.Collections.Generic.List[object]'
  foreach ($f in $shipFiles) {
    $lh = Get-LocalFp $f.p
    if ($lh -like 'PARENTLINK*') { if ($lh -eq ('PARENTLINKX:' + $f.h)) { $a = 'SAME' } else { $a = 'SKIPLINK' } }
    elseif ($null -eq $lh) { $a = 'ADD' }
    elseif ($lh -eq $f.h) { $a = 'SAME' }
    elseif ($oldH.ContainsKey($f.p) -and $lh -eq $oldH[$f.p]) { $a = 'UPDATE' }
    else { $a = 'LOCAL' }
    $plan.Add(@{ a = $a; p = $f.p })
  }
  foreach ($p in @($oldH.Keys | Sort-Object)) {
    if ($newH.ContainsKey($p)) { continue }
    $lh = Get-LocalFp $p
    if ($null -eq $lh -or $lh -eq 'PARENTLINK') { continue }
    if ($lh -like 'PARENTLINKX*') { $plan.Add(@{ a = 'SKIPLINK'; p = $p }); continue }
    if ($lh -eq $oldH[$p]) { $plan.Add(@{ a = 'REMOVE'; p = $p }) } else { $plan.Add(@{ a = 'LOCALREMOVE'; p = $p }) }
  }
  $nA = @($plan | Where-Object { $_.a -eq 'ADD' }).Count
  $nU = @($plan | Where-Object { $_.a -eq 'UPDATE' }).Count
  $nL = @($plan | Where-Object { $_.a -in @('LOCAL', 'LOCALREMOVE') }).Count
  $nR = @($plan | Where-Object { $_.a -eq 'REMOVE' }).Count
  $changing = @($plan | Where-Object { $_.a -ne 'SAME' -and $_.a -ne 'SKIPLINK' } | ForEach-Object { $_.p })
  # App templates that change in this update and that the user has a themed copy of.
  $retheme = @($themed | Where-Object { ($changing -contains $_) -and (Test-Path -LiteralPath (P ('profile/templates/' + ($_ -replace '^.*/', ''))) -PathType Leaf) } | ForEach-Object { $_ -replace '^.*/', '' })

  if ($Check) {
    Write-Output "installed: $OldV"; Write-Output "available: $NewV"
    foreach ($x in $plan) {
      if ($x.a -in @('LOCAL', 'LOCALREMOVE')) { Write-Output "would keep your edited version: $($x.p) (saved as $($x.p).local)" }
      if ($x.a -eq 'SKIPLINK') { Write-Output "would skip: $($x.p) (a folder on its way is a link to another folder; nothing is written through it)" }
    }
    Write-HooksLines $changing
    foreach ($t in $retheme) { Write-Output ("would refresh your themed copy: profile/templates/$t (your current copy is kept as profile/templates/" + ($t -replace '\.html$', '.previous.html') + ')') }
    Write-Output "update: check ($nA to add, $nU to update, $nR to remove, $nL edited by you; nothing changed)"
    exit 0
  }

  # ---------------------------------------------------------------- back up, then apply
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  [IO.Directory]::CreateDirectory($Bk) | Out-Null
  $B = Join-Path $Bk $OldV; if (Test-Path -LiteralPath $B) { $B = Join-Path $Bk "$OldV-$stamp" }
  $BF = Join-Path $B 'files'
  try {
    [IO.Directory]::CreateDirectory($BF) | Out-Null
    [IO.File]::WriteAllText((Join-Path $B 'backup-info.txt'), "from: $OldV`nto: $NewV`ndate: $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n", $utf8)
    foreach ($n in @('added.txt', 'changed.txt', 'local.txt')) { [IO.File]::WriteAllText((Join-Path $B $n), '', $utf8) }
    if (Test-Path -LiteralPath (P 'product-manifest.json')) { [IO.File]::Copy((P 'product-manifest.json'), (Join-Path $BF 'product-manifest.json')) }
    else { [IO.File]::WriteAllText((Join-Path $B 'added-manifest'), '', $utf8) }
    foreach ($x in $plan) {
      if ($x.a -notin @('UPDATE', 'LOCAL', 'REMOVE', 'LOCALREMOVE')) { continue }
      $bc = Join-Path $BF $x.p
      [IO.Directory]::CreateDirectory((Split-Path -Parent $bc)) | Out-Null
      [IO.File]::Copy((P $x.p), $bc, $true)
      Add-Line (Join-Path $B 'changed.txt') $x.p
    }
    Add-Line (Join-Path $B 'backup-info.txt') 'complete: yes'
  } catch { Fail "cannot back up the app files ($($_.Exception.Message)) (nothing was changed)" }

  $step = ''
  try {
    foreach ($x in $plan) {
      $p = $x.p; $step = $p
      switch ($x.a) {
        'ADD' { Add-Line (Join-Path $B 'added.txt') $p; Install-File (Join-Path $New $p) $p; Write-Output "added: $p" }
        'UPDATE' { Install-File (Join-Path $New $p) $p; Write-Output "updated: $p" }
        { $_ -in @('LOCAL', 'LOCALREMOVE') } {
          $l = "$p.local"; if (Test-Path -LiteralPath (P $l)) { $l = "$p.$stamp.local" }
          [IO.File]::Move((P $p), (P $l))
          Add-Line (Join-Path $B 'local.txt') "$p`t$l"
          if ($x.a -eq 'LOCAL') {
            Add-Line (Join-Path $B 'added.txt') $p
            Install-File (Join-Path $New $p) $p
            Write-Output "kept-local: $p (your edited version is now $l)"
          } else { Write-Output "kept-local: $p (no longer part of the app; your edited version is now $l)" }
        }
        'REMOVE' { [IO.File]::Delete((P $p)); Write-Output "removed: $p" }
        'SKIPLINK' { Write-Output "note: skipped $p ($(Get-LinkedParent $p)/ is a link to another folder; the update never writes through it)" }
      }
    }
    $step = 'product-manifest.json'
    Install-File $NewMan 'product-manifest.json'
  } catch {
    Write-Output "error: could not update $step; undoing the update"
    $r = @(Restore-From $B)
    if ($r[-1] -eq $true) {
      Add-Line (Join-Path $B 'backup-info.txt') ("rolled_back: " + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' (automatic)')
      Fail "the update could not finish ($step); everything was put back as it was"
    }
    Fail "the update could not finish ($step) and some files could not be put back; restore them from $BF"
  }

  # ---------------------------------------------------------------- after the app files
  $initOut = @()
  try { $initOut = @(& (P '.claude/skills/start/scripts/init-data.ps1') 2>&1 | ForEach-Object { [string]$_ }) } catch { $initOut = @("error: $($_.Exception.Message)") }
  foreach ($l in $initOut) {
    if ($l -like 'created: *') { Write-Output ('new starter file: ' + $l.Substring(9)) }
    elseif ($l -like 'error:*') { Write-Output ('note: starter files:' + $l.Substring(6)) }
  }
  # The user's themed template copies (profile/templates/): rebuild the ones whose app template changed.
  # Pages and interview briefs are never re-themed by an update.
  if ($retheme.Count -gt 0) {
    try { [IO.File]::WriteAllText((Join-Path $B 'templates.txt'), (($retheme -join "`n") + "`n"), $utf8) } catch {}
    $list = $retheme -join ','
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
      $r = @(& $node.Source (P '.claude/skills/page-design/scripts/apply-theme.mjs') --regenerate $list 2>&1 | ForEach-Object { [string]$_ })
      foreach ($l in $r) { if ($l -match '^(refreshed|created): (.*)$') { Write-Output ('template: ' + $Matches[2]) } }
      $last = if ($r.Count) { $r[-1] } else { '' }
      if ($last -notlike 'result:*') {
        $err = @($r | Where-Object { $_ -like 'error:*' })[0]
        Write-Output "note: your themed template copies (profile/templates/: $list) were not refreshed ($err); they still work but miss this update's template changes; refresh them with the page-design skill"
      }
    } else {
      Write-Output "note: the app's $list changed, and Node isn't available to refresh your themed copy in profile/templates/; refresh it by hand (update skill, `"Themed templates without Node`")"
    }
  }
  $mig = P 'migrations'
  if (Test-Path -LiteralPath $mig) {
    foreach ($m in @(Get-ChildItem -LiteralPath $mig -File | Where-Object { $_.Name -match '^[0-9]{3}-.*\.md$' } | Sort-Object Name)) {
      $mv = Get-Ver $m.FullName
      if ($mv -and (Compare-Ver $mv $OldV) -gt 0 -and (Compare-Ver $mv $NewV) -le 0) { Write-Output "migration: migrations/$($m.Name)" }
    }
  }
  Write-HooksLines $changing
  $cl = P 'CHANGELOG.md'
  if (Test-Path -LiteralPath $cl) {
    Write-Output 'changelog:'
    $show = $false
    foreach ($line in (Read-Text $cl).Split("`n")) {
      if ($line -match '^## ([0-9]+\.[0-9]+\.[0-9]+)') { $show = ((Compare-Ver $Matches[1] $OldV) -gt 0) }
      if ($show) { Write-Output $line }
    }
    Write-Output 'end of changelog'
  }
  Write-Output "update: done $OldV -> $NewV (backup: .backup/$(Split-Path -Leaf $B))"
} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
