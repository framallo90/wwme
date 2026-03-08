param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-ProjectRoot {
  param([string]$InputPath)

  $resolved = Resolve-Path -LiteralPath $InputPath
  return $resolved.Path
}

function Join-CommandForDisplay {
  param(
    [string]$FileName,
    [string[]]$Arguments = @()
  )

  if (-not $Arguments -or $Arguments.Count -eq 0) {
    return $FileName
  }

  $parts = @($FileName) + ($Arguments | ForEach-Object { Format-ArgumentValue -Value ([string]$_) })
  return ($parts -join " ")
}

function Format-ArgumentValue {
  param([string]$Value)

  if ($null -eq $Value) {
    return '""'
  }

  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }

  return $Value
}

function Invoke-ExternalCommand {
  param(
    [string]$FileName,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory,
    [switch]$UseCmdShim
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  $displayCommand = Join-CommandForDisplay -FileName $FileName -Arguments $Arguments

  if ($UseCmdShim) {
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/d /s /c `"$displayCommand`""
  } else {
    $psi.FileName = $FileName
    $psi.Arguments = if ($Arguments.Count -gt 0) {
      ($Arguments | ForEach-Object { Format-ArgumentValue -Value ([string]$_) }) -join " "
    } else {
      ""
    }
  }

  try {
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    return [pscustomobject]@{
      Command = $displayCommand
      ExitCode = $process.ExitCode
      StdOut = $stdout.TrimEnd()
      StdErr = $stderr.TrimEnd()
      StartError = $null
    }
  } catch {
    return [pscustomobject]@{
      Command = $displayCommand
      ExitCode = 127
      StdOut = ""
      StdErr = ""
      StartError = $_.Exception.Message
    }
  }
}

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "=== $Title ==="
}

function Write-CommandOutput {
  param($Result)

  if (-not $Result) {
    return
  }

  if ($Result.StartError) {
    Write-Host $Result.StartError
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($Result.StdOut)) {
    Write-Host $Result.StdOut
  }

  if (-not [string]::IsNullOrWhiteSpace($Result.StdErr)) {
    Write-Host $Result.StdErr
  }
}

function Add-Blocker {
  param(
    [System.Collections.Generic.List[object]]$List,
    [string]$Category,
    [string]$Kind,
    [string]$Summary,
    [string]$Rerun
  )

  $List.Add([pscustomobject]@{
    Category = $Category
    Kind = $Kind
    Summary = $Summary
    Rerun = $Rerun
  })
}

$projectRoot = Resolve-ProjectRoot -InputPath $ProjectPath
$blockers = New-Object 'System.Collections.Generic.List[object]'
$checkResults = @()

Write-Host "Project: $projectRoot"

$nodeResult = Invoke-ExternalCommand -FileName "node" -Arguments @("--version") -WorkingDirectory $projectRoot
$npmResult = Invoke-ExternalCommand -FileName "npm" -Arguments @("--version") -WorkingDirectory $projectRoot -UseCmdShim
$cargoResult = Invoke-ExternalCommand -FileName "cargo" -Arguments @("--version") -WorkingDirectory $projectRoot
$rustcResult = Invoke-ExternalCommand -FileName "rustc" -Arguments @("--version") -WorkingDirectory $projectRoot

$hasNode = $nodeResult.ExitCode -eq 0
$hasNpm = $npmResult.ExitCode -eq 0
$hasCargo = $cargoResult.ExitCode -eq 0
$hasRustc = $rustcResult.ExitCode -eq 0
$spawnResult = $null
$esbuildProbeResult = $null

Write-Section -Title "Environment"
Write-Host "Node: $hasNode"
Write-Host "Npm: $hasNpm"
Write-Host "Cargo: $hasCargo"
Write-Host "Rustc: $hasRustc"

if (-not $hasNode) {
  Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "Node no disponible en PATH." -Rerun "node --version"
}
if (-not $hasNpm) {
  Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "npm no disponible en PATH." -Rerun "npm --version"
}
if (-not $hasCargo) {
  Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "cargo no disponible en PATH." -Rerun "cargo --version"
}
if (-not $hasRustc) {
  Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "rustc no disponible en PATH." -Rerun "rustc --version"
}

