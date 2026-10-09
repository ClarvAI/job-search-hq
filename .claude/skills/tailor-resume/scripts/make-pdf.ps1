# make-pdf.ps1 - Windows version of make-pdf.sh, for when bash (Git Bash) isn't available.
# Works in Windows PowerShell 5.1 and PowerShell 7. Keep this file plain ASCII.
#
# Final PDF (after the checks):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\tailor-resume\scripts\make-pdf.ps1 jobs\<folder>\resume.html "First Last" "Company"
#   (also cover-letter.html, resume-designed.html -> ...-Resume-<Company>-Designed.pdf, or resume.rendercv.yaml when RenderCV is installed)
# Page-count check only (throwaway PDF, like page-count.sh):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\tailor-resume\scripts\make-pdf.ps1 jobs\<folder>\resume.html -CheckOnly
#
# Output: same lines as make-pdf.sh: "pdf: ...", "engine: ...", "paper: ...", "pages: N", "parse: ...", maybe
# "parse-note: ...", or a status: no-browser, no-rendercv, print-failed (a blank PDF, or one without the name, email
# and phone, is saved as <final name>-CHECK.pdf and a "check:" line says where), render-failed, not-found: <path>, usage: ...
param(
  [Parameter(Position = 0)] [string]$Source,
  [Parameter(Position = 1)] [string]$Name,
  [Parameter(Position = 2)] [string]$Company,
  [switch]$CheckOnly
)
# 'Continue', not 'Stop': in Windows PowerShell 5.1 any stderr text from rendercv/pdftotext would
# otherwise abort the script. Steps that must succeed use -ErrorAction Stop themselves.
$ErrorActionPreference = 'Continue'
# File names and parse lines can hold accented letters; print them as UTF-8 (Windows PowerShell 5.1 defaults to the
# console code page, which turns them into question marks).
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

$OnWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT

