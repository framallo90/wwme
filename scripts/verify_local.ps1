param(
  [string]$ProjectPath = (Get-Location).Path,
  [string[]]$Only = @(),
  [string[]]$Skip = @(),
  [string]$BookPath = "",
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$script:IsWindowsHost = $env:OS -eq "Windows_NT"

function Normalize-CheckList {
  param([string[]]$Values)
  $normalized = @()
  foreach ($value in $Values) {
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }
    $normalized += $value.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  }
  return @($normalized)
}

function Normalize-ProjectPath {
  param([string]$InputPath)
  $resolved = Resolve-Path -LiteralPath $InputPath
  return $resolved.Path
}

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

  if ($script:IsWindowsHost -and ($FileName -eq "npm" -or $FileName -eq "npx")) {
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

  if (-not $psi.FileName) {
    return [pscustomobject]@{
      ExitCode = 127
      StdOut = ""
      StdErr = "Nombre de comando vacio."
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
    }
  }

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdout.Trim()
    StdErr = $stderr.Trim()
  }
}

function New-CheckResult {
  param(
    [string]$Id,
    [string]$Category,
    [string]$Name,
    [string]$Status,
    [string]$Summary,
    [string]$Details,
    [long]$DurationMs
  )

  return [pscustomobject]@{
    id = $Id
    category = $Category
    name = $Name
    status = $Status
    summary = $Summary
    details = $Details
    durationMs = $DurationMs
  }
}

function Test-BookStructure {
  param([string]$PathToBook)

  if (-not (Test-Path -LiteralPath $PathToBook)) {
    return [pscustomobject]@{
      Ok = $false
      Message = "No existe la carpeta de libro: $PathToBook"
      Details = ""
    }
  }

  $bookJsonPath = Join-Path $PathToBook "book.json"
  $chaptersPath = Join-Path $PathToBook "chapters"
  $assetsPath = Join-Path $PathToBook "assets"
  $versionsPath = Join-Path $PathToBook "versions"
  $missing = @()

  if (-not (Test-Path -LiteralPath $bookJsonPath)) { $missing += "book.json" }
  if (-not (Test-Path -LiteralPath $chaptersPath)) { $missing += "chapters/" }
  if (-not (Test-Path -LiteralPath $assetsPath)) { $missing += "assets/" }
  if (-not (Test-Path -LiteralPath $versionsPath)) { $missing += "versions/" }

  if ($missing.Count -gt 0) {
    return [pscustomobject]@{
      Ok = $false
      Message = "Estructura incompleta de libro."
      Details = "Faltan: $($missing -join ", ")"
    }
  }

  try {
    $metadata = Get-Content -LiteralPath $bookJsonPath -Raw | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{
      Ok = $false
      Message = "book.json invalido."
      Details = $_.Exception.Message
    }
  }

  if (-not $metadata.chapterOrder -or $metadata.chapterOrder.Count -eq 0) {
    return [pscustomobject]@{
      Ok = $false
      Message = "book.json sin chapterOrder."
      Details = ""
    }
  }

  $missingChapters = @()
  foreach ($chapterId in $metadata.chapterOrder) {
    $chapterFile = Join-Path $chaptersPath ("{0}.json" -f $chapterId)
    if (-not (Test-Path -LiteralPath $chapterFile)) {
      $missingChapters += $chapterFile
    }
  }

  if ($missingChapters.Count -gt 0) {
    return [pscustomobject]@{
      Ok = $false
      Message = "Capitulos faltantes segun chapterOrder."
      Details = $missingChapters -join "; "
    }
  }

  return [pscustomobject]@{
    Ok = $true
    Message = "Estructura de libro valida."
    Details = "Capitulos: $($metadata.chapterOrder.Count)"
  }
}

$projectRoot = Normalize-ProjectPath -InputPath $ProjectPath
$Only = @(Normalize-CheckList -Values $Only)
$Skip = @(Normalize-CheckList -Values $Skip)
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path $projectRoot "reports\verify"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$reportPath = Join-Path $reportDir ("verify-{0}.json" -f $timestamp)

