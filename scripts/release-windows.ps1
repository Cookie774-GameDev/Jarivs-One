<#
.SYNOPSIS
  Build the Tauri desktop app for Windows and stage installers in releases\.

.DESCRIPTION
  This script automates the "I want to ship Jarvis to a user" flow.

  1. Runs `npm run tauri:build` (unless -SkipBuild). This produces an NSIS
     setup .exe and an MSI inside app\src-tauri\target\release\bundle\.
  2. Copies them into releases\ with two filenames each:
       - The Tauri-canonical name (VibeSpace_<v>_x64-setup.exe) so install.ps1
         keeps working when published to GitHub Releases.
       - A friendly name (Jarvis-<v>-Windows-x64.exe) for direct downloads.
     Matching updater signatures are generated and copied too.
  3. Builds releases\latest.json for tauri-plugin-updater.
  4. Computes SHA-256 hashes and updates releases\SHA256SUMS.txt.
  5. Prints a summary.

  Run from any directory; the script resolves paths relative to itself.

.PARAMETER SkipBuild
  Skip the tauri:build step. Use when the bundle is already up to date and
  you only need to re-stage / re-checksum.

.PARAMETER Version
  Override the version string used in friendly filenames. Defaults to the
  version found in package.json.

.EXAMPLE
  npm run release:windows

.EXAMPLE
  npm run release:stage      # uses last successful build
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# --- Paths ------------------------------------------------------------------
# Resolve repo root from the script location so this works no matter where
# it's invoked from.
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot    = Split-Path -Parent $ScriptDir
$AppDir      = Join-Path $RepoRoot 'app'
$BundleDir   = Join-Path $AppDir   'src-tauri\target\release\bundle'
$ReleasesDir = Join-Path $RepoRoot 'releases'

$nsisDir = Join-Path $BundleDir 'nsis'
$msiDir  = Join-Path $BundleDir 'msi'

function Assert-CanonicalTauriVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Version
  )
  $pattern = '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'
  $match = [regex]::Match($Version, $pattern)
  $maximum = [Numerics.BigInteger]::Parse('18446744073709551615')
  $valid = $match.Success
  if ($valid) {
    foreach ($index in 1..3) {
      if ([Numerics.BigInteger]::Parse($match.Groups[$index].Value) -gt $maximum) {
        $valid = $false
      }
    }
  }
  if ($valid -and $match.Groups[4].Success) {
    foreach ($identifier in $match.Groups[4].Value.Split('.')) {
      if ($identifier -match '^\d+$' -and $identifier.Length -gt 1 -and $identifier[0] -eq '0') {
        $valid = $false
      }
    }
  }
  if (-not $valid) {
    throw "Release version must be a canonical Tauri-compatible semantic version: $Version"
  }
  return $Version
}

function Assert-ReleaseVersionPreflight {
  param(
    [AllowEmptyString()]
    [string]$Version,
    [Parameter(Mandatory = $true)]
    [string]$PackageJsonPath,
    [Parameter(Mandatory = $true)]
    [string]$TauriConfigPath
  )
  $package = Get-Content -LiteralPath $PackageJsonPath -Raw -ErrorAction Stop | ConvertFrom-Json
  $tauri = Get-Content -LiteralPath $TauriConfigPath -Raw -ErrorAction Stop | ConvertFrom-Json
  $packageVersion = Assert-CanonicalTauriVersion -Version ([string]$package.version)
  $tauriVersion = Assert-CanonicalTauriVersion -Version ([string]$tauri.version)
  if (-not $packageVersion.Equals($tauriVersion, [StringComparison]::Ordinal)) {
    throw "Release version parity failed: package.json=$packageVersion tauri.conf.json=$tauriVersion"
  }
  $selectedVersion = if ([string]::IsNullOrWhiteSpace($Version)) { $packageVersion } else { $Version }
  $selectedVersion = Assert-CanonicalTauriVersion -Version $selectedVersion
  if (-not $selectedVersion.Equals($packageVersion, [StringComparison]::Ordinal)) {
    throw "Release version parity failed: requested=$selectedVersion configured=$packageVersion"
  }
  return $selectedVersion
}

# Tauri-canonical filenames as written by the bundler (productName is VibeSpace).
function Resolve-BundleArtifact {
  param([string]$Dir, [string[]]$Patterns)
  if (-not (Test-Path -LiteralPath $Dir)) { return $null }
  $hits = @()
  foreach ($pattern in $Patterns) {
    $candidate = Join-Path $Dir $pattern
    if (Test-Path -LiteralPath $candidate) {
      $hit = Get-Item -LiteralPath $candidate
      if ($hit.PSIsContainer -or ($hit.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Bundle artifact candidate must be a regular non-reparse file: $candidate"
      }
      $hits += $hit.FullName
    }
  }
  $hits = @($hits | Sort-Object -Unique)
  if ($hits.Count -gt 1) {
    throw "Ambiguous bundle artifacts: $($hits -join ', ')"
  }
  if ($hits.Count -eq 1) { return $hits[0] }
  return $null
}

function Assert-NonReparseDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  [void](Assert-PathChainNonReparse -Path $Path -Label $Label)
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (-not $item.PSIsContainer) {
    throw "$Label must be a directory: $Path"
  }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Label must not be a reparse point: $Path"
  }
  return $item.FullName
}

function Assert-PathChainNonReparse {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $fullPath = [IO.Path]::GetFullPath($Path)
  $cursor = if (Test-Path -LiteralPath $fullPath) {
    Get-Item -LiteralPath $fullPath -Force -ErrorAction Stop
  } else {
    $parent = Split-Path -Parent $fullPath
    if ([string]::IsNullOrWhiteSpace($parent)) {
      throw "$Label has no existing parent: $Path"
    }
    Get-Item -LiteralPath $parent -Force -ErrorAction Stop
  }
  while ($cursor) {
    if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label path chain contains a reparse point: $($cursor.FullName)"
    }
    $cursor = $cursor.Parent
  }
  return $fullPath
}

function Assert-ContainedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [switch]$AllowRoot
  )
  $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  if ($AllowRoot -and $fullPath.Equals($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath
  }
  $prefix = "$fullRoot$([IO.Path]::DirectorySeparatorChar)"
  if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes its containment root: $Path"
  }
  [void](Assert-PathChainNonReparse -Path $fullRoot -Label 'Containment root')
  [void](Assert-PathChainNonReparse -Path $fullPath -Label 'Contained path')
  return $fullPath
}

function Assert-FutureContainedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Root
  )
  $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  $fullRoot = Assert-NonReparseDirectory -Path $Root -Label 'Containment root'
  $prefix = "$fullRoot$([IO.Path]::DirectorySeparatorChar)"
  if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes its containment root: $Path"
  }
  $existingAncestor = Split-Path -Parent $fullPath
  while (-not (Test-Path -LiteralPath $existingAncestor)) {
    if ($existingAncestor.Equals($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
      break
    }
    $existingAncestor = Split-Path -Parent $existingAncestor
    if (
      [string]::IsNullOrWhiteSpace($existingAncestor) -or
      (
        -not $existingAncestor.Equals($fullRoot, [StringComparison]::OrdinalIgnoreCase) -and
        -not $existingAncestor.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
      )
    ) {
      throw "Path escapes its containment root: $Path"
    }
  }
  [void](Assert-NonReparseDirectory -Path $existingAncestor -Label 'Contained path ancestor')
  return $fullPath
}

