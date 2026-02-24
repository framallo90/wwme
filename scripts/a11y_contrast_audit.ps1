param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Convert-HexToRgb {
  param([string]$Hex)
  $value = $Hex.Trim().TrimStart('#')
  if ($value.Length -eq 3) {
    $value = "{0}{0}{1}{1}{2}{2}" -f $value[0], $value[1], $value[2]
  }
  if ($value.Length -ne 6) {
    throw "Color hex invalido: $Hex"
  }

  return [pscustomobject]@{
    R = [Convert]::ToInt32($value.Substring(0, 2), 16)
    G = [Convert]::ToInt32($value.Substring(2, 2), 16)
    B = [Convert]::ToInt32($value.Substring(4, 2), 16)
  }
}

function Get-LinearChannel {
  param([double]$Channel)
  $normalized = $Channel / 255.0
  if ($normalized -le 0.03928) {
    return $normalized / 12.92
  }
  return [Math]::Pow((($normalized + 0.055) / 1.055), 2.4)
}

function Get-Luminance {
  param([pscustomobject]$Rgb)
  $r = Get-LinearChannel -Channel $Rgb.R
  $g = Get-LinearChannel -Channel $Rgb.G
  $b = Get-LinearChannel -Channel $Rgb.B
  return (0.2126 * $r) + (0.7152 * $g) + (0.0722 * $b)
}

function Get-ContrastRatio {
  param(
    [string]$Foreground,
    [string]$Background
  )
  $fgLum = Get-Luminance -Rgb (Convert-HexToRgb -Hex $Foreground)
  $bgLum = Get-Luminance -Rgb (Convert-HexToRgb -Hex $Background)

  $lighter = [Math]::Max($fgLum, $bgLum)
  $darker = [Math]::Min($fgLum, $bgLum)
  return ($lighter + 0.05) / ($darker + 0.05)
}

$pairs = @(
  @{ id = "base-text"; fg = "#0d1a3c"; bg = "#ffffff"; min = 4.5; note = "Texto principal sobre fondo claro" },
  @{ id = "muted-text"; fg = "#4e5f86"; bg = "#ffffff"; min = 4.5; note = "Texto secundario sobre fondo claro" },
  @{ id = "button-text"; fg = "#102048"; bg = "#ecf4ff"; min = 4.5; note = "Texto de botones" },
  @{ id = "status-text"; fg = "#26406f"; bg = "#ffffff"; min = 4.5; note = "Barra de estado" },
  @{ id = "high-contrast-primary"; fg = "#0a1f45"; bg = "#ffffff"; min = 7.0; note = "Modo alto contraste primario" },
  @{ id = "high-contrast-muted"; fg = "#274377"; bg = "#ffffff"; min = 4.5; note = "Modo alto contraste secundario" }
)

$results = @()
foreach ($pair in $pairs) {
  $ratio = [Math]::Round((Get-ContrastRatio -Foreground $pair.fg -Background $pair.bg), 2)
  $ok = $ratio -ge $pair.min

  $results += [pscustomobject]@{
    id = $pair.id
    note = $pair.note
    foreground = $pair.fg
    background = $pair.bg
    ratio = $ratio
    min = $pair.min
    status = if ($ok) { "PASS" } else { "FAIL" }
  }
}

$fails = @($results | Where-Object { $_.status -eq "FAIL" })

if (-not $Quiet) {
  Write-Host "A11y contrast audit (WCAG)"
  foreach ($entry in $results) {
    Write-Host ("[{0}] {1} ratio={2}:1 min={3}:1 ({4})" -f $entry.status, $entry.id, $entry.ratio, $entry.min, $entry.note)
  }
  Write-Host ("Summary: PASS={0} FAIL={1}" -f (@($results).Count - @($fails).Count), @($fails).Count)
}

if (@($fails).Count -gt 0) {
  exit 1
}

exit 0
