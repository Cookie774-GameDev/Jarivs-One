#Requires -Version 5.1
<#
.SYNOPSIS
  One-click, free VibeSpace hourly AI news deployment for Windows.

.DESCRIPTION
  Run this script from any PowerShell folder. It:
  - checks Git and Node.js 20+
  - safely uses C:\Users\<you>\VibeSpace when available without changing its branch
  - otherwise clones the required GitHub branch into LocalAppData
  - installs the Worker dependencies
  - signs into Cloudflare through the browser when needed
  - creates the free D1 database and tables
  - deploys the Worker with an hourly Cloudflare Cron Trigger
  - opens the JSON news endpoint and saves its URL locally

  Cloudflare authentication cannot be bypassed. You may need to approve one browser login.
#>

[CmdletBinding()]
param(
    [string]$ExistingRepo = (Join-Path $HOME "VibeSpace"),
    [switch]$DoNotOpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoUrl = "https://github.com/Cookie774-GameDev/VibeSpace.git"
$Branch = "feature/cloudflare-hourly-ai-news"
$InstallRoot = Join-Path $env:LOCALAPPDATA "VibeSpaceNewsSetup"
$Workspace = Join-Path $InstallRoot "repo"
$WorkerPath = Join-Path $Workspace "workers\ai-news"
$DeployLog = Join-Path $InstallRoot "cloudflare-deploy.log"
$EndpointFile = Join-Path $InstallRoot "NEWS_API_URL.txt"
$EnvFile = Join-Path $InstallRoot "vibespace-news.env"
$MarkerFile = Join-Path $Workspace ".vibespace-news-installer"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $oldLocation = Get-Location
    try {
        if ($WorkingDirectory) {
            Set-Location $WorkingDirectory
        }

        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "$FilePath failed with exit code $exitCode."
        }
    }
    finally {
        Set-Location $oldLocation
    }
}

function Ensure-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter(Mandatory = $true)][string]$PackageId,
        [Parameter(Mandatory = $true)][string]$FriendlyName
    )

    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        return
    }

    if (-not (Get-Command "winget.exe" -ErrorAction SilentlyContinue)) {
        throw "$FriendlyName is missing and Windows Package Manager (winget) is unavailable."
    }

    Write-Step "Installing $FriendlyName"
    Invoke-Checked "winget.exe" @(
        "install", "--id", $PackageId, "-e",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--silent"
    )
    Refresh-ProcessPath

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$FriendlyName was installed, but this PowerShell session cannot see it yet. Close PowerShell, reopen it, and run this installer again."
    }
}

function Set-EnvLine {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $lines = @()
    if (Test-Path $Path) {
        $lines = @(Get-Content -LiteralPath $Path)
    }

    $prefix = "$Name="
    $updated = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index].StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
            $lines[$index] = "$Name=$Value"
            $updated = $true
        }
    }

    if (-not $updated) {
        $lines += "$Name=$Value"
    }

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

