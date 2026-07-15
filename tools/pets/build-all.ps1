[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Manifest,

    [ValidateSet("Draft", "Standard", "Best")]
    [string]$Quality = "Best",

    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ToolsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepositoryRoot = Resolve-Path (Join-Path $ToolsRoot "..\..")
$ManifestPath = Resolve-Path $Manifest
$Catalog = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$CharacterId = $Catalog.defaultCharacterId
$CharacterRoot = Join-Path (Split-Path -Parent $ManifestPath) "characters\$CharacterId"
$SchemaPath = Join-Path $RepositoryRoot "app\src\assets\pets\schemas\character-manifest.schema.json"
$HashInventory = Join-Path $CharacterRoot "archival\source-hashes.json"
$Archive = Join-Path $CharacterRoot "archival\vibespace_axolotl_layered_package.zip"
$Report = Join-Path $RepositoryRoot "app\src\assets\pets\characters\$CharacterId\qa\source-package-validation.json"
$PreviousPythonPath = $env:PYTHONPATH

try {
    $env:PYTHONPATH = $ToolsRoot
    & $Python -m pets_pipeline.normalize_package_layout `
        --character-root $CharacterRoot `
        --hash-inventory $HashInventory `
        --archive $Archive
    if ($LASTEXITCODE -ne 0) { throw "Pet package normalization failed" }

    & $Python -m pets_pipeline.validate_layered_package `
        --character-root $CharacterRoot `
        --catalog $ManifestPath `
        --catalog-schema $SchemaPath `
        --hash-inventory $HashInventory `
        --archive $Archive `
        --output $Report
    if ($LASTEXITCODE -ne 0) { throw "Pet source-package validation failed" }
}
finally {
    $env:PYTHONPATH = $PreviousPythonPath
}

Write-Output "Pet source package built at quality '$Quality': $CharacterId"
