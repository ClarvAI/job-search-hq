# Parses every .ps1 file in the workspace, and every base64 "commandWindows" script in
# .codex/hooks.json, with the PowerShell parser of whichever PowerShell runs this file.
# Run it under both Windows PowerShell 5.1 and PowerShell 7 to catch syntax that only one accepts.
# Also flags non-ASCII characters in .ps1 files that lack a UTF-8 BOM (5.1 reads those as ANSI).
# Usage: pwsh -NoProfile -File scripts/ci/parse-powershell.ps1
#        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ci/parse-powershell.ps1
# Exits 1 on any problem.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Write-Output ("PowerShell {0} ({1})" -f $PSVersionTable.PSVersion, $PSVersionTable.PSEdition)
$bad = 0; $n = 0

function Test-Source([string]$Label, [string]$Text) {
    $tokens = $null; $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseInput($Text, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        Write-Output "FAIL  $Label"
        foreach ($e in $errors) { Write-Output ("      line {0}: {1}" -f $e.Extent.StartLineNumber, $e.Message) }
        return $false
    }
    Write-Output "ok    $Label"
    return $true
}

$skipDirs = @('.git', 'node_modules', '.backup')
$files = Get-ChildItem -LiteralPath $repo -Recurse -File -Filter '*.ps1' -Force |
    Where-Object { $rel = $_.FullName.Substring($repo.Length); -not ($skipDirs | Where-Object { $rel -match ('[\\/]' + [regex]::Escape($_) + '[\\/]') }) } |
    Sort-Object FullName
foreach ($f in $files) {
    $n++
    $rel = $f.FullName.Substring($repo.Length).TrimStart('\', '/')
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    $text = (New-Object System.Text.UTF8Encoding($false)).GetString($bytes)
    if ($hasBom) { $text = $text.Substring(1) }
    if (-not (Test-Source $rel $text)) { $bad++ }
    if (-not $hasBom) {
        foreach ($b in $bytes) { if ($b -gt 0x7F) { Write-Output "FAIL  $rel has non-ASCII characters but no UTF-8 BOM (Windows PowerShell 5.1 would misread them)"; $bad++; break } }
    }
}

$hooksPath = Join-Path $repo '.codex/hooks.json'
if (Test-Path -LiteralPath $hooksPath) {
    $hooks = [IO.File]::ReadAllText($hooksPath) | ConvertFrom-Json
    foreach ($ev in $hooks.hooks.PSObject.Properties) {
        $i = 0
        foreach ($group in @($ev.Value)) {
            foreach ($h in @($group.hooks)) {
                $i++
                $cw = [string]$h.commandWindows
                if (-not $cw) { continue }
                $n++
                $label = ".codex/hooks.json $($ev.Name) #$i commandWindows"
                if ($cw -notmatch '-EncodedCommand\s+(\S+)') { Write-Output "FAIL  $label has no -EncodedCommand"; $bad++; continue }
                try { $script = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1])) }
                catch { Write-Output "FAIL  $label is not valid base64 UTF-16"; $bad++; continue }
                if (-not (Test-Source $label $script)) { $bad++ }
                if ($cw -notmatch '^powershell(\.exe)? ') { Write-Output "FAIL  $label should start with powershell (Windows PowerShell is on every Windows machine)"; $bad++ }
            }
        }
    }
} else {
    Write-Output "FAIL  .codex/hooks.json is missing"; $bad++
}

Write-Output "parsed $n scripts, $bad problems"
if ($bad -gt 0) { exit 1 }
exit 0
