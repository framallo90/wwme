param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-ExternalCommand {
  param(
    [string]$FileName,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  if ($env:OS -eq "Windows_NT" -and ($FileName -eq "npm" -or $FileName -eq "npx")) {
    $escapedForCmd = @($FileName)
    if ($Arguments) {
      $escapedForCmd += ($Arguments | ForEach-Object {
        $current = [string]$_
        if ($current -match '[\s"]') {
          '"' + ($current -replace '"', '\"') + '"'
        } else {
          $current
        }
      })
    }
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/d /s /c `"$([string]::Join(' ', $escapedForCmd))`""
  } else {
    $psi.FileName = $FileName
    if ($Arguments) {
      $escapedArguments = $Arguments | ForEach-Object {
        $current = [string]$_
        if ($current -match '[\s"]') {
          '"' + ($current -replace '"', '\"') + '"'
        } else {
          $current
        }
      }
      $psi.Arguments = [string]::Join(" ", $escapedArguments)
    }
  }

  try {
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
  } catch {
    return [pscustomobject]@{
      ExitCode = 127
      StdOut = ""
      StdErr = $_.Exception.Message
      Error = $_.Exception.Message
    }
  }

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdout.Trim()
    StdErr = $stderr.Trim()
    Error = ""
  }
}

function Invoke-Step {
  param(
    [string]$Id,
    [string]$Label,
    [string]$Command,
    [string[]]$CommandArgs,
    [string]$WorkingDirectory,
    [bool]$Required = $true
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $result = Invoke-ExternalCommand -FileName $Command -Arguments $CommandArgs -WorkingDirectory $WorkingDirectory
  $sw.Stop()

  $status = "FAIL"
  if ($result.ExitCode -eq 0) {
    $status = "PASS"
  } elseif (-not $Required) {
    $status = "WARN"
  }

  return [pscustomobject]@{
    id = $Id
    label = $Label
    command = ($Command + " " + ($CommandArgs -join " ")).Trim()
    required = $Required
    status = $status
    exitCode = $result.ExitCode
    durationMs = [Math]::Round($sw.Elapsed.TotalMilliseconds)
    stdout = $result.StdOut
    stderr = $result.StdErr
    error = $result.Error
  }
}

$projectRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
$timestamp = (Get-Date).ToString("s").Replace(":", "-").Replace(".", "-")
$outputDir = Join-Path $projectRoot ("reports\visual-qa\e2e-" + $timestamp)
$null = New-Item -ItemType Directory -Force -Path $outputDir

$cssAuditPath = Join-Path $outputDir "css-token-audit.json"
$tokenPath = Join-Path $outputDir "design-tokens.json"

$steps = @()
$steps += Invoke-Step -Id "stress-ui" -Label "Stress render de vistas pesadas" -Command "npm" -CommandArgs @("run", "verify:stress-ui") -WorkingDirectory $projectRoot
$steps += Invoke-Step -Id "a11y-contrast" -Label "Contraste WCAG" -Command "npm" -CommandArgs @("run", "verify:a11y-contrast") -WorkingDirectory $projectRoot
$steps += Invoke-Step -Id "css-token-audit" -Label "Auditoria de colores hardcodeados" -Command "npm" -CommandArgs @("run", "audit:css-tokens", "--", "--output", $cssAuditPath) -WorkingDirectory $projectRoot
$steps += Invoke-Step -Id "design-token-export" -Label "Exportacion de design tokens" -Command "npm" -CommandArgs @("run", "design:tokens", "--", "--output", $tokenPath) -WorkingDirectory $projectRoot

$summary = @{
  PASS = @($steps | Where-Object { $_.status -eq "PASS" }).Count
  WARN = @($steps | Where-Object { $_.status -eq "WARN" }).Count
  FAIL = @($steps | Where-Object { $_.status -eq "FAIL" }).Count
}

$manifestPath = Join-Path $outputDir "manifest.json"
$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("o")
  source = "scripts/visual_qa_e2e.ps1"
  outputDir = $outputDir
  summary = $summary
  steps = $steps
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host $manifestPath

if ($summary.FAIL -gt 0) {
  exit 1
}

exit 0
