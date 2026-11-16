# ---------------------------------------------------------------------------
# Start the FastAPI backend on http://127.0.0.1:8000
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-backend.ps1
#   ... -NoReload    (disable the development auto-reloader)
# ---------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$NoReload
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$VenvPython = Join-Path $Backend '.venv\Scripts\python.exe'

if (-not (Test-Path $VenvPython)) {
    throw 'backend\.venv is missing. Run .\scripts\setup.ps1 first.'
}
if (-not (Test-Path (Join-Path $Backend '.env'))) {
    throw 'backend\.env is missing. Run .\scripts\setup.ps1 first.'
}

Push-Location $Backend
try {
    $arguments = @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000')
    if (-not $NoReload) { $arguments += '--reload' }

    Write-Host 'NetPulse AI backend: http://127.0.0.1:8000' -ForegroundColor Cyan
    Write-Host 'API documentation:  http://127.0.0.1:8000/docs' -ForegroundColor DarkGray
    & $VenvPython @arguments
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