# Add future checks by appending entries to this array.
# Required keys: id, category, name, run (scriptblock returning status/summary/details).
$checks = @(
  @{
    id = "env.node"
    category = "env"
    name = "Node.js disponible"
    run = {
      $result = Invoke-ExternalCommand -FileName "node" -Arguments @("--version") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Node detectado: $($result.StdOut)"; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "Node no disponible."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "env.npm"
    category = "env"
    name = "npm disponible"
    run = {
      $result = Invoke-ExternalCommand -FileName "npm" -Arguments @("--version") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "npm detectado: $($result.StdOut)"; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "npm no disponible."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "env.cargo"
    category = "env"
    name = "Cargo disponible"
    run = {
      $result = Invoke-ExternalCommand -FileName "cargo" -Arguments @("--version") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Cargo detectado: $($result.StdOut)"; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "Cargo no disponible en PATH."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "env.rustc"
    category = "env"
    name = "rustc disponible"
    run = {
      $result = Invoke-ExternalCommand -FileName "rustc" -Arguments @("--version") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "rustc detectado: $($result.StdOut)"; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "rustc no disponible en PATH."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "env.ollama-binary"
    category = "env"
    name = "Ollama CLI disponible"
    run = {
      $result = Invoke-ExternalCommand -FileName "ollama" -Arguments @("--version") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Ollama CLI detectado."; details = ($result.StdOut + " " + $result.StdErr).Trim() }
      }
      return @{ status = "WARN"; summary = "No se detecto Ollama CLI."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "env.ollama-api"
    category = "env"
    name = "Ollama API local"
    run = {
      try {
        $response = Invoke-RestMethod -Method Get -Uri "http://localhost:11434/api/tags" -TimeoutSec 4
        $count = 0
        if ($response.models) { $count = $response.models.Count }
        return @{ status = "PASS"; summary = "Ollama API responde en localhost:11434."; details = "Modelos detectados: $count" }
      } catch {
        return @{ status = "WARN"; summary = "Ollama API no responde en localhost:11434."; details = $_.Exception.Message }
      }
    }
  },
  @{
    id = "tool.node-spawn"
    category = "tooling"
    name = "Node child_process spawn"
    run = {
      $cmd = @(
        "-e",
        "const cp=require('child_process');const r=cp.spawnSync(process.execPath,['-v'],{stdio:'pipe'});if(r.error){console.error(r.error.message);process.exit(2)};if(r.status!==0){console.error(String(r.stderr||''));process.exit(r.status)};console.log(String(r.stdout||'').trim());"
      )
      $result = Invoke-ExternalCommand -FileName "node" -Arguments $cmd -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Node puede crear subprocesos."; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "Node no puede crear subprocesos (spawn)."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "tool.esbuild-spawn"
    category = "tooling"
    name = "esbuild worker"
    run = {
      $cmd = @(
        "-e",
        "const esbuild=require('esbuild');esbuild.build({stdin:{contents:'console.log(1)',sourcefile:'in.js'},bundle:true,write:false}).then(()=>console.log('ok')).catch(e=>{console.error(e && e.message ? e.message : e);process.exit(1)});"
      )
      $result = Invoke-ExternalCommand -FileName "node" -Arguments $cmd -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "esbuild operativo."; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "esbuild no pudo iniciar worker."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "app.lint"
    category = "app"
    name = "Lint"
    run = {
      $result = Invoke-ExternalCommand -FileName "npm" -Arguments @("run", "lint") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Lint OK."; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "Lint con errores."; details = ($result.StdErr + "`n" + $result.StdOut).Trim() }
    }
  },
  @{
    id = "app.typecheck"
    category = "app"
    name = "TypeScript build"
    run = {
      $result = Invoke-ExternalCommand -FileName "npx" -Arguments @("tsc", "-b") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "TypeScript OK."; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "TypeScript con errores."; details = ($result.StdErr + "`n" + $result.StdOut).Trim() }
    }
  },
  @{
    id = "app.tests"
    category = "app"
    name = "Unit tests"
    run = {
      $result = Invoke-ExternalCommand -FileName "npm" -Arguments @("run", "test") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Tests unitarios OK."; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "Tests unitarios con errores."; details = ($result.StdErr + "`n" + $result.StdOut).Trim() }
    }
  },
  @{
    id = "app.a11y-contrast"
    category = "app"
    name = "A11y contrast (WCAG)"
    run = {
      $scriptPath = Join-Path $projectRoot "scripts\a11y_contrast_audit.ps1"
      if (-not (Test-Path -LiteralPath $scriptPath)) {
        return @{ status = "FAIL"; summary = "No se encontro scripts/a11y_contrast_audit.ps1."; details = $scriptPath }
      }

      $result = Invoke-ExternalCommand -FileName "powershell" -Arguments @("-ExecutionPolicy", "Bypass", "-File", $scriptPath, "-Quiet") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Contraste WCAG OK."; details = "Sin violaciones detectadas." }
      }
      return @{ status = "FAIL"; summary = "Contraste WCAG con fallos."; details = ($result.StdErr + "`n" + $result.StdOut).Trim() }
    }
  },
  @{
    id = "app.build"
    category = "app"
    name = "Frontend build"
    run = {
      $result = Invoke-ExternalCommand -FileName "npm" -Arguments @("run", "build") -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Build frontend OK."; details = $result.StdOut }
      }
      return @{ status = "FAIL"; summary = "Build frontend fallo."; details = ($result.StdErr + "`n" + $result.StdOut).Trim() }
    }
  },
  @{
    id = "tauri.metadata"
    category = "tauri"
    name = "Cargo metadata"
    run = {
      $manifestPath = Join-Path $projectRoot "src-tauri\Cargo.toml"
      if (-not (Test-Path -LiteralPath $manifestPath)) {
        return @{ status = "FAIL"; summary = "No se encontro src-tauri/Cargo.toml."; details = $manifestPath }
      }

      $result = Invoke-ExternalCommand -FileName "cargo" -Arguments @("metadata", "--no-deps", "--format-version", "1", "--manifest-path", $manifestPath) -WorkingDirectory $projectRoot
      if ($result.ExitCode -eq 0) {
        return @{ status = "PASS"; summary = "Cargo metadata OK."; details = "workspace resolvible" }
      }
      return @{ status = "FAIL"; summary = "Cargo metadata fallo."; details = ($result.StdErr + " " + $result.StdOut).Trim() }
    }
  },
  @{
    id = "book.structure"
    category = "book"
    name = "Estructura de libro de ejemplo"
    run = {
      $candidate = $BookPath
      if ([string]::IsNullOrWhiteSpace($candidate)) {
        $candidate = Join-Path $projectRoot "examples\demo-book"
      }

      $inspection = Test-BookStructure -PathToBook $candidate
      if ($inspection.Ok) {
        return @{ status = "PASS"; summary = $inspection.Message; details = "Path: $candidate | $($inspection.Details)" }
      }
      return @{ status = "FAIL"; summary = $inspection.Message; details = "Path: $candidate | $($inspection.Details)" }
    }
  }
)

$selectedChecks = @()
foreach ($check in $checks) {
  $id = $check.id
  if (@($Only).Count -gt 0 -and -not (@($Only) -contains $id)) {
    continue
  }
  if (@($Skip).Count -gt 0 -and (@($Skip) -contains $id)) {
    continue
  }
  $selectedChecks += $check
}

$results = @()
if (-not $Quiet) {
  Write-Host ""
  Write-Host "WriteWMe local verification"
  Write-Host "Project: $projectRoot"
  Write-Host "Checks: $($selectedChecks.Count)"
  Write-Host ""
}

foreach ($check in $selectedChecks) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $status = "FAIL"
  $summary = ""
  $details = ""

  try {
    $outcome = & $check.run
    $status = [string]$outcome.status
    $summary = [string]$outcome.summary
    $details = [string]$outcome.details
  } catch {
    $status = "FAIL"
    $summary = "Excepcion durante el check."
    $details = $_.Exception.Message
  } finally {
    $sw.Stop()
  }

  $result = New-CheckResult -Id $check.id -Category $check.category -Name $check.name -Status $status -Summary $summary -Details $details -DurationMs $sw.ElapsedMilliseconds
  $results += $result

  if (-not $Quiet) {
    Write-Host ("[{0}] {1} ({2} ms) - {3}" -f $result.status, $result.id, $result.durationMs, $result.summary)
  }
}

$counts = @{
  PASS = @($results | Where-Object { $_.status -eq "PASS" }).Count
  WARN = @($results | Where-Object { $_.status -eq "WARN" }).Count
  FAIL = @($results | Where-Object { $_.status -eq "FAIL" }).Count
}

$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("o")
  projectPath = $projectRoot
  powershellVersion = $PSVersionTable.PSVersion.ToString()
  checksRun = $results.Count
  summary = $counts
  results = $results
}

$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Summary: PASS=$($counts.PASS) WARN=$($counts.WARN) FAIL=$($counts.FAIL)"
  Write-Host "Report: $reportPath"
}

if ($counts.FAIL -gt 0) {
  exit 1
}

exit 0
