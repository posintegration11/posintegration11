# Run Next.js production build inside Docker (Linux FS). Use when the repo is on FAT32/exFAT.
# Requires Docker Desktop with the Linux engine running.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$ErrorActionPreference = "Continue"
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "[build-web-docker] Docker daemon is not reachable." -ForegroundColor Red
  Write-Host ""
  Write-Host "  1. Start Docker Desktop and wait until the engine is running (whale icon idle)."
  Write-Host "  2. Retry:  npm run build:web:docker"
  Write-Host ""
  Write-Host "  Alternative: copy the repo to an NTFS drive (e.g. C:\Projects\POS) and run:"
  Write-Host "    npm run build --prefix apps/web"
  Write-Host ""
  Write-Host "  Or push to GitHub — workflow .github/workflows/web-build.yml builds on Ubuntu."
  Write-Host ""
  exit 1
}

$ErrorActionPreference = "Stop"
docker build -f docker/web-build.Dockerfile -t pos-web-build:local .
exit $LASTEXITCODE
