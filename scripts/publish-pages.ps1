param(
    [string]$Message = "chore: publish pages",
    [switch]$NoCommit,
    [switch]$NoPush,
    [switch]$SkipPrepare,
    [switch]$FullPrepare
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

Write-Host "Starting publish workflow..."

if (-not $SkipPrepare) {
    if ($FullPrepare) {
        Write-Host "Preparing dist/milu_publish (full)..."
        Invoke-CheckedCommand -Command "npm" -Arguments @("run", "pages:prepare")
    }
    else {
        Write-Host "Preparing dist/milu_publish (incremental)..."
        Invoke-CheckedCommand -Command "npm" -Arguments @("run", "pages:prepare:incremental")
    }
}

Write-Host "Staging publish artifacts..."
Invoke-CheckedCommand -Command "git" -Arguments @("add", "dist/milu_publish", "CNAME")

& git diff --cached --quiet -- "dist/milu_publish" "CNAME"
$hasStagedChanges = ($LASTEXITCODE -ne 0)

if (-not $hasStagedChanges) {
    Write-Host "No staged changes for dist/milu_publish or CNAME. Nothing to publish."
    exit 0
}

if ($NoCommit) {
    Write-Host "NoCommit set. Changes are staged but not committed."
    exit 0
}

Write-Host "Creating commit..."
Invoke-CheckedCommand -Command "git" -Arguments @("commit", "-m", $Message)

if ($NoPush) {
    Write-Host "NoPush set. Commit created but not pushed."
    exit 0
}

$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq "HEAD") {
    throw "Could not detect current branch."
}

Write-Host "Pushing to origin/$branch..."
Invoke-CheckedCommand -Command "git" -Arguments @("push", "origin", $branch)

Write-Host "Publish workflow finished successfully."
