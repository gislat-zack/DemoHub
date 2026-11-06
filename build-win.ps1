Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Output 'Stopping Node processes that may lock native modules...'
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Output 'Building Windows executable...'
& npm run build:win
if ($LASTEXITCODE -ne 0) {
  throw "Build failed with exit code $LASTEXITCODE"
}

Write-Output 'Build completed. Output executable:'
Write-Output (Join-Path $PSScriptRoot 'dist\Static HTML Host.exe')
