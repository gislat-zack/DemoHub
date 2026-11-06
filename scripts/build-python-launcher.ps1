$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Launcher = Join-Path $Root 'python-launcher\static_html_host_manager.py'
$Dist = Join-Path $Root 'dist'
$Name = 'Static HTML Host Manager'

Write-Host 'Building Python GUI manager...' -ForegroundColor Cyan

if (-not (Test-Path $Launcher)) {
  throw "Python manager source not found: $Launcher"
}

$pythonCmd = $null
foreach ($cmd in @('python', 'py')) {
  try {
    & $cmd --version | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $pythonCmd = $cmd
      break
    }
  } catch {}
}

if (-not $pythonCmd) {
  throw 'Python was not found. Please install Python 3.9+ and add it to PATH.'
}

Write-Host "Using Python: $pythonCmd"

& $pythonCmd -m PyInstaller --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'PyInstaller not found. Installing...' -ForegroundColor Yellow
  & $pythonCmd -m pip install pyinstaller
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to install PyInstaller. Please run: python -m pip install pyinstaller'
  }
}

if (-not (Test-Path $Dist)) {
  New-Item -ItemType Directory -Path $Dist | Out-Null
}

Push-Location $Root
try {
  & $pythonCmd -m PyInstaller `
    --noconsole `
    --onefile `
    --clean `
    --name $Name `
    --distpath $Dist `
    --workpath (Join-Path $Root 'build\pyinstaller') `
    --specpath (Join-Path $Root 'build') `
    $Launcher
  if ($LASTEXITCODE -ne 0) {
    throw 'PyInstaller build failed.'
  }
} finally {
  Pop-Location
}

$Output = Join-Path $Dist "$Name.exe"
if (-not (Test-Path $Output)) {
  throw "Build failed. Output file not found: $Output"
}

Write-Host 'Python GUI manager build completed:' -ForegroundColor Green
Write-Host $Output