function Find-Browser {
  if ($OnWindows) {
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA, 'C:\Program Files', 'C:\Program Files (x86)') |
      Where-Object { $_ } | Select-Object -Unique
    foreach ($r in $roots) {
      foreach ($rel in @('Google\Chrome\Application\chrome.exe', 'Microsoft\Edge\Application\msedge.exe')) {
        $p = [IO.Path]::Combine($r, $rel)
        if (Test-Path -LiteralPath $p) { return $p }
      }
    }
  }
  foreach ($c in @('chrome', 'msedge', 'google-chrome', 'chromium', 'microsoft-edge')) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  # macOS/Linux PowerShell, just in case.
  foreach ($p in @('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}

function Quote-Arg([string]$a) { if ($a -match '[\s"]') { return '"' + ($a -replace '"', '\"') + '"' } else { return $a } }

function Invoke-Print([string]$browser, [string]$html, [string]$pdf) {
  if (Test-Path -LiteralPath $pdf) { Remove-Item -LiteralPath $pdf -Force }
  $full = (Resolve-Path -LiteralPath $html).ProviderPath
  # Percent-encode every folder name (spaces, #, %, [, accents...), keeping / and a drive's C:.
  # A folder named "Job Search #1" would otherwise break the address.
  $enc = (($full.Replace('\', '/').Split('/')) | ForEach-Object { if ($_ -match '^[A-Za-z]:$') { $_ } else { [Uri]::EscapeDataString($_) } }) -join '/'
  if ($enc.StartsWith('/')) { $url = 'file://' + $enc } else { $url = 'file:///' + $enc }   # //server/share stays file:////server/share
  $argList = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--no-pdf-header-footer', '--print-to-pdf-no-header', '--virtual-time-budget=3000',
    ('--print-to-pdf=' + $pdf), $url) | ForEach-Object { Quote-Arg $_ }
  $so = $pdf + '.out.log'; $se = $pdf + '.err.log'
  if ($OnWindows) { $proc = Start-Process -FilePath $browser -ArgumentList $argList -PassThru -WindowStyle Hidden -RedirectStandardOutput $so -RedirectStandardError $se }
  else { $proc = Start-Process -FilePath $browser -ArgumentList $argList -PassThru -RedirectStandardOutput $so -RedirectStandardError $se }
  $last = -1; $stable = 0
  for ($i = 0; $i -lt 120; $i++) {
    if ($proc.HasExited) { break }
    if (Test-Path -LiteralPath $pdf) {
      $size = (Get-Item -LiteralPath $pdf).Length
      if ($size -gt 0 -and $size -eq $last) { $stable++ } else { $stable = 0; $last = $size }
      if ($stable -ge 4) { break }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $proc.HasExited) { try { $proc.Kill() } catch { } }
  return ((Test-Path -LiteralPath $pdf) -and ((Get-Item -LiteralPath $pdf).Length -gt 0))
}

function Get-PdfLatin1([string]$pdf) {
  $bytes = [IO.File]::ReadAllBytes($pdf)
  return [Text.Encoding]::GetEncoding(28591).GetString($bytes)
}

function Get-PageCount([string]$pdf) {
  $pi = Get-Command pdfinfo -ErrorAction SilentlyContinue
  if ($pi) {
    $line = & pdfinfo $pdf 2>$null | Where-Object { $_ -match '^Pages:' } | Select-Object -First 1
    if ($line -match '(\d+)') { return [int]$Matches[1] }
  }
  return ([regex]::Matches((Get-PdfLatin1 $pdf), '/Type\s*/Page(?!s)')).Count
}

function Get-PaperSize([string]$pdf) {
  $m = [regex]::Match((Get-PdfLatin1 $pdf), '/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]')
  if (-not $m.Success) { return 'unknown' }
  $inv = [Globalization.CultureInfo]::InvariantCulture
  $w = [math]::Round([double]::Parse($m.Groups[3].Value, $inv) - [double]::Parse($m.Groups[1].Value, $inv))
  $h = [math]::Round([double]::Parse($m.Groups[4].Value, $inv) - [double]::Parse($m.Groups[2].Value, $inv))
  if ($w -eq 612 -and $h -eq 792) { return 'Letter' }
  if ($w -eq 595 -and $h -eq 842) { return 'A4' }
  return "$w x $h pt"
}

# Letters (accented ones kept), digits and hyphens only: the same rule the Apply Kit panel uses to find the file.
function Get-Slug([string]$s) { return (($s -replace '[^\p{L}\p{N}]+', '-').Trim('-')) }

# ---------------------------------------------------------------- main
if (-not $Source -or (-not $CheckOnly -and (-not $Name -or -not $Company))) {
  Write-Output 'usage: make-pdf.ps1 <resume.html|cover-letter.html|resume.rendercv.yaml> "First Last" "Company"   (or: make-pdf.ps1 <file.html> -CheckOnly)'
  exit 2
}
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { Write-Output "not-found: $Source"; exit 1 }
$srcFull = (Resolve-Path -LiteralPath $Source).ProviderPath
$dir = Split-Path -Parent $srcFull
$base = Split-Path -Leaf $srcFull
$lowerBase = $base.ToLowerInvariant()
$kind = 'Resume'; if ($lowerBase -like '*cover*') { $kind = 'Cover-Letter' }
# The optional designed resume (resume-designed.html) gets its own name, so the ATS resume's name never changes.
$suffix = ''; if ($kind -eq 'Resume' -and $lowerBase -like '*designed*') { $suffix = '-Designed' }
$isYaml = $lowerBase -like '*.yaml' -or $lowerBase -like '*.yml'
$isHtml = $lowerBase -like '*.html' -or $lowerBase -like '*.htm'
if (-not $isYaml -and -not $isHtml) { Write-Output "unsupported: $base (use .html or .rendercv.yaml)"; exit 2 }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('makepdf-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $tmpPdf = Join-Path $tmp 'out.pdf'
  if ($isYaml) {
    if ($CheckOnly) { Write-Output 'usage: -CheckOnly is for .html files'; exit 2 }
    if (-not (Get-Command rendercv -ErrorAction SilentlyContinue)) { Write-Output 'no-rendercv'; exit 0 }
    $log = & rendercv render $srcFull -nomd -nohtml -nopng -q --typst-path (Join-Path $tmp 'out.typ') --pdf-path $tmpPdf 2>&1
    if (-not (Test-Path -LiteralPath $tmpPdf)) { Write-Output 'render-failed'; $log | Select-Object -First 25 | ForEach-Object { Write-Output "$_" }; exit 1 }
    $engine = 'rendercv'
  } else {
    $browser = Find-Browser
    if (-not $browser) { Write-Output 'no-browser'; exit 0 }
    if (-not (Invoke-Print $browser $srcFull $tmpPdf)) { Write-Output 'print-failed'; exit 1 }
    $engine = 'browser'
  }

  if ($CheckOnly) { Write-Output ("pages: " + (Get-PageCount $tmpPdf)); exit 0 }

  $final = Join-Path $dir ((Get-Slug $Name) + '-' + $kind + '-' + (Get-Slug $Company) + $suffix + '.pdf')

  # ---- Is it a real document? A blank page, or one without the person's name, email and phone, is never saved
  # under the final name (the Apply Kit offers that name for uploads).
  $raw0 = [IO.File]::ReadAllText($srcFull)
  $bad = ''
  if (Get-Command pdftotext -ErrorAction SilentlyContinue) {
    $chk = Join-Path $tmp 'check.txt'
    & pdftotext -enc UTF-8 $tmpPdf $chk 2>$null
    if (Test-Path -LiteralPath $chk) {
      $ct = [IO.File]::ReadAllText($chk, [Text.Encoding]::UTF8)
      if (($ct -replace '\s', '') -eq '') { $bad = 'it has no text' }
      else {
        $seen = $ct.ToLowerInvariant().Contains($Name.ToLowerInvariant())
        $em0 = [regex]::Match($raw0, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
        if ($em0.Success -and $ct.ToLowerInvariant().Contains($em0.Value.ToLowerInvariant())) { $seen = $true }
        $ph = [regex]::Match($raw0, '\+?\(?[0-9][0-9 ().-]{7,}[0-9]')
        if ($ph.Success) {
          $pd = $ph.Value -replace '[^0-9]', ''
          if ($pd.Length -ge 7 -and ($ct -replace '[^0-9]', '').Contains($pd.Substring($pd.Length - 7))) { $seen = $true }
        }
        if (-not $seen) { $bad = 'the name, email and phone are all missing from its text' }
      }
    }
  } elseif (-not (Get-PdfLatin1 $tmpPdf).Contains('/Font')) { $bad = 'it has no text' }
  $checkPdf = $final -replace '\.pdf$', '-CHECK.pdf'
  if ($bad) {
    $moved = $true
    try { Move-Item -LiteralPath $tmpPdf -Destination $checkPdf -Force -ErrorAction Stop } catch { $moved = $false }
    Write-Output 'print-failed'
    if ($moved) { Write-Output "check: $checkPdf ($bad; saved under this name so it can't be uploaded by mistake)" }
    if (Test-Path -LiteralPath $final) { Write-Output "old: $final is from an earlier run and may not match the current file" }
    exit 1
  }
  if (Test-Path -LiteralPath $checkPdf) { Remove-Item -LiteralPath $checkPdf -Force -ErrorAction SilentlyContinue }

  try { Move-Item -LiteralPath $tmpPdf -Destination $final -Force -ErrorAction Stop }
  catch { Write-Output "save-failed: $final (is the PDF open in another app?)"; exit 1 }
  $paper = Get-PaperSize $final
  Write-Output "pdf: $final"
  Write-Output "engine: $engine"
  Write-Output "paper: $paper"
  Write-Output ("pages: " + (Get-PageCount $final))

  $raw = [IO.File]::ReadAllText($srcFull)
  $want = ''
  if ($engine -eq 'browser') {
    $m = [regex]::Match($raw, '@page[^}]*?size:\s*([A-Za-z0-9]+)', 'IgnoreCase')
  } else {
    $m = [regex]::Match($raw, '(?m)^\s+size:\s*([A-Za-z0-9-]+)')
  }
  if ($m.Success) {
    switch ($m.Groups[1].Value.ToLowerInvariant()) { 'letter' { $want = 'Letter' } 'us-letter' { $want = 'Letter' } 'a4' { $want = 'A4' } }
  }
  if ($want -and $want -ne $paper) { Write-Output "paper-warning: the file asks for $want but the PDF came out $paper" }

  # ---- Parse check
  if (-not (Get-Command pdftotext -ErrorAction SilentlyContinue)) { Write-Output 'parse: skipped (pdftotext not installed)'; exit 0 }
  $txtPath = Join-Path $tmp 'text.txt'
  & pdftotext -enc UTF-8 $final $txtPath 2>$null
  if (-not (Test-Path -LiteralPath $txtPath)) { Write-Output 'parse: failed (pdftotext could not read the PDF)'; exit 0 }
  $text = [IO.File]::ReadAllText($txtPath, [Text.Encoding]::UTF8)
  $lines = @($text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

  if ($engine -eq 'browser') {
    $vis = $raw -replace '(?s)<head[ >].*?</head>', ' ' -replace '(?s)<!--.*?-->', ' ' -replace '(?m)^.*class="screen-only".*$', ' '
    $vis = $vis -replace '<[^>]*>', ' ' -replace '&amp;', '&' -replace '&nbsp;', ' '
  } else { $vis = $raw }

  $good = New-Object System.Collections.Generic.List[string]
  $bad = New-Object System.Collections.Generic.List[string]
  $note = ''

  $top = ($lines | Select-Object -First 3) -join ' '
  if ($top.ToLowerInvariant().Contains($Name.ToLowerInvariant())) { $good.Add('name') } else { $bad.Add('name not in the first lines') }

  $em = [regex]::Match($vis, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
  if (-not $em.Success) { $bad.Add('no email in the file') }
  elseif ($text.ToLowerInvariant().Contains($em.Value.ToLowerInvariant())) { $good.Add('email') }
  else { $bad.Add("email $($em.Value) not readable") }

  $digits = ''
  foreach ($c in [regex]::Matches($vis, '\+?\(?[0-9][0-9 ().-]{7,}[0-9]')) {
    $d = $c.Value -replace '[^0-9]', ''
    if ($d.Length -ge 9 -and $d.Length -le 15) { $digits = $d; break }
  }
  if ($digits.Length -gt 10) { $digits = $digits.Substring($digits.Length - 10) }
  $topDigits = (($lines | Select-Object -First 12) -join ' ') -replace '[^0-9]', ''
  if (-not $digits) { $bad.Add('no phone in the file') }
  elseif ($topDigits.Contains($digits)) { $good.Add('phone') }
  else { $bad.Add('phone not readable near the top') }

  if ($kind -eq 'Resume') {
    if ($engine -eq 'browser') {
      $heads = @([regex]::Matches($raw, '(?is)<h2[^>]*>(.*?)</h2>') | ForEach-Object { ($_.Groups[1].Value -replace '<[^>]*>', '' -replace '&amp;', '&').Trim() })
    } else {
      $sec = [regex]::Match($raw, '(?ms)^  sections:\s*\r?\n(.*?)(?=^  \S|^\S|\z)')
      $heads = @([regex]::Matches($sec.Groups[1].Value, '(?m)^    ([^\s-][^:\r\n]*):\s*$') | ForEach-Object { $_.Groups[1].Value -replace '_', ' ' })
    }
    $heads = @($heads | Where-Object { $_ })
    if ($heads.Count -eq 0) { $bad.Add('no section headings found') }
    else {
      $i = 0
      foreach ($l in $lines) { if ($i -lt $heads.Count -and $l.ToLowerInvariant() -eq $heads[$i].ToLowerInvariant()) { $i++ } }
      if ($i -eq $heads.Count) { $good.Add("$($heads.Count) headings in order") }
      else { $bad.Add("heading `"$($heads[$i])`" missing or out of order") }
    }
  }

  $yearRx = '(?<![0-9])(?:19|20)[0-9]{2}(?![0-9])'
  $srcYears = @([regex]::Matches($vis, $yearRx) | ForEach-Object { $_.Value })
  $pdfYears = @([regex]::Matches($text, $yearRx) | ForEach-Object { $_.Value })
  if ($srcYears.Count -eq 0) { $bad.Add('no dates found') }
  elseif (($srcYears -join ' ') -eq ($pdfYears -join ' ')) { $good.Add('dates in order') }
  else {
    $lost = $srcYears | Where-Object { $pdfYears -notcontains $_ } | Select-Object -First 1
    if ($lost) { $bad.Add("date $lost not readable") }
    else {
      # Every date is there, just read in another order: usually a year standing alone at the right of a line
      # (a project or award). Applicant tracking systems handle that; it is a note, not something to fix.
      $good.Add('dates readable')
      $note = "dates read in a slightly different order than on the page (usually a year on its own at the right of a line); that's fine, don't change the layout for it"
    }
  }

  if ($bad.Count -eq 0) { Write-Output ("parse: ok (" + ($good -join ', ') + ")") }
  else {
    $msg = "parse: check these: " + ($bad -join '; ')
    if ($good.Count -gt 0) { $msg += " (fine: " + ($good -join ', ') + ")" }
    Write-Output $msg
  }
  if ($note) { Write-Output "parse-note: $note" }
  exit 0
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
