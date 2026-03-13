$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPython = Join-Path $repoRoot "backend\venv\Scripts\python.exe"
$frontendPath = Join-Path $repoRoot "frontend"
$backendTestsPath = Join-Path $repoRoot "backend\tests"

Write-Host "Running backend tests..."
& $backendPython -m unittest discover -s $backendTestsPath -v

Write-Host ""
Write-Host "Running frontend tests..."
Push-Location $frontendPath
try {
  & npm.cmd test
}
finally {
  Pop-Location
}
