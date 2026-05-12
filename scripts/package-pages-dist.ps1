#!/usr/bin/env pwsh
param(
    [switch]$NoPdf,
    [switch]$SkipPrepare,
    [string]$Output = "dist/milu_publish_upload.zip"
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [string]$Command,
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Command $($Arguments -join ' ')"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distDir = Join-Path $repoRoot "dist\milu_publish"

Push-Location $repoRoot
try {
    if (-not $SkipPrepare) {
        Write-Host "Preparing publish dist (pages:prepare)..."
        Invoke-CheckedCommand -Command "npm" -Arguments @("run", "pages:prepare")
    }

    if (-not (Test-Path -Path $distDir)) {
        throw "Missing dist folder: $distDir"
    }

    Write-Host "ZIP packaging disabled by project preference."
    Write-Host "Publish folder ready: $distDir"
    Write-Host "No ZIP file was generated (Output argument ignored: $Output)."
}
finally {
    Pop-Location
}
