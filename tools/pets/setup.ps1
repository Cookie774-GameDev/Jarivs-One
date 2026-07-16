[CmdletBinding()]
param(
    [string]$VirtualEnvironment = ".venv-pets"
)

$ErrorActionPreference = "Stop"
$ToolsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepositoryRoot = Resolve-Path (Join-Path $ToolsRoot "..\..")
$EnvironmentPath = Join-Path $RepositoryRoot $VirtualEnvironment
$PythonPath = Join-Path $EnvironmentPath "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonPath)) {
    python -m venv $EnvironmentPath
}

& $PythonPath -m pip install --disable-pip-version-check --requirement (Join-Path $ToolsRoot "requirements-lock.txt")
& $PythonPath -c "import cv2, jsonschema, numpy, PIL, pytest; print('Pet pipeline environment ready')"
Write-Output "Environment: $EnvironmentPath"
Write-Output "Pip cache: $(& $PythonPath -m pip cache dir)"
