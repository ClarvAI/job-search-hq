# Windows version of init-data.sh. First-run setup: copies every starter file in templates\blank\ that
# is missing from the workspace into place (one to one, same relative path). Never overwrites, never deletes.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\start\scripts\init-data.ps1 [-Quiet] [-DryRun]
#   -Quiet   print only the summary line, and only if something was created or went wrong (session-start hook)
#   -DryRun  list what would be created; change nothing
# Output: "created: <path>" per file, then "init: created N file(s)" or "init: nothing to do";
# "error: ..." and exit 1 if the workspace or templates\blank\ can't be found.
param([switch]$Quiet, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Output "error: $msg"; exit 1 }

try { $Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path.TrimEnd('\', '/') } catch { Fail 'cannot find the workspace' }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md') -PathType Leaf)) { Fail "AGENTS.md not found in $Root; this is not a Job Search HQ workspace" }
$Blank = Join-Path $Root 'templates\blank'
$bi = Get-Item -LiteralPath $Blank -Force -ErrorAction SilentlyContinue
if (-not $bi -or -not $bi.PSIsContainer -or $bi.LinkType) { Fail 'templates\blank\ is missing; nothing was created' }
$prefix = $bi.FullName.TrimEnd('\', '/').Length + 1

$n = 0; $failed = 0
$files = @(Get-ChildItem -LiteralPath $Blank -Recurse -File -Force | ForEach-Object { $_.FullName.Substring($prefix).Replace('\', '/') } |
  Where-Object { $_ -ne 'README.md' } | Sort-Object)
foreach ($rel in $files) {
  $dst = Join-Path $Root $rel
  # Present (or a link, even a broken one): leave it alone.
  if (Get-Item -LiteralPath $dst -Force -ErrorAction SilentlyContinue) { continue }
  $n++
  if ($DryRun) { Write-Output "would create: $rel"; continue }
  try {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $dst)) | Out-Null
    [IO.File]::Copy((Join-Path $Blank $rel), $dst, $false)
    if (-not $Quiet) { Write-Output "created: $rel" }
  } catch { $failed++; Write-Output "error: could not create $rel" }
}
# Empty folders the workflows expect.
foreach ($d in @('interviews', 'outbox', 'outbox\sent', 'outbox\discarded', 'imports')) {
  $p = Join-Path $Root $d
  if (-not $DryRun -and -not (Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue)) {
    try { [IO.Directory]::CreateDirectory($p) | Out-Null } catch {}
  }
}
if ($failed -gt 0) { Fail "$failed starter file(s) could not be created" }
if ($n -gt 0) {
  if ($DryRun) { Write-Output "init: would create $n file(s)" } else { Write-Output "init: created $n file(s)" }
} elseif (-not $Quiet) { Write-Output 'init: nothing to do' }
exit 0
