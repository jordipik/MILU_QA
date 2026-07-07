#!/usr/bin/env pwsh
<#
.SYNOPSIS
Flujo seguro de publicación: prepara, stagea, pero NO hace push.
Revisa cambios antes de confirmar manualmente con 'git push'.

.DESCRIPTION
Ejecuta en orden:
1. git status --short (qué cambió)
2. git diff --cached --name-status (detalle del próximo commit)
3. npm run pages:publish:nopush (prepara + stagea, sin commit ni push)
4. git status final (confirmación de staging)

Después el usuario hace 'git push' cuando esté seguro.

.EXAMPLE
.\publish-safe.ps1

.NOTES
Cwd: raíz del proyecto (donde está package.json)
#>

param(
    [switch]$NoStatus = $false
)

Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host "PUBLICACION SEGURA (sin push automático)" -ForegroundColor Cyan
Write-Host "===============================================`n" -ForegroundColor Cyan

# 1. Estado actual
Write-Host "1️⃣  Estado de archivos modificados:" -ForegroundColor Yellow
git status --short
Write-Host ""

# 2. Detalle de staging
Write-Host "2️⃣  Cambios staged (para el próximo commit):" -ForegroundColor Yellow
$stagedFiles = git diff --cached --name-status
if ($stagedFiles) {
    Write-Host $stagedFiles
} else {
    Write-Host "(sin cambios staged aún)" -ForegroundColor Gray
}
Write-Host ""

# 3. Preparar e stagear
Write-Host "3️⃣  Ejecutando: npm run pages:publish:nopush" -ForegroundColor Yellow
npm run pages:publish:nopush
$publishExit = $LASTEXITCODE
if ($publishExit -ne 0) {
    Write-Host "`n❌ Error en publish (exit code: $publishExit)" -ForegroundColor Red
    exit $publishExit
}
Write-Host ""

# 4. Status final
if (-not $NoStatus) {
    Write-Host "4️⃣  Estado final (archivos staged):" -ForegroundColor Yellow
    git status --short
    Write-Host ""
}

# Confirmación
Write-Host "===============================================" -ForegroundColor Green
Write-Host "✅ LISTO PARA PUSH" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Cambios preparados. Cuando estés seguro, ejecuta:" -ForegroundColor Cyan
Write-Host "  git push" -ForegroundColor White -BackgroundColor DarkGray
Write-Host ""
Write-Host "Si algo no está bien, puedes revertir con:" -ForegroundColor Gray
Write-Host "  git reset HEAD dist/ CNAME" -ForegroundColor Gray
Write-Host ""
