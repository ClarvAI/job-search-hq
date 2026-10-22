# Codex SessionStart on Windows (port of session-start.sh + summary.sh; keep them in step). No bash needed.
param([string]$App = 'codex')
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$hookInput = [Console]::In.ReadToEnd()
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
# Marker for /health: when hooks last ran, for which app, in which session.
$sessionId = ''
if ($hookInput -match '"session_id"\s*:\s*"([A-Za-z0-9_.:-]{1,100})"') { $sessionId = $Matches[1] }
try { $hd = Join-Path $root '.claude/.health'; $null = [IO.Directory]::CreateDirectory($hd); [IO.File]::WriteAllText((Join-Path $hd 'last-session-start'), ('{0} {1} {2}' -f [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), $App, $sessionId).TrimEnd() + "`n") } catch {}
# First run (or a file was deleted): copy any missing starter file from templates\blank\. Never overwrites.
$init = ''
try {
    $initScript = Join-Path $root '.claude/skills/start/scripts/init-data.ps1'
    if (Test-Path -LiteralPath $initScript -PathType Leaf) { $init = (@(& $initScript -Quiet 2>$null) -join "`n") }
} catch { $init = "error: $($_.Exception.Message)" }
$culture = [Globalization.CultureInfo]::InvariantCulture
$today = (Get-Date).Date
$todayIso = $today.ToString('yyyy-MM-dd', $culture)
$lines = New-Object 'System.Collections.Generic.List[string]'
# The try-it sample workspace (made by the tour) carries this marker file.
if (Test-Path -LiteralPath (Join-Path $root '.sample-workspace') -PathType Leaf) { $lines.Add("This is the SAMPLE workspace (made-up data). Don't run setup or save the user's details here; their own folder is separate.") }
function Read-Lines([string]$RelativePath) {
    $path = Join-Path $root $RelativePath
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        [IO.File]::ReadAllLines($path, [Text.Encoding]::UTF8)
    }
}
$preferences = @(Read-Lines 'profile/preferences.md')
# The value on the first "key:" line of the preferences ("" when blank).
function Get-Pref([string]$Key) {
    foreach ($l in $preferences) {
        if ($l -cmatch ('^' + [regex]::Escape($Key) + ':[ \t]*(.*)$')) { return (($Matches[1] -replace '\s*<!--.*$', '').Trim()) }
    }
    return ''
}
function Test-Iso([string]$s) {
    if ($s -notmatch '^([0-9]{4})-([0-9]{2})-([0-9]{2})$') { return $false }
    return (Get-Mk ([int]$Matches[1]) ([int]$Matches[2]) ([int]$Matches[3])) -eq $s   # also rejects impossible days (Feb 31)
}
function Get-Mk([int]$y, [int]$m, [int]$d) {
    if ($m -lt 1 -or $m -gt 12 -or $d -lt 1 -or $d -gt 31) { return '' }
    $md = 31
    if ($m -in @(4, 6, 9, 11)) { $md = 30 }
    elseif ($m -eq 2) { if (($y % 4 -eq 0 -and $y % 100 -ne 0) -or $y % 400 -eq 0) { $md = 29 } else { $md = 28 } }
    if ($d -gt $md) { return '' }                        # a day that doesn't exist (e.g. Feb 31) is not a real date
    return '{0:0000}-{1:00}-{2:00}' -f $y, $m, $d
}
# The order a slash date proves by itself (a part over 12, the other a month): MDY, DMY, or ''.
function Get-SlashOrder([string]$Value) {
    if ($Value.Trim() -notmatch '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{2}|[0-9]{4})$') { return '' }
    $a = [int]$Matches[1]; $b = [int]$Matches[2]
    if ($a -gt 12 -and $b -ge 1 -and $b -le 12) { return 'DMY' }
    if ($b -gt 12 -and $a -ge 1 -and $a -le 12) { return 'MDY' }
    return ''
}
# Dates (the same rules as csvdate.ts in the panels): YYYY-MM-DD always; YYYY/MM/DD always year first;
# D.M.YYYY always day first; a slash date by its own parts (a part over 12, or both equal), else by
# another slash date in the same row ($script:rowOrder), else by date_order in the preferences;
# otherwise it is "date unclear" ($script:ambiguous), never alerted on. A date that can't be read
# comes back as written.
function Get-Iso([string]$Value) {
    $script:ambiguous = $false
    $v = $Value.Trim()
    $r = ''
    if ($v -match '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$') { $r = Get-Mk ([int]$Matches[1]) ([int]$Matches[2]) ([int]$Matches[3]) }
    elseif ($v -match '^([0-9]{4})/([0-9]{1,2})/([0-9]{1,2})$') { $r = Get-Mk ([int]$Matches[1]) ([int]$Matches[2]) ([int]$Matches[3]) }
    elseif ($v -match '^([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{2}|[0-9]{4})$') {
        $y = [int]$Matches[3]; if ($Matches[3].Length -eq 2) { $y += 2000 }
        $r = Get-Mk $y ([int]$Matches[2]) ([int]$Matches[1])
    } elseif ($v -match '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{2}|[0-9]{4})$') {
        $a = [int]$Matches[1]; $b = [int]$Matches[2]; $y = [int]$Matches[3]; if ($Matches[3].Length -eq 2) { $y += 2000 }
        if ($a -eq $b) { $r = Get-Mk $y $a $b }
        elseif ($a -gt 12) { $r = Get-Mk $y $b $a }
        elseif ($b -gt 12) { $r = Get-Mk $y $a $b }
        else {
            $o = $script:rowOrder; if ($o -eq '') { $o = $dateOrder }
            if ($o -eq 'MDY') { $r = Get-Mk $y $a $b }
            elseif ($o -eq 'DMY') { $r = Get-Mk $y $b $a }
            else { $script:ambiguous = $true; return $v }
        }
    } else { return $v }
    if ($r) { return $r } else { return $v }
}
# "Also: Interview 2026-10-12" at the start of a job's notes: a second dated commitment (csvdate.ts alsoOf).
function Get-Also([string]$Notes) {
    if ($Notes -notmatch '^\s*Also:\s*([^;|]*?)\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[./][0-9]{1,2}[./](?:[0-9]{4}|[0-9]{2}))\b') { return $null }
    $text = ($Matches[1].Trim() + ' ' + $Matches[2]).Trim()
    $d = Get-Iso $Matches[2]
    if (-not (Test-Iso $d)) { $d = '' }
    return @{ Text = $text; Date = $d; Unclear = $script:ambiguous }
}
function Get-DayDiff([string]$From, [string]$To) {  # days from one YYYY-MM-DD to another
    $f = [datetime]::MinValue; $t = [datetime]::MinValue
    if (-not [datetime]::TryParseExact($From, 'yyyy-MM-dd', $culture, [Globalization.DateTimeStyles]::None, [ref]$f)) { return $null }
    if (-not [datetime]::TryParseExact($To, 'yyyy-MM-dd', $culture, [Globalization.DateTimeStyles]::None, [ref]$t)) { return $null }
    return [int]($t - $f).TotalDays
}
# CSV: a double quote opens a quoted cell only as the first character of a cell; anywhere else it is
# an ordinary character. A quoted cell may run over several lines. Sets $script:csvOpenQuote when the
# file ends inside a quoted cell.
# Rows with nothing but blanks don't count (not even as the header).
function Select-NonBlank($Rows) {
    $keep = New-Object 'System.Collections.Generic.List[object]'
    foreach ($r in $Rows) { foreach ($c in $r) { if ($c.Trim().TrimStart([char]0xFEFF) -ne '') { $keep.Add($r); break } } }
    return , $keep
}
function Read-Csv([string]$Text) {
    $Text = $Text.TrimStart([char]0xFEFF)
    $script:csvOpenQuote = $false
    $rows = New-Object 'System.Collections.Generic.List[object]'
    if ($Text.IndexOf('"') -lt 0) {
        foreach ($l in ($Text -split "`r`n|`r|`n")) { $rows.Add([string[]]($l -split ',')) }
        return , (Select-NonBlank $rows)
    }
    $cells = New-Object 'System.Collections.Generic.List[string]'
    $sb = New-Object System.Text.StringBuilder
    $q = $false; $cs = $true; $len = $Text.Length
    for ($i = 0; $i -lt $len; $i++) {
        $c = $Text[$i]
        if ($q) {
            if ($c -eq '"') { if ($i + 1 -lt $len -and $Text[$i + 1] -eq '"') { [void]$sb.Append('"'); $i++ } else { $q = $false } }
            else { [void]$sb.Append($c) }
        } elseif ($c -eq '"' -and $cs) { $q = $true; $cs = $false }
        elseif ($c -eq ',') { $cells.Add($sb.ToString()); [void]$sb.Clear(); $cs = $true }
        elseif ($c -eq "`r" -or $c -eq "`n") { $cells.Add($sb.ToString()); [void]$sb.Clear(); $rows.Add($cells.ToArray()); $cells.Clear(); $cs = $true }
        else { [void]$sb.Append($c); $cs = $false }
    }
    if ($q) { $script:csvOpenQuote = $true }
    if ($sb.Length -gt 0 -or $cells.Count -gt 0) { $cells.Add($sb.ToString()); $rows.Add($cells.ToArray()) }
    return , (Select-NonBlank $rows)
}
# date_order (csvdate.ts dateOrder): the first "date_order:" line outside HTML comments, optionally
# written as a list item ("- date_order: DMY"); MDY, DMY or YMD in any case; anything else = unknown.
$dateOrder = ''
$prefText = [regex]::Replace(($preferences -join "`n"), '<!--[\s\S]*?-->', '')
$dm = [regex]::Match($prefText, '(?mi)^[ \t]*(?:[-*][ \t]+)?date_order:[ \t]*`?([A-Za-z]{3})\b')
if ($dm.Success -and $dm.Groups[1].Value -match '^(mdy|dmy|ymd)$') { $dateOrder = $dm.Groups[1].Value.ToUpperInvariant() }
$closed = (Get-Pref 'search_status') -like 'closed*'
$lines.Add(('Today is {0} ({1}).' -f $today.ToString('dddd, MMMM dd, yyyy', $culture), $todayIso))
if ($init -match 'init: created (.*)') {
    $lines.Add("Missing starter files were just set up from the blank copies ($($Matches[1])). In a new folder that's normal (first run); otherwise tell the user a personal file was missing and came back blank.")
} elseif ($init -match 'error:') {
    $lines.Add('Some starter files could not be set up. Tell the user, and run .claude\skills\start\scripts\init-data.ps1 to see why.')
}
# The setup checklist (finished sections) lives in profile/setup-progress.md; a folder set up with an
# earlier version may still have the line in preferences.md, which counts while the new file is blank.
$progress = ''
foreach ($l in @(Read-Lines 'profile/setup-progress.md')) {
    if ($l -cmatch '^setup_progress:[ \t]*(.*)$') { $progress = (($Matches[1] -replace '\s*<!--.*$', '').Trim()); break }
}
if ($progress -eq '') { $progress = Get-Pref 'setup_progress' }
if ($preferences.Count -eq 0 -or $preferences -cmatch '^SETUP: not done') {
    if ($progress -ne '') {
        $lines.Add("The user started setup but stopped partway (done so far: $progress). When they first write, offer to pick up where they left off with `$start; it skips the parts already done.")
    } else {
        $lines.Add('The user has not finished setup. When they first write, welcome them in one or two sentences and suggest $start, or just say "set me up" (about 15 to 20 minutes).')
    }
}
# Essentials done, but some later setup sections not yet (only when the checklist lists something:
# done with nothing listed means setup finished before the checklist existed).
if ($preferences.Count -gt 0 -and -not ($preferences -cmatch '^SETUP: not done') -and $progress -ne '') {
    $done = @($progress -split ',' | ForEach-Object { $_.Trim() })
    $left = @('resume', 'status', 'preferences', 'field-pack', 'story', 'forms', 'look', 'first-week') | Where-Object { $done -notcontains $_ }
    if (@($left).Count -gt 0) {
        $lines.Add("Setup is done, but some setup sections were skipped or not reached yet ($(@($left) -join ', ')). When it fits, offer once to pick them up with `$start; it skips the parts already done.")
    }
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
# Only top-level, non-underscore .md files with closed front matter count. Also counts Gmail drafts
# (status in-gmail-drafts) made more than 2 days ago (status_at, else created), like summary.sh.
$drafts = 0
$gmailOld = 0
$outbox = Join-Path $root 'outbox'
function Get-HeadValue([string]$Line, [string]$Key) {
    $v = ($Line -creplace ('^' + $Key + ':[ \t]*'), '') -replace '[ \t]+#.*$', ''
    return ($v -replace '^["'']|["'']$', '')
}
if (Test-Path -LiteralPath $outbox -PathType Container) {
    foreach ($file in (Get-ChildItem -LiteralPath $outbox -File -Filter '*.md')) {
        if ($file.Name -cmatch '^[_.]' -or $file.Name -cnotlike '*.md') { continue }
        $content = @([IO.File]::ReadAllLines($file.FullName, [Text.Encoding]::UTF8))
        if ($content.Count -eq 0 -or $content[0] -cnotmatch '^---') { continue }
        $status = ''; $statusAt = ''; $created = ''
        for ($i = 1; $i -lt $content.Count; $i++) {
            if ($content[$i] -cmatch '^---') {
                if ($status -eq '' -or $status -eq 'draft') { $drafts++ }  # -eq ignores case, like summary.sh
                if ($status -eq 'in-gmail-drafts') {
                    $since = if ($statusAt -ne '') { $statusAt } else { $created }
                    if ($since.Length -ge 10) { $since = $since.Substring(0, 10) }
                    $waited = Get-DayDiff $since $todayIso
                    if ($null -ne $waited -and $waited -gt 2) { $gmailOld++ }
                }
                break
            }
            if ($content[$i] -cmatch '^status:') {
                $status = ($content[$i] -creplace '^status:[ \t]*', '') -creplace '[ \t#].*$', ''
            }
            if ($content[$i] -cmatch '^status_at:') { $statusAt = Get-HeadValue $content[$i] 'status_at' }
            if ($content[$i] -cmatch '^created:') { $created = Get-HeadValue $content[$i] 'created' }
        }
    }
}
if (-not $hasTracker) {
    if ($closed) { $lines.Add('search closed. Congratulations!') } else { $lines.Add('no tracker') }
} else {
    $readFailed = $false
    $rows = $null
    try { $rows = Read-Csv ([IO.File]::ReadAllText($tracker, [Text.Encoding]::UTF8)) } catch { $readFailed = $true }
    $header = @{}
    $semicolons = $false
    if (-not $readFailed -and $rows.Count -gt 0) {
        $h = $rows[0]
        if ($h.Count -gt 0) { $h[0] = $h[0].TrimStart([char]0xFEFF) }
        if ($h.Count -eq 1 -and $h[0].Split(';').Count -ge 3) { $semicolons = $true }
        for ($k = 0; $k -lt $h.Count; $k++) { $name = $h[$k].Trim().ToLowerInvariant(); if (-not $header.ContainsKey($name)) { $header[$name] = $k } }
    }
    if ($readFailed) {
        $lines.Add('Could not read jobs/tracker.csv (it may be open in Excel). Read it yourself before saying anything about the pipeline.')
    } elseif ($semicolons) {
        $lines.Add('jobs/tracker.csv was saved with semicolons between the columns instead of commas (Excel does this in many European regions), so it can''t be read safely. Ask the assistant to fix it. (Assistant: tell the user this, and offer to convert it back to commas; the panels will not save to it until then.)')
    } elseif ($script:csvOpenQuote) {
        $lines.Add('jobs/tracker.csv looks damaged: a cell starts with a double quote that is never closed, so the rows after it run together and the panels will not save to it. Read the file, find the unfinished quote, and show the user the fix before changing anything.')
    } elseif (-not ($header.ContainsKey('company') -and $header.ContainsKey('status'))) {
        $lines.Add('jobs/tracker.csv does not start with the usual header row (company,role,status,...), so it cannot be read. Read it and offer the user a fix before changing anything.')
    } else {
        $open = @('interested', 'applied', 'screening', 'interviewing', 'offer')
        $counts = @{}
        $total = 0; $openCount = 0
        # Due items, ranked: 0 = offers and overdue layoff-plan steps, 1 = interviews, take-homes and
        # deadlines, 2 = everything else; earliest date first within a rank (like summary.sh).
        $due = New-Object 'System.Collections.Generic.List[object]'
        $passed = New-Object 'System.Collections.Generic.List[string]'
        $unclear = New-Object 'System.Collections.Generic.List[string]'
        $withdraw = New-Object 'System.Collections.Generic.List[string]'
        $jobStatus = @{}
        for ($r = 1; $r -lt $rows.Count; $r++) {
            $row = $rows[$r]
            $get = { param($n) if ($header.ContainsKey($n) -and $header[$n] -lt $row.Count) { [string]$row[$header[$n]] } else { '' } }
            $company = (& $get 'company').Trim()
            if ($company -eq '') { continue }
            $total++
            $status = (& $get 'status').Trim().ToLowerInvariant()
            $folderKey = (& $get 'folder').Trim().ToLowerInvariant()
            if ($folderKey -ne '') { $jobStatus[$folderKey] = $status }   # a contact tied to this job folder follows its status
            if ($counts.ContainsKey($status)) { $counts[$status]++ } else { $counts[$status] = 1 }
            if ((& $get 'next_action') -match '^\s*send withdrawal') { $withdraw.Add("$company ($(& $get 'role'))") }
            # A finished search keeps one reminder: a signed contract's "Decide next step" about four weeks before it
            # ends (knowledge/freelance-and-contract.md); due like any next step, but not an open application (like summary.sh).
            if ($status -eq 'accepted' -and (& $get 'next_action') -match '^\s*decide next step') {
                $script:rowOrder = ''
                foreach ($cell in $row) {
                    $o = Get-SlashOrder ([string]$cell)
                    if ($o -eq '') { continue }
                    if ($script:rowOrder -eq '' -or $script:rowOrder -eq $o) { $script:rowOrder = $o } else { $script:rowOrder = '?'; break }
                }
                if ($script:rowOrder -eq '?') { $script:rowOrder = '' }
                $cd = Get-Iso (& $get 'next_action_date')
                if ($script:ambiguous) { $unclear.Add("$company ($(& $get 'role')): next step $cd") }
                elseif ((Test-Iso $cd) -and $cd -le $todayIso) { $due.Add([pscustomobject]@{ Rank = 2; Date = $cd; Order = $due.Count; Text = "$company ($(& $get 'role')): $(& $get 'next_action') [due $cd]" }) }
                continue
            }
            if ($status -notin $open) { continue }
            $openCount++
            $role = & $get 'role'; $act = & $get 'next_action'
            $script:rowOrder = ''
            foreach ($cell in $row) {
                $o = Get-SlashOrder ([string]$cell)
                if ($o -eq '') { continue }
                if ($script:rowOrder -eq '' -or $script:rowOrder -eq $o) { $script:rowOrder = $o } else { $script:rowOrder = '?'; break }
            }
            if ($script:rowOrder -eq '?') { $script:rowOrder = '' }
            $d = Get-Iso (& $get 'next_action_date')
            if ($script:ambiguous) { $unclear.Add("$company ($role): next step $d") }
            $dl = Get-Iso (& $get 'deadline')
            if ($script:ambiguous) { $unclear.Add("$company ($role): deadline $dl") }
            $also = Get-Also (& $get 'notes')
            if ($null -ne $also) {
                if ($also.Unclear) { $unclear.Add("$company ($role): $($also.Text)") }
                elseif ($also.Date -ne '' -and $also.Date -le $todayIso) {
                    $ar = if ($status -eq 'offer') { 0 } elseif ($also.Text -match 'interview|take-home') { 1 } else { 2 }
                    $due.Add([pscustomobject]@{ Rank = $ar; Date = $also.Date; Order = $due.Count; Text = "$company ($role): $($also.Text) [due $($also.Date)]" })
                }
            }
            if ($status -eq 'interested' -and (Test-Iso $dl) -and $dl -lt $todayIso) { $passed.Add("$company ($role) [deadline $dl]"); continue }
            $rank = 2; $text = ''; $extra = ''; $nd = ''
            if ((Test-Iso $d) -and $d -le $todayIso) { $text = "$act [due $d]"; $nd = $d }
            $dlDays = $null; if (Test-Iso $dl) { $dlDays = Get-DayDiff $todayIso $dl }
            if ($null -ne $dlDays -and $dlDays -le 3) {
                if ($status -eq 'offer') { $extra = "answer the offer by $dl"; if ($dl -lt $todayIso) { $extra += ' (passed)' } }
                elseif ($status -eq 'interested') { $extra = "apply by $dl" }
                if ($extra -ne '') { $rank = 1; if ($nd -eq '' -or $dl -lt $nd) { $nd = $dl } }
            }
            if ($text -eq '' -and $extra -eq '') { continue }
            if ($status -eq 'offer') { $rank = 0 } elseif ($act -match 'interview|take-home') { $rank = 1 }
            $sep = if ($text -ne '' -and $extra -ne '') { '; ' } else { '' }
            $due.Add([pscustomobject]@{ Rank = $rank; Date = $nd; Order = $due.Count; Text = "$company ($role): $text$sep$extra" })
        }
        # Contacts: networking follow-ups due today or earlier, by the playbook rules the Contacts board
        # and due alerts use (like summary.sh): not cold; not after 2 unanswered messages (to-contact /
        # contacted); not when the linked job is applied or later (its tracker row owns the follow-up).
        $contactDue = 0; $contactNames = New-Object 'System.Collections.Generic.List[string]'; $contactBad = ''
        $contactsPath = Join-Path $root 'contacts/contacts.csv'
        if (Test-Path -LiteralPath $contactsPath -PathType Leaf) {
            $crows = $null
            try { $crows = Read-Csv ([IO.File]::ReadAllText($contactsPath, [Text.Encoding]::UTF8)) } catch { $crows = $null }
            if ($null -ne $crows -and $crows.Count -gt 0) {
                $ch = $crows[0]; if ($ch.Count -gt 0) { $ch[0] = $ch[0].TrimStart([char]0xFEFF) }
                if ($ch.Count -eq 1 -and $ch[0].Split(';').Count -ge 3) { $contactBad = 'semicolons' }
                elseif ($script:csvOpenQuote) { $contactBad = 'open-quote' }
                else {
                    $cHeader = @{}
                    for ($k = 0; $k -lt $ch.Count; $k++) { $name = $ch[$k].Trim().ToLowerInvariant(); if (-not $cHeader.ContainsKey($name)) { $cHeader[$name] = $k } }
                    $owned = @('applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted')
                    for ($r = 1; $r -lt $crows.Count; $r++) {
                        $row = $crows[$r]
                        $cget = { param($n) if ($cHeader.ContainsKey($n) -and $cHeader[$n] -lt $row.Count) { [string]$row[$cHeader[$n]] } else { '' } }
                        $cname = (& $cget 'name').Trim(); if ($cname -eq '') { continue }
                        $cstatus = (& $cget 'status').Trim().ToLowerInvariant(); if ($cstatus -eq '') { $cstatus = 'to-contact' }
                        if ($cstatus -eq 'cold') { continue }
                        $touches = 0; if ((& $cget 'touches').Trim() -match '^[0-9]+') { $touches = [int]$Matches[0] }
                        if ($cstatus -in @('to-contact', 'contacted') -and $touches -ge 2) { continue }
                        $cjob = (& $cget 'job').Trim().ToLowerInvariant()
                        if ($cjob -ne '' -and $jobStatus.ContainsKey($cjob) -and $jobStatus[$cjob] -in $owned) { continue }
                        $script:rowOrder = ''
                        foreach ($cell in $row) {
                            $o = Get-SlashOrder ([string]$cell)
                            if ($o -eq '') { continue }
                            if ($script:rowOrder -eq '' -or $script:rowOrder -eq $o) { $script:rowOrder = $o } else { $script:rowOrder = '?'; break }
                        }
                        if ($script:rowOrder -eq '?') { $script:rowOrder = '' }
                        $fu = Get-Iso (& $cget 'next_followup')
                        if ($script:ambiguous) { $unclear.Add("$cname (contact): follow-up $fu"); continue }
                        if (-not (Test-Iso $fu) -or $fu -gt $todayIso) { continue }
                        $contactDue++
                        if ($contactDue -le 3) { $cco = (& $cget 'company').Trim(); $contactNames.Add($(if ($cco -ne '') { "$cname ($cco)" } else { $cname })) }
                    }
                }
            }
        }
        # Layoff plan: unchecked dated lines due within 3 days or overdue.
        foreach ($ln in @(Read-Lines 'jobs/layoff-plan.md')) {
            if ($ln -notmatch '^- \[ \] ([0-9]{4}-[0-9]{2}-[0-9]{2})(.*)$') { continue }
            $ld = $Matches[1]; $t = $Matches[2]
            $ldDays = Get-DayDiff $todayIso $ld
            if ($null -eq $ldDays -or $ldDays -gt 3) { continue }
            $t = $t -replace '^ *(\([A-Za-z]+\))? *:? *', ''
            if ($t.Length -gt 90) { $t = $t.Substring(0, 87) + '...' }
            $when = if ($ld -lt $todayIso) { "overdue since $ld" } else { "due $ld" }
            $due.Add([pscustomobject]@{ Rank = $(if ($ld -lt $todayIso) { 0 } else { 1 }); Date = $ld; Order = $due.Count; Text = "Layoff plan: $t [$when]" })
        }
        # Benefits certification day: a weekday name, or "every other <weekday> from YYYY-MM-DD".
        $certDay = Get-Pref 'benefits_cert_day'
        $cd = $certDay.ToLowerInvariant(); $wd = $today.ToString('ddd', $culture).ToLowerInvariant(); $cert = $false
        if ($cd -match 'every other ([a-z]+) from ([0-9]{4}-[0-9]{2}-[0-9]{2})') {
            $gap = Get-DayDiff $Matches[2] $todayIso
            if ($Matches[1].Length -ge 3 -and $Matches[1].Substring(0, 3) -eq $wd -and $null -ne $gap -and $gap -ge 0 -and $gap % 14 -eq 0) { $cert = $true }
        } elseif ($cd -match '^(every )?(mon|tue|wed|thu|fri|sat|sun)[a-z]*([ ,.;(]|$)') {
            if ($Matches[2] -eq $wd) { $cert = $true }
        }
        # Visa unemployment clock (the one formula in evaluate-job/references/visa-checks.md; matches
        # summary.sh and due-alerts). All four numbers must be present; a blank count means no estimate.
        $vLeft = $null
        $vStart = Get-Pref 'visa_clock_start'; $vAllowed = Get-Pref 'visa_days_allowed'; $vUsed = Get-Pref 'visa_days_used'; $vAsOf = Get-Pref 'visa_days_used_as_of'; $vType = Get-Pref 'visa_type'
        if ((Test-Iso $vStart) -and $vAllowed -match '^([0-9]+)' -and $vUsed -match '^[0-9]+') {
            $allowed = [int]($vAllowed -replace '[^0-9].*$', '')
            if ($allowed -gt 0) {
                $used = [int]($vUsed -replace '[^0-9].*$', '')
                # counting start = the later of the clock start and the day after the as-of date
                $fromN = Get-DayDiff '1970-01-01' $vStart
                if (Test-Iso $vAsOf) { $aN = (Get-DayDiff '1970-01-01' $vAsOf) + 1; if ($aN -gt $fromN) { $fromN = $aN } }
                $tN = Get-DayDiff '1970-01-01' $todayIso
                $running = if ($fromN -gt $tN) { 0 } else { $tN - $fromN + 1 }
                $vLeft = $allowed - $used - $running
            }
        }
        $sorted = @($due | Sort-Object Rank, Date, Order)
        if ($closed) {
            $lines.Add('search closed. Congratulations!')
            if ($openCount -gt 0) { $lines.Add("$openCount job(s) are still open in the tracker. Help the user send any withdrawals and mark them withdrawn.") }
            if ($withdraw.Count -gt 0) {
                $more = if ($withdraw.Count -gt 5) { '; and {0} more' -f ($withdraw.Count - 5) } else { '' }
                $lines.Add('Withdrawal notes still to send: ' + ((@($withdraw) | Select-Object -First 5) -join '; ') + $more + '.')
            }
            if ($drafts -gt 0) { $lines.Add("$drafts draft(s) still waiting in the Outbox.") }
            # Benefits and visa clocks keep running after the search is closed, until the user clears them.
            if ($cert) { $lines.Add("Today is the user's benefits certification day ($certDay). Offer to bring their work-search log up to date (the work-search-log skill) before they certify.") }
            if ($null -ne $vLeft) {
                $vt = if ($vType -ne '') { " ($vType)" } else { '' }
                $urgent = if ($vLeft -le 30) { ' Urgent: mention it today.' } else { '' }
                $shown = if ($vLeft -lt 0) { 0 } else { $vLeft }
                $lines.Add("Visa clock${vt}: about $shown of $allowed unemployment days left (estimate from the preferences; the official count always wins).$urgent")
            }
        } elseif ($total -eq 0 -and $drafts -eq 0 -and $due.Count -eq 0 -and -not $cert -and $null -eq $vLeft -and $contactDue -eq 0 -and $gmailOld -eq 0 -and $contactBad -eq '') {
            $lines.Add('Pipeline: nothing tracked yet.')
        } else {
            $c = { param($n) if ($counts.ContainsKey($n)) { $counts[$n] } else { 0 } }
            $pipeline = 'Pipeline: {0} applied' -f (& $c 'applied')
            if ((& $c 'screening') -gt 0) { $pipeline += ', {0} screening' -f (& $c 'screening') }
            $pipeline += ', {0} interviewing' -f (& $c 'interviewing')
            if ((& $c 'offer') -gt 0) { $pipeline += ', {0} offer(s)' -f (& $c 'offer') }
            $pipeline += ', {0} to apply' -f (& $c 'interested')
            if ($due.Count -gt 0) { $pipeline += ', {0} due' -f $due.Count }
            if ($drafts -gt 0) { $pipeline += ', {0} in Outbox' -f $drafts }
            if ($cert) { $pipeline += ', certify benefits today' }
            if ($null -ne $vLeft -and $vLeft -le 30) { $pipeline += ", visa days left: $vLeft" }
            $lines.Add($pipeline)
            if ($cert) { $lines.Add("Today is the user's benefits certification day ($certDay). Offer to bring their work-search log up to date (the work-search-log skill) before they certify.") }
            if ($null -ne $vLeft) {
                $vt = if ($vType -ne '') { " ($vType)" } else { '' }
                $urgent = if ($vLeft -le 30) { ' Urgent: mention it today.' } else { '' }
                $shown = if ($vLeft -lt 0) { 0 } else { $vLeft }
                $lines.Add("Visa clock${vt}: about $shown of $allowed unemployment days left (estimate from the preferences; the official count always wins).$urgent")
            }
            if ($sorted.Count -gt 0) {
                $lines.Add('Due today, overdue, or deadline within 3 days (most urgent first):')
                for ($k = 0; $k -lt $sorted.Count -and $k -lt 10; $k++) { $lines.Add('- ' + $sorted[$k].Text) }
                if ($sorted.Count -gt 10) { $lines.Add(('- ...and {0} more' -f ($sorted.Count - 10))) }
            }
            # Contact follow-ups and old Gmail drafts: one short line (the today skill has the full list).
            $xline = ''
            if ($contactDue -gt 0) {
                $more = if ($contactDue -gt 3) { ' and {0} more' -f ($contactDue - 3) } else { '' }
                $xline = $(if ($contactDue -eq 1) { '1 contact follow-up (' } else { "$contactDue contact follow-ups (" }) + (@($contactNames) -join ', ') + $more + ')'
            }
            if ($gmailOld -gt 0) {
                $sep = if ($xline -ne '') { '; ' } else { '' }
                $xline += $sep + $(if ($gmailOld -eq 1) { '1 Gmail draft' } else { "$gmailOld Gmail drafts" }) + ' made more than 2 days ago and not marked sent'
            }
            if ($xline -ne '') { $lines.Add("Also due: $xline. The today skill lists them.") }
            if ($contactBad -eq 'semicolons') { $lines.Add('contacts/contacts.csv was saved with semicolons between the columns, so contact follow-ups were not counted. Offer to fix it (the panels will not save to it until then).') }
            elseif ($contactBad -ne '') { $lines.Add('contacts/contacts.csv looks damaged (a quote that never closes), so contact follow-ups were not counted. Offer to fix it (the panels will not save to it until then).') }
            if ($passed.Count -gt 0) {
                $more = if ($passed.Count -gt 5) { '; and {0} more' -f ($passed.Count - 5) } else { '' }
                $lines.Add('Application deadline passed (suggest marking skipped unless the posting is still open): ' + ((@($passed) | Select-Object -First 5) -join '; ') + $more)
            }
            if ($unclear.Count -gt 0) {
                $more = if ($unclear.Count -gt 5) { '; and {0} more' -f ($unclear.Count - 5) } else { '' }
                $lines.Add('Date unclear (could be day/month or month/day), so not counted above: ' + ((@($unclear) | Select-Object -First 5) -join '; ') + $more + '. Ask the user which they mean before giving deadline advice, then save it as YYYY-MM-DD; never guess. If date_order is blank in the preferences, ask whether their spreadsheet puts the day or the month first.')
            }
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
# Scheduled routines (the routines skill) log "- YYYY-MM-DD HH:MM (middle dot) <routine> (middle dot) <result>" to history/routines.md:
# the latest run of each routine from the last 24 hours, at most 4 routines, oldest first (like session-start.sh).
$runs = New-Object 'System.Collections.Generic.List[object]'
$cutoff = [DateTime]::UtcNow.AddSeconds(-86400).ToLocalTime().ToString('yyyy-MM-dd HH:mm', $culture)
$sep = ' ' + [char]0x00B7 + ' '
foreach ($ln in @(Read-Lines 'history/routines.md')) {
    $ln = $ln.TrimStart([char]0xFEFF)
    if ($ln -cnotmatch '^- ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2})( |$)') { continue }
    $ts = $Matches[1]
    if ([string]::CompareOrdinal($ts, $cutoff) -lt 0) { continue }
    $rest = $ln.Substring(18).Trim()
    if ($rest.StartsWith($sep.Trim())) { $rest = $rest.Substring($sep.Trim().Length).Trim() }
    $i = $rest.IndexOf($sep)
    if ($i -ge 0) { $nm = $rest.Substring(0, $i).Trim(); $rs = $rest.Substring($i + $sep.Length).Trim() } else { $nm = $rest.Trim(); $rs = '' }
    # Not runs: the assistant's notes ("routines (middle dot) offered") and the user's changes (set up, paused, ...).
    # Lowercase A-Z only, like awk's tolower under LC_ALL=C.
    $key = [regex]::Replace($nm, '[A-Z]', { param($m) $m.Value.ToLowerInvariant() })
    $rsKey = [regex]::Replace($rs, '[A-Z]', { param($m) $m.Value.ToLowerInvariant() })
    if ($nm -eq '' -or $key -ceq 'routines' -or $rsKey -cmatch '^(set up|changed|paused|resumed|deleted)') { continue }
    $runs.Add([pscustomobject]@{ Name = $nm; Result = $rs; Time = $ts.Substring(11, 5); Key = $key })
}
$seenRun = New-Object System.Collections.Hashtable ([StringComparer]::Ordinal); $keepRun = @{}  # exact match, as in awk
for ($i = $runs.Count - 1; $i -ge 0 -and $keepRun.Count -lt 4; $i--) {
    if (-not $seenRun.ContainsKey($runs[$i].Key)) { $seenRun[$runs[$i].Key] = $true; $keepRun[$i] = $true }
}
$runParts = @(for ($i = 0; $i -lt $runs.Count; $i++) {
    if ($keepRun.ContainsKey($i)) { "$($runs[$i].Name) ($($runs[$i].Time))" + $(if ($runs[$i].Result -ne '') { ": $($runs[$i].Result)" } else { '' }) }
})
if ($runParts.Count -gt 0) { $lines.Add('Routine results from the last 24 hours (automatic runs; mention them in one line when the user first writes): ' + ($runParts -join '; ') + '.') }
# Routines with nothing logged for longer than their schedule allows (routine-status.ps1 has the rules).
$statusScript = Join-Path $root '.claude/skills/routines/scripts/routine-status.ps1'
$stalled = @()
if (Test-Path -LiteralPath $statusScript -PathType Leaf) {
    try {
        $stalled = @(@(& $statusScript 2>$null) | ForEach-Object { $f = "$_".Split("`t"); if ($f.Count -ge 5 -and $f[0] -eq 'stalled') {
            if ($f[2] -eq 'run') { "$($f[1]) (last ran $($f[3]))" } else { "$($f[1]) (set up $($f[3]), no run logged yet)" } } })
    } catch {}
}
$healthCmd = if ($App -eq 'codex') { '$health' } else { '/health' }
if ($stalled.Count -gt 0) { $lines.Add('Routines that seem to have stopped running (nothing logged in this folder for longer than their schedule): ' + ($stalled -join '; ') + ". Mention it in one line when the user first writes and offer $healthCmd to find out why. If they paused or deleted it on purpose, log that as the routines skill says, so it isn't flagged again.") }
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
