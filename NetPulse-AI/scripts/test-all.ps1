# ---------------------------------------------------------------------------
# Run every automated test suite and write JUnit XML for the Reports module.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
#   ... -BackendOnly
#   ... -FrontendOnly
# ---------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$VenvPython = Join-Path $Backend '.venv\Scripts\python.exe'
$TestRuns = Join-Path $Root 'reports\test-runs'

if (-not $FrontendOnly -and -not (Test-Path $VenvPython)) {
    throw 'backend\.venv is missing. Run .\scripts\setup.ps1 first.'
}
if (-not $BackendOnly -and -not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    throw 'frontend\node_modules is missing. Run .\scripts\setup.ps1 first.'
}

New-Item -ItemType Directory -Force -Path $TestRuns | Out-Null
$backendExit = 0
$frontendExit = 0

if (-not $FrontendOnly) {
    Write-Host "`n==> Backend Pytest suite" -ForegroundColor Cyan
    Push-Location $Backend
    try {
        $backendJunit = Join-Path $TestRuns 'backend-junit.xml'
        $coverageXml = Join-Path $TestRuns 'coverage.xml'
        & $VenvPython -m pytest "--junitxml=$backendJunit" --cov=app --cov-report=term --cov-report="xml:$coverageXml"
        $backendExit = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($backendExit -eq 0) {
        Write-Host 'Backend tests passed.' -ForegroundColor Green
    }
    else {
        Write-Host "Backend tests failed with exit code $backendExit." -ForegroundColor Red
    }
}

if (-not $BackendOnly) {
    Write-Host "`n==> Frontend Playwright suite" -ForegroundColor Cyan
    Push-Location $Frontend
    try {
        & npm.cmd run test:e2e
        $frontendExit = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($frontendExit -eq 0) {
        Write-Host 'Frontend tests passed.' -ForegroundColor Green
    }
    else {
        Write-Host "Frontend tests failed with exit code $frontendExit." -ForegroundColor Red
    }
}

Write-Host ''
Write-Host "JUnit results: $TestRuns" -ForegroundColor DarkGray
if ($backendExit -ne 0 -or $frontendExit -ne 0) {
    exit 1
}
Write-Host 'All selected test suites passed.' -ForegroundColor Green
