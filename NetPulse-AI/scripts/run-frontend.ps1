# ---------------------------------------------------------------------------
# Start the Vite frontend on http://127.0.0.1:5173
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-frontend.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'

if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    throw 'frontend\node_modules is missing. Run .\scripts\setup.ps1 first.'
}

Push-Location $Frontend
try {
    Write-Host 'NetPulse AI frontend: http://127.0.0.1:5173' -ForegroundColor Cyan
    Write-Host 'The Vite dev server proxies /api to http://127.0.0.1:8000' -ForegroundColor DarkGray
    & npm.cmd run dev -- --port 5173 --strictPort
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
