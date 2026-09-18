param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$venvRoot = Join-Path $projectRoot '.venv'
$isWindowsPlatform = $env:OS -eq 'Windows_NT'
$venvPython = if ($isWindowsPlatform) { Join-Path $venvRoot 'Scripts/python.exe' } else { Join-Path $venvRoot 'bin/python' }

if (-not (Test-Path $venvPython)) {
    $pythonCommand = $null
    $pythonArguments = @()
    foreach ($candidate in @('py', 'python3', 'python')) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            $arguments = if ($candidate -eq 'py') { @('-3') } else { @() }
            & $candidate @arguments -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>$null
            if ($LASTEXITCODE -eq 0) { $pythonCommand = $candidate; $pythonArguments = $arguments; break }
        }
    }
    if (-not $pythonCommand) { throw 'Install Python 3.9 or newer, then run local-start.ps1 again.' }
    Write-Host 'Creating .venv...'
    & $pythonCommand @pythonArguments -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment. Ensure Python includes venv and pip.' }
}

if (-not (Test-Path (Join-Path $projectRoot '.env'))) {
    Copy-Item (Join-Path $projectRoot '.env.example') (Join-Path $projectRoot '.env')
}
Write-Host 'Installing local requirements...'
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $projectRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. The website was not started.' }
$startArguments = @((Join-Path $projectRoot 'scripts/local_server.py'), 'start')
if ($NoBrowser) { $startArguments += '--no-browser' }
& $venvPython @startArguments
if ($LASTEXITCODE -ne 0) { throw 'Local startup failed. See the error above and .local/server.log.' }
