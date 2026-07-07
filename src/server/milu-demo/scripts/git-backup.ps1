param(
    [string]$Message = "",
    [string]$BackupRemote = "backup",
    [string]$BackupRoot = "C:\Users\jordi\source\backend\milu",
    [string]$BackupPrefix = "milu",
    [string[]]$ExcludedTopLevel = @(
        ".git",
        "node_modules",
        ".venv",
        "dist",
        "esquemas",
        "esquemas_pos_circulos",
        "json_originales",
        "zz_old",
        "zz_copias",
        "fotos_articulos",
        "fotos_motores",
        "pdf"
    ),
    [switch]$NoCommit,
    [switch]$NoPush,
    [switch]$NoZip,
    [switch]$AllowMain,
    [switch]$NoStatus
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

function Test-RemoteExists {
    param([string]$RemoteName)

    & git remote get-url $RemoteName *> $null
    return ($LASTEXITCODE -eq 0)
}

function Get-SafeFileNamePart {
    param([string]$Value)

    $invalidChars = [System.IO.Path]::GetInvalidFileNameChars()
    $sanitized = -join ($Value.ToCharArray() | ForEach-Object {
            if ($invalidChars -contains $_ -or $_ -eq '/' -or $_ -eq '\\') { '-' }
            else { $_ }
        })

    # Avoid edge cases like empty values or leading/trailing separators.
    $sanitized = $sanitized.Trim(' ', '.', '-')
    if ([string]::IsNullOrWhiteSpace($sanitized)) {
        return 'unknown'
    }

    return $sanitized
}

function Test-ReadableFile {
    param([string]$Path)

    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $stream.Dispose()
        return $true
    }
    catch {
        return $false
    }
}

function New-RepoZipSnapshot {
    param(
        [string]$SourceRoot,
        [string]$ZipPath,
        [string[]]$ExcludedTopLevel
    )

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $sourceRootNormalized = [System.IO.Path]::GetFullPath($SourceRoot)
    if (-not $sourceRootNormalized.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $sourceRootNormalized += [System.IO.Path]::DirectorySeparatorChar
    }

    $files = Get-ChildItem -LiteralPath $SourceRoot -Recurse -Force -File | Where-Object {
        $fullPath = [System.IO.Path]::GetFullPath($_.FullName)
        $relativePath = $fullPath.Substring($sourceRootNormalized.Length)
        $parts = $relativePath -split "[\\/]"
        $topLevel = if ($parts.Length -gt 0) { $parts[0] } else { "" }

        if ($ExcludedTopLevel -contains $topLevel) { return $false }
        if ($relativePath -match "(^|[\\/])__pycache__([\\/]|$)") { return $false }
        if ($_.Extension -ieq ".pyc") { return $false }

        return $true
    }

    if (Test-Path -LiteralPath $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    $zipFileStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::CreateNew)
    $zipArchive = New-Object System.IO.Compression.ZipArchive($zipFileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    $skipped = New-Object System.Collections.Generic.List[string]

    try {
        foreach ($file in $files) {
            $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
            $relativePath = $fullPath.Substring($sourceRootNormalized.Length)

            if (-not (Test-ReadableFile -Path $fullPath)) {
                $skipped.Add($relativePath)
                continue
            }

            $entryPath = $relativePath.Replace('\\', '/')
            $entry = $zipArchive.CreateEntry($entryPath, [System.IO.Compression.CompressionLevel]::Optimal)

            $inStream = [System.IO.File]::Open($fullPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $outStream = $entry.Open()
            try {
                $inStream.CopyTo($outStream)
            }
            finally {
                $outStream.Dispose()
                $inStream.Dispose()
            }
        }
    }
    finally {
        $zipArchive.Dispose()
        $zipFileStream.Dispose()
    }

    return $skipped
}

Invoke-CheckedCommand -Command "git" -Arguments @("rev-parse", "--is-inside-work-tree")

$repoRoot = (& git rev-parse --show-toplevel).Trim()
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()

if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq "HEAD") {
    throw "Could not detect the current branch. Checkout a branch and retry."
}

if (-not $AllowMain -and ($branch -eq "main" -or $branch -eq "master")) {
    throw "Refusing to run on $branch. Use a work branch or pass -AllowMain."
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Git + Backup workflow" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Repo   : $repoRoot"
Write-Host "Branch : $branch"
Write-Host ""

if (-not $NoStatus) {
    Write-Host "Current status:" -ForegroundColor Yellow
    & git status --short
    Write-Host ""
}

if (-not $NoCommit) {
    Write-Host "Staging changes..." -ForegroundColor Yellow
    Invoke-CheckedCommand -Command "git" -Arguments @("add", "-A")

    & git diff --cached --quiet
    $hasStagedChanges = ($LASTEXITCODE -ne 0)

    if ($hasStagedChanges) {
        if ([string]::IsNullOrWhiteSpace($Message)) {
            $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
            $Message = "chore: backup checkpoint $stamp"
        }

        Write-Host "Creating commit..." -ForegroundColor Yellow
        Invoke-CheckedCommand -Command "git" -Arguments @("commit", "-m", $Message)
    }
    else {
        Write-Host "No staged changes found. Skipping commit." -ForegroundColor Gray
    }

    Write-Host ""
}

if (-not $NoPush) {
    if (-not (Test-RemoteExists -RemoteName "origin")) {
        throw "Remote 'origin' does not exist."
    }

    Write-Host "Pushing to origin/$branch..." -ForegroundColor Yellow
    Invoke-CheckedCommand -Command "git" -Arguments @("push", "-u", "origin", $branch)

    if (Test-RemoteExists -RemoteName $BackupRemote) {
        Write-Host "Pushing to $BackupRemote/$branch..." -ForegroundColor Yellow
        Invoke-CheckedCommand -Command "git" -Arguments @("push", "-u", $BackupRemote, $branch)
    }
    else {
        Write-Host "Backup remote '$BackupRemote' does not exist. Skipping backup push." -ForegroundColor DarkYellow
        Write-Host "Create it with: git remote add $BackupRemote <url>" -ForegroundColor DarkYellow
    }

    Write-Host ""
}

if (-not $NoZip) {
    $monthFolder = Get-Date -Format "yyyy-MM"
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $branchSafe = Get-SafeFileNamePart -Value $branch
    $destinationDir = Join-Path $BackupRoot $monthFolder

    if (-not (Test-Path -Path $destinationDir)) {
        New-Item -Path $destinationDir -ItemType Directory | Out-Null
    }

    $zipName = "$BackupPrefix`_$branchSafe`_$timestamp.zip"
    $zipPath = Join-Path $destinationDir $zipName

    Write-Host "Creating zip snapshot..." -ForegroundColor Yellow
    Write-Host "Excluded top-level directories: $($ExcludedTopLevel -join ', ')" -ForegroundColor DarkGray
    $skippedFiles = New-RepoZipSnapshot -SourceRoot $repoRoot -ZipPath $zipPath -ExcludedTopLevel $ExcludedTopLevel

    Write-Host "Zip created: $zipPath" -ForegroundColor Green
    if ($skippedFiles.Count -gt 0) {
        Write-Host "Skipped locked/unreadable files: $($skippedFiles.Count)" -ForegroundColor DarkYellow
    }
    Write-Host ""
}

Write-Host "Workflow completed." -ForegroundColor Green