function Initialize-ReleaseFileIdentityType {
  if ('VibeSpace.ReleaseFileIdentity' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace VibeSpace {
  public sealed class ReleaseFileIdentityInfo {
    public uint VolumeSerialNumber;
    public ulong FileIndex;
    public uint NumberOfLinks;
    public long Length;
    public long CreationTime;
    public long LastWriteTime;
  }

  public static class ReleaseFileIdentity {
    [StructLayout(LayoutKind.Sequential)]
    private struct FILETIME {
      public uint Low;
      public uint High;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BY_HANDLE_FILE_INFORMATION {
      public uint FileAttributes;
      public FILETIME CreationTime;
      public FILETIME LastAccessTime;
      public FILETIME LastWriteTime;
      public uint VolumeSerialNumber;
      public uint FileSizeHigh;
      public uint FileSizeLow;
      public uint NumberOfLinks;
      public uint FileIndexHigh;
      public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(
      SafeFileHandle handle,
      out BY_HANDLE_FILE_INFORMATION information
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(
      string fileName,
      uint desiredAccess,
      uint shareMode,
      IntPtr securityAttributes,
      uint creationDisposition,
      uint flagsAndAttributes,
      IntPtr templateFile
    );

    private static long FileTimeToLong(FILETIME value) {
      return ((long)value.High << 32) | value.Low;
    }

    public static ReleaseFileIdentityInfo Get(SafeFileHandle handle) {
      BY_HANDLE_FILE_INFORMATION value;
      if (!GetFileInformationByHandle(handle, out value)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      return new ReleaseFileIdentityInfo {
        VolumeSerialNumber = value.VolumeSerialNumber,
        FileIndex = ((ulong)value.FileIndexHigh << 32) | value.FileIndexLow,
        NumberOfLinks = value.NumberOfLinks,
        Length = ((long)value.FileSizeHigh << 32) | value.FileSizeLow,
        CreationTime = FileTimeToLong(value.CreationTime),
        LastWriteTime = FileTimeToLong(value.LastWriteTime)
      };
    }

    public static SafeFileHandle OpenDirectory(string path) {
      // Deliberately omit FILE_SHARE_DELETE so the held release-root identity
      // cannot be renamed or replaced while pathname children are published.
      const uint FileShareReadWrite = 0x00000001 | 0x00000002;
      const uint FileListDirectory = 0x00000001;
      const uint OpenExisting = 3;
      const uint FileFlagBackupSemantics = 0x02000000;
      const uint FileFlagOpenReparsePoint = 0x00200000;
      SafeFileHandle handle = CreateFile(
        path,
        FileListDirectory,
        FileShareReadWrite,
        IntPtr.Zero,
        OpenExisting,
        FileFlagBackupSemantics | FileFlagOpenReparsePoint,
        IntPtr.Zero
      );
      if (handle.IsInvalid) {
        int error = Marshal.GetLastWin32Error();
        handle.Dispose();
        throw new Win32Exception(error);
      }
      return handle;
    }
  }
}
'@
}

function Open-BoundReleaseDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $fullPath = Assert-NonReparseDirectory -Path $Path -Label $Label
  Initialize-ReleaseFileIdentityType
  $handle = [VibeSpace.ReleaseFileIdentity]::OpenDirectory($fullPath)
  try {
    $identity = [VibeSpace.ReleaseFileIdentity]::Get($handle)
    return [pscustomobject]@{
      Path = $fullPath
      Label = $Label
      Handle = $handle
      VolumeSerialNumber = $identity.VolumeSerialNumber
      FileIndex = $identity.FileIndex
      CreationTime = $identity.CreationTime
    }
  } catch {
    $handle.Dispose()
    throw
  }
}

function Close-BoundReleaseDirectory {
  param([psobject]$Binding)
  if ($Binding -and $Binding.Handle) {
    $Binding.Handle.Dispose()
  }
}

function Assert-BoundReleaseDirectoryCurrent {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Binding
  )
  $current = Open-BoundReleaseDirectory -Path $Binding.Path -Label $Binding.Label
  try {
    foreach ($property in @('VolumeSerialNumber', 'FileIndex', 'CreationTime')) {
      if ($current.$property -ne $Binding.$property) {
        throw "$($Binding.Label) identity changed after validation: $($Binding.Path)"
      }
    }
  } finally {
    Close-BoundReleaseDirectory -Binding $current
  }
}

function Open-BoundReleaseFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $fullPath = Assert-PathChainNonReparse -Path $Path -Label $Label
  $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction Stop
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Label must be a regular non-reparse file: $Path"
  }
  Initialize-ReleaseFileIdentityType
  $stream = [IO.File]::Open(
    $fullPath,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read
  )
  try {
    $identity = [VibeSpace.ReleaseFileIdentity]::Get($stream.SafeFileHandle)
    if ($identity.NumberOfLinks -ne 1) {
      throw "$Label must not be a hard link: $Path"
    }
    $binding = [pscustomobject]@{
      Path = $fullPath
      Label = $Label
      Stream = $stream
      VolumeSerialNumber = $identity.VolumeSerialNumber
      FileIndex = $identity.FileIndex
      NumberOfLinks = $identity.NumberOfLinks
      Length = $identity.Length
      CreationTime = $identity.CreationTime
      LastWriteTime = $identity.LastWriteTime
      Sha256 = $null
    }
    $binding.Sha256 = Get-BoundFileHash -Binding $binding
    return $binding
  } catch {
    $stream.Dispose()
    throw
  }
}

function Close-BoundReleaseFile {
  param([psobject]$Binding)
  if ($Binding -and $Binding.Stream) {
    $Binding.Stream.Dispose()
  }
}

function Assert-BoundReleaseFileCurrent {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Binding
  )
  [void](Assert-PathChainNonReparse -Path $Binding.Path -Label $Binding.Label)
  $current = Open-BoundReleaseFile -Path $Binding.Path -Label $Binding.Label
  try {
    foreach ($property in @(
      'VolumeSerialNumber',
      'FileIndex',
      'NumberOfLinks',
      'Length',
      'CreationTime',
      'LastWriteTime',
      'Sha256'
    )) {
      if ($current.$property -ne $Binding.$property) {
        throw "$($Binding.Label) changed after validation: $($Binding.Path)"
      }
    }
  } finally {
    Close-BoundReleaseFile -Binding $current
  }
}

function Assert-ReleaseFileMatchesBindingAtPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [psobject]$ExpectedBinding,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $current = Open-BoundReleaseFile -Path $Path -Label $Label
  try {
    foreach ($property in @(
      'VolumeSerialNumber',
      'FileIndex',
      'NumberOfLinks',
      'Length',
      'CreationTime',
      'LastWriteTime',
      'Sha256'
    )) {
      if ($current.$property -ne $ExpectedBinding.$property) {
        throw "$Label identity changed after validation: $Path"
      }
    }
  } finally {
    Close-BoundReleaseFile -Binding $current
  }
}

function Assert-ReleaseFileMatchesBoundBytesAtPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [psobject]$ExpectedBinding,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $current = Open-BoundReleaseFile -Path $Path -Label $Label
  try {
    if (
      $current.Length -ne $ExpectedBinding.Length -or
      -not $current.Sha256.Equals(
        $ExpectedBinding.Sha256,
        [StringComparison]::Ordinal
      )
    ) {
      throw "$Label bytes do not match the bound source: $Path"
    }
  } finally {
    Close-BoundReleaseFile -Binding $current
  }
}

function Open-VerifiedReleaseFileCopy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [psobject]$SourceBinding,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $copy = Open-BoundReleaseFile -Path $Path -Label $Label
  try {
    $expectedHash = Get-BoundFileHash -Binding $SourceBinding
    $actualHash = Get-BoundFileHash -Binding $copy
    if (-not $actualHash.Equals($expectedHash, [StringComparison]::Ordinal)) {
      throw "$Label bytes do not match the bound source"
    }
    Assert-BoundReleaseFileCurrent -Binding $copy
    return $copy
  } catch {
    Close-BoundReleaseFile -Binding $copy
    throw
  }
}

function Get-BoundFileHash {
  param([psobject]$Binding)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $Binding.Stream.Position = 0
    return [Convert]::ToBase64String($algorithm.ComputeHash($Binding.Stream))
  } finally {
    $Binding.Stream.Position = 0
    $algorithm.Dispose()
  }
}

function Copy-BoundReleaseFile {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Binding,
    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
  )
  Assert-BoundReleaseFileCurrent -Binding $Binding
  $expectedHash = Get-BoundFileHash -Binding $Binding
  $destination = [IO.File]::Open(
    $DestinationPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $Binding.Stream.CopyTo($destination)
    $destination.Flush($true)
  } finally {
    $destination.Dispose()
    $Binding.Stream.Position = 0
  }
  $destinationBinding = Open-BoundReleaseFile `
    -Path $DestinationPath `
    -Label "$($Binding.Label) copy"
  try {
    $actualHash = Get-BoundFileHash -Binding $destinationBinding
    if (-not $actualHash.Equals($expectedHash, [StringComparison]::Ordinal)) {
      throw "$($Binding.Label) bytes changed while copying"
    }
    Assert-BoundReleaseFileCurrent -Binding $destinationBinding
  } finally {
    Close-BoundReleaseFile -Binding $destinationBinding
  }
  Assert-BoundReleaseFileCurrent -Binding $Binding
  return $DestinationPath
}

function Assert-RegularFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )
  $binding = Open-BoundReleaseFile -Path $Path -Label $Label
  try {
    return Get-Item -LiteralPath $binding.Path -Force
  } finally {
    Close-BoundReleaseFile -Binding $binding
  }
}