Write-Section -Title "node child_process spawn"
if ($hasNode) {
  $spawnResult = Invoke-ExternalCommand -FileName "node" -Arguments @(
    "-e",
    "const cp=require('child_process');const r=cp.spawnSync(process.execPath,['-v'],{windowsHide:true,stdio:'pipe'});if(r.error){console.error(r.error.message);process.exit(2)};if(r.status!==0){console.error(String(r.stderr||''));process.exit(r.status)};console.log(String(r.stdout||'').trim());"
  ) -WorkingDirectory $projectRoot
  Write-CommandOutput -Result $spawnResult
  $spawnStatus = if ($spawnResult.ExitCode -eq 0) { "PASS" } else { "FAIL" }
  Write-Host ("Result: {0}{1}" -f $spawnStatus, $(if ($spawnStatus -eq "FAIL") { " (exit $($spawnResult.ExitCode))" } else { "" }))
  $checkResults += [pscustomobject]@{ Name = "node child_process spawn"; Status = $spawnStatus }
  if ($spawnResult.ExitCode -ne 0) {
    Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "Node no puede crear subprocesos con pipes en este entorno." -Rerun "node -e `"const cp=require('child_process'); const p=cp.spawn(process.execPath,['-v'],{windowsHide:true,stdio:['pipe','pipe','inherit']}); p.on('error',e=>{console.error(e); process.exit(1);}); p.stdout.on('data',d=>process.stdout.write(d)); p.on('exit',c=>process.exit(c ?? 0));`""
  }
} else {
  Write-Host "Node no disponible; no se pudo ejecutar el check."
  Write-Host "Result: FAIL"
  $checkResults += [pscustomobject]@{ Name = "node child_process spawn"; Status = "FAIL" }
}

Write-Section -Title "esbuild worker"
if ($hasNode) {
  $esbuildProbeResult = Invoke-ExternalCommand -FileName "node" -Arguments @(
    "-e",
    "const esbuild=require('esbuild');esbuild.build({stdin:{contents:'console.log(1)',sourcefile:'in.js'},bundle:true,write:false}).then(()=>console.log('OK')).catch(err=>{console.error(err && err.message ? err.message : err);process.exit(1);});"
  ) -WorkingDirectory $projectRoot
  Write-CommandOutput -Result $esbuildProbeResult
  $esbuildProbeStatus = if ($esbuildProbeResult.ExitCode -eq 0) { "PASS" } else { "FAIL" }
  Write-Host ("Result: {0}{1}" -f $esbuildProbeStatus, $(if ($esbuildProbeStatus -eq "FAIL") { " (exit $($esbuildProbeResult.ExitCode))" } else { "" }))
  $checkResults += [pscustomobject]@{ Name = "esbuild worker"; Status = $esbuildProbeStatus }
  if ($esbuildProbeResult.ExitCode -ne 0) {
    Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "esbuild no pudo iniciar su worker en este entorno." -Rerun "node -e `"require('esbuild').build({stdin:{contents:'console.log(1)',sourcefile:'in.js'},outfile:'out.js',write:true}).then(()=>console.log('OK')).catch(err=>{console.error(err); process.exit(1);})`""
  }
} else {
  Write-Host "Node no disponible; no se pudo ejecutar el check."
  Write-Host "Result: FAIL"
  $checkResults += [pscustomobject]@{ Name = "esbuild worker"; Status = "FAIL" }
}

Write-Section -Title "npm run lint"
if ($hasNpm) {
  $lintResult = Invoke-ExternalCommand -FileName "npm" -Arguments @("run", "lint") -WorkingDirectory $projectRoot -UseCmdShim
  Write-CommandOutput -Result $lintResult
  $lintStatus = if ($lintResult.ExitCode -eq 0) { "PASS" } else { "FAIL" }
  Write-Host ("Result: {0}{1}" -f $lintStatus, $(if ($lintStatus -eq "FAIL") { " (exit $($lintResult.ExitCode))" } else { "" }))
  $checkResults += [pscustomobject]@{ Name = "npm run lint"; Status = $lintStatus }
  if ($lintResult.ExitCode -ne 0) {
    Add-Blocker -List $blockers -Category "Build" -Kind "code" -Summary "npm run lint fallo." -Rerun "npm run lint"
  }
} else {
  Write-Host "npm no disponible; no se pudo ejecutar lint."
  Write-Host "Result: FAIL"
  $checkResults += [pscustomobject]@{ Name = "npm run lint"; Status = "FAIL" }
}

