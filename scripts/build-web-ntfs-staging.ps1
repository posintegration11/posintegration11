# FAT32/exFAT: copy monorepo slice to an NTFS temp dir, run `next build` there, then copy `.next` back.
# Staging defaults to $env:TEMP (usually C:\Users\...\Local\Temp on NTFS). Override with POS_NTFS_STAGING_ROOT.
# Stop `npm run dev` before running (port 3000 check still applies).
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir

function Test-PathIsFatVolume([string]$FullPath) {
    if ($FullPath -notmatch '^([A-Za-z]):\\') { return $false }
    $letter = $Matches[1].ToUpperInvariant()
    try {
        $info = (& fsutil fsinfo volumeinfo "${letter}:" 2>&1 | Out-String)
    } catch {
        return $false
    }
    return ($info -match 'File System Name\s*:\s*FAT32' -or $info -match 'File System Name\s*:\s*exFAT')
}

$webDir = Join-Path $root "apps\web"
if (-not (Test-Path $webDir)) {
    Write-Error "Not found: $webDir"
    exit 1
}

if (-not (Test-PathIsFatVolume $webDir)) {
    Write-Host '[build-web-ntfs-staging] apps/web is not on FAT32/exFAT; running normal build.' -ForegroundColor Cyan
    Set-Location $root
    npm run build --prefix apps/web
    exit $LASTEXITCODE
}

$base = $env:POS_NTFS_STAGING_ROOT
if (-not $base) { $base = $env:TEMP }
$staging = Join-Path $base ("pos-web-build-" + [guid]::NewGuid().ToString("n"))

if (Test-PathIsFatVolume $staging) {
    Write-Host "[build-web-ntfs-staging] Staging path is also FAT32/exFAT: $staging" -ForegroundColor Red
    Write-Host "Set POS_NTFS_STAGING_ROOT to an NTFS folder, e.g. C:\build-temp" -ForegroundColor Yellow
    exit 1
}

Write-Host "[build-web-ntfs-staging] Sync $root -> $staging" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$robolog = Join-Path $env:TEMP ("pos-robocopy-" + [guid]::NewGuid().ToString("n") + ".log")
$null = & robocopy.exe $root $staging /E /R:1 /W:1 `
    /XD node_modules .next .git dist android-shell `
    /NFL /NDL /NJH /NJS /NC /NS /NP /LOG:$robolog
$rc = $LASTEXITCODE
if ($rc -ge 8) {
    Write-Host (Get-Content $robolog -Raw -ErrorAction SilentlyContinue)
    Write-Error "robocopy failed with exit $rc"
    exit $rc
}

$stWeb = Join-Path $staging "apps\web"
if (-not (Test-Path $stWeb)) {
    Write-Error "Staging missing apps\web after copy"
    exit 1
}

Set-Location $stWeb

# Do not inherit host env that changes distDir or skips Windows guards in unexpected ways.
foreach ($k in @('NEXT_WEB_DIST_DIR', 'NEXT_BUILD_ALLOW_DEV', 'NEXT_BUILD_SKIP_VOLUME_CHECK', 'NEXT_SKIP_PREBUILD_CLEAN')) {
    Remove-Item "Env:\$k" -ErrorAction SilentlyContinue
}

Write-Host '[build-web-ntfs-staging] npm ci + npm run build in staging...' -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Get-StagingNextOutDir([string]$WebRoot) {
    $def = Join-Path $WebRoot '.next'
    if (Test-Path -LiteralPath $def) { return $def }
    $alt = Get-ChildItem -LiteralPath $WebRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '.next*' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($alt) { return $alt.FullName }
    return $null
}

$srcNext = Get-StagingNextOutDir $stWeb
$dstNext = Join-Path $webDir '.next'
if (-not $srcNext) {
    Write-Error 'Build did not produce .next (or .next*) under staging'
    exit 1
}

Write-Host ('[build-web-ntfs-staging] Copy .next back to repo: ' + $dstNext) -ForegroundColor Cyan
if (Test-Path $dstNext) {
    Remove-Item -LiteralPath $dstNext -Recurse -Force -ErrorAction SilentlyContinue
}
$null = New-Item -ItemType Directory -Path $dstNext -Force
$null = & robocopy.exe $srcNext $dstNext /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP
if ($LASTEXITCODE -ge 8) {
    Write-Warning ('Copy .next back failed (exit ' + $LASTEXITCODE + '). Output at ' + $srcNext)
    exit 1
}

Write-Host ('[build-web-ntfs-staging] Done. .next -> apps\web') -ForegroundColor Green

# Must leave staging tree before Remove-Item (cwd was apps\web under staging).
Set-Location $root

if ($env:POS_KEEP_WEB_STAGING -eq '1') {
    Write-Host ('[build-web-ntfs-staging] Staging kept (POS_KEEP_WEB_STAGING=1): ' + $staging) -ForegroundColor Gray
} else {
    try {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction Stop
        Write-Host '[build-web-ntfs-staging] Staging folder removed.' -ForegroundColor Gray
    } catch {
        Write-Warning ('Could not remove staging; delete manually: ' + $staging)
    }
}