function New-ContainedUpdaterStage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactPath,
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,
    [Parameter(Mandatory = $true)]
    [string]$StageParent,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [scriptblock]$BeforeCopyTestHook,
    [switch]$RetainBindings
  )

  $Version = Assert-CanonicalTauriVersion -Version $Version

  $sourceRootPath = Assert-NonReparseDirectory -Path $SourceRoot -Label 'Updater source root'
  $containmentRootPath = Assert-NonReparseDirectory -Path $ContainmentRoot -Label 'Release root'
  $stageParentPath = Assert-ContainedPath -Path $StageParent -Root $containmentRootPath
  if (Test-Path -LiteralPath $stageParentPath) {
    $stageParentPath = Assert-NonReparseDirectory -Path $stageParentPath -Label 'Updater stage parent'
  }

  $artifact = Open-BoundReleaseFile -Path $ArtifactPath -Label 'Updater artifact'
  $signature = $null
  try {
  $artifactItem = Get-Item -LiteralPath $artifact.Path -Force
  if (-not $artifactItem.Directory.FullName.Equals(
      $sourceRootPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Updater artifact must be a direct child of its source root: $ArtifactPath"
  }
  $supportedNames = @(
    "VibeSpace-${Version}-Windows-x64.exe",
    "VibeSpace_${Version}_x64-setup.exe",
    "Jarvis-One-${Version}-Windows-x64.exe",
    "Jarvis One_${Version}_x64-setup.exe"
  )
  if ($supportedNames -notcontains $artifactItem.Name) {
    throw "Updater artifact is not the expected version-bound NSIS installer: $($artifactItem.Name)"
  }

  $signaturePath = "$($artifact.Path).sig"
  if (-not (Test-Path -LiteralPath $signaturePath)) {
    throw "Updater signature is missing for $($artifactItem.Name)"
  }
  $signature = Open-BoundReleaseFile -Path $signaturePath -Label 'Updater signature'
  $signatureItem = Get-Item -LiteralPath $signature.Path -Force
  if (-not $signatureItem.Directory.FullName.Equals(
      $sourceRootPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Updater signature must be a direct child of its source root: $signaturePath"
  }
  if ($signature.LastWriteTime -lt $artifact.LastWriteTime) {
    throw "Updater signature is stale for $($artifactItem.Name)"
  }

  if ($BeforeCopyTestHook) {
    & $BeforeCopyTestHook
  }

  if (-not (Test-Path -LiteralPath $stageParentPath)) {
    New-Item -ItemType Directory -Path $stageParentPath | Out-Null
  }
  $stageParentPath = Assert-NonReparseDirectory -Path $stageParentPath -Label 'Updater stage parent'
  $identity = [Guid]::NewGuid().ToString('N')
  $stagePath = Join-Path $stageParentPath "stage-$identity"
  New-Item -ItemType Directory -Path $stagePath | Out-Null
  $stage = [pscustomobject]@{
    Identity = $identity
    Path = $stagePath
    ArtifactPath = Join-Path $stagePath $artifactItem.Name
    SignaturePath = Join-Path $stagePath "$($artifactItem.Name).sig"
    ManifestPath = Join-Path $stagePath 'latest.json'
    ArtifactBinding = $null
    SignatureBinding = $null
    ManifestBinding = $null
  }
  try {
    [void](Copy-BoundReleaseFile -Binding $artifact -DestinationPath $stage.ArtifactPath)
    [void](Copy-BoundReleaseFile -Binding $signature -DestinationPath $stage.SignaturePath)
    if ($RetainBindings) {
      $stage.ArtifactBinding = Open-BoundReleaseFile `
        -Path $stage.ArtifactPath `
        -Label 'Retained updater-stage artifact'
      $stage.SignatureBinding = Open-BoundReleaseFile `
        -Path $stage.SignaturePath `
        -Label 'Retained updater-stage signature'
    }
    return $stage
  } catch {
    Close-BoundReleaseFile -Binding $stage.ManifestBinding
    Close-BoundReleaseFile -Binding $stage.SignatureBinding
    Close-BoundReleaseFile -Binding $stage.ArtifactBinding
    Remove-OwnedUpdaterStage `
      -Stage $stage `
      -StageParent $stageParentPath `
      -ContainmentRoot $containmentRootPath
    throw
  }
  } finally {
    Close-BoundReleaseFile -Binding $signature
    Close-BoundReleaseFile -Binding $artifact
  }
}

function Remove-OwnedUpdaterStage {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Stage,
    [Parameter(Mandatory = $true)]
    [string]$StageParent,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot
  )
  if ($Stage.Identity -notmatch '^[0-9a-f]{32}$') {
    throw 'Refusing to clean an updater stage with an invalid identity'
  }
  $root = Assert-NonReparseDirectory -Path $ContainmentRoot -Label 'Release root'
  $parent = Assert-ContainedPath -Path $StageParent -Root $root
  $parent = Assert-NonReparseDirectory -Path $parent -Label 'Updater stage parent'
  $expected = Join-Path $parent "stage-$($Stage.Identity)"
  $actual = Assert-ContainedPath -Path $Stage.Path -Root $parent
  if (-not $actual.Equals($expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to clean an updater stage not owned by this invocation'
  }
  if (-not (Test-Path -LiteralPath $actual)) { return }
  [void](Assert-NonReparseDirectory -Path $actual -Label 'Owned updater stage')
  $owned = @{}
  foreach ($candidate in @($Stage.ArtifactPath, $Stage.SignaturePath, $Stage.ManifestPath)) {
    if ([string]::IsNullOrWhiteSpace([string]$candidate)) {
      throw 'Refusing to clean an updater stage without its exact owned-file manifest'
    }
    $ownedPath = Assert-ContainedPath -Path ([string]$candidate) -Root $actual
    $ownedParent = Split-Path -Parent $ownedPath
    if (-not $ownedParent.Equals($actual, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean a nested updater-stage path: $ownedPath"
    }
    $owned[$ownedPath] = $true
  }
  $children = @(Get-ChildItem -LiteralPath $actual -Force)
  foreach ($child in $children) {
    if (
      $child.PSIsContainer -or
      ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      -not $owned.ContainsKey($child.FullName)
    ) {
      throw "Refusing to remove unexpected updater-stage content: $($child.FullName)"
    }
    [void](Assert-RegularFile -Path $child.FullName -Label 'Owned updater-stage file')
  }
  foreach ($child in $children) {
    [void](Assert-RegularFile -Path $child.FullName -Label 'Owned updater-stage file')
    Remove-Item -LiteralPath $child.FullName -Force
  }
  Remove-Item -LiteralPath $actual -Force
}

function Remove-OwnedReleaseTransaction {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TransactionPath,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [string]$Identity,
    [Parameter(Mandatory = $true)]
    [string[]]$OwnedLeafNames
  )
  if ($Identity -notmatch '^[0-9a-f]{32}$') {
    throw 'Refusing to clean a release transaction with an invalid identity'
  }
  if ($Label -notmatch '^[a-z][a-z0-9 ]{0,31}$') {
    throw 'Refusing to clean a release transaction with an invalid label'
  }
  $root = Assert-NonReparseDirectory -Path $ContainmentRoot -Label 'Release root'
  $expected = Join-Path $root ".$Label-transaction-$Identity"
  $actual = Assert-ContainedPath -Path $TransactionPath -Root $root
  if (-not $actual.Equals($expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to clean a release transaction not owned by this invocation'
  }
  if (-not (Test-Path -LiteralPath $actual)) { return }
  [void](Assert-NonReparseDirectory -Path $actual -Label "$Label transaction")
  $owned = @{}
  foreach ($leafName in $OwnedLeafNames) {
    if (
      [string]::IsNullOrWhiteSpace($leafName) -or
      $leafName -notmatch '^((new|old|failed|restore|failed-restore)-\d+|journal\.(json|tmp|previous))$'
    ) {
      throw "Refusing to clean an invalid release transaction filename: $leafName"
    }
    $owned[$leafName] = $true
  }
  $children = @(Get-ChildItem -LiteralPath $actual -Force)
  foreach ($child in $children) {
    if (
      $child.PSIsContainer -or
      ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      -not $owned.ContainsKey($child.Name)
    ) {
      throw "Refusing to remove unexpected release transaction content: $($child.FullName)"
    }
    [void](Assert-RegularFile -Path $child.FullName -Label 'Owned release transaction file')
  }
  foreach ($child in $children) {
    [void](Assert-RegularFile -Path $child.FullName -Label 'Owned release transaction file')
    Remove-Item -LiteralPath $child.FullName -Force
  }
  Remove-Item -LiteralPath $actual -Force
}

function Assert-NoPendingReleaseTransactions {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot
  )
  $root = Assert-NonReparseDirectory -Path $ContainmentRoot -Label 'Release root'
  foreach ($child in @(Get-ChildItem -LiteralPath $root -Force)) {
    if ($child.Name -notmatch '^\.[a-z][a-z0-9 ]{0,31}-transaction-[0-9a-f]{32}$') {
      continue
    }
    throw "Pending release transaction requires recovery admission before publication: $($child.FullName)"
  }
}

function Write-ReleaseTransactionJournal {
  param(
    [Parameter(Mandatory = $true)]
    [string]$JournalPath,
    [Parameter(Mandatory = $true)]
    [string]$TemporaryPath,
    [Parameter(Mandatory = $true)]
    [psobject]$Journal,
    [switch]$Replace
  )
  if (Test-Path -LiteralPath $TemporaryPath) {
    throw "Release transaction journal temporary path already exists: $TemporaryPath"
  }
  $json = $Journal | ConvertTo-Json -Depth 8
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
  $stream = [IO.File]::Open(
    $TemporaryPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
  } finally {
    $stream.Dispose()
  }
  if ($Replace) {
    $previousPath = Join-Path (Split-Path -Parent $JournalPath) 'journal.previous'
    if (Test-Path -LiteralPath $previousPath) {
      throw "Release transaction journal previous path already exists: $previousPath"
    }
    [IO.File]::Replace($TemporaryPath, $JournalPath, $previousPath, $true)
  } else {
    Move-Item -LiteralPath $TemporaryPath -Destination $JournalPath -ErrorAction Stop
  }
  $binding = Open-BoundReleaseFile -Path $JournalPath -Label 'Release transaction journal'
  try {
    $parsed = Get-Content -LiteralPath $JournalPath -Raw | ConvertFrom-Json
    if (
      $parsed.schemaVersion -ne $Journal.schemaVersion -or
      $parsed.identity -ne $Journal.identity -or
      $parsed.state -ne $Journal.state
    ) {
      throw 'Release transaction journal verification failed'
    }
  } finally {
    Close-BoundReleaseFile -Binding $binding
  }
}

function Invoke-TransactionalFilePublication {
  param(
    [Parameter(Mandatory = $true)]
    [psobject[]]$Entries,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [int]$TestFailAfterBackup = -1,
    [int]$TestFailAfterReplacement = -1,
    [int]$TestFailAfterMoveBeforeBind = -1,
    [scriptblock]$BeforeBackupTestHook,
    [scriptblock]$BeforeDestinationMoveTestHook,
    [scriptblock]$AfterPreparedJournalTestHook,
    [scriptblock]$AfterCommittedJournalTestHook
  )
  $root = Assert-NonReparseDirectory -Path $ContainmentRoot -Label 'Release root'
  Assert-NoPendingReleaseTransactions -ContainmentRoot $root
  $rootBinding = Open-BoundReleaseDirectory -Path $root -Label 'Release root'
  $destinationParentBindings = @{}
  $orderedDestinationParentBindings = @()
  $transactionBinding = $null
  $bindings = @()
  $prepared = @()
  $destinations = @{}
  $transaction = $null
  $identity = $null
  $journalPath = $null
  $journalTemporaryPath = $null
  $backedUp = @()
  $moved = @()
  $published = @()
  $safeToRemoveTransaction = $false
  try {
    $entryIndex = 0
    foreach ($entry in $Entries) {
      $contained = Assert-FutureContainedPath -Path ([string]$entry.DestinationPath) -Root $root
      if ($destinations.ContainsKey($contained)) {
        throw "$Label contains a duplicate destination: $contained"
      }
      $destinations[$contained] = $true
      $binding = $entry.SourceBinding
      if ($binding) {
        Assert-BoundReleaseFileCurrent -Binding $binding
      } else {
        $binding = Open-BoundReleaseFile -Path ([string]$entry.SourcePath) -Label "$Label source"
        $bindings += $binding
      }
      $existing = $null
      if (Test-Path -LiteralPath $contained) {
        $existing = Open-BoundReleaseFile -Path $contained -Label "Existing $Label destination"
        Close-BoundReleaseFile -Binding $existing
      }
      $prepared += [pscustomobject]@{
        Binding = $binding
        Destination = $contained
        DestinationParent = Split-Path -Parent $contained
        DestinationParentBinding = $null
        Existing = $existing
        FreshnessReferencePath = [string]$entry.FreshnessReferencePath
        Temporary = $null
        Backup = $null
        BackupBinding = $null
        HadExisting = [bool]$existing
        PublishedIdentity = $null
        Index = $entryIndex
        MovedToDestination = $false
        Quarantine = $null
        RestoreTemporary = $null
        FailedRestore = $null
      }
      $entryIndex++
    }

    foreach ($item in $prepared) {
      if ([string]::IsNullOrWhiteSpace($item.FreshnessReferencePath)) { continue }
      $referencePath = [IO.Path]::GetFullPath($item.FreshnessReferencePath)
      $reference = $null
      foreach ($candidate in $prepared) {
        if ($candidate.Binding.Path.Equals($referencePath, [StringComparison]::OrdinalIgnoreCase)) {
          $reference = $candidate.Binding
          break
        }
      }
      if (-not $reference) {
        throw "$Label freshness reference is not part of the bound publication set: $referencePath"
      }
      if ($item.Binding.LastWriteTime -lt $reference.LastWriteTime) {
        throw "$Label signature is stale for $referencePath"
      }
    }

    $destinationParentPaths = @{}
    foreach ($item in $prepared) {
      $parentPath = [IO.Path]::GetFullPath($item.DestinationParent)
      if (-not $parentPath.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
        $parentPath = Assert-FutureContainedPath -Path $parentPath -Root $root
      }
      while (-not $parentPath.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
        $destinationParentPaths[$parentPath] = $true
        $parentPath = Split-Path -Parent $parentPath
        if ([string]::IsNullOrWhiteSpace($parentPath)) {
          throw "$Label destination parent chain escaped the release root"
        }
        $parentPath = [IO.Path]::GetFullPath($parentPath)
      }
    }
    foreach ($parentPath in @($destinationParentPaths.Keys | Sort-Object { $_.Length })) {
      $containingPath = Split-Path -Parent $parentPath
      $containingBinding = if (
        $containingPath.Equals($root, [StringComparison]::OrdinalIgnoreCase)
      ) {
        $rootBinding
      } else {
        $destinationParentBindings[$containingPath]
      }
      if (-not $containingBinding) {
        throw "$Label destination parent has no retained containing-directory binding: $parentPath"
      }
      Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $containingBinding
      if (-not (Test-Path -LiteralPath $parentPath)) {
        New-Item -ItemType Directory -Path $parentPath -ErrorAction Stop | Out-Null
      }
      $parentBinding = Open-BoundReleaseDirectory `
        -Path $parentPath `
        -Label "$Label destination parent"
      $destinationParentBindings[$parentPath] = $parentBinding
      $orderedDestinationParentBindings += $parentBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $containingBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $parentBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
    }
    foreach ($item in $prepared) {
      $item.DestinationParentBinding = if (
        $item.DestinationParent.Equals($root, [StringComparison]::OrdinalIgnoreCase)
      ) {
        $rootBinding
      } else {
        $destinationParentBindings[$item.DestinationParent]
      }
      if (-not $item.DestinationParentBinding) {
        throw "$Label destination has no retained parent binding: $($item.Destination)"
      }
    }

    $identity = [Guid]::NewGuid().ToString('N')
    $transaction = Join-Path $root ".$Label-transaction-$identity"
    [void](Assert-ContainedPath -Path $transaction -Root $root)
    Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
    New-Item -ItemType Directory -Path $transaction -ErrorAction Stop | Out-Null
    $transactionBinding = Open-BoundReleaseDirectory `
      -Path $transaction `
      -Label "$Label transaction"
    Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
    Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding

    for ($index = 0; $index -lt $prepared.Count; $index++) {
      $item = $prepared[$index]
      $item.Temporary = Join-Path $transaction "new-$index"
      $item.Backup = Join-Path $transaction "old-$index"
      Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
      [void](Copy-BoundReleaseFile -Binding $item.Binding -DestinationPath $item.Temporary)
      Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
    }
    $journalPath = Join-Path $transaction 'journal.json'
    $journalTemporaryPath = Join-Path $transaction 'journal.tmp'
    $journal = [ordered]@{
      schemaVersion = 'vibespace.release-transaction.v1'
      identity = $identity
      label = $Label
      state = 'prepared'
      entries = @($prepared | ForEach-Object {
        [ordered]@{
          index = $_.Index
          destination = $_.Destination
          destinationRelative = $_.Destination.Substring($root.Length).TrimStart('\', '/')
          newLeaf = Split-Path -Leaf $_.Temporary
          backupLeaf = if ($_.HadExisting) { Split-Path -Leaf $_.Backup } else { $null }
          hadExisting = $_.HadExisting
          sourceSha256 = $_.Binding.Sha256
          priorSha256 = if ($_.Existing) { $_.Existing.Sha256 } else { $null }
        }
      })
    }
    Write-ReleaseTransactionJournal `
      -JournalPath $journalPath `
      -TemporaryPath $journalTemporaryPath `
      -Journal $journal
    Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
    if ($AfterPreparedJournalTestHook) {
      & $AfterPreparedJournalTestHook $journalPath
    }
    if ($BeforeBackupTestHook) {
      & $BeforeBackupTestHook
    }

    $replacementCount = 0
    $backupCount = 0
    $moveCount = 0
    foreach ($item in $prepared) {
      Assert-BoundReleaseFileCurrent -Binding $item.Binding
      Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
      $destination = $item.Destination
      if ($item.HadExisting) {
        Assert-BoundReleaseFileCurrent -Binding $item.Existing
        Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
        Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
        Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
        Move-Item -LiteralPath $destination -Destination $item.Backup -ErrorAction Stop
        $backedUp += $item
        $item.BackupBinding = Open-BoundReleaseFile `
          -Path $item.Backup `
          -Label "Held backed-up $Label destination"
        Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
        Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
        Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
        Assert-ReleaseFileMatchesBindingAtPath `
          -Path $item.Backup `
          -ExpectedBinding $item.Existing `
          -Label "Backed-up $Label destination"
        $backupCount++
        if ($TestFailAfterBackup -ge 0 -and $backupCount -eq $TestFailAfterBackup) {
          throw "injected $Label backup failure"
        }
      } elseif (Test-Path -LiteralPath $destination) {
        throw "$Label destination appeared after validation: $destination"
      }
      $temporaryBinding = Open-VerifiedReleaseFileCopy `
        -Path $item.Temporary `
        -SourceBinding $item.Binding `
        -Label "Prepared $Label file"
      Close-BoundReleaseFile -Binding $temporaryBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
      if ($BeforeDestinationMoveTestHook) {
        & $BeforeDestinationMoveTestHook
        $BeforeDestinationMoveTestHook = $null
      }
      Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
      Move-Item -LiteralPath $item.Temporary -Destination $destination -ErrorAction Stop
      $item.MovedToDestination = $true
      $moved += $item
      Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
      Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
      $moveCount++
      if (
        $TestFailAfterMoveBeforeBind -ge 0 -and
        $moveCount -eq $TestFailAfterMoveBeforeBind
      ) {
        throw "injected $Label move-before-bind failure"
      }
      $item.PublishedIdentity = Open-VerifiedReleaseFileCopy `
        -Path $destination `
        -SourceBinding $item.Binding `
        -Label "Published $Label destination"
      Close-BoundReleaseFile -Binding $item.PublishedIdentity
      $published += $item
      $replacementCount++
      if ($TestFailAfterReplacement -ge 0 -and $replacementCount -eq $TestFailAfterReplacement) {
        throw "injected $Label publication failure"
      }
    }

    $journal.state = 'committed'
    Write-ReleaseTransactionJournal `
      -JournalPath $journalPath `
      -TemporaryPath $journalTemporaryPath `
      -Journal $journal `
      -Replace
    Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
    if ($AfterCommittedJournalTestHook) {
      & $AfterCommittedJournalTestHook `
        $journalPath `
        (Join-Path $transaction 'journal.previous')
    }
    $safeToRemoveTransaction = $true
    return @($prepared | ForEach-Object { $_.Destination })
  } catch {
    $publicationError = $_
    $rollbackFailed = $false
    $preserveUnverifiedResidue = $false
    foreach ($item in $backedUp) {
      try {
        if (-not $item.BackupBinding) {
          throw "Backed-up $Label destination has no retained binding"
        }
        Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
        Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
        Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
        Assert-BoundReleaseFileCurrent -Binding $item.BackupBinding
        Assert-ReleaseFileMatchesBindingAtPath `
          -Path $item.Backup `
          -ExpectedBinding $item.Existing `
          -Label "Backed-up $Label destination"
      } catch {
        $rollbackFailed = $true
      }
    }
    for ($index = $moved.Count - 1; $index -ge 0; $index--) {
      $item = $moved[$index]
      try {
        if (Test-Path -LiteralPath $item.Destination) {
          Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
          $item.Quarantine = Join-Path $transaction "failed-$($item.Index)"
          Move-Item `
            -LiteralPath $item.Destination `
            -Destination $item.Quarantine `
            -ErrorAction Stop
          Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
          try {
            $quarantined = Open-VerifiedReleaseFileCopy `
              -Path $item.Quarantine `
              -SourceBinding $item.Binding `
              -Label "Quarantined $Label destination"
            Close-BoundReleaseFile -Binding $quarantined
          } catch {
            $preserveUnverifiedResidue = $true
          }
        }
      } catch {
        $rollbackFailed = $true
      }
    }
    if (-not $rollbackFailed) {
      for ($index = $backedUp.Count - 1; $index -ge 0; $index--) {
        $item = $backedUp[$index]
        if (Test-Path -LiteralPath $item.Destination) {
          $rollbackFailed = $true
          break
        }
        try {
          Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
          Assert-BoundReleaseFileCurrent -Binding $item.BackupBinding
          $item.RestoreTemporary = Join-Path $transaction "restore-$($item.Index)"
          [void](Copy-BoundReleaseFile `
            -Binding $item.BackupBinding `
            -DestinationPath $item.RestoreTemporary)
          Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
          Move-Item `
            -LiteralPath $item.RestoreTemporary `
            -Destination $item.Destination `
            -ErrorAction Stop
          $item.RestoreTemporary = $null
          Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
          Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
          Assert-ReleaseFileMatchesBoundBytesAtPath `
            -Path $item.Destination `
            -ExpectedBinding $item.Existing `
            -Label "Restored $Label destination"
        } catch {
          if (Test-Path -LiteralPath $item.Destination) {
            $item.FailedRestore = Join-Path $transaction "failed-restore-$($item.Index)"
            Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
            Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
            Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
            Move-Item `
              -LiteralPath $item.Destination `
              -Destination $item.FailedRestore `
              -ErrorAction SilentlyContinue
            Assert-BoundReleaseDirectoryCurrent -Binding $transactionBinding
            Assert-BoundReleaseDirectoryCurrent -Binding $item.DestinationParentBinding
            Assert-BoundReleaseDirectoryCurrent -Binding $rootBinding
          }
          $rollbackFailed = $true
          break
        }
      }
      if (-not $rollbackFailed -and -not $preserveUnverifiedResidue) {
        $safeToRemoveTransaction = $true
        throw $publicationError
      }
      if (-not $rollbackFailed) {
        throw "$Label publication failed; canonical destinations were restored but unverified transaction residue was preserved at $transaction"
      }
    }
    throw "$Label publication failed and rollback was incomplete; preserved transaction at $transaction"
  } finally {
    foreach ($item in $prepared) {
      Close-BoundReleaseFile -Binding $item.BackupBinding
      $item.BackupBinding = $null
    }
    foreach ($binding in $bindings) {
      Close-BoundReleaseFile -Binding $binding
    }
    Close-BoundReleaseDirectory -Binding $transactionBinding
    $transactionBinding = $null
    if (
      $safeToRemoveTransaction -and
      $transaction -and
      (Test-Path -LiteralPath $transaction)
    ) {
      $ownedLeafNames = @()
      for ($index = 0; $index -lt $prepared.Count; $index++) {
        $ownedLeafNames += "new-$index"
        $ownedLeafNames += "old-$index"
        $ownedLeafNames += "failed-$index"
        $ownedLeafNames += "restore-$index"
        $ownedLeafNames += "failed-restore-$index"
      }
      $ownedLeafNames += 'journal.json'
      $ownedLeafNames += 'journal.tmp'
      $ownedLeafNames += 'journal.previous'
      try {
        Remove-OwnedReleaseTransaction `
          -TransactionPath $transaction `
          -ContainmentRoot $root `
          -Label $Label `
          -Identity $identity `
          -OwnedLeafNames $ownedLeafNames
      } catch {
        Write-Warning "Preserved release transaction residue after safe cleanup refusal: $transaction"
      }
    }
    for ($index = $orderedDestinationParentBindings.Count - 1; $index -ge 0; $index--) {
      Close-BoundReleaseDirectory -Binding $orderedDestinationParentBindings[$index]
    }
    Close-BoundReleaseDirectory -Binding $rootBinding
  }
}

function Publish-ReleaseAssetsTransactionally {
  param(
    [Parameter(Mandatory = $true)]
    [psobject[]]$Assets,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [int]$TestFailAfterBackup = -1,
    [int]$TestFailAfterReplacement = -1,
    [int]$TestFailAfterMoveBeforeBind = -1,
    [scriptblock]$BeforeBackupTestHook,
    [scriptblock]$BeforeDestinationMoveTestHook
  )
  $entries = @()
  foreach ($asset in $Assets) {
    $name = [string]$asset.DestinationName
    if (
      [string]::IsNullOrWhiteSpace($name) -or
      -not $name.Equals([IO.Path]::GetFileName($name), [StringComparison]::Ordinal)
    ) {
      throw "Release asset destination must be a single filename: $name"
    }
    $entries += [pscustomobject]@{
      SourcePath = [string]$asset.SourcePath
      DestinationPath = Join-Path $ContainmentRoot $name
    }
  }
  return Invoke-TransactionalFilePublication `
    -Entries $entries `
    -ContainmentRoot $ContainmentRoot `
    -Label 'release asset' `
    -TestFailAfterBackup $TestFailAfterBackup `
    -TestFailAfterReplacement $TestFailAfterReplacement `
    -TestFailAfterMoveBeforeBind $TestFailAfterMoveBeforeBind `
    -BeforeBackupTestHook $BeforeBackupTestHook `
    -BeforeDestinationMoveTestHook $BeforeDestinationMoveTestHook
}

function Publish-ReleaseArtifactsTransactionally {
  param(
    [Parameter(Mandatory = $true)]
    [psobject[]]$Artifacts,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [int]$TestFailAfterBackup = -1,
    [int]$TestFailAfterReplacement = -1
  )
  $entries = @()
  foreach ($artifact in $Artifacts) {
    $sourcePath = [string]$artifact.SourcePath
    if ([string]::IsNullOrWhiteSpace($sourcePath)) {
      throw 'Release artifact source path is required'
    }
    $canonicalName = [string]$artifact.CanonicalName
    $friendlyName = [string]$artifact.FriendlyName
    foreach ($name in @($canonicalName, $friendlyName)) {
      if (
        [string]::IsNullOrWhiteSpace($name) -or
        -not $name.Equals([IO.Path]::GetFileName($name), [StringComparison]::Ordinal)
      ) {
        throw "Release artifact destination must be a single filename: $name"
      }
    }
    if ($canonicalName.Equals($friendlyName, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Release artifact canonical and friendly destinations must differ: $canonicalName"
    }
    $signaturePath = "$sourcePath.sig"
    if (-not (Test-Path -LiteralPath $signaturePath)) {
      throw "Release artifact signature is missing: $signaturePath"
    }
    foreach ($destinationName in @($canonicalName, $friendlyName)) {
      $entries += [pscustomobject]@{
        SourcePath = $sourcePath
        DestinationPath = Join-Path $ContainmentRoot $destinationName
      }
      $entries += [pscustomobject]@{
        SourcePath = $signaturePath
        DestinationPath = Join-Path $ContainmentRoot "$destinationName.sig"
        FreshnessReferencePath = $sourcePath
      }
    }
  }
  return Invoke-TransactionalFilePublication `
    -Entries $entries `
    -ContainmentRoot $ContainmentRoot `
    -Label 'release asset' `
    -TestFailAfterBackup $TestFailAfterBackup `
    -TestFailAfterReplacement $TestFailAfterReplacement
}

function Publish-UpdaterManifestAtomically {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string[]]$DestinationPaths,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [int]$TestFailAfterReplacement = -1
  )
  if ($DestinationPaths.Count -ne 3) {
    throw 'Updater manifest publication requires exactly three destinations'
  }
  $entries = @($DestinationPaths | ForEach-Object {
    [pscustomobject]@{ SourcePath = $SourcePath; DestinationPath = $_ }
  })
  [void](Invoke-TransactionalFilePublication `
    -Entries $entries `
    -ContainmentRoot $ContainmentRoot `
    -Label 'manifest' `
    -TestFailAfterReplacement $TestFailAfterReplacement)
}

function Publish-CompleteReleaseUnitTransactionally {
  param(
    [Parameter(Mandatory = $true)]
    [psobject[]]$Artifacts,
    [Parameter(Mandatory = $true)]
    [string]$ManifestSourcePath,
    [psobject]$ManifestSourceBinding,
    [Parameter(Mandatory = $true)]
    [string[]]$ManifestDestinationPaths,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [int]$TestFailAfterReplacement = -1,
    [scriptblock]$BeforeDestinationMoveTestHook
  )
  if ($ManifestDestinationPaths.Count -ne 3) {
    throw 'Complete release publication requires exactly three updater manifest destinations'
  }
  $entries = @()
  foreach ($artifact in $Artifacts) {
    $sourceBinding = $artifact.SourceBinding
    $signatureBinding = $artifact.SignatureBinding
    $sourcePath = if ($sourceBinding) {
      [string]$sourceBinding.Path
    } else {
      [string]$artifact.SourcePath
    }
    if ([string]::IsNullOrWhiteSpace($sourcePath)) {
      throw 'Complete release artifact source path is required'
    }
    $canonicalName = [string]$artifact.CanonicalName
    $friendlyName = [string]$artifact.FriendlyName
    foreach ($name in @($canonicalName, $friendlyName)) {
      if (
        [string]::IsNullOrWhiteSpace($name) -or
        -not $name.Equals([IO.Path]::GetFileName($name), [StringComparison]::Ordinal)
      ) {
        throw "Complete release destination must be a single filename: $name"
      }
    }
    if ($canonicalName.Equals($friendlyName, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Complete release canonical and friendly destinations must differ: $canonicalName"
    }
    $signaturePath = "$sourcePath.sig"
    if (-not (Test-Path -LiteralPath $signaturePath)) {
      throw "Complete release artifact signature is missing: $signaturePath"
    }
    foreach ($destinationName in @($canonicalName, $friendlyName)) {
      $entries += [pscustomobject]@{
        SourcePath = $sourcePath
        SourceBinding = $sourceBinding
        DestinationPath = Join-Path $ContainmentRoot $destinationName
      }
      $entries += [pscustomobject]@{
        SourcePath = $signaturePath
        SourceBinding = $signatureBinding
        DestinationPath = Join-Path $ContainmentRoot "$destinationName.sig"
        FreshnessReferencePath = $sourcePath
      }
    }
  }
  foreach ($destinationPath in $ManifestDestinationPaths) {
    $entries += [pscustomobject]@{
      SourcePath = $ManifestSourcePath
      SourceBinding = $ManifestSourceBinding
      DestinationPath = $destinationPath
    }
  }
  return Invoke-TransactionalFilePublication `
    -Entries $entries `
    -ContainmentRoot $ContainmentRoot `
    -Label 'complete release' `
    -TestFailAfterReplacement $TestFailAfterReplacement `
    -BeforeDestinationMoveTestHook $BeforeDestinationMoveTestHook
}

function Remove-CurrentVersionSignatures {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$ArtifactPaths,
    [Parameter(Mandatory = $true)]
    [string[]]$BundleRoots
  )
  foreach ($artifactPath in $ArtifactPaths) {
    if ([string]::IsNullOrWhiteSpace($artifactPath)) { continue }
    $signaturePath = "$artifactPath.sig"
    $contained = $false
    foreach ($bundleRoot in $BundleRoots) {
      if ([string]::IsNullOrWhiteSpace($bundleRoot) -or -not (Test-Path -LiteralPath $bundleRoot)) {
        continue
      }
      try {
        [void](Assert-ContainedPath -Path $signaturePath -Root $bundleRoot)
        $contained = $true
        break
      } catch {
        continue
      }
    }
    if (-not $contained) {
      throw "Refusing to clean a signature outside the configured bundle roots: $signaturePath"
    }
    if (Test-Path -LiteralPath $signaturePath) {
      [void](Assert-RegularFile -Path $signaturePath -Label 'Current-version updater signature')
      Remove-Item -LiteralPath $signaturePath -Force
      Write-Warn "Removed current-version updater signature: $(Split-Path -Leaf $signaturePath)"
    }
  }
}

$packageJsonPath = Join-Path $AppDir 'package.json'
$tauriConfigPath = Join-Path $AppDir 'src-tauri\tauri.conf.json'
$Version = Assert-ReleaseVersionPreflight `
  -Version $Version `
  -PackageJsonPath $packageJsonPath `
  -TauriConfigPath $tauriConfigPath

if (-not (Test-Path -LiteralPath $ReleasesDir)) {
  New-Item -ItemType Directory -Path $ReleasesDir -Force | Out-Null
}
[void](Assert-NonReparseDirectory -Path $ReleasesDir -Label 'Release root')

$nsisSrc = Resolve-BundleArtifact $nsisDir @(
  "VibeSpace_${Version}_x64-setup.exe",
  "Jarvis One_${Version}_x64-setup.exe"
)
$msiSrc = Resolve-BundleArtifact $msiDir @(
  "VibeSpace_${Version}_x64_en-US.msi",
  "Jarvis One_${Version}_x64_en-US.msi"
)
$nsisName = if ($nsisSrc) { Split-Path -Leaf $nsisSrc } else { "VibeSpace_${Version}_x64-setup.exe" }
$msiName  = if ($msiSrc)  { Split-Path -Leaf $msiSrc }  else { "VibeSpace_${Version}_x64_en-US.msi" }
$friendlyNsisName = "VibeSpace-${Version}-Windows-x64.exe"
$friendlyMsiName = "VibeSpace-${Version}-Windows-x64.msi"
$script:UpdaterSigningPasswordIsBlank = $false

# --- Pretty output ---------------------------------------------------------
function Write-Step ($msg) { Write-Host "  -> " -NoNewline -ForegroundColor Cyan; Write-Host $msg }
function Write-Ok   ($msg) { Write-Host "  OK " -NoNewline -ForegroundColor Green; Write-Host $msg }
function Write-Warn ($msg) { Write-Host "  !! " -NoNewline -ForegroundColor Yellow; Write-Host $msg -ForegroundColor Yellow }
function Write-Fail ($msg) { Write-Host "  XX " -NoNewline -ForegroundColor Red; Write-Host $msg -ForegroundColor Red }

function Get-CommittedReleaseUnitItemsForReporting {
  param([string[]]$Paths)
  $items = @()
  foreach ($path in $Paths) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    try {
      $items += Get-Item -LiteralPath $path -Force -ErrorAction Stop
    } catch {
      Write-Warn 'Release unit is committed; one published output could not be inspected for reporting'
    }
  }
  return @($items)
}

function Invoke-BoundUpdaterReleasePublication {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$UpdaterStage,
    [Parameter(Mandatory = $true)]
    [string]$NsisName,
    [Parameter(Mandatory = $true)]
    [string]$FriendlyNsisName,
    [string]$MsiSourcePath,
    [string]$MsiName,
    [string]$FriendlyMsiName,
    [Parameter(Mandatory = $true)]
    [string[]]$ManifestDestinationPaths,
    [Parameter(Mandatory = $true)]
    [string]$ContainmentRoot,
    [scriptblock]$BeforeDestinationMoveTestHook,
    [scriptblock]$AfterCommitBeforeReportTestHook
  )
  $releaseArtifacts = @(
    [pscustomobject]@{
      SourcePath = $UpdaterStage.ArtifactPath
      SourceBinding = $UpdaterStage.ArtifactBinding
      SignatureBinding = $UpdaterStage.SignatureBinding
      CanonicalName = $NsisName
      FriendlyName = $FriendlyNsisName
    }
  )
  if (-not [string]::IsNullOrWhiteSpace($MsiSourcePath)) {
    $releaseArtifacts += [pscustomobject]@{
      SourcePath = $MsiSourcePath
      CanonicalName = $MsiName
      FriendlyName = $FriendlyMsiName
    }
  }

  $publishedPaths = @(
    Publish-CompleteReleaseUnitTransactionally `
      -Artifacts $releaseArtifacts `
      -ManifestSourcePath $UpdaterStage.ManifestPath `
      -ManifestSourceBinding $UpdaterStage.ManifestBinding `
      -ManifestDestinationPaths $ManifestDestinationPaths `
      -ContainmentRoot $ContainmentRoot `
      -BeforeDestinationMoveTestHook $BeforeDestinationMoveTestHook
  )
  if ($AfterCommitBeforeReportTestHook) {
    & $AfterCommitBeforeReportTestHook $publishedPaths
  }
  $committedItems = @(Get-CommittedReleaseUnitItemsForReporting -Paths $publishedPaths)
  foreach ($stagedItem in $committedItems) {
    if ($stagedItem.Name.EndsWith('.sig', [StringComparison]::OrdinalIgnoreCase)) {
      Write-Ok "Staged $($stagedItem.Name)"
    } elseif ($stagedItem.Extension.Equals('.json', [StringComparison]::OrdinalIgnoreCase)) {
      Write-Ok "Published $($stagedItem.Name)"
    } else {
      $sizeMB = [math]::Round($stagedItem.Length / 1MB, 2)
      Write-Ok "Staged $($stagedItem.Name) ($sizeMB MB)"
    }
  }
  Write-Ok 'Committed signed root assets and all updater manifests'
  return [pscustomobject]@{
    Paths = $publishedPaths
    Items = $committedItems
  }
}

function Get-ConfiguredUpdaterPublicKey {
  $tauriConfigPath = Join-Path $AppDir 'src-tauri\tauri.conf.json'
  $tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
  $publicKey = $tauriConfig.plugins.updater.pubkey
  if ([string]::IsNullOrWhiteSpace($publicKey)) {
    Write-Fail "Updater public key is missing from $tauriConfigPath"
    exit 1
  }
  return $publicKey.Trim()
}

function Test-UpdaterKeyPair {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PrivateKeyPath,
    [Parameter(Mandatory = $true)]
    [string]$ConfiguredPublicKey
  )

  $publicKeyPath = "$PrivateKeyPath.pub"
  if (-not (Test-Path -LiteralPath $publicKeyPath)) {
    return $false
  }

  $candidatePublicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
  return $candidatePublicKey -eq $ConfiguredPublicKey
}

function Initialize-UpdaterSigningKey {
  $hasInlineKey = -not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)
  $hasKeyPath = -not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PATH)
  $configuredPublicKey = Get-ConfiguredUpdaterPublicKey
  $tauriKeyDir = Join-Path $env:USERPROFILE '.tauri'
  $defaultKeyPaths = @(
    (Join-Path $tauriKeyDir 'jarvis.key'),
    (Join-Path $tauriKeyDir 'jarvis-plain.key')
  )

  if ($hasKeyPath -and -not (Test-Path -LiteralPath $env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    Write-Fail "TAURI_SIGNING_PRIVATE_KEY_PATH does not exist: $env:TAURI_SIGNING_PRIVATE_KEY_PATH"
    exit 1
  }

  if (-not $hasInlineKey -and -not $hasKeyPath) {
    $matchingKeyPath = $defaultKeyPaths |
      Where-Object {
        (Test-Path -LiteralPath $_) -and
        (Test-UpdaterKeyPair -PrivateKeyPath $_ -ConfiguredPublicKey $configuredPublicKey)
      } |
      Select-Object -First 1

    if ($matchingKeyPath) {
      $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $matchingKeyPath
      $hasKeyPath = $true
      Write-Ok "Using updater signing key at $matchingKeyPath"
    }
  }

  if (-not $hasInlineKey -and -not $hasKeyPath) {
    Write-Fail 'Missing Tauri updater signing private key.'
    Write-Warn 'Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH before running release:windows.'
    Write-Warn "For local maintainer builds, place the key and matching .pub file in $tauriKeyDir."
    Write-Warn 'Without this key, Tauri cannot generate .sig files and latest.json cannot be valid.'
    exit 1
  }

  if ($hasKeyPath) {
    $keyPath = (Resolve-Path -LiteralPath $env:TAURI_SIGNING_PRIVATE_KEY_PATH).Path
    if (-not (Test-UpdaterKeyPair -PrivateKeyPath $keyPath -ConfiguredPublicKey $configuredPublicKey)) {
      Write-Fail "Updater key does not match app/src-tauri/tauri.conf.json: $keyPath"
      Write-Warn "Expected a matching public key at $keyPath.pub"
      exit 1
    }

    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $keyPath
    $passwordPath = "$keyPath.password"
    if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) -and (Test-Path -LiteralPath $passwordPath)) {
      $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -LiteralPath $passwordPath -Raw).TrimEnd()
      Write-Ok "Loaded updater signing key password from $passwordPath"
    } elseif ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) {
      $blankPasswordPath = Join-Path $tauriKeyDir 'empty-password.txt'
      if (Test-Path -LiteralPath $blankPasswordPath) {
        $script:UpdaterSigningPasswordIsBlank = $true
        Write-Ok "Using an empty updater signing key password"
      }
    }
  } elseif ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PUBLIC_KEY)) {
    Write-Fail 'Inline updater keys require TAURI_SIGNING_PUBLIC_KEY for pair validation.'
    Write-Warn 'Prefer TAURI_SIGNING_PRIVATE_KEY_PATH with a sibling .pub file.'
    exit 1
  } elseif ($env:TAURI_SIGNING_PUBLIC_KEY.Trim() -ne $configuredPublicKey) {
    Write-Fail 'TAURI_SIGNING_PUBLIC_KEY does not match app/src-tauri/tauri.conf.json.'
    exit 1
  }
}

function Invoke-UpdaterSignature {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactPath
  )

  if (-not (Test-Path -LiteralPath $ArtifactPath)) {
    Write-Fail "Cannot sign missing updater artifact: $ArtifactPath"
    exit 1
  }

  Write-Step "Generating updater signature for $(Split-Path -Leaf $ArtifactPath)..."
  $tauriCli = Join-Path $RepoRoot 'node_modules\@tauri-apps\cli\tauri.js'
  $nodePath = (Get-Command node -ErrorAction Stop).Source

  if ($script:UpdaterSigningPasswordIsBlank) {
    # Windows PowerShell drops empty native arguments, so cmd.exe is used to
    # preserve the explicit `-p ""` required by an unencrypted minisign key.
    $command = '"{0}" "{1}" signer sign -f "{2}" -p "" "{3}"' -f `
      $nodePath, $tauriCli, $env:TAURI_SIGNING_PRIVATE_KEY_PATH, $ArtifactPath
    & cmd.exe /d /s /c $command
  } else {
    & $nodePath $tauriCli signer sign $ArtifactPath
  }

  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath "$ArtifactPath.sig")) {
    throw "Updater signing failed for $ArtifactPath"
  }
  Write-Ok "Generated $(Split-Path -Leaf "$ArtifactPath.sig")"
}

