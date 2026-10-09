# Codex SessionStart on Windows (port of session-start.sh + summary.sh). No bash needed.
param([string]$App = 'codex')
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$null = [Console]::In.ReadToEnd()
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
try { $hd = Join-Path $root '.claude/.health'; $null = [IO.Directory]::CreateDirectory($hd); [IO.File]::WriteAllText((Join-Path $hd 'last-session-start'), ('{0} {1}' -f [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), $App) + "`n") } catch {}
# First run (or a file was deleted): copy any missing starter file from templates\blank\. Never overwrites.
$init = ''
try {
    $initScript = Join-Path $root '.claude/skills/start/scripts/init-data.ps1'
    if (Test-Path -LiteralPath $initScript -PathType Leaf) { $init = (@(& $initScript -Quiet 2>$null) -join "`n") }
} catch { $init = "error: $($_.Exception.Message)" }
$culture = [Globalization.CultureInfo]::InvariantCulture
$today = (Get-Date).Date
$lines = New-Object 'System.Collections.Generic.List[string]'
function Read-Lines([string]$RelativePath) {
    $path = Join-Path $root $RelativePath
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        [IO.File]::ReadAllLines($path, [Text.Encoding]::UTF8)
    }
}
# Excel may save dates with slashes, in the order set by the region of the computer. Only an order
# that can be told apart (one part over 12, or both parts the same) is read, like summary.sh;
# 03/04/2026 sets $script:ambiguous and is skipped.
function Parse-Date([string]$Value) {
    $script:ambiguous = $false
    $v = $Value.Trim()
    $date = [datetime]::MinValue
    if ($v -match '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{2}|[0-9]{4})$') {
        $a = [int]$Matches[1]; $b = [int]$Matches[2]; $y = $Matches[3]
        if ($y.Length -eq 2) { $y = [string](2000 + [int]$y) }
        if ($a -ge 1 -and $b -ge 1 -and $a -le 31 -and $b -le 31) {
            if ($a -le 12 -and ($b -gt 12 -or $a -eq $b)) { $v = '{0}-{1:00}-{2:00}' -f $y, $a, $b }       # month/day
            elseif ($b -le 12 -and $a -gt 12) { $v = '{0}-{1:00}-{2:00}' -f $y, $b, $a }                   # day/month
            elseif ($a -le 12 -and $b -le 12) { $script:ambiguous = $true; return $null }
        }
    }
    if ([datetime]::TryParseExact($v, 'yyyy-MM-dd', $culture,
            [Globalization.DateTimeStyles]::None, [ref]$date)) { return $date.Date }
    return $null
}
$ambiguousDates = 0
$preferences = @(Read-Lines 'profile/preferences.md')
$lines.Add(('Today is {0} ({1}).' -f $today.ToString('dddd, MMMM dd, yyyy', $culture), $today.ToString('yyyy-MM-dd', $culture)))
if ($init -match 'init: created (.*)') {
    $lines.Add("Missing starter files were just set up from the blank copies ($($Matches[1])). In a new folder that's normal (first run); otherwise tell the user a personal file was missing and came back blank.")
} elseif ($init -match 'error:') {
    $lines.Add('Some starter files could not be set up. Tell the user, and run .claude\skills\start\scripts\init-data.ps1 to see why.')
}
if ($preferences.Count -eq 0 -or $preferences -cmatch '^SETUP: not done') {
    $lines.Add('The user has not finished setup. When they first write, welcome them in one or two sentences and suggest $start, or just say "set me up" (about 15 to 20 minutes).')
}
$tracker = Join-Path $root 'jobs/tracker.csv'
$hasTracker = Test-Path -LiteralPath $tracker -PathType Leaf
$jobs = Join-Path $root 'jobs'
if (Test-Path -LiteralPath $jobs -PathType Container) {
    foreach ($file in (Get-ChildItem -LiteralPath $jobs -File | Sort-Object Name)) {
        if ($file.Extension -in @('.xlsx', '.xls') -and
            (-not $hasTracker -or $file.LastWriteTimeUtc -gt (Get-Item -LiteralPath $tracker).LastWriteTimeUtc)) {
            $lines.Add("The user saved jobs/$($file.Name) after jobs/tracker.csv; their newest edits may be in that file. Ask before changing the tracker, and offer to copy them in.")
        }
    }
}
# Only top-level, non-underscore .md files with closed front matter count.
$drafts = 0
$outbox = Join-Path $root 'outbox'
if (Test-Path -LiteralPath $outbox -PathType Container) {
    foreach ($file in (Get-ChildItem -LiteralPath $outbox -File -Filter '*.md')) {
        if ($file.Name -cmatch '^[_.]' -or $file.Name -cnotlike '*.md') { continue }
        $content = @([IO.File]::ReadAllLines($file.FullName, [Text.Encoding]::UTF8))
        if ($content.Count -eq 0 -or $content[0] -cnotmatch '^---') { continue }
        $status = ''
        for ($i = 1; $i -lt $content.Count; $i++) {
            if ($content[$i] -cmatch '^---') {
                if ($status -eq '' -or $status -eq 'draft') { $drafts++ }  # -eq ignores case, like summary.sh
                break
            }
            if ($content[$i] -cmatch '^status:') {
                $status = ($content[$i] -creplace '^status:[ \t]*', '') -creplace '[ \t#].*$', ''
            }
        }
    }
}
if ($preferences -cmatch '^search_status: closed') {
    $lines.Add('search closed. Congratulations!')
} elseif (-not $hasTracker) {
    $lines.Add('no tracker')
} else {
    # summary.sh's exact open set; all other statuses (including closed ones) are excluded.
    $open = @('interested', 'applied', 'screening', 'interviewing', 'offer')
    $counts = @{}
    foreach ($status in $open) { $counts[$status] = 0 }
    # One list in tracker order, like summary.sh: due/overdue items and deadlines within 3 days.
    $due = New-Object 'System.Collections.Generic.List[string]'
    $total = 0
    $readFailed = $false
    try { $rows = @(Import-Csv -LiteralPath $tracker -Encoding UTF8 -WarningAction SilentlyContinue -ErrorAction Stop) }
    catch { $rows = @(); $readFailed = $true }
    foreach ($row in $rows) {
        if ([string]$row.company -eq '') { continue }
        $total++
        $status = ([string]$row.status).Trim().ToLowerInvariant()
        if ($status -notin $open) { continue }
        $counts[$status]++
        $date = Parse-Date ([string]$row.next_action_date)
        if ($script:ambiguous) { $ambiguousDates++ }
        if ($null -ne $date -and $date -le $today) {
            $due.Add(('- {0} ({1}): {2} [due {3}]' -f $row.company, $row.role, $row.next_action, $date.ToString('yyyy-MM-dd', $culture)))
        }
        if ($status -in @('interested','offer') -and -not ($null -ne $date -and $date -le $today)) {
            $deadline = Parse-Date ([string]$row.deadline)
            if ($script:ambiguous) { $ambiguousDates++ }
            if ($null -ne $deadline -and $deadline -le $today.AddDays(3)) {
                $verb = if ($status -eq 'offer') { 'answer the offer' } else { 'apply' }
                $due.Add(('- {0} ({1}): {2} [deadline {3}]' -f $row.company, $row.role, $verb, $deadline.ToString('yyyy-MM-dd', $culture)))
            }
        }
    }
    if ($readFailed) {
        $lines.Add('Could not read jobs/tracker.csv (it may be open in Excel). Read it yourself before saying anything about the pipeline.')
    } elseif ($total -eq 0 -and $drafts -eq 0) {
        $lines.Add('Pipeline: nothing tracked yet.')
    } else {
        $pipeline = 'Pipeline: {0} applied, {1} interviewing' -f ($counts['applied'] + $counts['screening']), $counts['interviewing']
        if ($counts['offer'] -gt 0) { $pipeline += ', {0} offer(s)' -f $counts['offer'] }
        $pipeline += ', {0} to apply' -f $counts['interested']
        if ($due.Count -gt 0) { $pipeline += ', {0} due' -f $due.Count }
        if ($drafts -gt 0) { $pipeline += ', {0} in Outbox' -f $drafts }
        $lines.Add($pipeline)
        if ($due.Count -gt 0) {
            $lines.Add('Due today, overdue, or deadline within 3 days:')
            for ($k = 0; $k -lt $due.Count -and $k -lt 10; $k++) { $lines.Add($due[$k]) }
            if ($due.Count -gt 10) { $lines.Add(('- ...and {0} more' -f ($due.Count - 10))) }
        }
        if ($ambiguousDates -gt 0) {
            $lines.Add('Some open jobs have dates like 03/04/2026 that could be day/month or month/day, so they were left out above. Ask the user what they mean before giving deadline advice, then save them as YYYY-MM-DD.')
        }
    }
}
$autonomy = ''; $outboxMode = ''
foreach ($line in $preferences) {
    if ($line -cmatch '^autonomy:\s*([a-z-]*)') { $autonomy = $Matches[1]; break }
}
foreach ($line in $preferences) {
    if ($line -cmatch '^outbox_mode:\s*([a-z-]*)') { $outboxMode = $Matches[1]; break }
}
$lines.Add("Autonomy: $autonomy. Outbox mode: $outboxMode.")
$recent = @(Read-Lines 'history/activity.md' | Where-Object { $_ -cmatch '^- [0-9]{4}-' } | Select-Object -Last 8)
if ($recent.Count -gt 0) {
    $lines.Add('Recent activity (from either app; newest last):')
    foreach ($item in $recent) { $lines.Add($item) }
}
$result = @{ hookSpecificOutput = @{
    hookEventName = 'SessionStart'
    additionalContext = ($lines -join "`n").Replace("`t", ' ')
} }
$json = [regex]::Replace(($result | ConvertTo-Json -Compress -Depth 5), '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })  # ASCII-only JSON survives any console code page
    [Console]::Out.Write($json + "`n")
exit 0
