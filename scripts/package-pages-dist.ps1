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
$zipPath = Join-Path $repoRoot $Output

Push-Location $repoRoot
try {
    if (-not $SkipPrepare) {
        Write-Host "Preparing publish dist (pages:prepare)..."
        Invoke-CheckedCommand -Command "npm" -Arguments @("run", "pages:prepare")
    }

    if (-not (Test-Path -Path $distDir)) {
        throw "Missing dist folder: $distDir"
    }

    if (Test-Path -Path $zipPath) {
        Remove-Item -Path $zipPath -Force
    }

    $zipDir = Split-Path -Parent $zipPath
    if (-not [string]::IsNullOrWhiteSpace($zipDir)) {
        New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
    }

    $tarArgs = @("-a", "-c", "-f", $zipPath)
    if ($NoPdf) {
        Write-Host "Packing ZIP without pdf/ folder..."
        $tarArgs += @("--exclude=./pdf", "--exclude=./pdf/*")
    }
    else {
        Write-Host "Packing ZIP with full dist content..."
    }
    $tarArgs += @("-C", $distDir, ".")

    Invoke-CheckedCommand -Command "tar.exe" -Arguments $tarArgs

    $zipInfo = Get-Item -Path $zipPath
    Write-Host "ZIP ready: $($zipInfo.FullName)"
    Write-Host "Size (bytes): $($zipInfo.Length)"
}
finally {
    Pop-Location
}