try {
    Write-Host ""
    Write-Host "VibeSpace Free Hourly AI News Installer" -ForegroundColor Green
    Write-Host "Runs from any folder. No X, Reddit, YouTube API, paid AI, or Windows scheduled task." -ForegroundColor DarkGray

    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null

    Ensure-WingetPackage -CommandName "git.exe" -PackageId "Git.Git" -FriendlyName "Git"
    Ensure-WingetPackage -CommandName "node.exe" -PackageId "OpenJS.NodeJS.LTS" -FriendlyName "Node.js LTS"

    $nodeVersionText = (& node.exe --version).Trim()
    $nodeMajor = [int](($nodeVersionText.TrimStart("v") -split "\.")[0])
    if ($nodeMajor -lt 20) {
        Write-Step "Updating Node.js to the current LTS release"
        Invoke-Checked "winget.exe" @(
            "upgrade", "--id", "OpenJS.NodeJS.LTS", "-e",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--silent"
        )
        Refresh-ProcessPath
        $nodeVersionText = (& node.exe --version).Trim()
        $nodeMajor = [int](($nodeVersionText.TrimStart("v") -split "\.")[0])
        if ($nodeMajor -lt 20) {
            throw "Node.js 20 or newer is required. Current version: $nodeVersionText"
        }
    }

    Write-Step "Preparing the VibeSpace news deployment workspace"

    $existingRepoIsGit = Test-Path (Join-Path $ExistingRepo ".git")

    if (Test-Path $Workspace) {
        if (-not (Test-Path (Join-Path $Workspace ".git"))) {
            throw "The installer workspace exists but is not a Git repository: $Workspace"
        }

        Invoke-Checked "git.exe" @("-C", $Workspace, "fetch", "origin", $Branch, "--prune")
        Invoke-Checked "git.exe" @("-C", $Workspace, "reset", "--hard", "origin/$Branch")
    }
    elseif ($existingRepoIsGit) {
        # A detached worktree prevents this installer from changing the user's active VibeSpace branch.
        Invoke-Checked "git.exe" @("-C", $ExistingRepo, "fetch", "origin", $Branch, "--prune")
        Invoke-Checked "git.exe" @(
            "-C", $ExistingRepo,
            "worktree", "add", "--force", "--detach",
            $Workspace, "origin/$Branch"
        )
    }
    else {
        Invoke-Checked "git.exe" @(
            "clone",
            "--branch", $Branch,
            "--single-branch",
            "--depth", "1",
            $RepoUrl,
            $Workspace
        )
    }

    Set-Content -LiteralPath $MarkerFile -Value "Managed by Setup-VibeSpace-Free-News.ps1" -Encoding UTF8

    if (-not (Test-Path (Join-Path $WorkerPath "package.json"))) {
        throw "The Cloudflare Worker package was not found at: $WorkerPath"
    }

    Write-Step "Installing Cloudflare Worker dependencies"
    Invoke-Checked "npm.cmd" @("install", "--no-audit", "--no-fund") $WorkerPath

    Write-Step "Validating the Worker"
    Invoke-Checked "npm.cmd" @("run", "typecheck") $WorkerPath

    Write-Step "Checking Cloudflare login"
    $oldLocation = Get-Location
    try {
        Set-Location $WorkerPath
        & npx.cmd wrangler whoami --config wrangler.jsonc *> $null
        $whoAmIExit = $LASTEXITCODE
    }
    finally {
        Set-Location $oldLocation
    }

    if ($whoAmIExit -ne 0) {
        Write-Host ""
        Write-Host "Cloudflare will open your browser. Approve the login, then return here." -ForegroundColor Yellow
        Invoke-Checked "npx.cmd" @("wrangler", "login") $WorkerPath
    }

    Write-Step "Creating D1 and deploying the free hourly Worker"
    if (Test-Path $DeployLog) {
        Remove-Item -LiteralPath $DeployLog -Force
    }

    $oldLocation = Get-Location
    try {
        Set-Location $WorkerPath
        & npm.cmd run setup:free 2>&1 | Tee-Object -FilePath $DeployLog
        $deployExit = $LASTEXITCODE
    }
    finally {
        Set-Location $oldLocation
    }

    if ($deployExit -ne 0) {
        throw "Cloudflare deployment failed. Full log: $DeployLog"
    }

    $deployText = Get-Content -LiteralPath $DeployLog -Raw
    $urlMatches = [regex]::Matches(
        $deployText,
        "https://[A-Za-z0-9.-]+\.workers\.dev",
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $baseUrl = $null
    if ($urlMatches.Count -gt 0) {
        $baseUrl = $urlMatches[$urlMatches.Count - 1].Value.TrimEnd("/")
    }

    if ($baseUrl) {
        $newsUrl = "$baseUrl/api/news?limit=50"

        Set-Content -LiteralPath $EndpointFile -Value $baseUrl -Encoding UTF8
        Set-Content -LiteralPath $EnvFile -Value "VITE_NEWS_API_URL=$baseUrl" -Encoding UTF8
        [Environment]::SetEnvironmentVariable("VITE_NEWS_API_URL", $baseUrl, "User")
        $env:VITE_NEWS_API_URL = $baseUrl

        if ($existingRepoIsGit -and (Test-Path (Join-Path $ExistingRepo "app"))) {
            $appEnvPath = Join-Path $ExistingRepo "app\.env.local"
            Set-EnvLine -Path $appEnvPath -Name "VITE_NEWS_API_URL" -Value $baseUrl
            Write-Host "Updated VibeSpace app setting: $appEnvPath" -ForegroundColor DarkGray
        }

        try {
            Set-Clipboard -Value $newsUrl
        }
        catch {
            # Clipboard is optional.
        }

        Write-Step "Testing the live JSON output"
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 60
            $news = Invoke-RestMethod -Uri $newsUrl -Method Get -TimeoutSec 120
            $storyCount = 0
            if ($null -ne $news.count) {
                $storyCount = [int]$news.count
            }

            Write-Host "Health check: OK" -ForegroundColor Green
            Write-Host "Stories returned: $storyCount" -ForegroundColor Green
        }
        catch {
            Write-Warning "Deployment succeeded, but the immediate API test did not finish: $($_.Exception.Message)"
            Write-Warning "The first import may still be completing. Open the endpoint again shortly."
        }

        Write-Host ""
        Write-Host "SETUP COMPLETE" -ForegroundColor Green
        Write-Host "Hourly schedule: minute 7 of every hour, hosted by Cloudflare" -ForegroundColor White
        Write-Host "Your PC can be turned off; no Windows Scheduled Task is needed." -ForegroundColor White
        Write-Host ""
        Write-Host "News JSON:" -ForegroundColor Cyan
        Write-Host $newsUrl -ForegroundColor White
        Write-Host ""
        Write-Host "Saved endpoint:" -ForegroundColor Cyan
        Write-Host $EndpointFile -ForegroundColor White
        Write-Host ""
        Write-Host "The News JSON address was also copied to your clipboard." -ForegroundColor DarkGray

        if (-not $DoNotOpenBrowser) {
            Start-Process $newsUrl
        }
    }
    else {
        Write-Host ""
        Write-Host "Deployment completed, but the workers.dev URL could not be extracted automatically." -ForegroundColor Yellow
        Write-Host "Open this log and copy the workers.dev address shown near the end:" -ForegroundColor Yellow
        Write-Host $DeployLog -ForegroundColor White
        Write-Host "Add /api/news?limit=50 to that address." -ForegroundColor White
    }
}
catch {
    Write-Host ""
    Write-Host "SETUP STOPPED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Nothing was scheduled on Windows. Re-run this same installer after fixing the message above." -ForegroundColor Yellow
    exit 1
}
