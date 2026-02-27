param(
  [switch]$WhatIf,
  [string]$TargetRoot
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$skillSourceRoot = $repoRoot
$codexHome = Join-Path $HOME ".codex"
$resolvedTargetRoot = if ($TargetRoot -and $TargetRoot.Trim().Length -gt 0) {
  $TargetRoot
} else {
  Join-Path $codexHome "skills"
}

$skillsToInstall = @(
  "writewme-storycraft-pro",
  "writewme-editorial-qa",
  "writewme-kdp-production",
  "writewme-writing-suite"
)

try {
  $targetExists = Test-Path $resolvedTargetRoot
} catch {
  Write-Error "Cannot access '$resolvedTargetRoot'. Run this script in a session with access to that folder."
  exit 1
}

if (-not $targetExists) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Create directory: $resolvedTargetRoot"
  } else {
    try {
      New-Item -ItemType Directory -Path $resolvedTargetRoot -Force | Out-Null
    } catch {
      Write-Error "Cannot create '$resolvedTargetRoot'. Check folder permissions and try again."
      exit 1
    }
  }
}

foreach ($skillName in $skillsToInstall) {
  $sourcePath = Join-Path $skillSourceRoot $skillName
  if (-not (Test-Path $sourcePath)) {
    throw "Skill source folder not found: $sourcePath"
  }

  $destPath = Join-Path $resolvedTargetRoot $skillName
  if ($WhatIf) {
    Write-Host "[WhatIf] Copy $sourcePath -> $destPath"
    continue
  }

  if (Test-Path $destPath) {
    Remove-Item $destPath -Recurse -Force
  }

  Copy-Item $sourcePath $destPath -Recurse -Force
  Write-Host "Installed: $skillName"
}

Write-Host ""
Write-Host "Done. Restart Codex session to refresh the skill list."
