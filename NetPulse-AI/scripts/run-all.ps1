# ---------------------------------------------------------------------------
# Start the backend and frontend in separate PowerShell windows, then open
# the workspace in the default browser.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

$backendScript = Join-Path $PSScriptRoot 'run-backend.ps1'
$frontendScript = Join-Path $PSScriptRoot 'run-frontend.ps1'

if (-not (Test-Path (Join-Path $Root 'backend\.venv\Scripts\python.exe'))) {
    throw 'backend\.venv is missing. Run .\scripts\setup.ps1 first.'
}

Write-Host 'Starting the NetPulse AI backend...' -ForegroundColor Cyan
Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$backendScript`""

Start-Sleep -Seconds 2

Write-Host 'Starting the NetPulse AI frontend...' -ForegroundColor Cyan
Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$frontendScript`""

Start-Sleep -Seconds 4

Write-Host ''
Write-Host 'Backend:  http://127.0.0.1:8000' -ForegroundColor Green
Write-Host 'Frontend: http://127.0.0.1:5173' -ForegroundColor Green
Write-Host 'Swagger:  http://127.0.0.1:8000/docs' -ForegroundColor Green
Write-Host ''
Write-Host 'Close the two PowerShell windows to stop the services.' -ForegroundColor DarkGray

Start-Process 'http://127.0.0.1:5173'
