# Clean install for this repo on Windows (reduces EPERM / half-written node_modules).
# Run from repo root:  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Remove-NodeModulesTree {
    param([Parameter(Mandatory)][string]$Dir)
    if (-not (Test-Path -LiteralPath $Dir)) { return }
    try {
        $full = (Get-Item -LiteralPath $Dir -Force).FullName
    } catch {
        $full = $Dir.TrimEnd('\', '/')
    }
    Write-Host "  Removing $full" -ForegroundColor Gray

    # More reliable than Remove-Item for deep node_modules / junctions on Windows
    $null = & cmd.exe /c "rmdir /s /q `"$full`"" 2>&1
    Start-Sleep -Milliseconds 400

    if (-not (Test-Path -LiteralPath $Dir)) { return }

    # Robocopy mirror-empty trick purges stubborn trees
    $empty = Join-Path $env:TEMP ("pos-empty-" + [guid]::NewGuid().ToString("n"))
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    try {
        $null = & robocopy.exe $empty $full /MIR /NJH /NJS /NDL /NC /NS /NP /NFL 2>&1
        $null = & cmd.exe /c "rmdir /s /q `"$empty`"" 2>&1
        $null = & cmd.exe /c "rmdir /s /q `"$full`"" 2>&1
    } finally {
        if (Test-Path -LiteralPath $empty) {
            Remove-Item -LiteralPath $empty -Force -Recurse -ErrorAction SilentlyContinue
        }
    }

    Start-Sleep -Milliseconds 200
    if (Test-Path -LiteralPath $Dir) {
        Write-Host "  WARNING: Still present: $full — close Cursor/terminals using it, add Defender exclusion, then delete manually." -ForegroundColor Yellow
    }
}

Write-Host "Close dev servers and other terminals using this folder, then press Enter..." -ForegroundColor Yellow
$null = Read-Host

Write-Host "Removing node_modules..." -ForegroundColor Cyan
foreach ($p in @(
        (Join-Path $root "node_modules")
        (Join-Path $root "apps\api\node_modules")
        (Join-Path $root "apps\web\node_modules")
    )) {
    Remove-NodeModulesTree -Dir $p
}

Write-Host "Installing root, then apps/api, then apps/web..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location (Join-Path $root "apps\api")
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Push-Location (Join-Path $root "apps\web")
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "Prisma generate..." -ForegroundColor Cyan
npm run db:generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Run:  npm run dev" -ForegroundColor Green
