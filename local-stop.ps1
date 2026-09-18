$ErrorActionPreference = 'Stop'
$isWindowsPlatform = $env:OS -eq 'Windows_NT'
$venvPython = if ($isWindowsPlatform) { Join-Path $PSScriptRoot '.venv/Scripts/python.exe' } else { Join-Path $PSScriptRoot '.venv/bin/python' }
if (-not (Test-Path $venvPython)) {
    if (Test-Path (Join-Path $PSScriptRoot '.local/server.json')) {
        throw 'The virtual environment is missing. Restore it with local-start.ps1 before stopping the recorded server.'
    }
    Write-Host 'No local Python server is running.'
    exit 0
}
& $venvPython (Join-Path $PSScriptRoot 'scripts/local_server.py') stop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the local server. See the error above.' }