Write-Section -Title "npm run build"
if ($hasNpm) {
  $buildResult = Invoke-ExternalCommand -FileName "npm" -Arguments @("run", "build") -WorkingDirectory $projectRoot -UseCmdShim
  Write-CommandOutput -Result $buildResult
  $buildStatus = if ($buildResult.ExitCode -eq 0) { "PASS" } else { "FAIL" }
  Write-Host ("Result: {0}{1}" -f $buildStatus, $(if ($buildStatus -eq "FAIL") { " (exit $($buildResult.ExitCode))" } else { "" }))
  $checkResults += [pscustomobject]@{ Name = "npm run build"; Status = $buildStatus }
  if ($buildResult.ExitCode -ne 0) {
    $buildText = (($buildResult.StdOut + "`n" + $buildResult.StdErr).Trim())
    $looksLikeSpawnRestriction =
      ($buildText -match "spawn EPERM") -or
      ($buildText -match "spawn EINVAL") -or
      ($spawnResult -and $spawnResult.ExitCode -ne 0) -or
      ($esbuildProbeResult -and $esbuildProbeResult.ExitCode -ne 0)

    if ($looksLikeSpawnRestriction) {
      Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "npm run build fallo por restriccion de spawn/esbuild del entorno." -Rerun "npm run build"
    } else {
      Add-Blocker -List $blockers -Category "Build" -Kind "code" -Summary "npm run build fallo." -Rerun "npm run build"
    }
  }
} else {
  Write-Host "npm no disponible; no se pudo ejecutar build."
  Write-Host "Result: FAIL"
  $checkResults += [pscustomobject]@{ Name = "npm run build"; Status = "FAIL" }
}

Write-Section -Title "cargo --version"
Write-CommandOutput -Result $cargoResult
Write-Host ("Result: {0}" -f $(if ($hasCargo) { "PASS" } else { "FAIL" }))
$checkResults += [pscustomobject]@{ Name = "cargo --version"; Status = $(if ($hasCargo) { "PASS" } else { "FAIL" }) }

Write-Section -Title "rustc --version"
Write-CommandOutput -Result $rustcResult
Write-Host ("Result: {0}" -f $(if ($hasRustc) { "PASS" } else { "FAIL" }))
$checkResults += [pscustomobject]@{ Name = "rustc --version"; Status = $(if ($hasRustc) { "PASS" } else { "FAIL" }) }

Write-Section -Title "cargo metadata"
$manifestPath = Join-Path $projectRoot "src-tauri\Cargo.toml"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Write-Host "No se encontro src-tauri/Cargo.toml"
  Write-Host "Result: FAIL"
  $checkResults += [pscustomobject]@{ Name = "cargo metadata"; Status = "FAIL" }
  Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "No se encontro src-tauri/Cargo.toml." -Rerun "cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml"
} elseif (-not $hasCargo) {
  Write-Host "cargo no disponible; no se pudo ejecutar cargo metadata."
  Write-Host "Result: FAIL"
  $checkResults += [pscustomobject]@{ Name = "cargo metadata"; Status = "FAIL" }
} else {
  $metadataResult = Invoke-ExternalCommand -FileName "cargo" -Arguments @("metadata", "--no-deps", "--format-version", "1", "--manifest-path", $manifestPath) -WorkingDirectory $projectRoot
  Write-CommandOutput -Result $metadataResult
  $metadataStatus = if ($metadataResult.ExitCode -eq 0) { "PASS" } else { "FAIL" }
  Write-Host ("Result: {0}{1}" -f $metadataStatus, $(if ($metadataStatus -eq "FAIL") { " (exit $($metadataResult.ExitCode))" } else { "" }))
  $checkResults += [pscustomobject]@{ Name = "cargo metadata"; Status = $metadataStatus }
  if ($metadataResult.ExitCode -ne 0) {
    Add-Blocker -List $blockers -Category "Build" -Kind "environment" -Summary "cargo metadata fallo." -Rerun "cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml"
  }
}

Write-Section -Title "Checks Summary"
foreach ($check in $checkResults) {
  Write-Host ("{0}: {1}" -f $check.Name, $check.Status)
}

Write-Section -Title "Blockers"
if ($blockers.Count -eq 0) {
  Write-Host "None"
} else {
  foreach ($blocker in $blockers) {
    Write-Host ("- [{0}] ({1}) {2}" -f $blocker.Category, $blocker.Kind, $blocker.Summary)
    Write-Host ("  Rerun: {0}" -f $blocker.Rerun)
  }
}

$finalStatus = if ($blockers.Count -eq 0) { "PASS" } else { "FAIL" }
Write-Host ""
Write-Host "Final: $finalStatus"

if ($finalStatus -eq "FAIL") {
  exit 1
}

exit 0
