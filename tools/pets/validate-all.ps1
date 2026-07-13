[CmdletBinding()]
param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ToolsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepositoryRoot = Resolve-Path (Join-Path $ToolsRoot "..\..")
$Manifest = Join-Path $RepositoryRoot "grok\pets\input\characters.json"

Push-Location $RepositoryRoot
try {
    & $Python -m pytest "tools\pets\tests" -q
    if ($LASTEXITCODE -ne 0) { throw "Pet pipeline tests failed" }

    & (Join-Path $ToolsRoot "build-all.ps1") -Manifest $Manifest -Quality Best -Python $Python
    if ($LASTEXITCODE -ne 0) { throw "Pet package validation failed" }
}
finally {
    Pop-Location
}
