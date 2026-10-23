# Which routines have stopped running, from history/routines.md (PowerShell version of routine-status.sh;
# keep them in step). Read-only. Prints one tab-separated line per routine, in the order each first
# appears in the log: <state> <name> <last> <date> <cadence> (see routine-status.sh for the rules).
# session-start.ps1 and health.ps1 use this.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\routines\scripts\routine-status.ps1
# Works in Windows PowerShell 5.1 and PowerShell 7 (Windows, macOS, Linux).
# UTF-8 output, so a routine name with accents reads the same as from the bash version (Windows PowerShell 5.1
# otherwise writes in the console's code page).
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$log = Join-Path $root 'history/routines.md'
if (-not (Test-Path -LiteralPath $log -PathType Leaf)) { exit 0 }
# Days since a fixed start, for a real YYYY-MM-DD date (else 0); the same formula as the bash version.
function Get-DayNumber([string]$s) {
    $y = [int]$s.Substring(0, 4); $m = [int]$s.Substring(5, 2); $d = [int]$s.Substring(8, 2)
    if ($m -lt 1 -or $m -gt 12 -or $d -lt 1) { return 0 }
    if ($m -eq 2) { $dim = if (($y % 4 -eq 0) -and (($y % 100 -ne 0) -or ($y % 400 -eq 0))) { 29 } else { 28 } }
    elseif ($m -eq 4 -or $m -eq 6 -or $m -eq 9 -or $m -eq 11) { $dim = 30 } else { $dim = 31 }
    if ($d -gt $dim) { return 0 }
    if ($m -le 2) { $y--; $m += 12 }
    return 365 * $y + [Math]::Floor($y / 4) - [Math]::Floor($y / 100) + [Math]::Floor($y / 400) + [Math]::Floor((153 * ($m - 3) + 2) / 5) + $d
}
function Get-Cadence([string]$s) {
    if ($s.Contains('fortnightly')) { return 'fortnightly' }
    if ($s.Contains('weekdays')) { return 'weekdays' }
    if ($s.Contains('daily')) { return 'daily' }
    if ($s.Contains('weekly')) { return 'weekly' }
    return ''
}
# Lowercase A-Z only, like awk's tolower under LC_ALL=C, so both versions match names the same way.
function Get-Key([string]$s) { return [regex]::Replace($s, '[A-Z]', { param($m) $m.Value.ToLowerInvariant() }) }
$sep = ' ' + [char]0x00B7 + ' '
$order = New-Object 'System.Collections.Generic.List[string]'
# Exact-match tables (a plain @{} ignores case, which would merge names the bash version keeps apart).
function New-Table { return ,(New-Object System.Collections.Hashtable ([StringComparer]::Ordinal)) }
$name = New-Table; $stop = New-Table; $cad = New-Table; $ran = New-Table; $run = New-Table; $admin = New-Table; $setup = New-Table
$lines = @()
try { $lines = [IO.File]::ReadAllLines($log, [Text.Encoding]::UTF8) } catch { exit 0 }
foreach ($ln in $lines) {
    $ln = $ln.TrimStart([char]0xFEFF).TrimEnd("`r")
    if ($ln -cnotmatch '^- ([0-9]{4}-[0-9]{2}-[0-9]{2}) [0-9]{2}:[0-9]{2}( |$)') { continue }
    $dt = $Matches[1]
    if ((Get-DayNumber $dt) -eq 0) { continue }
    $rest = $ln.Substring(18).Trim()
    if ($rest.StartsWith($sep.Trim())) { $rest = $rest.Substring($sep.Trim().Length).Trim() }
    $i = $rest.IndexOf($sep)
    if ($i -ge 0) { $nm = $rest.Substring(0, $i).Trim(); $rs = Get-Key $rest.Substring($i + $sep.Length).Trim() } else { $nm = $rest.Trim(); $rs = '' }
    $k = Get-Key $nm
    if ($nm -eq '' -or $k -ceq 'routines') { continue }
    if (-not $name.ContainsKey($k)) { $order.Add($k); $stop[$k] = $false; $ran[$k] = $false; $cad[$k] = ''; $run[$k] = ''; $admin[$k] = ''; $setup[$k] = '' }
    $name[$k] = $nm
    if ($rs -cmatch '^(paused|deleted)') { $stop[$k] = $true; continue }
    if ($rs.StartsWith('set up')) {
        $stop[$k] = $false; $setup[$k] = $dt; $admin[$k] = $dt; $ran[$k] = $false
        $c = Get-Cadence $rs; if ($c -ne '') { $cad[$k] = $c }
        continue
    }
    if ($rs.StartsWith('changed')) { $admin[$k] = $dt; $c = Get-Cadence $rs; if ($c -ne '') { $cad[$k] = $c }; continue }
    if ($rs.StartsWith('resumed')) { $stop[$k] = $false; $admin[$k] = $dt; continue }
    $run[$k] = $dt; $ran[$k] = $true
}
$t = Get-DayNumber ((Get-Date).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture))
foreach ($k in $order) {
    $c = $cad[$k]
    if ($c -eq '') {
        if ($k -ceq 'morning scan' -or $k -ceq 'follow-up drafts') { $c = 'weekdays' }
        elseif ($k -ceq 'inbox check') { $c = 'daily' }
        else { $c = 'weekly' }
    }
    $lim = if ($c -eq 'daily') { 2 } elseif ($c -eq 'weekdays') { 4 } elseif ($c -eq 'fortnightly') { 16 } else { 9 }
    $ref = $run[$k]; if ([string]::CompareOrdinal($admin[$k], $ref) -gt 0) { $ref = $admin[$k] }
    if ($ref -eq '') { $st = 'stopped' } else {
        $age = $t - (Get-DayNumber $ref)
        $st = if ($stop[$k]) { 'stopped' } elseif ($age -gt 45) { 'inactive' } elseif ($age -gt $lim) { 'stalled' } else { 'ok' }
    }
    if ($ran[$k]) { $kind = 'run'; $when = $run[$k] } else { $kind = 'setup'; $when = if ($setup[$k] -ne '') { $setup[$k] } else { $ref } }
    Write-Output ("{0}`t{1}`t{2}`t{3}`t{4}" -f $st, $name[$k], $kind, $when, $c)
}
exit 0