Write-Host ""
Write-Host "  Jarvis release pipeline (Windows x64)" -ForegroundColor Cyan
Write-Host "  version: $Version" -ForegroundColor Gray
Write-Host ""

# --- 1. Build (unless skipped) ---------------------------------------------
if (-not $SkipBuild) {
  Initialize-UpdaterSigningKey

  Remove-CurrentVersionSignatures `
    -ArtifactPaths @(
      (Join-Path $nsisDir "VibeSpace_${Version}_x64-setup.exe"),
      (Join-Path $nsisDir "Jarvis One_${Version}_x64-setup.exe"),
      (Join-Path $msiDir "VibeSpace_${Version}_x64_en-US.msi"),
      (Join-Path $msiDir "Jarvis One_${Version}_x64_en-US.msi")
    ) `
    -BundleRoots @($nsisDir, $msiDir)

  $signScript = Join-Path $RepoRoot 'scripts\sign-windows.ps1'
  $signConfig = Join-Path $AppDir 'src-tauri\tauri.windows-signing.generated.json'
  $signingConfigObject = @{
    bundle = @{
      createUpdaterArtifacts = $false
      windows = @{
        signCommand = @{
          cmd = 'powershell'
          args = @(
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            $signScript,
            '%1'
          )
        }
      }
    }
  }
  $signingConfigObject |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $signConfig -Encoding UTF8

  Write-Step 'Running npm run tauri:build (this takes 5-15 minutes)...'
  Push-Location -LiteralPath $AppDir
  try {
    & npm run tauri:build -- --config 'src-tauri\tauri.windows-signing.generated.json'
    if ($LASTEXITCODE -ne 0) {
      throw "tauri:build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
  Write-Ok 'Build complete'
  $nsisSrc = Resolve-BundleArtifact $nsisDir @(
    "VibeSpace_${Version}_x64-setup.exe",
    "VibeSpace_${Version}_x64-setup.exe"
  )
  $msiSrc = Resolve-BundleArtifact $msiDir @(
    "VibeSpace_${Version}_x64_en-US.msi",
    "VibeSpace_${Version}_x64_en-US.msi"
  )
  if (-not $nsisSrc) { throw "NSIS installer not found under $nsisDir after build." }
  $nsisName = Split-Path -Leaf $nsisSrc
  if ($msiSrc) { $msiName = Split-Path -Leaf $msiSrc }
  Invoke-UpdaterSignature -ArtifactPath $nsisSrc
  if ($msiSrc) { Invoke-UpdaterSignature -ArtifactPath $msiSrc }
} else {
  Write-Warn 'Skipping build (-SkipBuild)'
  $nsisSrc = Resolve-BundleArtifact $nsisDir @(
    "VibeSpace_${Version}_x64-setup.exe",
    "VibeSpace_${Version}_x64-setup.exe"
  )
  $msiSrc = Resolve-BundleArtifact $msiDir @(
    "VibeSpace_${Version}_x64_en-US.msi",
    "VibeSpace_${Version}_x64_en-US.msi"
  )
  if ($nsisSrc) { $nsisName = Split-Path -Leaf $nsisSrc }
  if ($msiSrc) { $msiName = Split-Path -Leaf $msiSrc }
}

# --- 2. Build one immutable updater source generation -----------------------
if (-not $nsisSrc) {
  throw "NSIS installer not found under $nsisDir."
}
$manifestScript = Join-Path $RepoRoot 'scripts\build-updater-manifest.mjs'
if (-not (Test-Path -LiteralPath $manifestScript)) {
  throw "Manifest script not found: $manifestScript"
}
Write-Step 'Building latest.json updater manifest from one bound signed generation...'
$updaterStage = $null
$updaterStageParent = Join-Path $ReleasesDir '.updater-staging'
$manifestPath = Join-Path $ReleasesDir 'latest.json'
$channelPath = Join-Path $ReleasesDir 'channel.json'
$archived = Join-Path (Join-Path $ReleasesDir 'manifests') "v$Version.json"
$releaseCommitted = $false
$committedReleaseItems = @()
try {
  $updaterStage = New-ContainedUpdaterStage `
    -ArtifactPath $nsisSrc `
    -SourceRoot $nsisDir `
    -StageParent $updaterStageParent `
    -ContainmentRoot $ReleasesDir `
    -Version $Version `
    -RetainBindings
  & node $manifestScript `
    --version $Version `
    --assets-dir $updaterStage.Path `
    --base-url "https://github.com/Cookie774-GameDev/VibeSpace/releases/download/v$Version" `
    --outfile $updaterStage.ManifestPath
  if ($LASTEXITCODE -ne 0) {
    throw "updater manifest generation failed with exit code $LASTEXITCODE"
  }
  $updaterStage.ManifestBinding = Open-BoundReleaseFile `
    -Path $updaterStage.ManifestPath `
    -Label 'Generated updater manifest'

  # --- 3. Publish assets and all updater manifests as one rollback unit -----
  # The helper is also the executable integration seam proving that the
  # retained artifact/signature/manifest bindings reach the transaction.
  $publicationResult = Invoke-BoundUpdaterReleasePublication `
    -UpdaterStage $updaterStage `
    -NsisName $nsisName `
    -FriendlyNsisName $friendlyNsisName `
    -MsiSourcePath $msiSrc `
    -MsiName $msiName `
    -FriendlyMsiName $friendlyMsiName `
    -ManifestDestinationPaths @($manifestPath, $channelPath, $archived) `
    -ContainmentRoot $ReleasesDir
  $staged = @($publicationResult.Paths)
  $committedReleaseItems = @($publicationResult.Items)
  $releaseCommitted = $true
} finally {
  if ($updaterStage) {
    Close-BoundReleaseFile -Binding $updaterStage.ManifestBinding
    Close-BoundReleaseFile -Binding $updaterStage.SignatureBinding
    Close-BoundReleaseFile -Binding $updaterStage.ArtifactBinding
    $updaterStage.ManifestBinding = $null
    $updaterStage.SignatureBinding = $null
    $updaterStage.ArtifactBinding = $null
    try {
      Remove-OwnedUpdaterStage `
        -Stage $updaterStage `
        -StageParent $updaterStageParent `
        -ContainmentRoot $ReleasesDir
    } catch {
      if ($releaseCommitted) {
        Write-Warn "Release unit is committed; preserved updater-stage residue after safe cleanup refusal: $($updaterStage.Path)"
      } else {
        throw
      }
    }
  }
}

# --- 4. Checksums ----------------------------------------------------------
$sumsPath = Join-Path $ReleasesDir 'SHA256SUMS.txt'
try {
  Write-Step 'Computing SHA-256 hashes for the committed release unit...'
  $releaseFiles = @($staged) |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
    ForEach-Object { (Get-Item -LiteralPath $_).FullName } |
    Sort-Object -Unique
  $lines = @()
  $lines += "# SHA-256 checksums for VibeSpace $Version (Windows x64)"
  $lines += "# Generated $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
  $lines += ""
  foreach ($releaseFile in $releaseFiles) {
    $item = Get-Item -LiteralPath $releaseFile
    $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLower()
    $lines += ('{0}  {1}' -f $hash, $item.Name)
    Write-Ok ("{0}  {1}" -f $hash.Substring(0,16), $item.Name)
  }
  Set-Content -LiteralPath $sumsPath -Value ($lines -join "`r`n") -Encoding UTF8
  Write-Ok "Wrote $sumsPath"
} catch {
  Write-Warn "Release unit is committed, but checksum generation failed: $($_.Exception.Message)"
}

# --- 5. Summary ------------------------------------------------------------
Write-Host ""
Write-Host "  Done." -ForegroundColor Green
Write-Host ""
Write-Host "  Staged in: $ReleasesDir" -ForegroundColor Cyan
Write-Host "  Files:"
$committedReleaseItems `
  | Where-Object { $_.Name -match '\.(exe|msi)$' } `
  | Sort-Object Name `
  | ForEach-Object {
      $sizeMB = [math]::Round($_.Length / 1MB, 2)
      Write-Host ("    {0,-45}  {1,8} MB" -f $_.Name, $sizeMB)
    }
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    - Test:    Double-click any .exe in releases\ to install."
Write-Host "    - Publish: gh release create v$Version releases\*${Version}* releases\latest.json releases\SHA256SUMS.txt"
Write-Host "    - Docs:    See DOWNLOAD.md and releases\README.md."
Write-Host ""
