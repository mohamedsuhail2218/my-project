# ---------------------------------------------------------------------------
# NetPulse AI - one-time local setup
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
#
# Creates the Python virtual environment, installs backend and frontend
# dependencies, generates a local backend/.env with random secrets, and
# prepares the data/report folders. It never overwrites an existing .env.
# ---------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$VenvPython = Join-Path $Backend '.venv\Scripts\python.exe'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Yellow
}

function New-UrlSafeSecret {
    param([int]$ByteCount = 48)
    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host ' NetPulse AI - local setup' -ForegroundColor White
Write-Host '============================================================' -ForegroundColor DarkCyan

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
Write-Step 'Checking prerequisites'

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
    throw 'Python was not found on PATH. Install Python 3.11 or newer from https://www.python.org/downloads/ and enable "Add python.exe to PATH".'
}

$pythonVersion = (& python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))").Trim()
if ([version]$pythonVersion -lt [version]'3.11.0') {
    throw "Python 3.11 or newer is required. Found $pythonVersion."
}
Write-Ok "Python $pythonVersion"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js was not found on PATH. Install Node.js 18 LTS or newer from https://nodejs.org/.'
}
$nodeVersion = (& node --version).Trim().TrimStart('v')
if ([version]$nodeVersion -lt [version]'18.0.0') {
    throw "Node.js 18 or newer is required. Found $nodeVersion."
}
Write-Ok "Node.js $nodeVersion"

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npmCommand) {
    throw 'npm was not found on PATH. Reinstall Node.js with npm included.'
}
Write-Ok 'npm is available'

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------
Write-Step 'Preparing the Python virtual environment'
New-Item -ItemType Directory -Force -Path (Join-Path $Backend 'data') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'reports\test-runs') | Out-Null

if (-not (Test-Path $VenvPython)) {
    & python -m venv (Join-Path $Backend '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the Python virtual environment.' }
    Write-Ok 'Virtual environment created at backend\.venv'
}
else {
    Write-Ok 'Virtual environment already exists'
}

Write-Step 'Installing backend dependencies'
& $VenvPython -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) { throw 'Failed to upgrade pip.' }
& $VenvPython -m pip install -r (Join-Path $Backend 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Failed to install backend dependencies.' }
Write-Ok 'Backend dependencies installed'

Write-Step 'Configuring backend/.env'
$envPath = Join-Path $Backend '.env'
$adminEmail = 'admin@netpulse.ai'
$generatedPassword = $null
if (Test-Path $envPath) {
    $existing = Get-Content $envPath -Raw
    $match = [regex]::Match($existing, '(?m)^ADMIN_EMAIL=(.+)$')
    if ($match.Success) { $adminEmail = $match.Groups[1].Value.Trim() }
    Write-Ok 'backend/.env already exists; it was not modified'
}
else {
    $template = Get-Content (Join-Path $Backend '.env.example') -Raw
    $generatedPassword = New-UrlSafeSecret -ByteCount 18
    $template = $template.Replace('REPLACE_WITH_A_LONG_RANDOM_SECRET', (New-UrlSafeSecret -ByteCount 48))
    $template = $template.Replace('REPLACE_WITH_A_STRONG_PASSWORD', $generatedPassword)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($envPath, $template, $utf8NoBom)
    Write-Ok 'backend/.env created with random JWT secret and administrator password'
}

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
if (-not $SkipFrontend) {
    Write-Step 'Installing frontend dependencies'
    Push-Location $Frontend
    try {
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install frontend dependencies.' }
        Write-Ok 'Frontend dependencies installed'
    }
    finally {
        Pop-Location
    }

    Write-Step 'Checking the Playwright browser'
    $chromeCandidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($chromeCandidates) {
        Write-Ok 'Google Chrome found (Playwright uses the installed Chrome channel)'
    }
    else {
        Write-Warn 'Google Chrome was not found. The E2E tests default to PLAYWRIGHT_CHANNEL=chrome.'
        Write-Warn 'Install Chrome, or run: $env:PLAYWRIGHT_CHANNEL="msedge"; npm.cmd run test:e2e'
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host "`n============================================================" -ForegroundColor DarkCyan
Write-Host ' Setup complete' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host " Administrator email: $adminEmail"
if ($generatedPassword) {
    Write-Host " Administrator password: $generatedPassword" -ForegroundColor Yellow
    Write-Host ' Store this password securely. It is also in backend/.env.' -ForegroundColor Yellow
}
else {
    Write-Host ' Existing credentials remain in backend/.env.'
}
Write-Host ''
Write-Host ' Start the application:' -ForegroundColor White
Write-Host '   powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1'
Write-Host ''
Write-Host ' Or start the services separately:' -ForegroundColor White
Write-Host '   .\scripts\run-backend.ps1'
Write-Host '   .\scripts\run-frontend.ps1'
Write-Host ''
Write-Host ' Run all automated tests:' -ForegroundColor White
Write-Host '   .\scripts\test-all.ps1'
