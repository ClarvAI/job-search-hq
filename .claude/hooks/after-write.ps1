# PostToolUse context for Codex on Windows (port of after-write.sh).
param([string]$App = 'codex')

try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$raw = [Console]::In.ReadToEnd()
try { $hook = $raw.TrimStart([char]0xFEFF) | ConvertFrom-Json -ErrorAction Stop }
catch { exit 0 }
$paths = New-Object 'System.Collections.Generic.List[string]'
if ($hook.tool_input.file_path) { $paths.Add([string]$hook.tool_input.file_path) }
# Codex patches: read tool_input.command, and (like after-write.sh) any "*** Add File:" lines anywhere in the input.
$scan = ($raw -replace '\\\\', '/') -replace '\\r\\n|\\n|\\r', "`n"
foreach ($line in @([string]$hook.tool_input.command -split '\r\n|\n|\r') + @($scan -split "`n")) {
    if ($line -cmatch '^\*\*\* (Add File|Update File|Move to): ([^"]*)') { $paths.Add($Matches[2].Trim()) }
}
$publishedPath = Join-Path $root 'profile/published-pages.md'
$published = ''
# Publishing pages is a Claude feature; Codex never gets republish reminders.
if ($false -and (Test-Path -LiteralPath $publishedPath -PathType Leaf)) {
    $published = [IO.File]::ReadAllText($publishedPath, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
}
$messages = New-Object 'System.Collections.Generic.List[string]'
function Add-Message([string]$Message) {
    if (-not $messages.Contains($Message)) { $messages.Add($Message) }
}
# A draft moved into outbox/sent or outbox/discarded is being archived, not written.
$moved = (($paths -join '|').Replace('\', '/') -match 'outbox/(sent|discarded)/')
foreach ($path in $paths) {
    if (-not $path) { continue }
    $p = '/' + ($path.Replace('\', '/') -replace '/{2,}', '/').TrimStart('/')
    if ($p -match '/\.(agents|claude|codex)/') { continue }
    # Case-sensitive patterns preserve bash case matching, including outbox exclusions.
    if ($p -cmatch '/jobs/.*/(resume\.md|cover-letter\.md|application-answers\.md)$') {
        $name = $Matches[1]
        Add-Message "Reminder: before showing the user $name, run the truth-checker review (and voice-editor for prose) on this latest version, then rebuild its .html from the final text."
    } elseif ($p -cmatch '/(jobs/tracker\.csv|contacts/contacts\.csv)$') {
        $dot = [char]0x00B7
        Add-Message ("Shared record changed: append one line to history/activity.md exactly like: - {0} {1} Codex {1} <job or person>: <what changed>." -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $dot)
        if ($p -cmatch '/jobs/tracker\.csv$') { $dash = Join-Path $root 'pages/dashboard.html'; if ((Test-Path -LiteralPath $dash) -and ([IO.File]::ReadAllText($dash, [Text.Encoding]::UTF8) -match '"example": true')) { Add-Message 'The dashboard page still shows example data; refresh its data block from the tracker at the end of this task (pages skill).' } }
        if ($p -cmatch '/jobs/tracker\.csv$' -and $published -cmatch '(?m)^\|\s*Dashboard\s*\|.*https') {
            Add-Message "The user's dashboard is published; republish it once you finish this task (see the pages skill)."
        }
    } elseif ($p -cmatch '/(profile/story-bank\.md|knowledge/field/field-primer\.md)$') {
        if ($published -cmatch '(?m)^\|\s*Flashcards\s*\|.*https') {
            Add-Message "The user's flashcards are published and their source changed. Refresh and republish them once you finish this task (see the pages skill)."
        }
    } elseif ($p -cmatch '/profile/master-resume\.md$') {
        if ($published -cmatch '(?m)^\|\s*Portfolio\s*\|.*https') {
            Add-Message "The user's portfolio is published and their master resume changed. Offer to update it; republish only after the user approves."
        }
    } elseif ($p -cmatch '/outbox/_.*$|/outbox/sent/.*$|/outbox/discarded/.*$') {
        continue
    } elseif ($p -cmatch '/outbox/.*\.md$' -and -not $moved) {
        Add-Message 'This is an Outbox draft. Check it follows the header format in AGENTS.md, run voice-editor if not done, and tell the user it''s ready in the Outbox (say "show my outbox"). Never send it yourself.'
    }
}
if ($messages.Count -gt 0) {
    $result = @{ hookSpecificOutput = @{
        hookEventName = 'PostToolUse'
        additionalContext = $messages -join ' '
    } }
    $json = [regex]::Replace(($result | ConvertTo-Json -Compress -Depth 5), '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })  # ASCII-only JSON survives any console code page
    [Console]::Out.Write($json + "`n")
}
exit 0
