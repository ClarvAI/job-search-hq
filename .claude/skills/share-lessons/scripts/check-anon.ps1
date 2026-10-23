# Read-only privacy check for a lessons-learned draft (PowerShell version of check-anon.sh; keep them in step:
# the same terms, patterns, order and messages). Exits 1 when anything is found.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\share-lessons\scripts\check-anon.ps1 <draft file>
# Works in Windows PowerShell 5.1 and PowerShell 7 (Windows, macOS, Linux).
param([string]$Draft = '')
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
if ($Draft -eq '' -or -not (Test-Path -LiteralPath $Draft -PathType Leaf)) { Write-Output 'error: no draft file (usage: check-anon.ps1 <draft file>)'; exit 2 }
$Draft = (Resolve-Path -LiteralPath $Draft).ProviderPath
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$enc = New-Object System.Text.UTF8Encoding($false)
function Read-Text([string]$rel) {
    $p = Join-Path $root $rel
    if (Test-Path -LiteralPath $p -PathType Leaf) { try { return [IO.File]::ReadAllText($p, $enc) } catch {} }
    return $null
}
# Lowercase A-Z only, like tr and awk under LC_ALL=C.
function Get-Lower([string]$s) { return [regex]::Replace($s, '[A-Z]', { param($m) $m.Value.ToLowerInvariant() }) }
# The same cell splitter as check-anon.sh: a quote opens a quoted cell only at the start of a cell.
function Split-Row([string]$s) {
    $cells = New-Object 'System.Collections.Generic.List[string]'
    $cell = New-Object System.Text.StringBuilder
    $q = $false
    for ($i = 0; $i -lt $s.Length; $i++) {
        $c = $s[$i]
        if ($q) {
            if ($c -eq '"') { if ($i + 1 -lt $s.Length -and $s[$i + 1] -eq '"') { [void]$cell.Append('"'); $i++ } else { $q = $false } } else { [void]$cell.Append($c) }
        } elseif ($c -eq '"' -and $cell.Length -eq 0) { $q = $true }
        elseif ($c -eq ',') { $cells.Add($cell.ToString()); [void]$cell.Clear() }
        else { [void]$cell.Append($c) }
    }
    $cells.Add($cell.ToString())
    return ,$cells
}
function Get-Column([string]$rel, [string[]]$want) {
    $text = Read-Text $rel
    if ($null -eq $text) { return @() }
    $out = New-Object 'System.Collections.Generic.List[string]'
    $lines = $text.TrimStart([char]0xFEFF) -split "`n"
    if ($lines.Count -eq 0) { return @() }
    $head = Split-Row ($lines[0].TrimEnd("`r"))
    $col = @{}
    for ($i = 0; $i -lt $head.Count; $i++) { $col[(Get-Lower $head[$i])] = $i }
    for ($n = 1; $n -lt $lines.Count; $n++) {
        $ln = $lines[$n].TrimEnd("`r")
        if ($n -eq $lines.Count - 1 -and $ln -eq '') { continue }
        $cells = Split-Row $ln
        foreach ($w in $want) {
            if ($col.ContainsKey($w) -and $col[$w] -lt $cells.Count) {
                $v = $cells[$col[$w]].Trim(" `t".ToCharArray())
                if ($v -ne '') { $out.Add($v) }
            }
        }
    }
    return ,$out
}

$raw = New-Object 'System.Collections.Generic.List[string]'
foreach ($v in (Get-Column 'jobs/tracker.csv' @('company', 'location'))) { $raw.Add($v) }
foreach ($v in (Get-Column 'contacts/contacts.csv' @('company', 'email'))) { $raw.Add($v) }
# A company like "Globex, Inc." or "The Acme Company": its name without the legal words too.
foreach ($v in @((Get-Column 'jobs/tracker.csv' @('company')) + (Get-Column 'contacts/contacts.csv' @('company')))) {
    $c = $v -replace ',.*$', ''
    $raw.Add($c)
    $c = $c -creplace '^[Tt]he\s+', '' -creplace '\s+(&|[Aa]nd)\s+[Ss]ons?$', '' -creplace '\s+([Ii]nc|[Ll][Ll][Cc]|[Ll]td|[Cc]orp|[Cc]orporation|[Cc]o|[Cc]ompany|[Gg]roup|[Pp][Ll][Cc]|[Gg][Mm][Bb][Hh])\.?$', ''
    $raw.Add($c)
}
$people = @((Get-Column 'jobs/tracker.csv' @('contact')) + (Get-Column 'contacts/contacts.csv' @('name')))
$prefs = Read-Text 'profile/preferences.md'
if ($null -ne $prefs) { $m = [regex]::Match($prefs, '(?m)^name:[ \t]*([^\r\n]*)'); if ($m.Success) { $people += $m.Groups[1].Value } }
foreach ($p in $people) { $raw.Add($p); foreach ($part in ($p -split '[,;/ ]')) { $raw.Add($part) } }
foreach ($v in (Get-Column 'jobs/tracker.csv' @('location'))) { foreach ($part in ($v -split ',')) { $raw.Add(($part -replace '^\s+', '' -creplace '\s[A-Z][A-Z]$', '')) } }
$stop = '(?i)^(remote|hybrid|onsite|on-site|inc|llc|ltd|corp|the|and|team|lead|n/a|none|unknown)$'
$terms = @($raw | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -ge 3 -and $_ -notmatch '^[0-9]*$' -and $_ -notmatch $stop } | Sort-Object -Unique -CaseSensitive)

$text = ([IO.File]::ReadAllText($Draft, $enc)).Replace("`r", '')
$found = New-Object 'System.Collections.Generic.List[string]'
function Add-Found([string]$label, [string[]]$hits) {
    $u = @($hits | ForEach-Object { Get-Lower $_ } | Sort-Object -Unique)
    [Array]::Sort($u, [StringComparer]::Ordinal)
    foreach ($h in $u) { if ($h -ne '') { $found.Add("found: ${label}: $h") } }
}
if ($terms.Count -gt 0) {
    # Longest first, so "pat lee" wins over "pat" where both match (grep -F picks the longest).
    $alt = (@($terms | Sort-Object -Property @{ Expression = { $_.Length }; Descending = $true }) | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $hits = @([regex]::Matches($text, "(?<![A-Za-z0-9_])(?:$alt)(?![A-Za-z0-9_])", 'IgnoreCase, CultureInvariant') | ForEach-Object { $_.Value })
    Add-Found 'from your files' $hits
}
$patterns = @(
    @('email', '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'),
    @('link', '(https?://|www\.)[^\s)]+'),
    @('phone', '\+?\(?[0-9]{1,4}\)?[ .-][0-9 ().-]{6,}[0-9]|\b[0-9]{10,}\b'),
    @('pay', '(\$|\u20AC|\u00A3|\u00A5)\s?[0-9][0-9,.]*[kKmM]?|[0-9]+([.,][0-9]+)?\s?[kK]\b|\b[0-9]{2,3},[0-9]{3}\b'),
    @('exact date', '\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b|\b[0-9]{1,2}[/.][0-9]{1,2}[/.][0-9]{2,4}\b')
)
foreach ($p in $patterns) { Add-Found $p[0] @([regex]::Matches($text, $p[1]) | ForEach-Object { $_.Value }) }

foreach ($f in $found) { Write-Output $f }
if ($found.Count -eq 0) { Write-Output "ok: nothing personal found by the automatic check (it can't catch everything: read the draft yourself)"; exit 0 }
Write-Output "check: $($found.Count) found"
exit 1
