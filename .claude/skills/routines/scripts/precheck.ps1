# Scheduled routines: should this run skip? (PowerShell version of precheck.sh; keep them in step: the same
# rules, output and log line). Prints "GO" or "SKIP: <reason>"; on a skip it appends the line to history/routines.md.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\routines\scripts\precheck.ps1 -Routine "morning scan"
# Works in Windows PowerShell 5.1 and PowerShell 7 (Windows, macOS, Linux).
param([string]$Routine = '')
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
if ($Routine -eq '') { Write-Output 'error: no routine name (usage: precheck.ps1 -Routine "morning scan")'; exit 2 }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$culture = [Globalization.CultureInfo]::InvariantCulture
$now = Get-Date
$today = $now.ToString('yyyy-MM-dd', $culture)
$enc = New-Object System.Text.UTF8Encoding($false)
$prefsPath = Join-Path $root 'profile/preferences.md'
$prefs = if (Test-Path -LiteralPath $prefsPath -PathType Leaf) { ([IO.File]::ReadAllText($prefsPath, $enc)).Replace("`r", '') } else { $null }
$key = [regex]::Replace($Routine, '[A-Z]', { param($m) $m.Value.ToLowerInvariant() })
$isCert = $key -ceq 'certification reminder'
function Get-Pref([string]$name) {
    if ($null -eq $prefs) { return '' }
    $m = [regex]::Match($prefs, "(?m)^[ \t]*-?[ \t]*${name}:[ \t]*([^\n]*)")
    if (-not $m.Success) { return '' }
    return (($m.Groups[1].Value -replace '\s*<!--.*$', '') -replace '\s+$', '')
}
function Skip([string]$why) {
    $dir = Join-Path $root 'history'
    try {
        $null = [IO.Directory]::CreateDirectory($dir)
        $log = Join-Path $dir 'routines.md'
        if (-not (Test-Path -LiteralPath $log -PathType Leaf)) { [IO.File]::WriteAllText($log, "# Routine results`n`n", $enc) }
        [IO.File]::AppendAllText($log, ('- {0} {1} {2} {1} skipped: {3}' -f $now.ToString('yyyy-MM-dd HH:mm', $culture), [char]0x00B7, $Routine, $why) + "`n", $enc)
    } catch {}
    Write-Output "SKIP: $why"
    exit 0
}
# Days since a fixed start (the same formula as routine-status.sh).
function Get-DayNumber([string]$s) {
    $y = [int]$s.Substring(0, 4); $m = [int]$s.Substring(5, 2); $d = [int]$s.Substring(8, 2)
    if ($m -le 2) { $y--; $m += 12 }
    return 365 * $y + [Math]::Floor($y / 4) - [Math]::Floor($y / 100) + [Math]::Floor($y / 400) + [Math]::Floor((153 * ($m - 3) + 2) / 5) + $d
}

if ($null -eq $prefs -or $prefs -cmatch '(?m)^SETUP: not done') { Skip 'setup not done' }
if (Test-Path -LiteralPath (Join-Path $root '.sample-workspace') -PathType Leaf) { Skip 'sample workspace' }
$closed = $prefs -cmatch '(?m)^search_status:[ \t]*closed'
$until = ''; $resumed = $false
foreach ($ln in $prefs.Split("`n")) {
    if ($ln -cmatch '^[- ]*[0-9]{4}-[0-9]{2}-[0-9]{2}: search paused until ([0-9]{4}-[0-9]{2}-[0-9]{2})') { $until = $Matches[1]; $resumed = $false; continue }
    if ($ln -cmatch '^[- ]*[0-9]{4}-[0-9]{2}-[0-9]{2}: search resumed') { $resumed = $true }
}
$paused = $until -ne '' -and [string]::CompareOrdinal($until, $today) -gt 0 -and -not $resumed
if ($isCert) {
    $cert = Get-Pref 'benefits_cert_day'
    if ($cert -eq '') { Skip 'no certification day set; this routine can be deleted' }
    $wd = $cert.ToLowerInvariant()
    if (@('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') -ccontains $wd) {
        if ($wd -cne $now.DayOfWeek.ToString().ToLowerInvariant()) { Skip 'not certification day' }
    }
    Write-Output 'GO'; exit 0
}
if ($closed) { Skip 'search closed' }
if ($paused) { Skip 'search paused' }
if ($key -ceq 'weekly review') {
    $dir = Join-Path $root 'interviews'
    if (Test-Path -LiteralPath $dir -PathType Container) {
        foreach ($f in @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue)) {
            if ($f.Name -cmatch '^weekly-([0-9]{4}-[0-9]{2}-[0-9]{2})\.md$') {
                $x = (Get-DayNumber $today) - (Get-DayNumber $Matches[1])
                if ($x -ge 0 -and $x -le 6) { Skip 'already done this week' }
            }
        }
    }
}
Write-Output 'GO'
