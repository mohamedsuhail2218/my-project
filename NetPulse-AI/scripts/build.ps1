# ---------------------------------------------------------------------------
# Build the production frontend. FastAPI automatically serves frontend/dist
# from http://127.0.0.1:8000 when the folder exists.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'

if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    throw 'frontend\node_modules is missing. Run .\scripts\setup.ps1 first.'
}

Push-Location $Frontend
try {
    Write-Host 'Building the production frontend...' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Build complete: frontend\dist' -ForegroundColor Green
Write-Host 'Start the backend and open http://127.0.0.1:8000' -ForegroundColor Green
