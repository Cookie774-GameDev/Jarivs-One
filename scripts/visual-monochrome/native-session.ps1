[CmdletBinding(DefaultParameterSetName = 'ValidateOnly')]
param(
  [Parameter(Mandatory = $true, ParameterSetName = 'ValidateOnly')]
  [switch]$ValidateOnly,

  [Parameter(Mandatory = $true, ParameterSetName = 'BuildReleaseExecutable')]
  [switch]$BuildReleaseExecutable,

  [Parameter(Mandatory = $true, ParameterSetName = 'BuildUnsignedNsisArtifact')]
  [switch]$BuildUnsignedNsisArtifact,

  [Parameter(Mandatory = $true, ParameterSetName = 'RunContainedDevSession')]
  [switch]$RunContainedDevSession,

  [Parameter(Mandatory = $true, ParameterSetName = 'RunCargoLibraryTests')]
  [switch]$RunCargoLibraryTests,

  [string]$SessionRoot,
  [string]$RepoRoot,
  [string]$Commit,
  [ValidateRange(0, 65535)]
  [int]$Port = 0,
  [string]$IdentifierSuffix,
  [string]$Nonce,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [Alias('ProtectedAfterFixturePath')]
  [string]$ProtectedStateFixture,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [string]$OwnedProcessFixture,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [Alias('EvidenceFixturePath')]
  [string]$EvidenceFixture,
  [string]$EvidenceToken,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [string]$BaseConfigFixture,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [string]$TestCapabilityFixture,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [string]$UnsignedNsisArtifactFixture,
  [ValidateRange(5, 600)]
  [int]$EvidenceTimeoutSeconds = 120,
  [Parameter(ParameterSetName = 'RunCargoLibraryTests')]
  [ValidateRange(60, 14400)]
  [int]$CargoTestTimeoutSeconds = 3600,
  [Parameter(ParameterSetName = 'ValidateOnly')]
  [switch]$PreserveArtifacts,
  [int[]]$ProtectedPid = @(),
  [ValidateRange(0, 65535)]
  [int]$ProtectedListenerPort = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RuntimeProfile = 'monochrome-visual-test'
$TestCapability = 'monochrome-test'
$EvidenceSchemaVersion = 'vibespace.monochrome.native-evidence.v1'
$DeniedEffectManifestHash = '24d75985399db9fb179ac64a10b982801fcb7681bf3f13a5a62d2340fa04850c'
$DeniedEffectIds = @(
  'notification',
  'processRelaunch',
  'updater',
  'shellOpen',
  'externalHttp',
  'keychain',
  'registry',
  'launcher',
  'tray',
  'singleInstance',
  'globalShortcut',
  'deepLink',
  'autostart'
)
$FixtureRouteAndQuery = (
  '/chat?' +
  'monochrome-fixture=chat&' +
  'monochrome-fixture-hash=fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9&' +
  'monochrome-surface=route:chat&' +
  'monochrome-theme=monochrome&' +
  'monochrome-origami-gate=false'
)
$ProductionCapabilities = @('default', 'pet-mini-panel', 'pet-overlay', 'workbench-window')
$AllowedTestPermissions = @(
  'core:default',
  'core:event:default',
  'core:window:default',
  'core:webview:default',
  'core:app:default',
  'core:path:default',
  'os:default',
  'dialog:allow-open'
)
$ForbiddenPermissionTokens = @(
  'notification',
  'process',
  'updater',
  'shell',
  'http',
  'global-shortcut',
  'deep-link',
  'autostart',
  'create-webview-window'
)
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-Sha256 {
  param([AllowEmptyString()][string]$Value)

  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return (
      ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '')
    ).ToLowerInvariant()
  }
  finally {
    $algorithm.Dispose()
  }
}

function Get-BytesSha256 {
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Value)

  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (
      ([System.BitConverter]::ToString($algorithm.ComputeHash($Value))).Replace('-', '')
    ).ToLowerInvariant()
  }
  finally {
    $algorithm.Dispose()
  }
}

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (
      ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '')
    ).ToLowerInvariant()
  }
  finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Get-CargoLibraryTestInputSnapshot {
  param([Parameter(Mandatory = $true)][string]$InputRoot)

  $root = [System.IO.Path]::GetFullPath($InputRoot).TrimEnd('\', '/')
  $rootItem = Get-Item -LiteralPath $root -Force -ErrorAction Stop
  if (
    -not $rootItem.PSIsContainer -or
    ($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    throw 'Cargo library-test input root must be an ordinary directory.'
  }

  $directories = New-Object 'System.Collections.Generic.Queue[string]'
  $directories.Enqueue($root)
  $files = New-Object System.Collections.ArrayList
  while ($directories.Count -gt 0) {
    $directory = $directories.Dequeue()
    foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)) {
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Cargo library-test input contains a reparse point: $($item.FullName)"
      }
      $relativePath = $item.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
      if ($item.PSIsContainer) {
        if ($directory -ceq $root -and $item.Name -ceq 'target') {
          continue
        }
        $directories.Enqueue($item.FullName)
        continue
      }
      if (-not ($item -is [System.IO.FileInfo])) {
        throw "Cargo library-test input is not a regular file: $($item.FullName)"
      }
      [void]$files.Add([ordered]@{
          relativePath = $relativePath
          sizeBytes = [int64]$item.Length
          sha256 = Get-FileSha256 -Path $item.FullName
        })
    }
  }

  $orderedFiles = [object[]]@($files)
  $ordinalFileComparer = [System.Collections.Generic.Comparer[object]]::Create(
    [System.Comparison[object]]{
      param($left, $right)
      [StringComparer]::Ordinal.Compare(
        [string]$left.relativePath,
        [string]$right.relativePath
      )
    }
  )
  [Array]::Sort($orderedFiles, $ordinalFileComparer)
  $canonicalLines = [object[]]@(
    $orderedFiles | ForEach-Object {
      "{0}`n{1}`n{2}" -f $_.relativePath, $_.sizeBytes, $_.sha256
    }
  )
  $digestGroup = {
    param([object[]]$Group)
    Get-Sha256 -Value (
      (@($Group) | ForEach-Object {
          "{0}`n{1}`n{2}" -f $_.relativePath, $_.sizeBytes, $_.sha256
        }) -join "`n"
    )
  }
  $rustSources = [object[]]@(
    $orderedFiles | Where-Object { [string]$_.relativePath -match '\.rs$' }
  )
  $buildInputs = [object[]]@(
    $orderedFiles | Where-Object {
      [string]$_.relativePath -cin @('Cargo.toml', 'Cargo.lock', 'build.rs')
    }
  )
  $configInputs = [object[]]@(
    $orderedFiles | Where-Object {
      [string]$_.relativePath -match '(?:^|/)(?:Cargo\.toml|Cargo\.lock|[^/]+\.(?:json|toml))$'
    }
  )
  $cargoToml = @($orderedFiles | Where-Object { $_.relativePath -ceq 'Cargo.toml' })
  $cargoLock = @($orderedFiles | Where-Object { $_.relativePath -ceq 'Cargo.lock' })
  if ($cargoToml.Count -ne 1 -or $cargoLock.Count -ne 1) {
    throw 'Cargo library-test inputs require exact Cargo.toml and Cargo.lock files.'
  }

  return [ordered]@{
    files = $orderedFiles
    fileCount = $orderedFiles.Count
    inventoryDigest = Get-Sha256 -Value ($canonicalLines -join "`n")
    cargoTomlSha256 = [string]$cargoToml[0].sha256
    cargoLockSha256 = [string]$cargoLock[0].sha256
    rustSourceDigest = & $digestGroup $rustSources
    buildInputDigest = & $digestGroup $buildInputs
    configInputDigest = & $digestGroup $configInputs
  }
}

function Assert-CargoLibraryTestInputSnapshotStable {
  param(
    [Parameter(Mandatory = $true)][object]$Before,
    [Parameter(Mandatory = $true)][object]$After
  )

  if (
    [int]$Before.fileCount -ne [int]$After.fileCount -or
    [string]$Before.inventoryDigest -cne [string]$After.inventoryDigest -or
    (($Before.files | ConvertTo-Json -Depth 8 -Compress) -cne
      ($After.files | ConvertTo-Json -Depth 8 -Compress))
  ) {
    throw 'CARGO_LIBRARY_TEST_INPUT_DRIFT'
  }
}

function Get-CargoLibraryTestResult {
  param(
    [Parameter(Mandatory = $true)][int]$ExitCode,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$StandardOutput,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$StandardError
  )

  $combined = "$StandardOutput`n$StandardError"
  $policyPatterns = [ordered]@{
    applicationControl = 'Application Control policy has blocked'
    windowsError4551 = 'os error 4551'
    groupPolicy = 'blocked by group policy'
    administratorPolicy = 'blocked by your administrator'
  }
  foreach ($entry in $policyPatterns.GetEnumerator()) {
    if ($combined.IndexOf([string]$entry.Value, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      throw 'BLOCKED_HOST_POLICY'
    }
  }

  if ($ExitCode -ne 0) {
    throw 'CARGO_LIBRARY_TEST_FAILED'
  }

  $summaryLines = [regex]::Matches($combined, '(?m)^test result: [^\r\n]+\r?$')
  $summaryPattern = (
    '(?m)^test result: ok\. ' +
    '(?<passed>\d+) passed; ' +
    '(?<failed>\d+) failed; ' +
    '(?<ignored>\d+) ignored; ' +
    '(?<measured>\d+) measured; ' +
    '(?<filtered>\d+) filtered out; ' +
    'finished in (?<duration>[0-9.]+)s\r?$'
  )
  $matches = [regex]::Matches($combined, $summaryPattern)
  if ($summaryLines.Count -ne 1 -or $matches.Count -ne 1) {
    throw 'CARGO_LIBRARY_TEST_RESULT_AMBIGUOUS'
  }
  if (
    $combined -match (
      '(?im)^(?:error(?:\[[^\]]+\])?:|failures:|test result: FAILED\.)|' +
      'could not compile|process didn''t exit successfully'
    )
  ) {
    throw 'CARGO_LIBRARY_TEST_FAILED'
  }
  $match = $matches[0]
  if ([int]$match.Groups['failed'].Value -ne 0) {
    throw 'CARGO_LIBRARY_TEST_FAILED'
  }
  return [ordered]@{
    status = 'PASS'
    summary = ([string]$match.Value).TrimEnd("`r")
    passed = [int]$match.Groups['passed'].Value
    failed = [int]$match.Groups['failed'].Value
    ignored = [int]$match.Groups['ignored'].Value
    measured = [int]$match.Groups['measured'].Value
    filteredOut = [int]$match.Groups['filtered'].Value
    durationSeconds = [double]::Parse(
      [string]$match.Groups['duration'].Value,
      [Globalization.CultureInfo]::InvariantCulture
    )
  }
}

function Invoke-ContainedCargoLibraryTests {
  $cargo = Get-Command cargo.exe -ErrorAction Stop
  $rustc = Get-Command rustc.exe -ErrorAction Stop
  $git = Get-Command git.exe -ErrorAction Stop
  $sessionOwner = Get-OwnedProcessIdentity -ProcessId $PID
  if ($null -eq $sessionOwner) {
    throw 'Cargo library-test runner identity is unavailable.'
  }

  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $CargoLibraryTestInputRoot
  Assert-NoReparsePathComponents `
    -TrustedRoot $NativeBuildRoot `
    -Candidate $absoluteDirectories['native/cargo-target']
  if (
    -not (
      Test-IsContainedPath `
        -Root $absoluteDirectories['native/cargo-target'] `
        -Candidate $CargoLibraryTestTargetPath
    )
  ) {
    throw 'Cargo library-test target escaped its contained build root.'
  }
  if (Test-Path -LiteralPath $CargoLibraryTestTargetPath) {
    throw 'CARGO_LIBRARY_TEST_TARGET_NOT_FRESH'
  }
  $cargoTarget = Ensure-ContainedDirectory `
    -Root $absoluteDirectories['native/cargo-target'] `
    -RelativePath 'cargo-library-tests'

  $logsRoot = Ensure-ContainedDirectory -Root $SessionRoot -RelativePath 'logs'
  $cargoLogsPath = Join-Path $logsRoot 'cargo-library-tests'
  if (Test-Path -LiteralPath $cargoLogsPath) {
    throw 'CARGO_LIBRARY_TEST_LOGS_NOT_FRESH'
  }
  $cargoLogsPath = Ensure-ContainedDirectory `
    -Root $logsRoot `
    -RelativePath 'cargo-library-tests'
  $cargoStandardOutputPath = Join-Path $cargoLogsPath 'stdout.log'
  $cargoStandardErrorPath = Join-Path $cargoLogsPath 'stderr.log'
  foreach ($logPath in @($cargoStandardOutputPath, $cargoStandardErrorPath)) {
    if (Test-Path -LiteralPath $logPath) {
      throw 'CARGO_LIBRARY_TEST_LOGS_NOT_FRESH'
    }
  }

  $inputBefore = Get-CargoLibraryTestInputSnapshot -InputRoot $CargoLibraryTestInputRoot
  $branch = [string](& $git.Source -C $RepoRoot branch --show-current)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
    throw 'CARGO_LIBRARY_TEST_GIT_BRANCH_UNAVAILABLE'
  }
  $head = [string](& $git.Source -C $RepoRoot rev-parse HEAD)
  if ($LASTEXITCODE -ne 0 -or $head -cne $Commit) {
    throw 'CARGO_LIBRARY_TEST_HEAD_MISMATCH'
  }
  $dirtyInputInventory = [object[]]@(
    & $git.Source `
      -C $RepoRoot `
      status `
      --porcelain=v1 `
      --untracked-files=all `
      -- `
      $CargoLibraryTestInputRelativePath
  )
  if ($LASTEXITCODE -ne 0) {
    throw 'CARGO_LIBRARY_TEST_DIRTY_INVENTORY_UNAVAILABLE'
  }
  $dirtyInputDigest = Get-Sha256 -Value ($dirtyInputInventory -join "`n")

  $cargoVersion = [string](& $cargo.Source --version)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($cargoVersion)) {
    throw 'CARGO_LIBRARY_TEST_CARGO_VERSION_UNAVAILABLE'
  }
  $rustcVersion = [string](& $rustc.Source --version)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rustcVersion)) {
    throw 'CARGO_LIBRARY_TEST_RUSTC_VERSION_UNAVAILABLE'
  }

  $launchEnvironment = [ordered]@{
    CARGO_TARGET_DIR = $cargoTarget
    CARGO_BUILD_JOBS = '1'
    RUST_TEST_THREADS = '1'
  }
  $savedEnvironment = @{}
  foreach ($entry in $launchEnvironment.GetEnumerator()) {
    $savedEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable(
      $entry.Key,
      [EnvironmentVariableTarget]::Process
    )
    [Environment]::SetEnvironmentVariable(
      $entry.Key,
      [string]$entry.Value,
      [EnvironmentVariableTarget]::Process
    )
  }

  $process = $null
  $rootIdentity = $null
  $retainedDescendants = @()
  $cleanup = [ordered]@{
    lane = 'cargo-library-tests'
    provenDescendants = [object[]]@()
    stoppedPids = [object[]]@()
    errors = [object[]]@()
  }
  $startedAtUtc = [datetime]::UtcNow
  $completedAtUtc = $null
  $exitCode = $null
  $primaryFailure = $null
  $protectedPids = @($protectedBefore.processes | ForEach-Object { [int]$_.pid })

  $report.outcomes.cargoLibraryTests = [ordered]@{
    status = 'RUNNING'
    evidence = [ordered]@{
      branch = $branch
      head = $head
      dirtyInputInventory = $dirtyInputInventory
      dirtyInputDigest = $dirtyInputDigest
      inputInventory = [object[]]$inputBefore.files
      inputInventoryDigest = [string]$inputBefore.inventoryDigest
      command = [ordered]@{
        executable = [string]$cargo.Source
        arguments = [object[]]$cargoLibraryTestArguments
        workingDirectory = $RepoRoot
      }
      environmentPolicy = $launchEnvironment
      targetIdentity = [ordered]@{
        relativePath = $CargoLibraryTestTargetRelativePath
        absolutePathHash = Get-Sha256 -Value $cargoTarget
        wasFresh = $true
      }
      cargoVersion = $cargoVersion.Trim()
      rustcVersion = $rustcVersion.Trim()
      startedAtUtc = $startedAtUtc.ToString('o')
      artifactDisposition = 'PRESERVED_FOR_EVIDENCE'
    }
  }
  Write-JsonFile -Path $manifestPath -Value $report

  try {
    $process = Start-Process `
      -FilePath $cargo.Source `
      -ArgumentList $cargoLibraryTestArguments `
      -WorkingDirectory $RepoRoot `
      -RedirectStandardOutput $cargoStandardOutputPath `
      -RedirectStandardError $cargoStandardErrorPath `
      -PassThru `
      -WindowStyle Hidden
    $rootIdentity = Resolve-EvidenceProducerIdentity -RecordedIdentity ([ordered]@{
        pid = [int]$process.Id
        parentPid = [int]$PID
        creationTime = $process.StartTime.ToUniversalTime().ToString('o')
        executable = [string]$cargo.Source
        commandLine = ''
      })
    Assert-OwnedProcessAncestry `
      -Snapshot ([ordered]@{
        sessionOwner = $sessionOwner
        root = $rootIdentity
        descendants = [object[]]@()
      }) `
      -SessionStartedAtUtc $SessionStartedAtUtc

    $deadline = $startedAtUtc.AddSeconds($CargoTestTimeoutSeconds)
    $snapshotAt = [datetime]::MinValue
    while (-not $process.HasExited -and [datetime]::UtcNow -lt $deadline) {
      if ([datetime]::UtcNow -ge $snapshotAt) {
        $currentDescendants = @(
          Get-OwnedDescendantIdentities -RootIdentity $rootIdentity
        )
        $retainedDescendants = @(
          Merge-OwnedProcessSnapshots `
            -Recorded $retainedDescendants `
            -Current $currentDescendants
        )
        Assert-OwnedProcessAncestry `
          -Snapshot ([ordered]@{
            sessionOwner = $sessionOwner
            root = $rootIdentity
            descendants = [object[]]$retainedDescendants
          }) `
          -SessionStartedAtUtc $SessionStartedAtUtc
        $snapshotAt = [datetime]::UtcNow.AddSeconds(1)
      }
      [Threading.Thread]::Sleep(100)
      $process.Refresh()
    }
    if (-not $process.HasExited) {
      throw 'CARGO_LIBRARY_TEST_TIMEOUT'
    }
    $process.WaitForExit()
    $exitCode = [int]$process.ExitCode
  }
  catch {
    $primaryFailure = $_
  }
  finally {
    $completedAtUtc = [datetime]::UtcNow
    foreach ($entry in $launchEnvironment.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable(
        $entry.Key,
        $savedEnvironment[$entry.Key],
        [EnvironmentVariableTarget]::Process
      )
    }
    if ($null -ne $rootIdentity) {
      $cleanup = Invoke-IdentityBoundCleanupLane `
        -Lane 'cargo-library-tests' `
        -RootIdentity $rootIdentity `
        -RetainedDescendants $retainedDescendants `
        -SessionOwner $sessionOwner `
        -SessionStartedAtUtc $SessionStartedAtUtc `
        -ProtectedPids $protectedPids
    }
  }

  $readFreshLog = {
    param([string]$Path, [string]$RelativePath)
    Assert-NoReparsePathComponents -TrustedRoot $SessionRoot -Candidate $Path
    $before = Get-Item -LiteralPath $Path -Force
    if (
      $before.PSIsContainer -or
      ($before.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw 'CARGO_LIBRARY_TEST_LOG_INVALID'
    }
    $content = Get-Content -LiteralPath $Path -Raw
    $after = Get-Item -LiteralPath $Path -Force
    if (
      $before.Length -ne $after.Length -or
      $before.LastWriteTimeUtc -ne $after.LastWriteTimeUtc
    ) {
      throw 'CARGO_LIBRARY_TEST_LOG_DRIFT'
    }
    return [ordered]@{
      relativePath = $RelativePath
      sizeBytes = [int64]$after.Length
      sha256 = Get-FileSha256 -Path $Path
      content = $content
    }
  }

  $stdout = $null
  $stderr = $null
  $inputAfter = $null
  $testResult = $null
  try {
    $stdout = & $readFreshLog `
      $cargoStandardOutputPath `
      'logs/cargo-library-tests/stdout.log'
    $stderr = & $readFreshLog `
      $cargoStandardErrorPath `
      'logs/cargo-library-tests/stderr.log'
    $inputAfter = Get-CargoLibraryTestInputSnapshot -InputRoot $CargoLibraryTestInputRoot
    Assert-CargoLibraryTestInputSnapshotStable -Before $inputBefore -After $inputAfter
    if ($null -eq $primaryFailure) {
      $testResult = Get-CargoLibraryTestResult `
        -ExitCode $exitCode `
        -StandardOutput ([string]$stdout.content) `
        -StandardError ([string]$stderr.content)
    }
  }
  catch {
    if ($null -eq $primaryFailure) {
      $primaryFailure = $_
    }
  }

  $combinedLogs = "$([string]$stdout.content)`n$([string]$stderr.content)"
  $policyBlockSignatures = [ordered]@{
    applicationControl = (
      $combinedLogs.IndexOf(
        'Application Control policy has blocked',
        [StringComparison]::OrdinalIgnoreCase
      ) -ge 0
    )
    windowsError4551 = (
      $combinedLogs.IndexOf('os error 4551', [StringComparison]::OrdinalIgnoreCase) -ge 0
    )
    groupPolicy = (
      $combinedLogs.IndexOf('blocked by group policy', [StringComparison]::OrdinalIgnoreCase) -ge 0
    )
    administratorPolicy = (
      $combinedLogs.IndexOf(
        'blocked by your administrator',
        [StringComparison]::OrdinalIgnoreCase
      ) -ge 0
    )
  }
  $logMetadata = {
    param([object]$Log)
    if ($null -eq $Log) {
      return $null
    }
    return [ordered]@{
      relativePath = [string]$Log.relativePath
      sizeBytes = [int64]$Log.sizeBytes
      sha256 = [string]$Log.sha256
    }
  }
  $cleanupEvidence = [ordered]@{
    lane = [string](
      Get-OptionalProperty `
        -InputObject $cleanup `
        -Name 'lane' `
        -Default 'cargo-library-tests'
    )
    provenDescendants = [object[]]@(
      $cleanup.provenDescendants |
        ForEach-Object { ConvertTo-OwnedProcessMetadata -Process $_ }
    )
    stoppedPids = [object[]]$cleanup.stoppedPids
    errors = [object[]]$cleanup.errors
  }
  $evidence = [ordered]@{
    branch = $branch
    head = $head
    dirtyInputInventory = $dirtyInputInventory
    dirtyInputDigest = $dirtyInputDigest
    inputInventory = [object[]]$inputBefore.files
    inputInventoryDigest = [string]$inputBefore.inventoryDigest
    cargoTomlSha256 = [string]$inputBefore.cargoTomlSha256
    cargoLockSha256 = [string]$inputBefore.cargoLockSha256
    rustSourceDigest = [string]$inputBefore.rustSourceDigest
    buildInputDigest = [string]$inputBefore.buildInputDigest
    configInputDigest = [string]$inputBefore.configInputDigest
    command = [ordered]@{
      executable = [string]$cargo.Source
      arguments = [object[]]$cargoLibraryTestArguments
      workingDirectory = $RepoRoot
    }
    environmentPolicy = $launchEnvironment
    targetIdentity = [ordered]@{
      relativePath = $CargoLibraryTestTargetRelativePath
      absolutePathHash = Get-Sha256 -Value $cargoTarget
      wasFresh = $true
    }
    cargoVersion = $cargoVersion.Trim()
    rustcVersion = $rustcVersion.Trim()
    processIdentity = if ($null -eq $rootIdentity) {
      $null
    }
    else {
      ConvertTo-OwnedProcessMetadata -Process $rootIdentity
    }
    startedAtUtc = $startedAtUtc.ToString('o')
    completedAtUtc = $completedAtUtc.ToString('o')
    exitCode = $exitCode
    stdout = & $logMetadata $stdout
    stderr = & $logMetadata $stderr
    testResult = $testResult
    policyBlockSignatures = $policyBlockSignatures
    cleanup = $cleanupEvidence
    artifactDisposition = 'PRESERVED_FOR_EVIDENCE'
  }
  if (@($cleanup.errors).Count -gt 0 -and $null -eq $primaryFailure) {
    $primaryFailure = [System.Exception]::new('CARGO_LIBRARY_TEST_CLEANUP_FAILED')
  }
  $report.outcomes.cargoLibraryTests = [ordered]@{
    status = if ($null -eq $primaryFailure) { 'PASS' } else { 'FAIL' }
    evidence = $evidence
  }
  $report['execution'] = [ordered]@{
    status = if ($null -eq $primaryFailure) {
      'CARGO_LIBRARY_TESTS_PASS'
    }
    else {
      'CARGO_LIBRARY_TESTS_FAIL'
    }
    category = if ($null -eq $primaryFailure) {
      $null
    }
    else {
      [string]$primaryFailure.Exception.Message
    }
  }
  Write-JsonFile -Path $manifestPath -Value $report
  if ($null -ne $primaryFailure) {
    throw $primaryFailure
  }
}

function New-RandomHex {
  param([ValidateRange(8, 64)][int]$ByteCount = 16)

  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Get-AbsolutePath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$BasePath = (Get-Location).Path
  )

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Test-IsContainedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )

  $normalizedRoot = (Get-AbsolutePath -Path $Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $normalizedCandidate = Get-AbsolutePath -Path $Candidate
  return $normalizedCandidate.StartsWith(
    "$normalizedRoot$([System.IO.Path]::DirectorySeparatorChar)",
    [System.StringComparison]::OrdinalIgnoreCase
  )
}

function Assert-NoReparsePathComponents {
  param(
    [Parameter(Mandatory = $true)][string]$TrustedRoot,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [switch]$AllowMissingLeaf
  )

  $trusted = (Get-AbsolutePath -Path $TrustedRoot).TrimEnd('\', '/')
  $absoluteCandidate = Get-AbsolutePath -Path $Candidate
  if (
    -not $absoluteCandidate.Equals($trusted, [System.StringComparison]::OrdinalIgnoreCase) -and
    -not (Test-IsContainedPath -Root $trusted -Candidate $absoluteCandidate)
  ) {
    throw "Path escaped its trusted root: $absoluteCandidate"
  }
  $trustedItem = Get-Item -LiteralPath $trusted -Force
  if (($trustedItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing reparse point path component: $trusted"
  }
  $relative = $absoluteCandidate.Substring($trusted.Length).TrimStart('\', '/')
  $current = $trusted
  foreach ($component in @($relative -split '[\\/]+' | Where-Object { $_ })) {
    $current = Join-Path $current $component
    if (-not (Test-Path -LiteralPath $current)) {
      if ($AllowMissingLeaf) {
        continue
      }
      throw "Required path component does not exist: $current"
    }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing reparse point path component: $current"
    }
  }
}

function Assert-OrdinaryDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Create
  )

  if (Test-Path -LiteralPath $Path) {
    Assert-NoReparsePathComponents -TrustedRoot $SessionTrustedRoot -Candidate $Path
    $item = Get-Item -LiteralPath $Path -Force
    if (-not $item.PSIsContainer) {
      throw "Contained path is not a directory: $Path"
    }
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing reparse point session or contained directory: $Path"
    }
    return
  }
  if (-not $Create) {
    throw "Required directory does not exist: $Path"
  }
  Assert-NoReparsePathComponents `
    -TrustedRoot $SessionTrustedRoot `
    -Candidate $Path `
    -AllowMissingLeaf
  [void](New-Item -ItemType Directory -Path $Path -Force)
  Assert-NoReparsePathComponents -TrustedRoot $SessionTrustedRoot -Candidate $Path
  $created = Get-Item -LiteralPath $Path -Force
  if (($created.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing reparse point session or contained directory: $Path"
  }
}

function Ensure-ContainedDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  $candidate = Get-AbsolutePath -Path (Join-Path $Root $RelativePath)
  if (-not (Test-IsContainedPath -Root $Root -Candidate $candidate)) {
    throw "Contained directory escaped the session root: $RelativePath"
  }
  Assert-OrdinaryDirectory -Path $candidate -Create
  return $candidate
}

function New-StrictLoopbackReservation {
  param([ValidateRange(0, 65535)][int]$RequestedPort)

  $listener = New-Object System.Net.Sockets.TcpListener(
    [System.Net.IPAddress]::Loopback,
    $RequestedPort
  )
  $listener.Server.ExclusiveAddressUse = $true
  try {
    $listener.Start()
    return [ordered]@{
      listener = $listener
      port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
  }
  catch [System.Net.Sockets.SocketException] {
    throw "Strict loopback port $RequestedPort is already in use; its owner was not terminated."
  }
}

function Merge-ConfigValue {
  param(
    [AllowNull()][object]$Base,
    [AllowNull()][object]$Override
  )

  if ($null -eq $Override) {
    return $null
  }
  if (
    $Override -is [System.Management.Automation.PSCustomObject] -or
    $Override -is [System.Collections.IDictionary]
  ) {
    $result = [ordered]@{}
    if ($null -ne $Base) {
      foreach ($property in $Base.PSObject.Properties) {
        $result[$property.Name] = $property.Value
      }
      if ($Base -is [System.Collections.IDictionary]) {
        foreach ($key in $Base.Keys) {
          $result[[string]$key] = $Base[$key]
        }
      }
    }
    $overrideEntries = if ($Override -is [System.Collections.IDictionary]) {
      $Override.GetEnumerator() | ForEach-Object {
        [pscustomobject]@{ Name = [string]$_.Key; Value = $_.Value }
      }
    }
    else {
      $Override.PSObject.Properties
    }
    foreach ($entry in $overrideEntries) {
      $baseValue = if ($result.Contains($entry.Name)) { $result[$entry.Name] } else { $null }
      $result[$entry.Name] = Merge-ConfigValue -Base $baseValue -Override $entry.Value
    }
    return $result
  }
  if ($Override -is [System.Collections.IEnumerable] -and $Override -isnot [string]) {
    return ,([object[]]@($Override))
  }
  return $Override
}

function New-PathMetadata {
  param([AllowEmptyString()][string]$Value)

  return [ordered]@{
    present = -not [string]::IsNullOrWhiteSpace($Value)
    type = 'path'
    sha256 = Get-Sha256 -Value ([string]$Value)
  }
}

function Get-OptionalProperty {
  param(
    [AllowNull()][object]$InputObject,
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][object]$Default = $null
  )

  if ($null -eq $InputObject) {
    return $Default
  }
  if ($InputObject -is [System.Collections.IDictionary]) {
    if ($InputObject.Contains($Name)) {
      return $InputObject[$Name]
    }
    return $Default
  }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $Default
  }
  return $property.Value
}

function ConvertTo-ProtectedMetadata {
  param([AllowNull()][object]$Snapshot)

  $processMetadata = @()
  foreach ($process in @(Get-OptionalProperty -InputObject $Snapshot -Name 'processes' -Default @())) {
    $pidValue = [int](Get-OptionalProperty -InputObject $process -Name 'pid' -Default 0)
    $name = [string](Get-OptionalProperty -InputObject $process -Name 'name' -Default '')
    $creationTime = [string](
      Get-OptionalProperty -InputObject $process -Name 'creationTime' -Default ''
    )
    $executable = [string](Get-OptionalProperty -InputObject $process -Name 'executable' -Default '')
    $commandLine = [string](
      Get-OptionalProperty -InputObject $process -Name 'commandLine' -Default ''
    )
    $processMetadata += [ordered]@{
      pid = $pidValue
      nameHash = Get-Sha256 -Value $name
      creationTimeHash = Get-Sha256 -Value $creationTime
      executableHash = Get-Sha256 -Value $executable
      commandHash = Get-Sha256 -Value $commandLine
      fieldCount = 5
    }
  }

  $listener = Get-OptionalProperty -InputObject $Snapshot -Name 'listener'
  $launcher = Get-OptionalProperty -InputObject $Snapshot -Name 'launcher'
  $launcherPath = [string](Get-OptionalProperty -InputObject $launcher -Name 'path' -Default '')
  $launcherContent = [string](
    Get-OptionalProperty -InputObject $launcher -Name 'content' -Default ''
  )
  $registryMetadata = @()
  foreach (
    $registryValue in @(
      Get-OptionalProperty -InputObject $Snapshot -Name 'registryValues' -Default @()
    )
  ) {
    $keyPath = [string](
      Get-OptionalProperty -InputObject $registryValue -Name 'keyPath' -Default ''
    )
    $valueName = [string](
      Get-OptionalProperty -InputObject $registryValue -Name 'valueName' -Default ''
    )
    $value = [string](Get-OptionalProperty -InputObject $registryValue -Name 'value' -Default '')
    $registryMetadata += [ordered]@{
      keyPathHash = Get-Sha256 -Value $keyPath
      valueNameHash = Get-Sha256 -Value $valueName
      exists = [bool](
        Get-OptionalProperty -InputObject $registryValue -Name 'exists' -Default $false
      )
      type = Get-OptionalProperty -InputObject $registryValue -Name 'type'
      valueHash = Get-Sha256 -Value $value
    }
  }
  $credential = Get-OptionalProperty -InputObject $Snapshot -Name 'credential'
  $keychainNamespace = [string](
    Get-OptionalProperty -InputObject $credential -Name 'namespace' -Default ''
  )

  return [ordered]@{
    processCount = $processMetadata.Count
    processes = [object[]]$processMetadata
    listener = [ordered]@{
      present = $null -ne $listener
      pid = if ($null -eq $listener) {
        $null
      }
      else {
        [int](Get-OptionalProperty -InputObject $listener -Name 'pid' -Default 0)
      }
      port = if ($null -eq $listener) {
        $null
      }
      else {
        [int](Get-OptionalProperty -InputObject $listener -Name 'port' -Default 0)
      }
      hostHash = if ($null -eq $listener) {
        $null
      }
      else {
        Get-Sha256 -Value (
          [string](Get-OptionalProperty -InputObject $listener -Name 'host' -Default '')
        )
      }
    }
    launcher = [ordered]@{
      exists = [bool](Get-OptionalProperty -InputObject $launcher -Name 'exists' -Default $false)
      pathHash = Get-Sha256 -Value $launcherPath
      type = Get-OptionalProperty -InputObject $launcher -Name 'type'
      contentHash = Get-Sha256 -Value $launcherContent
    }
    registryValues = [object[]]$registryMetadata
    credential = [ordered]@{
      present = -not [string]::IsNullOrWhiteSpace($keychainNamespace)
      namespaceHash = Get-Sha256 -Value $keychainNamespace
      targetCount = [int](
        Get-OptionalProperty -InputObject $credential -Name 'targetCount' -Default 0
      )
    }
  }
}

function Get-CurrentProtectedSnapshot {
  $processes = @()
  foreach ($processId in @($ProtectedPid | Sort-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if ($null -eq $process) {
      throw "Protected PID $processId is unavailable; refusing to infer its identity."
    }
    $creationTime = if ($process.CreationDate -is [datetime]) {
      $process.CreationDate.ToUniversalTime().ToString('o')
    }
    else {
      [string]$process.CreationDate
    }
    $processes += [ordered]@{
      pid = [int]$process.ProcessId
      name = [string]$process.Name
      creationTime = $creationTime
      executable = [string]$process.ExecutablePath
      commandLine = [string]$process.CommandLine
    }
  }

  $listener = $null
  if ($ProtectedListenerPort -gt 0) {
    $connections = @(
      Get-NetTCPConnection `
        -State Listen `
        -LocalPort $ProtectedListenerPort `
        -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::', '::1') }
    )
    if ($connections.Count -ne 1) {
      throw (
        "Protected listener port $ProtectedListenerPort must have exactly one owner; " +
        "found $($connections.Count)."
      )
    }
    $listener = [ordered]@{
      pid = [int]$connections[0].OwningProcess
      port = [int]$connections[0].LocalPort
      host = [string]$connections[0].LocalAddress
    }
    if ($ProtectedPid.Count -gt 0 -and $ProtectedPid -notcontains $listener.pid) {
      throw (
        "Protected listener owner $($listener.pid) is outside the declared protected PID set."
      )
    }
  }

  $launcherPath = if ([string]::IsNullOrWhiteSpace([string]$env:APPDATA)) {
    ''
  }
  else {
    Join-Path ([string]$env:APPDATA) 'Microsoft\Windows\Start Menu\Programs\VibeSpace.lnk'
  }
  $launcherExists = -not [string]::IsNullOrWhiteSpace($launcherPath) -and (
    Test-Path -LiteralPath $launcherPath
  )
  $launcherType = $null
  $launcherContent = ''
  if ($launcherExists) {
    $launcherItem = Get-Item -LiteralPath $launcherPath -Force
    $launcherType = if ($launcherItem.PSIsContainer) {
      'directory'
    }
    elseif (($launcherItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      'reparse-point'
    }
    else {
      'regular-file'
    }
    if ($launcherType -ceq 'regular-file') {
      $launcherContent = [Convert]::ToBase64String(
        [System.IO.File]::ReadAllBytes($launcherPath)
      )
    }
  }

  $registryValues = @()
  foreach ($target in @(
      [ordered]@{ keyPath = 'HKCU:\Environment'; valueName = 'Path' },
      [ordered]@{
        keyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
        valueName = 'VibeSpace'
      }
    )) {
    $exists = $false
    $type = $null
    $value = $null
    if (Test-Path -LiteralPath $target.keyPath) {
      $key = Get-Item -LiteralPath $target.keyPath
      $property = Get-ItemProperty `
        -LiteralPath $target.keyPath `
        -Name $target.valueName `
        -ErrorAction SilentlyContinue
      if ($null -ne $property) {
        $exists = $true
        $value = $property.($target.valueName)
        $type = [string]$key.GetValueKind($target.valueName)
      }
    }
    $registryValues += [ordered]@{
      keyPath = [string]$target.keyPath
      valueName = [string]$target.valueName
      exists = $exists
      type = $type
      value = $value
    }
  }

  $credentialNamespace = 'ai.jarvis.desktop'
  $credentialTargets = @(
    & "$env:SystemRoot\System32\cmdkey.exe" /list 2>$null |
    Where-Object { $_ -match '^\s*Target:' -and $_ -match [regex]::Escape($credentialNamespace) }
  )

  return [ordered]@{
    processes = [object[]]$processes
    listener = $listener
    launcher = [ordered]@{
      path = $launcherPath
      exists = $launcherExists
      type = $launcherType
      content = $launcherContent
    }
    registryValues = [object[]]$registryValues
    credential = [ordered]@{
      namespace = $credentialNamespace
      targetCount = $credentialTargets.Count
    }
  }
}

function Read-ProtectedStatePair {
  param([string]$FixturePath)

  if ([string]::IsNullOrWhiteSpace($FixturePath)) {
    return [ordered]@{
      before = Get-CurrentProtectedSnapshot
      after = $null
    }
  }
  $absoluteFixture = Get-AbsolutePath -Path $FixturePath
  if (-not (Test-Path -LiteralPath $absoluteFixture -PathType Leaf)) {
    throw "Protected-state fixture is missing: $absoluteFixture"
  }
  $parsed = Get-Content -LiteralPath $absoluteFixture -Raw | ConvertFrom-Json
  if ($null -eq $parsed.before -or $null -eq $parsed.after) {
    throw 'Protected-state fixture must provide before and after snapshots.'
  }
  return [ordered]@{
    before = $parsed.before
    after = $parsed.after
  }
}

function Get-ProtectedAfterSnapshot {
  if ([string]::IsNullOrWhiteSpace($ProtectedStateFixture)) {
    return Get-CurrentProtectedSnapshot
  }
  return $protectedPair.after
}

function ConvertTo-OwnedProcessMetadata {
  param([Parameter(Mandatory = $true)][object]$Process)

  $executable = [string](
    Get-OptionalProperty -InputObject $Process -Name 'executable' -Default ''
  )
  $commandLine = [string](
    Get-OptionalProperty -InputObject $Process -Name 'commandLine' -Default ''
  )
  return [ordered]@{
    pid = [int](Get-OptionalProperty -InputObject $Process -Name 'pid' -Default 0)
    parentPid = [int](Get-OptionalProperty -InputObject $Process -Name 'parentPid' -Default 0)
    creationTimeUtc = [string](
      Get-OptionalProperty -InputObject $Process -Name 'creationTime' -Default ''
    )
    creationTimeHash = Get-Sha256 -Value (
      [string](Get-OptionalProperty -InputObject $Process -Name 'creationTime' -Default '')
    )
    executableHash = if (
      -not [string]::IsNullOrWhiteSpace($executable) -and
      (Test-Path -LiteralPath $executable -PathType Leaf)
    ) {
      Get-FileSha256 -Path $executable
    }
    else {
      Get-Sha256 -Value $executable
    }
    commandHash = Get-BytesSha256 -Value (
      [System.Text.Encoding]::Unicode.GetBytes($commandLine)
    )
  }
}

function ConvertTo-OwnedProcessSet {
  param([Parameter(Mandatory = $true)][object]$Snapshot)

  $root = Get-OptionalProperty -InputObject $Snapshot -Name 'root'
  $descendants = @(
    Get-OptionalProperty -InputObject $Snapshot -Name 'descendants' -Default @()
  )
  return [ordered]@{
    sessionOwner = if ($null -eq (
        Get-OptionalProperty -InputObject $Snapshot -Name 'sessionOwner'
      )) {
      $null
    }
    else {
      ConvertTo-OwnedProcessMetadata -Process (
        Get-OptionalProperty -InputObject $Snapshot -Name 'sessionOwner'
      )
    }
    root = if ($null -eq $root) {
      $null
    }
    else {
      ConvertTo-OwnedProcessMetadata -Process $root
    }
    descendants = [object[]]@(
      $descendants | ForEach-Object { ConvertTo-OwnedProcessMetadata -Process $_ }
    )
  }
}

function Assert-OwnedProcessAncestry {
  param(
    [Parameter(Mandatory = $true)][object]$Snapshot,
    [Parameter(Mandatory = $true)][datetime]$SessionStartedAtUtc
  )

  $owner = Get-OptionalProperty -InputObject $Snapshot -Name 'sessionOwner'
  $root = Get-OptionalProperty -InputObject $Snapshot -Name 'root'
  if ($null -eq $owner -or $null -eq $root) {
    throw 'Owned process ancestry requires sessionOwner and root identities.'
  }
  $identities = @($owner, $root) + @(
    Get-OptionalProperty -InputObject $Snapshot -Name 'descendants' -Default @()
  )
  $byPid = @{}
  foreach ($identity in $identities) {
    $pidValue = [int](Get-OptionalProperty -InputObject $identity -Name 'pid' -Default 0)
    if ($pidValue -le 0 -or $byPid.ContainsKey($pidValue)) {
      throw 'Owned process ancestry contains an ambiguous or duplicate PID.'
    }
    $byPid[$pidValue] = $identity
    $created = [datetime]::Parse(
      [string](Get-OptionalProperty -InputObject $identity -Name 'creationTime' -Default ''),
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AdjustToUniversal
    )
    if (
      $pidValue -ne [int](Get-OptionalProperty -InputObject $owner -Name 'pid' -Default 0) -and
      $created.ToUniversalTime() -lt $SessionStartedAtUtc.ToUniversalTime()
    ) {
      throw 'Owned process ancestry violates session creation order.'
    }
  }
  if (
    [int](Get-OptionalProperty -InputObject $root -Name 'parentPid' -Default 0) -ne
    [int](Get-OptionalProperty -InputObject $owner -Name 'pid' -Default 0)
  ) {
    throw 'Owned process root parent chain is ambiguous.'
  }
  foreach (
    $child in @(
      @($root) +
      @(Get-OptionalProperty -InputObject $Snapshot -Name 'descendants' -Default @())
    )
  ) {
    $parentPid = [int](Get-OptionalProperty -InputObject $child -Name 'parentPid' -Default 0)
    if (-not $byPid.ContainsKey($parentPid)) {
      throw 'Owned process parent chain is incomplete or ambiguous.'
    }
    $childCreated = [datetime]::Parse(
      [string](Get-OptionalProperty -InputObject $child -Name 'creationTime' -Default '')
    ).ToUniversalTime()
    $parentCreated = [datetime]::Parse(
      [string](Get-OptionalProperty -InputObject $byPid[$parentPid] -Name 'creationTime' -Default '')
    ).ToUniversalTime()
    if ($childCreated -lt $parentCreated) {
      throw 'Owned process ancestry violates parent creation order.'
    }
  }
}

function Read-OwnedProcessFixture {
  param([string]$FixturePath)

  if ([string]::IsNullOrWhiteSpace($FixturePath)) {
    return $null
  }
  $absoluteFixture = Get-AbsolutePath -Path $FixturePath
  if (-not (Test-Path -LiteralPath $absoluteFixture -PathType Leaf)) {
    throw "Owned-process fixture is missing: $absoluteFixture"
  }
  $parsed = Get-Content -LiteralPath $absoluteFixture -Raw | ConvertFrom-Json
  if ($null -eq $parsed.before -or $null -eq $parsed.after) {
    throw 'Owned-process fixture must provide before and after snapshots.'
  }
  return $parsed
}

function Move-StaleEvidenceToAttemptArchive {
  param(
    [Parameter(Mandatory = $true)][string]$SessionRoot,
    [Parameter(Mandatory = $true)][datetime]$StartedAtUtc,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string]$NonceHash
  )

  $evidencePath = Get-AbsolutePath -Path (
    Join-Path $SessionRoot 'evidence\native-evidence.json'
  )
  if (-not (Test-Path -LiteralPath $evidencePath)) {
    return $null
  }
  Assert-NoReparsePathComponents -TrustedRoot $SessionRoot -Candidate $evidencePath
  $evidenceItem = Get-Item -LiteralPath $evidencePath -Force
  if (
    $evidenceItem.PSIsContainer -or
    ($evidenceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    throw 'Stale native evidence must be a regular non-reparse file.'
  }

  $archiveRoot = Ensure-ContainedDirectory `
    -Root $SessionRoot `
    -RelativePath 'logs\evidence-attempts'
  $evidenceHash = Get-FileSha256 -Path $evidencePath
  $archiveName = '{0}-{1}-{2}.json' -f (
    $StartedAtUtc.ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
  ), $NonceHash.Substring(0, 12), $evidenceHash.Substring(0, 16)
  $archivePath = Get-AbsolutePath -Path (Join-Path $archiveRoot $archiveName)
  Assert-NoReparsePathComponents `
    -TrustedRoot $SessionRoot `
    -Candidate $archivePath `
    -AllowMissingLeaf
  if (Test-Path -LiteralPath $archivePath) {
    throw 'Stale native evidence archive destination already exists.'
  }

  Move-Item -LiteralPath $evidencePath -Destination $archivePath
  Assert-NoReparsePathComponents -TrustedRoot $SessionRoot -Candidate $archivePath
  if (Test-Path -LiteralPath $evidencePath) {
    throw 'Stale native evidence remained at the one-shot producer path.'
  }
  return "logs/evidence-attempts/$archiveName"
}

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Value
  )

  Assert-NoReparsePathComponents `
    -TrustedRoot $SessionTrustedRoot `
    -Candidate $Path `
    -AllowMissingLeaf
  $json = $Value | ConvertTo-Json -Depth 32
  [System.IO.File]::WriteAllText($Path, "$json`n", $Utf8NoBom)
  Assert-NoReparsePathComponents -TrustedRoot $SessionTrustedRoot -Candidate $Path
}

function Test-StringArraysEqual {
  param(
    [Parameter(Mandatory = $true)][object[]]$Left,
    [Parameter(Mandatory = $true)][object[]]$Right
  )

  return (($Left | ForEach-Object { [string]$_ } | Sort-Object) -join "`n") -ceq (
    ($Right | ForEach-Object { [string]$_ } | Sort-Object) -join "`n"
  )
}

function Assert-ExactObjectFields {
  param(
    [AllowNull()][object]$Value,
    [Parameter(Mandatory = $true)][string[]]$Fields,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ($null -eq $Value) {
    throw "Evidence is missing $Label."
  }
  $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  if (-not (Test-StringArraysEqual -Left $actual -Right $Fields)) {
    throw "Evidence $Label fields are incomplete or unexpected."
  }
}

function Assert-ExactHandshake {
  param(
    [Parameter(Mandatory = $true)][object]$Handshake,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $fields = @('profile', 'appIdentifier', 'capabilityIdentifier', 'sessionNonceHash')
  Assert-ExactObjectFields -Value $Handshake -Fields $fields -Label $Label
  if (
    [string]$Handshake.profile -cne $RuntimeProfile -or
    [string]$Handshake.appIdentifier -cne $Identifier -or
    [string]$Handshake.capabilityIdentifier -cne $TestCapability -or
    [string]$Handshake.sessionNonceHash -cne $NonceHash
  ) {
    throw "Evidence $Label does not match the exact session handshake."
  }
}

function Get-ArtifactDisposition {
  param(
    [Parameter(Mandatory = $true)][string]$ParameterSetName,
    [Parameter(Mandatory = $true)][bool]$PreserveArtifacts
  )

  if ($ParameterSetName -ceq 'ValidateOnly') {
    if ($PreserveArtifacts) {
      return 'PRESERVED_EXPLICITLY'
    }
    return 'SELF_CLEANED'
  }
  if (
    $ParameterSetName -cin @(
      'BuildReleaseExecutable',
      'BuildUnsignedNsisArtifact',
      'RunContainedDevSession',
      'RunCargoLibraryTests'
    )
  ) {
    return 'PRESERVED_FOR_EVIDENCE'
  }
  throw "Unexpected parameter set for artifact disposition: $ParameterSetName"
}

function Set-ReportDeniedEffectsFromEvidence {
  param(
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Report,
    [Parameter(Mandatory = $true)][object]$Evidence
  )

  $copiedCounters = [ordered]@{}
  foreach ($effectId in $DeniedEffectIds) {
    $copiedCounters[$effectId] = [long]$Evidence.deniedEffects.counters.$effectId
  }
  $Report.deniedEffects.status = [string]$Evidence.deniedEffects.status
  $Report.deniedEffects.counters = $copiedCounters
}

function Assert-AndSanitizeEvidence {
  param([Parameter(Mandatory = $true)][object]$Evidence)

  Assert-ExactObjectFields `
    -Value $Evidence `
    -Fields @(
      'schemaVersion',
      'authenticationHash',
      'sessionNonceHash',
      'producer',
      'nativeHandshake',
      'frontendHandshake',
      'readiness',
      'deniedEffects',
      'errors'
    ) `
    -Label 'root'
  if ([string]$Evidence.schemaVersion -cne $EvidenceSchemaVersion) {
    throw 'Evidence schema version is not supported.'
  }
  if (
    [string]$Evidence.authenticationHash -cne $EvidenceAuthenticationHash -or
    [string]$Evidence.sessionNonceHash -cne $NonceHash
  ) {
    throw 'Evidence authentication or session nonce binding failed.'
  }
  Assert-ExactHandshake -Handshake $Evidence.nativeHandshake -Label 'nativeHandshake'
  Assert-ExactHandshake -Handshake $Evidence.frontendHandshake -Label 'frontendHandshake'

  Assert-ExactObjectFields `
    -Value $Evidence.producer `
    -Fields @(
      'pid',
      'creationTimeUtc',
      'creationTimeHash',
      'executableHash',
      'commandHash'
    ) `
    -Label 'producer'
  $producerCreated = [string]$Evidence.producer.creationTimeUtc
  if (
    [int]$Evidence.producer.pid -le 0 -or
    [string]$Evidence.producer.creationTimeHash -cne (Get-Sha256 -Value $producerCreated) -or
    [string]$Evidence.producer.executableHash -notmatch '^[0-9a-f]{64}$' -or
    [string]$Evidence.producer.commandHash -notmatch '^[0-9a-f]{64}$'
  ) {
    throw 'Evidence producer identity is invalid.'
  }

  $readinessFields = @(
    'status',
    'application',
    'fixtureSmoke',
    'surface',
    'theme',
    'font',
    'fallback'
  )
  Assert-ExactObjectFields -Value $Evidence.readiness -Fields $readinessFields -Label 'readiness'
  if (
    [string]$Evidence.readiness.status -cne 'PASS' -or
    [string]$Evidence.readiness.application -cne 'READY' -or
    [string]$Evidence.readiness.fixtureSmoke -cne 'PASS' -or
    [string]$Evidence.readiness.surface -cne 'route:chat' -or
    [string]$Evidence.readiness.theme -cne 'monochrome' -or
    [string]$Evidence.readiness.font -cne 'READY' -or
    [string]$Evidence.readiness.fallback -cne 'NOT_USED'
  ) {
    throw 'Evidence readiness or synthetic fixture smoke is not PASS.'
  }

  Assert-ExactObjectFields `
    -Value $Evidence.deniedEffects `
    -Fields @('status', 'manifestHash', 'counters') `
    -Label 'deniedEffects'
  if (
    [string]$Evidence.deniedEffects.status -cne 'PASS' -or
    [string]$Evidence.deniedEffects.manifestHash -cne $DeniedEffectManifestHash
  ) {
    throw 'Evidence denied-effect manifest is invalid.'
  }
  Assert-ExactObjectFields `
    -Value $Evidence.deniedEffects.counters `
    -Fields $DeniedEffectIds `
    -Label 'deniedEffects.counters'
  $actualCounterOrder = @($Evidence.deniedEffects.counters.PSObject.Properties.Name)
  if (($actualCounterOrder -join "`n") -cne ($DeniedEffectIds -join "`n")) {
    throw 'Evidence denied-effect counters are not in canonical order.'
  }
  foreach ($effectId in $DeniedEffectIds) {
    $counterValue = $Evidence.deniedEffects.counters.$effectId
    if (
      $null -eq $counterValue -or
      (
        $counterValue.GetType() -ne [int] -and
        $counterValue.GetType() -ne [long]
      ) -or
      [long]$counterValue -ne 0
    ) {
      throw "Evidence denied-effect counter is not an exact integer zero: $effectId"
    }
  }
  Assert-ExactObjectFields -Value $Evidence.errors -Fields @('page', 'native') -Label 'errors'
  if (@($Evidence.errors.page).Count -ne 0 -or @($Evidence.errors.native).Count -ne 0) {
    throw 'Evidence contains page or native errors.'
  }
  return $Evidence
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Get-AbsolutePath -Path (Join-Path $PSScriptRoot '..\..')
}
else {
  $RepoRoot = Get-AbsolutePath -Path $RepoRoot
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'app\src-tauri\tauri.conf.json'))) {
  throw "RepoRoot is not the expected VibeSpace repository: $RepoRoot"
}

if ([string]::IsNullOrWhiteSpace($Commit)) {
  $Commit = (& git -C $RepoRoot rev-parse HEAD).Trim()
}
if ($Commit -notmatch '^[0-9a-fA-F]{40}$') {
  throw 'Commit must be an exact forty-character Git object ID.'
}
$Commit = $Commit.ToLowerInvariant()
$SessionStartedAtUtc = (Get-Date).ToUniversalTime()

if ([string]::IsNullOrWhiteSpace($IdentifierSuffix)) {
  $IdentifierSuffix = New-RandomHex -ByteCount 8
}
if ($IdentifierSuffix -notmatch '^[0-9a-f]{16,128}$') {
  throw 'IdentifierSuffix must contain 16-128 lowercase hexadecimal characters.'
}

if ([string]::IsNullOrWhiteSpace($Nonce)) {
  $Nonce = New-RandomHex -ByteCount 32
}
if ($Nonce -notmatch '^[0-9a-f]{16,128}$') {
  throw 'Nonce must contain 16-128 lowercase hexadecimal characters.'
}
$NonceHash = Get-Sha256 -Value $Nonce
$Identifier = "ai.vibespace.monochrome.test$IdentifierSuffix"
if ([string]::IsNullOrWhiteSpace($EvidenceToken)) {
  $EvidenceToken = New-RandomHex -ByteCount 32
}
if ($EvidenceToken -notmatch '^[0-9a-f]{32,128}$') {
  throw 'EvidenceToken must contain 32-128 lowercase hexadecimal characters.'
}
$EvidenceAuthenticationHash = Get-Sha256 -Value "$NonceHash`n$EvidenceToken"

$SessionTrustedRoot = $RepoRoot
Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $RepoRoot
$OwnedArtifactRoot = Ensure-ContainedDirectory `
  -Root $RepoRoot `
  -RelativePath '.artifacts\monochrome'
if ([string]::IsNullOrWhiteSpace($SessionRoot)) {
  $sessionId = "{0}-{1}" -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'), $IdentifierSuffix
  $SessionRoot = Join-Path $RepoRoot ".artifacts\monochrome\$sessionId\native-session"
}
$SessionRoot = Get-AbsolutePath -Path $SessionRoot
if (-not (Test-IsContainedPath -Root $OwnedArtifactRoot -Candidate $SessionRoot)) {
  throw 'SessionRoot must be under the repository-owned .artifacts\monochrome root.'
}
Assert-NoReparsePathComponents `
  -TrustedRoot $RepoRoot `
  -Candidate $SessionRoot `
  -AllowMissingLeaf
Assert-OrdinaryDirectory -Path $SessionRoot -Create

$relativeDirectories = @(
  'evidence',
  'native/profile',
  'native/profile/appdata',
  'native/profile/localappdata',
  'native/profile/userprofile',
  'native/profile/home',
  'native/profile/home-drive',
  'native/profile/home-path',
  'native/profile/webview2',
  'native/profile/temp',
  'playwright/profile',
  'vite/cache'
)
$absoluteDirectories = @{}
foreach ($relativeDirectory in $relativeDirectories) {
  $absoluteDirectories[$relativeDirectory] = Ensure-ContainedDirectory `
    -Root $SessionRoot `
    -RelativePath $relativeDirectory
}
$ArchivedStaleEvidenceRelativePath = $null
if ($PSCmdlet.ParameterSetName -cne 'ValidateOnly') {
  $ArchivedStaleEvidenceRelativePath = Move-StaleEvidenceToAttemptArchive `
    -SessionRoot $SessionRoot `
    -StartedAtUtc $SessionStartedAtUtc `
    -NonceHash $NonceHash
}
$NativeBuildRoot = Ensure-ContainedDirectory `
  -Root $RepoRoot `
  -RelativePath 'app\src-tauri\target\monochrome-sessions'
$NativeBuildKey = (Get-Sha256 -Value $SessionRoot).Substring(0, 32)
$NativeCargoTargetRelativePath = "app/src-tauri/target/monochrome-sessions/$NativeBuildKey"
$absoluteDirectories['native/cargo-target'] = Ensure-ContainedDirectory `
  -Root $NativeBuildRoot `
  -RelativePath $NativeBuildKey
$CargoLibraryTestTargetRelativePath = (
  "$NativeCargoTargetRelativePath/cargo-library-tests"
)
$CargoLibraryTestTargetPath = Get-AbsolutePath -Path (
  Join-Path $RepoRoot $CargoLibraryTestTargetRelativePath
)
$CargoLibraryTestInputRelativePath = 'app/src-' + 'tauri'
$CargoLibraryTestInputRoot = Get-AbsolutePath -Path (
  Join-Path $RepoRoot $CargoLibraryTestInputRelativePath
)

$PortReservation = $null
$SelectedPort = 0
if (-not $RunCargoLibraryTests) {
  $PortReservation = New-StrictLoopbackReservation -RequestedPort $Port
  $SelectedPort = [int]$PortReservation.port
}
$DevUrl = "http://127.0.0.1:$SelectedPort"
$Csp = (
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "img-src 'self' data:; " +
  "connect-src 'self' http://127.0.0.1:$SelectedPort ws://127.0.0.1:$SelectedPort; " +
  "media-src 'self' blob: data:; " +
  "worker-src 'self' blob:; " +
  "frame-src 'none'; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'none'; " +
  "navigate-to 'self' http://127.0.0.1:$SelectedPort;"
)

$baseConfigPath = if ([string]::IsNullOrWhiteSpace($BaseConfigFixture)) {
  Join-Path $RepoRoot 'app\src-tauri\tauri.conf.json'
}
else {
  Get-AbsolutePath -Path $BaseConfigFixture
}
$testCapabilityPath = if ([string]::IsNullOrWhiteSpace($TestCapabilityFixture)) {
  Join-Path $RepoRoot 'app\src-tauri\capabilities\monochrome-test.json'
}
else {
  Get-AbsolutePath -Path $TestCapabilityFixture
}
$baseConfig = Get-Content -LiteralPath $baseConfigPath -Raw | ConvertFrom-Json
$testCapabilityConfig = Get-Content -LiteralPath $testCapabilityPath -Raw | ConvertFrom-Json
$baseCapabilities = @($baseConfig.app.security.capabilities)
$testPermissions = @(
  $testCapabilityConfig.permissions | ForEach-Object {
    if ($_ -is [string]) {
      $_
    }
    else {
      [string]$_.identifier
    }
  }
)
$hasForbiddenPermission = $false
foreach ($permission in $testPermissions) {
  foreach ($token in $ForbiddenPermissionTokens) {
    if ($permission.Contains($token)) {
      $hasForbiddenPermission = $true
    }
  }
}
if (-not (Test-StringArraysEqual -Left $baseCapabilities -Right $ProductionCapabilities)) {
  throw 'Production capability closure does not match the frozen four identifiers.'
}
if (
  [string]$testCapabilityConfig.identifier -cne $TestCapability -or
  @($testCapabilityConfig.windows).Count -ne 1 -or
  [string]$testCapabilityConfig.windows[0] -cne $TestCapability
) {
  throw 'Test capability identity/window scope is invalid.'
}
if (
  $hasForbiddenPermission -or
  -not (Test-StringArraysEqual -Left $testPermissions -Right $AllowedTestPermissions)
) {
  throw 'Test capability permission set is not the exact least-privilege closure.'
}

$overrideConfig = [ordered]@{
  identifier = $Identifier
  build = [ordered]@{
    beforeDevCommand = $null
    devUrl = $DevUrl
  }
  app = [ordered]@{
    windows = [object[]]@(
      [ordered]@{
        label = $TestCapability
        title = 'VibeSpace MonoChrome Visual Test'
        url = "$DevUrl$FixtureRouteAndQuery"
        visible = $false
      }
    )
    security = [ordered]@{
      capabilities = [object[]]@($TestCapability)
      csp = $Csp
    }
  }
  plugins = [ordered]@{ updater = $null }
  bundle = [ordered]@{
    active = $false
    createUpdaterArtifacts = $false
  }
}

$releaseConfig = [ordered]@{
  identifier = $Identifier
  build = [ordered]@{
    beforeDevCommand = $null
  }
  app = [ordered]@{
    windows = [object[]]@(
      [ordered]@{
        label = $TestCapability
        title = 'VibeSpace MonoChrome Visual Test'
        url = $FixtureRouteAndQuery
        visible = $true
      }
    )
    security = [ordered]@{
      capabilities = [object[]]@($TestCapability)
      csp = $Csp
    }
  }
  plugins = [ordered]@{ updater = $null }
  bundle = [ordered]@{
    active = $false
    createUpdaterArtifacts = $false
  }
}

$nsisConfig = [ordered]@{
  identifier = $Identifier
  build = [ordered]@{
    beforeDevCommand = $null
  }
  app = [ordered]@{
    windows = [object[]]@(
      [ordered]@{
        label = $TestCapability
        title = 'VibeSpace MonoChrome Visual Test'
        url = $FixtureRouteAndQuery
        visible = $true
      }
    )
    security = [ordered]@{
      capabilities = [object[]]@($TestCapability)
      csp = $Csp
    }
  }
  plugins = [ordered]@{ updater = $null }
  bundle = [ordered]@{
    active = $true
    createUpdaterArtifacts = $false
    targets = [object[]]@('nsis')
  }
}

$effectiveConfigs = [ordered]@{
  dev = Merge-ConfigValue -Base $baseConfig -Override $overrideConfig
  release = Merge-ConfigValue -Base $baseConfig -Override $releaseConfig
  nsis = Merge-ConfigValue -Base $baseConfig -Override $nsisConfig
}
foreach ($effectiveEntry in $effectiveConfigs.GetEnumerator()) {
  $effective = $effectiveEntry.Value
  $effectiveWindows = @($effective['app']['windows'])
  $effectiveCapabilities = @($effective['app']['security']['capabilities'])
  if (
    $effectiveWindows.Count -ne 1 -or
    [string]$effectiveWindows[0]['label'] -cne $TestCapability -or
    $effectiveCapabilities.Count -ne 1 -or
    [string]$effectiveCapabilities[0] -cne $TestCapability -or
    $null -ne $effective['plugins']['updater'] -or
    [bool]$effective['bundle']['createUpdaterArtifacts']
  ) {
    throw "Effective $($effectiveEntry.Name) Tauri config violates the isolated test boundary."
  }
}
if (
  [bool]$effectiveConfigs.dev['bundle']['active'] -or
  [bool]$effectiveConfigs.release['bundle']['active'] -or
  -not [bool]$effectiveConfigs.nsis['bundle']['active'] -or
  -not (
    Test-StringArraysEqual `
      -Left @($effectiveConfigs.nsis['bundle']['targets']) `
      -Right @('nsis')
  )
) {
  throw 'Effective Tauri config bundle modes are not exact.'
}

$overridePath = Join-Path $SessionRoot 'override.json'
$releaseOverridePath = Join-Path $SessionRoot 'release-override.json'
$nsisOverridePath = Join-Path $SessionRoot 'nsis-override.json'
$sessionOwnerPath = Join-Path $SessionRoot 'session-owner.json'
Write-JsonFile -Path $sessionOwnerPath -Value ([ordered]@{
    schemaVersion = 1
    sessionRootHash = Get-Sha256 -Value $SessionRoot
    nonceHash = $NonceHash
    createdAtUtc = $SessionStartedAtUtc.ToString('o')
  })
Write-JsonFile -Path $overridePath -Value $overrideConfig
Write-JsonFile -Path $releaseOverridePath -Value $releaseConfig
Write-JsonFile -Path $nsisOverridePath -Value $nsisConfig

$parentUserProfile = [string]$env:USERPROFILE
$cargoHome = if ([string]::IsNullOrWhiteSpace([string]$env:CARGO_HOME)) {
  Join-Path $parentUserProfile '.cargo'
}
else {
  [string]$env:CARGO_HOME
}
$rustupHome = if ([string]::IsNullOrWhiteSpace([string]$env:RUSTUP_HOME)) {
  Join-Path $parentUserProfile '.rustup'
}
else {
  [string]$env:RUSTUP_HOME
}
$parentHome = if ([string]::IsNullOrWhiteSpace([string]$env:HOME)) {
  $parentUserProfile
}
else {
  [string]$env:HOME
}

$protectedPair = Read-ProtectedStatePair -FixturePath $ProtectedStateFixture
$protectedBefore = ConvertTo-ProtectedMetadata -Snapshot $protectedPair.before
$protectedBeforeJson = $protectedBefore | ConvertTo-Json -Depth 20 -Compress
$protectedAfterJson = $null
if ($null -ne $protectedPair.after) {
  $protectedAfterJson = (
    ConvertTo-ProtectedMetadata -Snapshot $protectedPair.after
  ) | ConvertTo-Json -Depth 20 -Compress
  if ($protectedBeforeJson -cne $protectedAfterJson) {
    throw 'Protected state drift detected; refusing cleanup and host repair.'
  }
}

$ownedProcessEvidence = [ordered]@{
  status = 'NOT_RUN'
  sessionStartedAtUtc = $SessionStartedAtUtc.ToString('o')
  optimizedExecutable = [ordered]@{
    relativePath = "$NativeCargoTargetRelativePath/release/jarvis.exe"
    underSessionRoot = $false
    underRepoOwnedBuildRoot = $true
    applicationControlCompatible = $true
    expectedType = 'regular-file-no-reparse'
  }
  identityFields = [object[]]@(
    'pid',
    'parentPid',
    'creationTimeUtc',
    'creationTimeHash',
    'executableHash',
    'commandHash'
  )
  sessionOwner = $null
  cleanupBranch = $null
  evidenceStatus = 'NOT_RUN'
  acceptanceIndependentCleanup = $true
  root = $null
  descendants = [object[]]@()
  stoppedPids = [object[]]@()
}
$ownedFixture = Read-OwnedProcessFixture -FixturePath $OwnedProcessFixture
if ($null -ne $ownedFixture) {
  $fixtureSessionStart = [datetime]::Parse(
    [string](Get-OptionalProperty -InputObject $ownedFixture -Name 'sessionStartedAtUtc')
  ).ToUniversalTime()
  Assert-OwnedProcessAncestry `
    -Snapshot $ownedFixture.before `
    -SessionStartedAtUtc $fixtureSessionStart
  Assert-OwnedProcessAncestry `
    -Snapshot $ownedFixture.after `
    -SessionStartedAtUtc $fixtureSessionStart
  $ownedBefore = ConvertTo-OwnedProcessSet -Snapshot $ownedFixture.before
  $ownedAfter = ConvertTo-OwnedProcessSet -Snapshot $ownedFixture.after
  $ownedBeforeJson = $ownedBefore | ConvertTo-Json -Depth 20 -Compress
  $ownedAfterJson = $ownedAfter | ConvertTo-Json -Depth 20 -Compress
  if ($ownedBeforeJson -cne $ownedAfterJson) {
    throw 'Owned process identity drift detected; refusing PID cleanup.'
  }

  $protectedPids = @($protectedBefore.processes | ForEach-Object { [int]$_.pid })
  $ownedPids = @()
  if ($null -ne $ownedBefore.root) {
    $ownedPids += [int]$ownedBefore.root.pid
  }
  $ownedPids += @($ownedBefore.descendants | ForEach-Object { [int]$_.pid })
  if (@($ownedPids | Where-Object { $protectedPids -contains $_ }).Count -gt 0) {
    throw 'Protected PID overlap detected; refusing owned-process cleanup.'
  }
  if (@($ownedPids | Sort-Object -Unique).Count -ne $ownedPids.Count) {
    throw 'Owned process fixture contains duplicate PIDs.'
  }

  $stoppedPids = @(
    Get-OptionalProperty -InputObject $ownedFixture -Name 'stoppedPids' -Default @()
  ) | ForEach-Object { [int]$_ }
  $allowedStoppedPids = @($ownedBefore.descendants | ForEach-Object { [int]$_.pid })
  if ($null -ne $ownedBefore.root) {
    $allowedStoppedPids += [int]$ownedBefore.root.pid
  }
  if (@($stoppedPids | Where-Object { $allowedStoppedPids -notcontains $_ }).Count -gt 0) {
    throw 'Owned process fixture stops a PID outside the exact recorded owned tree.'
  }
  $cleanupBranch = Get-OptionalProperty -InputObject $ownedFixture -Name 'cleanupBranch'
  $allowedCleanupBranches = @(
    'vite-startup-error',
    'vite-listener-timeout',
    'native-startup-error',
    'native-early-exit',
    'native-evidence-timeout',
    'optimized-early-exit',
    'optimized-evidence-error'
  )
  if ($null -ne $cleanupBranch -and $allowedCleanupBranches -notcontains [string]$cleanupBranch) {
    throw 'Owned process fixture declares an unknown cleanup branch.'
  }
  $ownedProcessEvidence.status = 'VALIDATED_FIXTURE'
  $ownedProcessEvidence.sessionStartedAtUtc = $fixtureSessionStart.ToString('o')
  $ownedProcessEvidence.sessionOwner = $ownedBefore.sessionOwner
  $ownedProcessEvidence.cleanupBranch = $cleanupBranch
  $ownedProcessEvidence.evidenceStatus = [string](
    Get-OptionalProperty -InputObject $ownedFixture -Name 'evidenceStatus' -Default 'NOT_RUN'
  )
  $ownedProcessEvidence.root = $ownedBefore.root
  $ownedProcessEvidence.descendants = [object[]]$ownedBefore.descendants
  $ownedProcessEvidence.stoppedPids = [object[]]$stoppedPids
}

$viteEnvironment = [ordered]@{
  VITE_VIBESPACE_RUNTIME_PROFILE = $RuntimeProfile
  VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER = $Identifier
  VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER = $TestCapability
  VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH = $NonceHash
}
$childPaths = [ordered]@{
  APPDATA = 'native/profile/appdata'
  LOCALAPPDATA = 'native/profile/localappdata'
  USERPROFILE = 'native/profile/userprofile'
  HOME = 'native/profile/home'
  HOMEDRIVE = 'native/profile/home-drive'
  HOMEPATH = 'native/profile/home-path'
  WEBVIEW2_USER_DATA_FOLDER = 'native/profile/webview2'
  TEMP = 'native/profile/temp'
  TMP = 'native/profile/temp'
}
$devChildPaths = [ordered]@{}
foreach ($entry in $childPaths.GetEnumerator()) {
  $devChildPaths[$entry.Key] = $entry.Value
}
$devChildPaths.VIBESPACE_MONOCHROME_PROFILE_ROOT = 'native/profile'
$devChildPaths.VIBESPACE_MONOCHROME_APP_DATA_ROOT = 'native/profile/appdata'

$releaseArguments = @(
  '--prefix',
  'app',
  'run',
  'tauri',
  '--',
  'build',
  '--no-bundle',
  '--no-sign',
  '--config',
  'release-override.json'
)
$nsisArguments = @(
  '--prefix',
  'app',
  'run',
  'tauri',
  '--',
  'build',
  '--bundles',
  'nsis',
  '--no-sign',
  '--config',
  'nsis-override.json'
)
$cargoLibraryTestArguments = @(
  'test',
  '--manifest-path',
  'app/src-tauri/Cargo.toml',
  '--locked',
  '--lib',
  '--',
  '--test-threads=1'
)

$deniedCounters = [ordered]@{
  notification = $null
  processRelaunch = $null
  updater = $null
  shellOpen = $null
  externalHttp = $null
  keychain = $null
  registry = $null
  launcher = $null
  tray = $null
  singleInstance = $null
  globalShortcut = $null
  deepLink = $null
  autostart = $null
}

$evidenceResult = $null
$evidenceStatus = 'NOT_RUN'
if (-not [string]::IsNullOrWhiteSpace($EvidenceFixture)) {
  $absoluteEvidenceFixture = Get-AbsolutePath -Path $EvidenceFixture
  Assert-NoReparsePathComponents `
    -TrustedRoot $RepoRoot `
    -Candidate $absoluteEvidenceFixture
  if (-not (Test-Path -LiteralPath $absoluteEvidenceFixture -PathType Leaf)) {
    throw 'Evidence fixture is missing or not a regular file.'
  }
  $evidenceResult = Assert-AndSanitizeEvidence -Evidence (
    Get-Content -LiteralPath $absoluteEvidenceFixture -Raw | ConvertFrom-Json
  )
  $evidenceStatus = 'VALIDATED_FIXTURE'
  $deniedCounters = [ordered]@{}
  foreach ($effectId in $DeniedEffectIds) {
    $deniedCounters[$effectId] = [long]$evidenceResult.deniedEffects.counters.$effectId
  }
}

$expectedArtifactRelativePath = (
  "$NativeCargoTargetRelativePath/release/bundle/nsis/{0}_{1}_x64-setup.exe" -f
  [string]$baseConfig.productName,
  [string]$baseConfig.version
)
$artifactOutcome = [ordered]@{
  status = 'NOT_RUN'
  evidence = $null
}
if (-not [string]::IsNullOrWhiteSpace($UnsignedNsisArtifactFixture)) {
  $expectedArtifactPath = Get-AbsolutePath -Path (Join-Path $RepoRoot $expectedArtifactRelativePath)
  $fixtureArtifactPath = Get-AbsolutePath -Path $UnsignedNsisArtifactFixture
  if (
    -not $fixtureArtifactPath.Equals(
      $expectedArtifactPath,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw 'Unsigned NSIS artifact path is not the exact expected contained target.'
  }
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $fixtureArtifactPath
  $artifactItem = Get-Item -LiteralPath $fixtureArtifactPath -Force
  if (
    $artifactItem.PSIsContainer -or
    ($artifactItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or
    $artifactItem.Length -le 0
  ) {
    throw 'Unsigned NSIS artifact must be a positive-size regular non-reparse file.'
  }
  $artifactOutcome.status = 'VALIDATED_FIXTURE'
  $artifactOutcome.evidence = [ordered]@{
    relativePath = $expectedArtifactRelativePath
    sha256 = Get-FileSha256 -Path $fixtureArtifactPath
    sizeBytes = [int64]$artifactItem.Length
    configHash = Get-FileSha256 -Path $nsisOverridePath
    commit = $Commit
    identifier = $Identifier
  }
}
$runnerTokens = $null
$runnerParseErrors = $null
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile(
  $PSCommandPath,
  [ref]$runnerTokens,
  [ref]$runnerParseErrors
)
if ($runnerParseErrors.Count -ne 0) {
  throw 'Runner source failed its own PowerShell AST parse.'
}
$reportUsesPortTermination = @(
  $runnerAst.FindAll(
    {
      param($node)
      $node -is [System.Management.Automation.Language.CommandAst] -and
      $node.GetCommandName() -ceq 'Stop-Process' -and
      $node.Extent.Text -match 'Port|OwningProcess|Get-NetTCPConnection'
    },
    $true
  )
).Count -ne 0
$nativeEvidence = [ordered]@{
  profile = $null
  appIdentifier = $null
  capabilityIdentifier = $null
  sessionNonceHash = $null
}

$report = [ordered]@{
  contained = $true
  nativeEvidence = $nativeEvidence
  harnessHandoff = [ordered]@{
    status = 'NOT_RUN'
    reportRelativePath = 'session-manifest.json'
    consumerArgument = '--handshake-report'
    requiredTopLevelFields = [object[]]@('contained', 'nativeEvidence')
    readinessSource = 'actual-authenticated-product-producer-only'
  }
  productProducerDependency = [ordered]@{
    status = 'MISSING_PRODUCT_INTEGRATION'
    owner = 'frontend-native-integration-lane'
    requiredEnvironment = [object[]]@(
      'VIBESPACE_MONOCHROME_EVIDENCE_PATH',
      'VIBESPACE_MONOCHROME_EVIDENCE_TOKEN',
      'VIBESPACE_MONOCHROME_SESSION_NONCE_HASH'
    )
    requiredOrigin = 'actual-owned-native-process-tree'
    fixtureMayValidateSchema = $true
    fixtureMaySetReady = $false
    executableModeFailsClosedWhileMissing = $true
  }
  productProducerInterface = [ordered]@{
    schemaVersion = $EvidenceSchemaVersion
    runtimeQuery = [ordered]@{
      command = 'runtime_profile_query'
      requestFields = [object[]]@()
      resultFields = [object[]]@(
        'profile',
        'appIdentifier',
        'capabilityIdentifier',
        'sessionNonceHash',
        'deniedEffects'
      )
    }
    evidenceCommit = [ordered]@{
      command = 'monochrome_evidence_commit'
      requestFields = [object[]]@(
        'nativeHandshake',
        'frontendHandshake',
        'readiness',
        'errors'
      )
      resultFields = [object[]]@(
        'status',
        'schemaVersion',
        'sessionNonceHash',
        'producer'
      )
    }
    authentication = [ordered]@{
      owner = 'native-rust-command'
      tokenEnvironment = 'VIBESPACE_MONOCHROME_EVIDENCE_TOKEN'
      nonceHashEnvironment = 'VIBESPACE_MONOCHROME_SESSION_NONCE_HASH'
      proof = 'sha256(sessionNonceHash-newline-ephemeralEvidenceToken)'
      tokenExposedToFrontend = $false
    }
    fileWrite = [ordered]@{
      owner = 'native-rust-command'
      pathEnvironment = 'VIBESPACE_MONOCHROME_EVIDENCE_PATH'
      strategy = 'same-directory-temp-file-fsync-atomic-rename'
      frontendDirectWriteAllowed = $false
    }
  }
  mode = switch ($PSCmdlet.ParameterSetName) {
    'ValidateOnly' { 'validate-only' }
    'BuildReleaseExecutable' { 'build-release-executable' }
    'BuildUnsignedNsisArtifact' { 'build-unsigned-nsis-artifact' }
    'RunContainedDevSession' { 'run-contained-dev-session' }
    'RunCargoLibraryTests' { 'run-cargo-library-tests' }
    default { throw "Unexpected parameter set: $($PSCmdlet.ParameterSetName)" }
  }
  sessionRootHash = Get-Sha256 -Value $SessionRoot
  session = [ordered]@{
    commit = $Commit
    nonceHash = $NonceHash
  }
  identity = [ordered]@{
    host = '127.0.0.1'
    port = $SelectedPort
    devUrl = $DevUrl
    identifier = $Identifier
  }
  portSelection = [ordered]@{
    host = '127.0.0.1'
    port = $SelectedPort
    ownerPid = $null
    verification = 'exclusive-bind-reservation-held-through-validation'
    reservationReleasedAfterValidation = $true
    killsOwner = $false
    usesDevDesktopHelper = $false
  }
  overrideConfig = $overrideConfig
  releaseConfig = $releaseConfig
  nsisConfig = $nsisConfig
  effectiveConfigs = $effectiveConfigs
  productionCapabilities = [object[]]$ProductionCapabilities
  testCapability = $TestCapability
  buildEnvironment = [ordered]@{
    usesParentToolchainHomes = $true
    relocatesCargoHome = $false
    relocatesRustupHome = $false
    retainsParentUserHomeUntilChildLaunch = $true
    cargoHome = New-PathMetadata -Value $cargoHome
    rustupHome = New-PathMetadata -Value $rustupHome
    userProfile = New-PathMetadata -Value $parentUserProfile
    home = New-PathMetadata -Value $parentHome
    cargoTarget = [ordered]@{
      relativePath = $NativeCargoTargetRelativePath
      underSessionRoot = $false
      underRepoOwnedBuildRoot = $true
      applicationControlCompatible = $true
    }
  }
  viteEnvironment = $viteEnvironment
  childEnvironment = [ordered]@{
    VIBESPACE_RUNTIME_PROFILE = $RuntimeProfile
    VIBESPACE_MONOCHROME_SESSION_NONCE_HASH = $NonceHash
    paths = $childPaths
  }
  devChildEnvironment = [ordered]@{
    preservesParentToolchainHomes = $true
    relocatesCargoHome = $false
    relocatesRustupHome = $false
    paths = $devChildPaths
  }
  runtimeHandshake = [ordered]@{
    command = 'runtime_profile_query'
    status = $evidenceStatus
    responseFields = [object[]]@(
      'profile',
      'appIdentifier',
      'capabilityIdentifier',
      'sessionNonceHash'
    )
    expected = [ordered]@{
      profile = $RuntimeProfile
      appIdentifier = $Identifier
      capabilityIdentifier = $TestCapability
      sessionNonceHash = $NonceHash
    }
  }
  interfaceContract = [ordered]@{
    testMode = [ordered]@{
      profile = $RuntimeProfile
      appIdentifierPattern = '^ai\.vibespace\.monochrome\.test[0-9a-f]+$'
      capabilityIdentifier = $TestCapability
      sessionNonceHashPattern = '^[0-9a-f]{64}$'
      deniedBeforePrivilegedEffectAdapters = $true
    }
    ordinaryMode = [ordered]@{
      rejectsTestOnlySignals = [object[]]@(
        'VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER',
        'VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER',
        'VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
        'VIBESPACE_MONOCHROME_SESSION_NONCE_HASH'
      )
      evidence = [ordered]@{
        appIdentifier = $null
        capabilityIdentifier = $null
        sessionNonceHash = $null
      }
    }
  }
  protectedState = $protectedBefore
  deniedEffects = [ordered]@{
    status = $evidenceStatus
    counters = $deniedCounters
  }
  evidenceChannel = [ordered]@{
    schemaVersion = $EvidenceSchemaVersion
    relativePath = 'evidence/native-evidence.json'
    status = $evidenceStatus
    deadlineSeconds = $EvidenceTimeoutSeconds
    authentication = [ordered]@{
      algorithm = 'sha256'
      proofInput = 'sessionNonceHash-newline-ephemeralEvidenceToken'
      expectedHash = $EvidenceAuthenticationHash
      rawTokenPersisted = $false
    }
    required = [ordered]@{
      nativeHandshake = [object[]]@(
        'profile',
        'appIdentifier',
        'capabilityIdentifier',
        'sessionNonceHash'
      )
      frontendHandshake = [object[]]@(
        'profile',
        'appIdentifier',
        'capabilityIdentifier',
        'sessionNonceHash'
      )
      readiness = [object[]]@(
        'status',
        'application',
        'fixtureSmoke',
        'surface',
        'theme',
        'font',
        'fallback'
      )
      deniedEffects = [object[]]@('status', 'manifestHash', 'counters')
      errors = [object[]]@('page', 'native')
      producer = [object[]]@(
        'pid',
        'creationTimeUtc',
        'creationTimeHash',
        'executableHash',
        'commandHash'
      )
    }
    result = $evidenceResult
  }
  executableSuccessGate = [ordered]@{
    deadlineSeconds = $EvidenceTimeoutSeconds
    pollMilliseconds = 250
    failsOnProcessExitBeforeEvidence = $true
    failsOnTimeout = $true
    failsOnNotRun = $true
    failsOnMissingFields = $true
    requiresAuthenticatedNonceBoundEvidence = $true
    requiresApplicationReady = $true
    requiresSyntheticFixtureSmoke = $true
    requiresZeroPageAndNativeErrors = $true
    requiresAllDeniedEffectCountersZero = $true
  }
  cleanup = [ordered]@{
    scope = 'owned-descendants-only'
    identityFields = [object[]]@(
      'pid',
      'parentPid',
      'creationTimeUtc',
      'creationTimeHash',
      'executableHash',
      'commandHash'
    )
    containedPaths = [object[]]@(
      $NativeCargoTargetRelativePath,
      'native/profile',
      'playwright/profile',
      'vite/cache'
    )
    stopsProtectedPids = $false
    rejectsIdentityDrift = $true
    rejectsReparsePoint = $true
    rejectsProtectedStateDrift = $true
    rejectsAmbiguousAncestry = $true
    requiresParentChainValidation = $true
    requiresCreationAfterSessionAndParent = $true
    rootStopRequiresNonceConfirmedHandshake = $false
    rootStopRequiresExactOwnedIdentity = $true
    cleanupRunsWithoutAcceptedEvidence = $true
    preservesEarlierDescendantSnapshots = $true
    revalidatesEveryPathComponentBeforeUse = $true
    killsByPort = $false
    repairsHostState = $false
    stopsOwnedRootOnFailureOnly = $true
    preservesProfileEvidence = $true
  }
  ownedProcesses = $ownedProcessEvidence
  executionModes = [ordered]@{
    validateOnly = [ordered]@{
      builds = $false
      launchesNativeApp = $false
      launchesInstaller = $false
    }
    buildReleaseExecutable = [ordered]@{
      builds = $true
      bundlesInstaller = $false
      signsArtifact = $false
      launchesInstaller = $false
      launchesNativeApp = $true
      requiresOptimizedExecutable = $true
      requiresIdentityBoundCleanup = $true
      requiresAuthenticatedEvidence = $true
      deadlineSeconds = $EvidenceTimeoutSeconds
    }
    buildUnsignedNsisArtifact = [ordered]@{
      builds = $true
      bundlesInstaller = $true
      signsArtifact = $false
      publishesArtifact = $false
      launchesInstaller = $false
    }
    runContainedDevSession = [ordered]@{
      builds = $false
      launchesVite = $true
      launchesNativeApp = $true
      requiresExactListenerIdentity = $true
      requiresAuthenticatedEvidence = $true
    }
    runCargoLibraryTests = [ordered]@{
      buildsTests = $true
      launchesNativeApp = $false
      launchesInstaller = $false
      launchesVite = $false
      signsArtifact = $false
      publishesArtifact = $false
      requiresFreshTarget = $true
      requiresInputDriftCheck = $true
      requiresIdentityBoundCleanup = $true
      requiresUnambiguousLibrarySummary = $true
    }
    installedPackageSandboxVm = [ordered]@{
      status = 'SKIPPED_NOT_APPLICABLE_HOST_INSTALL_PROHIBITED'
      requiresSandboxVm = $true
    }
    platformCoverage = [ordered]@{
      macOSWebKit = 'SKIPPED_NOT_APPLICABLE_WINDOWS_HOST'
      linux = 'SKIPPED_NOT_APPLICABLE_WINDOWS_HOST'
    }
  }
  artifactContract = [ordered]@{
    relativePath = $expectedArtifactRelativePath
    expectedType = 'regular-file-no-reparse'
    requiresContainedPath = $true
    requiresSha256 = $true
    requiresPositiveSize = $true
    requiresConfigHash = $true
    requiresCommitBuildIdentity = $true
  }
  optimizedSuccessGate = [ordered]@{
    requiredProducerIdentityFields = [object[]]@(
      'pid',
      'creationTimeHash',
      'executableHash',
      'commandHash'
    )
    requiresExactOwnedRootMatch = $true
    requiresCurrentIdentityRevalidation = $true
    evidenceSource = 'actual-authenticated-product-producer-only'
    fixtureMaySetPass = $false
    passOutcome = 'optimizedExecutable'
  }
  outcomes = [ordered]@{
    optimizedExecutable = [ordered]@{ status = 'NOT_RUN'; evidence = $null }
    unsignedNsisArtifact = $artifactOutcome
    cargoLibraryTests = [ordered]@{ status = 'NOT_RUN'; evidence = $null }
    installedPackageSandboxVm = [ordered]@{
      status = 'SKIPPED_NOT_APPLICABLE_HOST_INSTALL_PROHIBITED'
      requiresSandboxVm = $true
    }
    platforms = [ordered]@{
      macOSWebKit = [ordered]@{ status = 'SKIPPED_NOT_APPLICABLE_WINDOWS_HOST' }
      linux = [ordered]@{ status = 'SKIPPED_NOT_APPLICABLE_WINDOWS_HOST' }
    }
  }
  devSessionLifecycle = [ordered]@{
    status = 'NOT_RUN'
    vite = [ordered]@{
      command = 'npm'
      requiresContainedCache = $true
      requiresExactListenerIdentity = $true
      identityFields = [object[]]@(
        'pid',
        'creationTimeUtc',
        'creationTimeHash',
        'executableHash',
        'commandHash'
      )
    }
    native = [ordered]@{
      requiresAuthenticatedEvidence = $true
      requiresProductOwnedReadiness = $true
    }
    reservation = [ordered]@{
      heldUntilViteLaunch = $true
      releasedOnlyForAtomicLaunch = $true
      listenerMustMatchViteProcessTree = $true
    }
    cleanup = [ordered]@{
      identityBoundDescendantsOnly = $true
      acceptanceIndependent = $true
      killsByPort = $false
    }
  }
  releaseCommand = [ordered]@{
    executable = 'npm'
    arguments = [object[]]$releaseArguments
  }
  nsisCommand = [ordered]@{
    executable = 'npm'
    arguments = [object[]]$nsisArguments
  }
  cargoLibraryTestCommand = [ordered]@{
    executable = 'cargo'
    arguments = [object[]]$cargoLibraryTestArguments
    workingDirectory = '.'
    environment = [ordered]@{
      CARGO_TARGET_DIR = $CargoLibraryTestTargetRelativePath
      CARGO_BUILD_JOBS = '1'
      RUST_TEST_THREADS = '1'
    }
  }
  cargoLibraryTestEvidenceContract = [ordered]@{
    requiredBindings = [object[]]@(
      'branch',
      'head',
      'dirtyInputInventory',
      'dirtyInputDigest',
      'inputInventory',
      'inputInventoryDigest',
      'cargoTomlSha256',
      'cargoLockSha256',
      'rustSourceDigest',
      'buildInputDigest',
      'configInputDigest',
      'command',
      'environmentPolicy',
      'targetIdentity',
      'cargoVersion',
      'rustcVersion',
      'processIdentity',
      'startedAtUtc',
      'completedAtUtc',
      'exitCode',
      'stdout',
      'stderr',
      'testResult',
      'policyBlockSignatures',
      'cleanup',
      'artifactDisposition'
    )
    requiresFreshLogs = $true
    rejectsInputDrift = $true
    passRequiresExitZero = $true
    passRequiresOneOkLibrarySummary = $true
    passRejectsFailureMarkers = $true
  }
  writtenFiles = [object[]]@(
    'session-owner.json',
    'override.json',
    'release-override.json',
    'nsis-override.json',
    'session-manifest.json'
  )
  staleEvidenceArchive = $ArchivedStaleEvidenceRelativePath
  artifactDisposition = Get-ArtifactDisposition `
    -ParameterSetName $PSCmdlet.ParameterSetName `
    -PreserveArtifacts ([bool]$PreserveArtifacts)
  selfChecks = [ordered]@{
    strictLoopback = $DevUrl.StartsWith('http://127.0.0.1:')
    portWasUnused = (
      $RunCargoLibraryTests -or [bool]$PortReservation.listener.Server.IsBound
    )
    noOwnerTermination = -not $reportUsesPortTermination
    noDevDesktopHelper = -not ($releaseArguments -contains 'dev-desktop')
    productionCapabilityClosure = Test-StringArraysEqual `
      -Left $baseCapabilities `
      -Right $ProductionCapabilities
    testCapabilityReplacement = (
      @($overrideConfig.app.security.capabilities).Count -eq 1 -and
      [string]$overrideConfig.app.security.capabilities[0] -ceq $TestCapability
    )
    testCapabilityIdentity = (
      [string]$testCapabilityConfig.identifier -ceq $TestCapability -and
      @($testCapabilityConfig.windows).Count -eq 1 -and
      [string]$testCapabilityConfig.windows[0] -ceq $TestCapability
    )
    leastPrivilegeCapability = (
      -not $hasForbiddenPermission -and
      (Test-StringArraysEqual -Left $testPermissions -Right $AllowedTestPermissions)
    )
    loopbackOnlyCsp = (
      $Csp -notmatch 'https:|wss:|\*|localhost' -and
      $Csp -notmatch 'https?://(?!127\.0\.0\.1)' -and
      $Csp -notmatch 'wss?://(?!127\.0\.0\.1)'
    )
    isolatedCargoTarget = (Test-IsContainedPath `
      -Root $NativeBuildRoot `
      -Candidate $absoluteDirectories['native/cargo-target'])
    isolatedChildProfile = (Test-IsContainedPath `
      -Root $SessionRoot `
      -Candidate $absoluteDirectories['native/profile'])
    parentToolchainPreserved = $true
    protectedStateStable = (
      $null -eq $protectedAfterJson -or $protectedBeforeJson -ceq $protectedAfterJson
    )
    nonceHashOnly = $NonceHash -cmatch '^[0-9a-f]{64}$'
    pairedRuntimeProfile = (
      $viteEnvironment.VITE_VIBESPACE_RUNTIME_PROFILE -ceq $RuntimeProfile
    )
    handshakeExpected = (
      $viteEnvironment.VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER -ceq $Identifier -and
      $viteEnvironment.VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER -ceq $TestCapability -and
      $viteEnvironment.VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH -ceq $NonceHash
    )
    interfaceContractPublished = (
      $RuntimeProfile -ceq 'monochrome-visual-test' -and
      $TestCapability -ceq 'monochrome-test'
    )
  }
}

$reportJsonBeforeWrite = $report | ConvertTo-Json -Depth 32 -Compress
foreach ($rawValue in @(
    [string](Get-OptionalProperty -InputObject (
        Get-OptionalProperty -InputObject $protectedPair.before -Name 'launcher'
      ) -Name 'path' -Default ''),
    [string](Get-OptionalProperty -InputObject (
        Get-OptionalProperty -InputObject $protectedPair.before -Name 'launcher'
      ) -Name 'content' -Default ''),
    [string](Get-OptionalProperty -InputObject (
        Get-OptionalProperty -InputObject $protectedPair.before -Name 'credential'
      ) -Name 'namespace' -Default '')
  )) {
  if (-not [string]::IsNullOrWhiteSpace($rawValue) -and $reportJsonBeforeWrite.Contains($rawValue)) {
    throw 'Sanitized report contains a raw protected-state value.'
  }
}
foreach (
  $registryValue in @(
    Get-OptionalProperty -InputObject $protectedPair.before -Name 'registryValues' -Default @()
  )
) {
  foreach ($field in @('value')) {
    $rawValue = [string](
      Get-OptionalProperty -InputObject $registryValue -Name $field -Default ''
    )
    if (-not [string]::IsNullOrWhiteSpace($rawValue) -and $reportJsonBeforeWrite.Contains($rawValue)) {
      throw 'Sanitized report contains a raw protected registry value.'
    }
  }
}
foreach ($rawProcess in @(
    Get-OptionalProperty -InputObject $protectedPair.before -Name 'processes' -Default @()
  )) {
  foreach ($field in @('name', 'creationTime', 'executable', 'commandLine')) {
    $rawValue = [string](Get-OptionalProperty -InputObject $rawProcess -Name $field -Default '')
    if (-not [string]::IsNullOrWhiteSpace($rawValue) -and $reportJsonBeforeWrite.Contains($rawValue)) {
      throw 'Sanitized report contains raw protected process identity.'
    }
  }
}
if ($null -ne $ownedFixture) {
  foreach ($ownedSnapshot in @($ownedFixture.before, $ownedFixture.after)) {
    $rawOwnedRoot = Get-OptionalProperty -InputObject $ownedSnapshot -Name 'root'
    $rawOwnedProcesses = @(
      @($rawOwnedRoot) +
      @(
        Get-OptionalProperty -InputObject $ownedSnapshot -Name 'descendants' -Default @()
      )
    )
    foreach ($rawOwnedProcess in $rawOwnedProcesses) {
      if ($null -eq $rawOwnedProcess) {
        continue
      }
      foreach ($field in @('executable', 'commandLine')) {
        $rawValue = [string](
          Get-OptionalProperty -InputObject $rawOwnedProcess -Name $field -Default ''
        )
        if (
          -not [string]::IsNullOrWhiteSpace($rawValue) -and
          $reportJsonBeforeWrite.Contains($rawValue)
        ) {
          throw 'Sanitized report contains raw owned process identity.'
        }
      }
    }
  }
}
if ($reportJsonBeforeWrite.Contains($Nonce)) {
  throw 'Sanitized report contains the raw session nonce.'
}
if ($reportJsonBeforeWrite.Contains($EvidenceToken)) {
  throw 'Sanitized report contains the raw evidence token.'
}

$manifestPath = Join-Path $SessionRoot 'session-manifest.json'

function Assert-ProtectedStateStableAtBoundary {
  $afterMetadata = ConvertTo-ProtectedMetadata -Snapshot (Get-ProtectedAfterSnapshot)
  $afterJson = $afterMetadata | ConvertTo-Json -Depth 20 -Compress
  if ($protectedBeforeJson -cne $afterJson) {
    throw 'Protected state drift detected at the actual execution boundary; no repair attempted.'
  }
  $report.selfChecks.protectedStateStable = $true
}

function Remove-NonceOwnedSessionTree {
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $SessionRoot
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $sessionOwnerPath
  $owner = Get-Content -LiteralPath $sessionOwnerPath -Raw | ConvertFrom-Json
  if (
    [string]$owner.nonceHash -cne $NonceHash -or
    [string]$owner.sessionRootHash -cne (Get-Sha256 -Value $SessionRoot)
  ) {
    throw 'Session ownership marker drifted; refusing artifact cleanup.'
  }
  Assert-NoReparsePathComponents `
    -TrustedRoot $RepoRoot `
    -Candidate $absoluteDirectories['native/cargo-target']
  if (
    -not (
      Test-IsContainedPath `
        -Root $NativeBuildRoot `
        -Candidate $absoluteDirectories['native/cargo-target']
    )
  ) {
    throw 'Native build cache escaped its task-owned build root.'
  }
  Remove-Item -LiteralPath $absoluteDirectories['native/cargo-target'] -Recurse -Force
  Remove-Item -LiteralPath $SessionRoot -Recurse -Force
}

if ($ValidateOnly) {
  Assert-ProtectedStateStableAtBoundary
  Write-JsonFile -Path $manifestPath -Value $report
  $outputJson = $report | ConvertTo-Json -Depth 32 -Compress
  $PortReservation.listener.Stop()
  if (-not $PreserveArtifacts) {
    Remove-NonceOwnedSessionTree
  }
  $outputJson
  exit 0
}

function Invoke-IsolatedBuild {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$ConfigPath
  )

  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $SessionRoot
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $ConfigPath
  Assert-NoReparsePathComponents `
    -TrustedRoot $RepoRoot `
    -Candidate $absoluteDirectories['native/cargo-target']
  $npm = Get-Command npm.cmd -ErrorAction Stop
  $actualArguments = @($Arguments)
  $actualArguments[$actualArguments.Count - 1] = $ConfigPath
  $saved = @{}
  $buildEnvironment = [ordered]@{
    CARGO_TARGET_DIR = $absoluteDirectories['native/cargo-target']
    VITE_VIBESPACE_RUNTIME_PROFILE = $RuntimeProfile
    VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER = $Identifier
    VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER = $TestCapability
    VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH = $NonceHash
  }
  foreach ($entry in $buildEnvironment.GetEnumerator()) {
    $saved[$entry.Key] = [System.Environment]::GetEnvironmentVariable(
      $entry.Key,
      [System.EnvironmentVariableTarget]::Process
    )
    [System.Environment]::SetEnvironmentVariable(
      $entry.Key,
      [string]$entry.Value,
      [System.EnvironmentVariableTarget]::Process
    )
  }
  try {
    Push-Location $RepoRoot
    try {
      & $npm.Source @actualArguments
      if ($LASTEXITCODE -ne 0) {
        throw "Isolated build failed with exit code $LASTEXITCODE."
      }
      Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $SessionRoot
      Assert-NoReparsePathComponents `
        -TrustedRoot $RepoRoot `
        -Candidate $absoluteDirectories['native/cargo-target']
    }
    finally {
      Pop-Location
    }
  }
  finally {
    foreach ($entry in $buildEnvironment.GetEnumerator()) {
      [System.Environment]::SetEnvironmentVariable(
        $entry.Key,
        $saved[$entry.Key],
        [System.EnvironmentVariableTarget]::Process
      )
    }
  }
}

function ConvertFrom-CimProcess {
  param([Parameter(Mandatory = $true)][object]$Process)

  $creationTime = if ($Process.CreationDate -is [datetime]) {
    $Process.CreationDate.ToUniversalTime().ToString('o')
  }
  else {
    [string]$Process.CreationDate
  }
  return [ordered]@{
    pid = [int]$Process.ProcessId
    parentPid = [int]$Process.ParentProcessId
    creationTime = $creationTime
    executable = [string]$Process.ExecutablePath
    commandLine = [string]$Process.CommandLine
  }
}

function Get-OwnedProcessIdentity {
  param([Parameter(Mandatory = $true)][int]$ProcessId)

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
  if ($null -eq $process) {
    return $null
  }
  return ConvertFrom-CimProcess -Process $process
}

function Get-OwnedDescendantIdentities {
  param(
    [Parameter(Mandatory = $true)][object]$RootIdentity,
    [object[]]$ProcessSnapshot
  )

  $allProcesses = if ($PSBoundParameters.ContainsKey('ProcessSnapshot')) {
    @($ProcessSnapshot)
  }
  else {
    @(Get-CimInstance Win32_Process)
  }
  $childrenByParent = @{}
  foreach ($process in $allProcesses) {
    $parentId = [int]$process.ParentProcessId
    if (-not $childrenByParent.ContainsKey($parentId)) {
      $childrenByParent[$parentId] = New-Object System.Collections.ArrayList
    }
    [void]$childrenByParent[$parentId].Add($process)
  }

  $descendants = @()
  $queue = New-Object 'System.Collections.Generic.Queue[object]'
  $queue.Enqueue($RootIdentity)
  $visitedPids = @{}
  $visitedPids[[int]$RootIdentity.pid] = $true
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    $parentId = [int]$parent.pid
    $parentCreated = [datetime]::Parse(
      [string]$parent.creationTime,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AdjustToUniversal
    ).ToUniversalTime()
    if (-not $childrenByParent.ContainsKey($parentId)) {
      continue
    }
    foreach ($child in @($childrenByParent[$parentId])) {
      $childId = [int]$child.ProcessId
      if ($visitedPids.ContainsKey($childId)) {
        continue
      }
      $childIdentity = ConvertFrom-CimProcess -Process $child
      $childCreated = [datetime]::Parse(
        [string]$childIdentity.creationTime,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AdjustToUniversal
      ).ToUniversalTime()
      if ($childCreated -lt $parentCreated) {
        continue
      }
      $visitedPids[$childId] = $true
      $descendants += $childIdentity
      $queue.Enqueue($childIdentity)
    }
  }
  return [object[]]$descendants
}

function Test-OwnedProcessIdentityEqual {
  param(
    [Parameter(Mandatory = $true)][object]$Expected,
    [Parameter(Mandatory = $true)][object]$Actual
  )

  $expectedMetadata = ConvertTo-OwnedProcessMetadata -Process $Expected
  $actualMetadata = ConvertTo-OwnedProcessMetadata -Process $Actual
  return (
    ($expectedMetadata | ConvertTo-Json -Depth 10 -Compress) -ceq
    ($actualMetadata | ConvertTo-Json -Depth 10 -Compress)
  )
}

function Merge-OwnedProcessSnapshots {
  param(
    [object[]]$Recorded = @(),
    [object[]]$Current = @(),
    [switch]$PruneAbsentRecorded
  )

  $mergedByPid = @{}
  $effectiveRecorded = @($Recorded)
  if ($PruneAbsentRecorded) {
    $currentPids = @{}
    foreach ($currentIdentity in @($Current)) {
      if ($null -ne $currentIdentity) {
        $currentPids[[int]$currentIdentity.pid] = $true
      }
    }
    $effectiveRecorded = @(
      $effectiveRecorded |
        Where-Object { $currentPids.ContainsKey([int]$_.pid) }
    )
  }
  $recordedCount = $effectiveRecorded.Count
  $allIdentities = $effectiveRecorded + @($Current)
  for ($identityIndex = 0; $identityIndex -lt $allIdentities.Count; $identityIndex++) {
    $identity = $allIdentities[$identityIndex]
    $isCurrentIdentity = $identityIndex -ge $recordedCount
    if ($null -eq $identity) {
      continue
    }
    $identityPid = [int]$identity.pid
    if ($mergedByPid.ContainsKey($identityPid)) {
      $recordedIdentity = $mergedByPid[$identityPid]
      $recordedParentPid = [int](
        Get-OptionalProperty -InputObject $recordedIdentity -Name 'parentPid' -Default 0
      )
      $currentParentPid = [int](
        Get-OptionalProperty -InputObject $identity -Name 'parentPid' -Default 0
      )
      $recordedCreationTime = [string](
        Get-OptionalProperty -InputObject $recordedIdentity -Name 'creationTime' -Default ''
      )
      $currentCreationTime = [string](
        Get-OptionalProperty -InputObject $identity -Name 'creationTime' -Default ''
      )
      if ($recordedCreationTime -cne $currentCreationTime -and $isCurrentIdentity) {
        $mergedByPid[$identityPid] = $identity
        continue
      }
      $recordedExecutable = [string](
        Get-OptionalProperty -InputObject $recordedIdentity -Name 'executable' -Default ''
      )
      $currentExecutable = [string](
        Get-OptionalProperty -InputObject $identity -Name 'executable' -Default ''
      )
      $recordedCommandLine = [string](
        Get-OptionalProperty -InputObject $recordedIdentity -Name 'commandLine' -Default ''
      )
      $currentCommandLine = [string](
        Get-OptionalProperty -InputObject $identity -Name 'commandLine' -Default ''
      )
      $changedFields = @()
      if ($recordedParentPid -ne $currentParentPid) {
        $changedFields += 'parentPid'
      }
      if ($recordedCreationTime -cne $currentCreationTime) {
        $changedFields += 'creationTimeUtc'
        $changedFields += 'creationTimeHash'
      }
      if (
        -not [string]::IsNullOrWhiteSpace($recordedExecutable) -and
        -not [string]::IsNullOrWhiteSpace($currentExecutable) -and
        $recordedExecutable -cne $currentExecutable
      ) {
        $changedFields += 'executableHash'
      }
      if (
        -not [string]::IsNullOrWhiteSpace($recordedCommandLine) -and
        -not [string]::IsNullOrWhiteSpace($currentCommandLine) -and
        $recordedCommandLine -cne $currentCommandLine
      ) {
        $changedFields += 'commandHash'
      }
      if ($changedFields.Count -gt 0) {
        throw (
          "Ambiguous PID reuse detected while merging owned process snapshots: $identityPid; " +
          "changed fields: $($changedFields -join ', ')."
        )
      }
      $mergedByPid[$identityPid] = [ordered]@{
        pid = $identityPid
        parentPid = $recordedParentPid
        creationTime = $recordedCreationTime
        executable = if ([string]::IsNullOrWhiteSpace($recordedExecutable)) {
          $currentExecutable
        }
        else {
          $recordedExecutable
        }
        commandLine = if ([string]::IsNullOrWhiteSpace($recordedCommandLine)) {
          $currentCommandLine
        }
        else {
          $recordedCommandLine
        }
      }
      continue
    }
    $mergedByPid[$identityPid] = $identity
  }
  return [object[]]@(
    $mergedByPid.Values |
      Sort-Object { [int]$_.pid }
  )
}

function Read-ValidatedEvidenceFile {
  $evidencePath = Get-AbsolutePath -Path (
    Join-Path $SessionRoot 'evidence\native-evidence.json'
  )
  if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) {
    return $null
  }
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $evidencePath
  $first = Get-Item -LiteralPath $evidencePath -Force
  $content = Get-Content -LiteralPath $evidencePath -Raw
  $second = Get-Item -LiteralPath $evidencePath -Force
  if (
    $first.Length -ne $second.Length -or
    $first.LastWriteTimeUtc -ne $second.LastWriteTimeUtc
  ) {
    throw 'Evidence file changed while being read; refusing ambiguous producer output.'
  }
  return Assert-AndSanitizeEvidence -Evidence ($content | ConvertFrom-Json)
}

function Resolve-EvidenceProducerIdentity {
  param(
    [Parameter(Mandatory = $true)][object]$RecordedIdentity,
    [scriptblock]$IdentityResolver = {
      param($processId)
      Get-OwnedProcessIdentity -ProcessId $processId
    },
    [scriptblock]$ExactCreationResolver = {
      param($processId)
      (Get-Process -Id $processId -ErrorAction Stop).StartTime.ToUniversalTime()
    },
    [scriptblock]$Sleeper = {
      param($milliseconds)
      [Threading.Thread]::Sleep($milliseconds)
    },
    [ValidateRange(1, 100)][int]$Attempts = 20
  )

  $processId = [int](
    Get-OptionalProperty -InputObject $RecordedIdentity -Name 'pid' -Default 0
  )
  $candidate = $RecordedIdentity
  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    $current = & $IdentityResolver $processId
    if ($null -eq $current) {
      throw 'Evidence producer exited before exact identity reconciliation.'
    }
    $candidate = @(
      Merge-OwnedProcessSnapshots -Recorded @($candidate) -Current @($current)
    )[0]
    $executable = [string](
      Get-OptionalProperty -InputObject $candidate -Name 'executable' -Default ''
    )
    $commandLine = [string](
      Get-OptionalProperty -InputObject $candidate -Name 'commandLine' -Default ''
    )
    if (
      -not [string]::IsNullOrWhiteSpace($executable) -and
      -not [string]::IsNullOrWhiteSpace($commandLine)
    ) {
      $observedCreation = [datetime]::Parse(
        [string](
          Get-OptionalProperty -InputObject $candidate -Name 'creationTime' -Default ''
        ),
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AdjustToUniversal
      ).ToUniversalTime()
      $exactCreation = ([datetime](& $ExactCreationResolver $processId)).ToUniversalTime()
      if (
        ($observedCreation.Ticks - ($observedCreation.Ticks % 10)) -ne
          ($exactCreation.Ticks - ($exactCreation.Ticks % 10))
      ) {
        throw 'Evidence producer creation identity drifted during exact reconciliation.'
      }
      $candidate.creationTime = $exactCreation.ToString('o')
      return $candidate
    }
    & $Sleeper 25
  }
  throw 'Evidence producer identity remained incomplete after bounded reconciliation.'
}

function Stop-IdentityBoundProcessTree {
  param(
    [Parameter(Mandatory = $true)][object]$RootIdentity,
    [Parameter(Mandatory = $true)][object[]]$Descendants,
    [int[]]$ProtectedPids = @(),
    [scriptblock]$IdentityResolver,
    [scriptblock]$IdentityComparer,
    [scriptblock]$ProcessStopper
  )

  if ($null -eq $IdentityResolver) {
    $IdentityResolver = { param($processId) Get-OwnedProcessIdentity -ProcessId $processId }
  }
  if ($null -eq $IdentityComparer) {
    $IdentityComparer = {
      param($expected, $actual)
      Test-OwnedProcessIdentityEqual -Expected $expected -Actual $actual
    }
  }
  if ($null -eq $ProcessStopper) {
    $ProcessStopper = { param($processId) Stop-Process -Id $processId -ErrorAction Stop }
  }
  $stopped = @()
  $errors = @()
  foreach ($recorded in @($Descendants | Sort-Object `
        @{ Expression = { [datetime]::Parse([string]$_.creationTime) }; Descending = $true },
        @{ Expression = { [int]$_.pid }; Descending = $true })) {
    if ($ProtectedPids -contains [int]$recorded.pid) {
      $errors += [ordered]@{ category = 'protected-identity'; pid = [int]$recorded.pid }
      continue
    }
    try {
      $current = & $IdentityResolver ([int]$recorded.pid)
    }
    catch {
      $errors += [ordered]@{ category = 'resolver-failed'; pid = [int]$recorded.pid }
      continue
    }
    if ($null -eq $current) {
      continue
    }
    try {
      $identityMatches = & $IdentityComparer $recorded $current
    }
    catch {
      $errors += [ordered]@{ category = 'comparer-failed'; pid = [int]$recorded.pid }
      continue
    }
    if (-not $identityMatches) {
      $errors += [ordered]@{ category = 'identity-drift'; pid = [int]$recorded.pid }
      continue
    }
    try {
      & $ProcessStopper ([int]$recorded.pid)
      $stopped += [int]$recorded.pid
    }
    catch {
      $errors += [ordered]@{ category = 'stop-failed'; pid = [int]$recorded.pid }
    }
  }
  if ($ProtectedPids -contains [int]$RootIdentity.pid) {
    $errors += [ordered]@{ category = 'protected-identity'; pid = [int]$RootIdentity.pid }
  }
  else {
    try {
      $currentRoot = & $IdentityResolver ([int]$RootIdentity.pid)
    }
    catch {
      $currentRoot = $null
      $errors += [ordered]@{ category = 'resolver-failed'; pid = [int]$RootIdentity.pid }
    }
    if ($null -ne $currentRoot) {
      $rootComparisonFailed = $false
      try {
        $rootIdentityMatches = & $IdentityComparer $RootIdentity $currentRoot
      }
      catch {
        $rootComparisonFailed = $true
        $rootIdentityMatches = $false
        $errors += [ordered]@{ category = 'comparer-failed'; pid = [int]$RootIdentity.pid }
      }
      if (-not $rootComparisonFailed -and -not $rootIdentityMatches) {
        $errors += [ordered]@{ category = 'identity-drift'; pid = [int]$RootIdentity.pid }
      }
      elseif ($rootIdentityMatches) {
        try {
          & $ProcessStopper ([int]$RootIdentity.pid)
          $stopped += [int]$RootIdentity.pid
        }
        catch {
          $errors += [ordered]@{ category = 'stop-failed'; pid = [int]$RootIdentity.pid }
        }
      }
    }
  }
  return [ordered]@{
    stoppedPids = [object[]]$stopped
    errors = [object[]]$errors
  }
}

function Invoke-IdentityBoundCleanupLane {
  param(
    [Parameter(Mandatory = $true)][string]$Lane,
    [Parameter(Mandatory = $true)][object]$RootIdentity,
    [object[]]$RetainedDescendants = @(),
    [Parameter(Mandatory = $true)][object]$SessionOwner,
    [Parameter(Mandatory = $true)][datetime]$SessionStartedAtUtc,
    [int[]]$ProtectedPids = @(),
    [scriptblock]$DescendantResolver,
    [scriptblock]$SnapshotMerger,
    [scriptblock]$AncestryValidator,
    [scriptblock]$IdentityResolver,
    [scriptblock]$IdentityComparer,
    [scriptblock]$ProcessStopper
  )

  if ($null -eq $DescendantResolver) {
    $DescendantResolver = {
      param($rootProcessId)
      Get-OwnedDescendantIdentities -RootIdentity $RootIdentity
    }
  }
  if ($null -eq $SnapshotMerger) {
    $SnapshotMerger = {
      param($recorded, $current)
      Merge-OwnedProcessSnapshots `
        -Recorded $recorded `
        -Current $current `
        -PruneAbsentRecorded
    }
  }
  if ($null -eq $AncestryValidator) {
    $AncestryValidator = {
      param($snapshot, $startedAt)
      Assert-OwnedProcessAncestry -Snapshot $snapshot -SessionStartedAtUtc $startedAt
    }
  }

  $errors = @()
  $provenDescendants = @($RetainedDescendants)
  try {
    $currentDescendants = @(& $DescendantResolver ([int]$RootIdentity.pid))
    $candidateDescendants = @(
      & $SnapshotMerger ([object[]]$RetainedDescendants) ([object[]]$currentDescendants)
    )
    & $AncestryValidator ([ordered]@{
        sessionOwner = $SessionOwner
        root = $RootIdentity
        descendants = [object[]]$candidateDescendants
      }) $SessionStartedAtUtc
    $provenDescendants = $candidateDescendants
  }
  catch {
    $errors += "$Lane/validation-failed"
  }

  try {
    $cleanupResult = Stop-IdentityBoundProcessTree `
      -RootIdentity $RootIdentity `
      -Descendants $provenDescendants `
      -ProtectedPids $ProtectedPids `
      -IdentityResolver $IdentityResolver `
      -IdentityComparer $IdentityComparer `
      -ProcessStopper $ProcessStopper
    foreach ($errorRecord in $cleanupResult.errors) {
      $errors += "$Lane/$($errorRecord.category)/$($errorRecord.pid)"
    }
  }
  catch {
    $cleanupResult = [ordered]@{ stoppedPids = @(); errors = @() }
    $errors += "$Lane/stop-orchestration-failed"
  }

  return [ordered]@{
    provenDescendants = [object[]]$provenDescendants
    stoppedPids = [object[]]$cleanupResult.stoppedPids
    errors = [object[]]$errors
  }
}

function Invoke-ContainedDevSession {
  $npm = Get-Command npm.cmd -ErrorAction Stop
  $sessionOwner = Get-OwnedProcessIdentity -ProcessId $PID
  if ($null -eq $sessionOwner) {
    throw 'Runner process identity is unavailable for the contained dev session.'
  }
  $protectedPids = @($protectedBefore.processes | ForEach-Object { [int]$_.pid })
  $viteProcess = $null
  $viteRoot = $null
  $viteDescendants = @()
  $nativeProcess = $null
  $nativeRoot = $null
  $nativeDescendants = @()
  $validatedEvidence = $null
  $primaryFailure = $null
  $viteLogRoot = Ensure-ContainedDirectory -Root $SessionRoot -RelativePath 'logs'
  $viteStandardOutputPath = Join-Path $viteLogRoot 'vite.stdout.log'
  $viteStandardErrorPath = Join-Path $viteLogRoot 'vite.stderr.log'
  $nativeLogRoot = $viteLogRoot
  $nativeStandardOutputPath = Join-Path $nativeLogRoot 'native.stdout.log'
  $nativeStandardErrorPath = Join-Path $nativeLogRoot 'native.stderr.log'
  $viteWorkingDirectory = Get-AbsolutePath -Path (Join-Path $RepoRoot 'app')
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $viteWorkingDirectory
  $viteLaunchEnvironment = [ordered]@{}
  foreach ($entry in $viteEnvironment.GetEnumerator()) {
    $viteLaunchEnvironment[$entry.Key] = $entry.Value
  }
  $viteLaunchEnvironment.VIBESPACE_VITE_CACHE_DIR = $absoluteDirectories['vite/cache']
  $viteArguments = @(
    'exec',
    '--',
    'vite',
    '--host',
    '127.0.0.1',
    '--port',
    [string]$SelectedPort,
    '--strictPort'
  )
  try {
    $savedViteEnvironment = @{}
    foreach ($entry in $viteLaunchEnvironment.GetEnumerator()) {
      $savedViteEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key)
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value)
    }
    try {
      # Release only for the single exact Vite launch, then authenticate the
      # listener against this recorded owned tree.
      $PortReservation.listener.Stop()
      $viteProcess = Start-Process `
        -FilePath $npm.Source `
        -ArgumentList $viteArguments `
        -WorkingDirectory $viteWorkingDirectory `
        -RedirectStandardOutput $viteStandardOutputPath `
        -RedirectStandardError $viteStandardErrorPath `
        -PassThru
    }
    finally {
      foreach ($entry in $viteLaunchEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $savedViteEnvironment[$entry.Key])
      }
    }
    $viteRoot = Get-OwnedProcessIdentity -ProcessId $viteProcess.Id
    if ($null -eq $viteRoot) {
      throw 'Vite exited before its exact identity could be recorded.'
    }
    if ($protectedPids -contains [int]$viteRoot.pid) {
      throw 'Protected PID overlap detected for the Vite root.'
    }

    $listenerIdentity = $null
    $listenerDeadline = [datetime]::UtcNow.AddSeconds(30)
    while ([datetime]::UtcNow -lt $listenerDeadline -and $null -eq $listenerIdentity) {
      if ($viteProcess.HasExited) {
        throw 'Vite exited before binding its reserved loopback port.'
      }
      $candidateViteDescendants = @(
        Merge-OwnedProcessSnapshots `
          -Recorded $viteDescendants `
          -Current @(Get-OwnedDescendantIdentities -RootIdentity $viteRoot) `
          -PruneAbsentRecorded
      )
      if (
        @(
          $candidateViteDescendants |
            Where-Object { $protectedPids -contains [int]$_.pid }
        ).Count
      ) {
        throw 'Protected PID overlap detected in the Vite tree.'
      }
      Assert-OwnedProcessAncestry `
        -Snapshot ([ordered]@{
          sessionOwner = $sessionOwner
          root = $viteRoot
          descendants = [object[]]$candidateViteDescendants
        }) `
        -SessionStartedAtUtc $SessionStartedAtUtc
      $viteDescendants = $candidateViteDescendants
      $connections = @(
        Get-NetTCPConnection `
          -State Listen `
          -LocalAddress '127.0.0.1' `
          -LocalPort $SelectedPort `
          -ErrorAction SilentlyContinue
      )
      if ($connections.Count -gt 1) {
        throw 'Reserved Vite port has ambiguous listener ownership.'
      }
      if ($connections.Count -eq 1) {
        $allowedPids = @([int]$viteRoot.pid) + @(
          $viteDescendants | ForEach-Object { [int]$_.pid }
        )
        if ($allowedPids -notcontains [int]$connections[0].OwningProcess) {
          throw 'Reserved Vite port was captured by a process outside the exact Vite tree.'
        }
        $listenerIdentity = Get-OwnedProcessIdentity `
          -ProcessId ([int]$connections[0].OwningProcess)
      }
      [Threading.Thread]::Sleep(100)
    }
    if ($null -eq $listenerIdentity) {
      throw 'Vite did not bind the exact reserved loopback port before its deadline.'
    }

    # The native producer validates this regular, non-reparse file as session
    # path authority before it will atomically publish evidence. Publish the
    # already-sanitized NOT_RUN report before launch; the final report replaces
    # it only after authenticated evidence and cleanup complete.
    Write-JsonFile -Path $manifestPath -Value $report

    $nativeEnvironment = [ordered]@{
      VIBESPACE_RUNTIME_PROFILE = $RuntimeProfile
      VIBESPACE_MONOCHROME_SESSION_NONCE_HASH = $NonceHash
      VIBESPACE_MONOCHROME_EVIDENCE_PATH = Join-Path $SessionRoot 'evidence\native-evidence.json'
      VIBESPACE_MONOCHROME_EVIDENCE_TOKEN = $EvidenceToken
      CARGO_HOME = $cargoHome
      RUSTUP_HOME = $rustupHome
      CARGO_TARGET_DIR = $absoluteDirectories['native/cargo-target']
      VIBESPACE_MONOCHROME_PROFILE_ROOT = $absoluteDirectories['native/profile']
      VIBESPACE_MONOCHROME_APP_DATA_ROOT = $absoluteDirectories['native/profile/appdata']
      APPDATA = $absoluteDirectories['native/profile/appdata']
      LOCALAPPDATA = $absoluteDirectories['native/profile/localappdata']
      USERPROFILE = $absoluteDirectories['native/profile/userprofile']
      HOME = $absoluteDirectories['native/profile/home']
      HOMEDRIVE = $absoluteDirectories['native/profile/home-drive']
      HOMEPATH = $absoluteDirectories['native/profile/home-path']
      WEBVIEW2_USER_DATA_FOLDER = $absoluteDirectories['native/profile/webview2']
      TEMP = $absoluteDirectories['native/profile/temp']
      TMP = $absoluteDirectories['native/profile/temp']
    }
    $savedNativeEnvironment = @{}
    foreach ($entry in $nativeEnvironment.GetEnumerator()) {
      $savedNativeEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key)
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value)
    }
    try {
      $nativeProcess = Start-Process `
        -FilePath $npm.Source `
        -ArgumentList @(
          '--prefix',
          'app',
          'run',
          'tauri',
          '--',
          'dev',
          '--no-watch',
          '--config',
          $overridePath
        ) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $nativeStandardOutputPath `
        -RedirectStandardError $nativeStandardErrorPath `
        -PassThru
    }
    finally {
      foreach ($entry in $nativeEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $savedNativeEnvironment[$entry.Key])
      }
    }
    $nativeRoot = Get-OwnedProcessIdentity -ProcessId $nativeProcess.Id
    if ($null -eq $nativeRoot) {
      throw 'Native dev root exited before its exact identity could be recorded.'
    }
    if ($protectedPids -contains [int]$nativeRoot.pid) {
      throw 'Protected PID overlap detected for the native dev root.'
    }

    $deadline = [datetime]::UtcNow.AddSeconds($EvidenceTimeoutSeconds)
    while ([datetime]::UtcNow -lt $deadline -and $null -eq $validatedEvidence) {
      if ($viteProcess.HasExited) {
        throw 'Vite exited before authenticated evidence reached PASS.'
      }
      if ($nativeProcess.HasExited) {
        throw 'Native dev root exited before authenticated evidence reached PASS.'
      }
      $candidateNativeDescendants = @(
        Merge-OwnedProcessSnapshots `
          -Recorded $nativeDescendants `
          -Current @(Get-OwnedDescendantIdentities -RootIdentity $nativeRoot) `
          -PruneAbsentRecorded
      )
      Assert-OwnedProcessAncestry `
        -Snapshot ([ordered]@{
          sessionOwner = $sessionOwner
          root = $nativeRoot
          descendants = [object[]]$candidateNativeDescendants
        }) `
        -SessionStartedAtUtc $SessionStartedAtUtc
      $nativeDescendants = $candidateNativeDescendants
      $validatedEvidence = Read-ValidatedEvidenceFile
      if ($null -ne $validatedEvidence) {
        $producerPid = [int]$validatedEvidence.producer.pid
        $producer = @(
          (@($nativeRoot) + $nativeDescendants) |
            Where-Object { [int]$_.pid -eq $producerPid }
        )
        if ($producer.Count -ne 1) {
          throw 'Evidence producer is outside or ambiguous within the native dev tree.'
        }
        $producerIdentity = Resolve-EvidenceProducerIdentity -RecordedIdentity $producer[0]
        $producerMetadata = ConvertTo-OwnedProcessMetadata -Process $producerIdentity
        if (
          [string]$producerMetadata.creationTimeHash -cne
            [string]$validatedEvidence.producer.creationTimeHash -or
          [string]$producerMetadata.executableHash -cne
            [string]$validatedEvidence.producer.executableHash -or
          [string]$producerMetadata.commandHash -cne
            [string]$validatedEvidence.producer.commandHash
        ) {
          throw 'Evidence producer identity hashes do not match the exact native dev process.'
        }
      }
      [Threading.Thread]::Sleep(250)
    }
    if ($null -eq $validatedEvidence) {
      throw 'Contained dev evidence deadline expired with producer fields NOT_RUN.'
    }
    $report.evidenceChannel.status = 'PASS'
    $report.evidenceChannel.result = $validatedEvidence
    $report.nativeEvidence = [ordered]@{
      profile = [string]$validatedEvidence.nativeHandshake.profile
      appIdentifier = [string]$validatedEvidence.nativeHandshake.appIdentifier
      capabilityIdentifier = [string]$validatedEvidence.nativeHandshake.capabilityIdentifier
      sessionNonceHash = [string]$validatedEvidence.nativeHandshake.sessionNonceHash
    }
    $report.harnessHandoff.status = 'READY'
    $report.runtimeHandshake.status = 'PASS'
    Set-ReportDeniedEffectsFromEvidence -Report $report -Evidence $validatedEvidence
    $report.productProducerDependency.status = 'SATISFIED_BY_ACTUAL_EVIDENCE'
    $report.devSessionLifecycle.status = 'PASS'
  }
  catch {
    $primaryFailure = $_
    throw
  }
  finally {
    $cleanupErrors = @()
    foreach ($lane in @('native', 'vite')) {
      $laneRoot = if ($lane -eq 'native') { $nativeRoot } else { $viteRoot }
      $laneDescendants = if ($lane -eq 'native') { $nativeDescendants } else { $viteDescendants }
      if ($null -eq $laneRoot) { continue }
      $laneResult = Invoke-IdentityBoundCleanupLane `
        -Lane $lane `
        -RootIdentity $laneRoot `
        -RetainedDescendants $laneDescendants `
        -SessionOwner $sessionOwner `
        -SessionStartedAtUtc $SessionStartedAtUtc `
        -ProtectedPids $protectedPids
      if ($lane -eq 'native') {
        $nativeDescendants = @($laneResult.provenDescendants)
      }
      else {
        $viteDescendants = @($laneResult.provenDescendants)
      }
      $cleanupErrors += @($laneResult.errors)
    }
    try {
      Assert-ProtectedStateStableAtBoundary
    }
    catch {
      $cleanupErrors += 'protected-state/assertion-failed'
    }
    if ($cleanupErrors.Count -gt 0) {
      if ($null -ne $primaryFailure) {
        throw (
          "Contained dev session failed: $($primaryFailure.Exception.Message) " +
          "Cleanup errors: $($cleanupErrors -join ', ')."
        )
      }
      throw "Identity cleanup completed with categorical errors: $($cleanupErrors -join ', ')."
    }
  }
}

function Assert-IsolatedNativeBuildArtifactPath {
  param(
    [Parameter(Mandatory = $true)][string]$NativeBuildRoot,
    [Parameter(Mandatory = $true)][string]$Candidate
  )

  if (-not (Test-IsContainedPath -Root $NativeBuildRoot -Candidate $Candidate)) {
    throw 'Optimized native executable escaped the isolated cargo target.'
  }
}

function Invoke-OptimizedNativeChild {
  $executable = Get-AbsolutePath -Path (
    Join-Path $absoluteDirectories['native/cargo-target'] 'release\jarvis.exe'
  )
  Assert-IsolatedNativeBuildArtifactPath `
    -NativeBuildRoot $absoluteDirectories['native/cargo-target'] `
    -Candidate $executable
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $executable
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'Optimized native executable is missing from the isolated cargo target.'
  }
  $executableItem = Get-Item -LiteralPath $executable -Force
  if (($executableItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Optimized native executable is a reparse point.'
  }

  $childEnvironment = [ordered]@{
    VIBESPACE_RUNTIME_PROFILE = $RuntimeProfile
    VIBESPACE_MONOCHROME_SESSION_NONCE_HASH = $NonceHash
    VIBESPACE_MONOCHROME_EVIDENCE_PATH = (
      Join-Path $SessionRoot 'evidence\native-evidence.json'
    )
    VIBESPACE_MONOCHROME_EVIDENCE_TOKEN = $EvidenceToken
    APPDATA = $absoluteDirectories['native/profile/appdata']
    LOCALAPPDATA = $absoluteDirectories['native/profile/localappdata']
    USERPROFILE = $absoluteDirectories['native/profile/userprofile']
    HOME = $absoluteDirectories['native/profile/home']
    WEBVIEW2_USER_DATA_FOLDER = $absoluteDirectories['native/profile/webview2']
    TEMP = $absoluteDirectories['native/profile/temp']
    TMP = $absoluteDirectories['native/profile/temp']
  }
  $homeRoot = [System.IO.Path]::GetPathRoot($childEnvironment.HOME)
  $childEnvironment.HOMEDRIVE = $homeRoot.TrimEnd('\')
  $childEnvironment.HOMEPATH = $childEnvironment.HOME.Substring(
    $homeRoot.TrimEnd('\').Length
  )

  $environmentKeys = @($childEnvironment.Keys) + @('CARGO_HOME', 'RUSTUP_HOME')
  $savedEnvironment = @{}
  foreach ($key in $environmentKeys) {
    $savedEnvironment[$key] = [System.Environment]::GetEnvironmentVariable(
      $key,
      [System.EnvironmentVariableTarget]::Process
    )
  }

  $sessionOwnerIdentity = Get-OwnedProcessIdentity -ProcessId $PID
  if ($null -eq $sessionOwnerIdentity) {
    throw 'Runner process identity is unavailable.'
  }
  $nativeProcess = $null
  $candidateRootIdentity = $null
  $rootIdentity = $null
  $protectedPids = @($protectedBefore.processes | ForEach-Object { [int]$_.pid })
  $trackedDescendants = @{}
  $stoppedPids = @()
  $evidenceConfirmed = $false
  $report.ownedProcesses.status = 'STARTING'
  $report.ownedProcesses.sessionOwner = ConvertTo-OwnedProcessMetadata -Process $sessionOwnerIdentity
  Write-JsonFile -Path $manifestPath -Value $report
  try {
    try {
      foreach ($entry in $childEnvironment.GetEnumerator()) {
        [System.Environment]::SetEnvironmentVariable(
          $entry.Key,
          [string]$entry.Value,
          [System.EnvironmentVariableTarget]::Process
        )
      }
      [System.Environment]::SetEnvironmentVariable(
        'CARGO_HOME',
        $null,
        [System.EnvironmentVariableTarget]::Process
      )
      [System.Environment]::SetEnvironmentVariable(
        'RUSTUP_HOME',
        $null,
        [System.EnvironmentVariableTarget]::Process
      )
      $nativeProcess = Start-Process `
        -FilePath $executable `
        -WorkingDirectory ([System.IO.Path]::GetDirectoryName($executable)) `
        -PassThru
    }
    finally {
      foreach ($key in $environmentKeys) {
        [System.Environment]::SetEnvironmentVariable(
          $key,
          $savedEnvironment[$key],
          [System.EnvironmentVariableTarget]::Process
        )
      }
    }

    if ($null -eq $nativeProcess) {
      throw 'Optimized native child did not return an owned process identity.'
    }
    $candidateRootIdentity = Get-OwnedProcessIdentity -ProcessId $nativeProcess.Id
    if ($null -eq $candidateRootIdentity) {
      throw 'Optimized native child exited before its identity could be recorded.'
    }
    Assert-OwnedProcessAncestry `
      -Snapshot ([ordered]@{
        sessionOwner = $sessionOwnerIdentity
        root = $candidateRootIdentity
        descendants = @()
      }) `
      -SessionStartedAtUtc $SessionStartedAtUtc
    if (
      -not [string]::Equals(
        (Get-AbsolutePath -Path $candidateRootIdentity.executable),
        $executable,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      throw 'Optimized native child executable identity does not match the built artifact.'
    }

    if ($protectedPids -contains [int]$candidateRootIdentity.pid) {
      throw 'Protected PID overlap detected for the optimized native child.'
    }
    $rootIdentity = $candidateRootIdentity

    $report.ownedProcesses.status = 'RUNNING'
    $report.ownedProcesses.sessionOwner = ConvertTo-OwnedProcessMetadata -Process $sessionOwnerIdentity
    $report.ownedProcesses.root = ConvertTo-OwnedProcessMetadata -Process $rootIdentity
    Write-JsonFile -Path $manifestPath -Value $report

    $deadline = [datetime]::UtcNow.AddSeconds($EvidenceTimeoutSeconds)
    while ([datetime]::UtcNow -lt $deadline) {
      if ($nativeProcess.HasExited) {
        throw 'Optimized native child exited before authenticated evidence reached PASS.'
      }
      $currentDescendants = @(
        Get-OwnedDescendantIdentities -RootIdentity $rootIdentity
      )
      foreach ($descendant in $currentDescendants) {
        $descendantPid = [int]$descendant.pid
        if ($protectedPids -contains $descendantPid) {
          throw 'Protected PID overlap detected in the optimized native descendant tree.'
        }
      }
      $candidateDescendants = @(
        Merge-OwnedProcessSnapshots `
          -Recorded ([object[]]$trackedDescendants.Values) `
          -Current $currentDescendants `
          -PruneAbsentRecorded
      )
      Assert-OwnedProcessAncestry `
        -Snapshot ([ordered]@{
          sessionOwner = $sessionOwnerIdentity
          root = $rootIdentity
          descendants = [object[]]$candidateDescendants
        }) `
        -SessionStartedAtUtc $SessionStartedAtUtc
      $trackedDescendants = @{}
      foreach ($descendant in $candidateDescendants) {
        $trackedDescendants[[int]$descendant.pid] = $descendant
      }
      $validatedEvidence = Read-ValidatedEvidenceFile
      if ($null -ne $validatedEvidence) {
        $currentProducer = Get-OwnedProcessIdentity `
          -ProcessId ([int]$validatedEvidence.producer.pid)
        if (
          $null -eq $currentProducer -or
          [int]$validatedEvidence.producer.pid -ne [int]$rootIdentity.pid -or
          -not (Test-OwnedProcessIdentityEqual -Expected $rootIdentity -Actual $currentProducer)
        ) {
          throw 'Evidence producer is not the current exact optimized native root identity.'
        }
        $exactProducer = Resolve-EvidenceProducerIdentity -RecordedIdentity $currentProducer
        $producerMetadata = ConvertTo-OwnedProcessMetadata -Process $exactProducer
        if (
          [string]$producerMetadata.creationTimeHash -cne
            [string]$validatedEvidence.producer.creationTimeHash -or
          [string]$producerMetadata.executableHash -cne
            [string]$validatedEvidence.producer.executableHash -or
          [string]$producerMetadata.commandHash -cne
            [string]$validatedEvidence.producer.commandHash
        ) {
          throw 'Evidence producer identity hashes do not match the optimized native root.'
        }
        $evidenceConfirmed = $true
        $report.evidenceChannel.status = 'PASS'
        $report.evidenceChannel.result = $validatedEvidence
        $report.nativeEvidence = [ordered]@{
          profile = [string]$validatedEvidence.nativeHandshake.profile
          appIdentifier = [string]$validatedEvidence.nativeHandshake.appIdentifier
          capabilityIdentifier = [string]$validatedEvidence.nativeHandshake.capabilityIdentifier
          sessionNonceHash = [string]$validatedEvidence.nativeHandshake.sessionNonceHash
        }
        $report.harnessHandoff.status = 'READY'
        $report.runtimeHandshake.status = 'PASS'
        Set-ReportDeniedEffectsFromEvidence -Report $report -Evidence $validatedEvidence
        $report.outcomes.optimizedExecutable = [ordered]@{
          status = 'PASS'
          evidence = [ordered]@{
            relativePath = "$NativeCargoTargetRelativePath/release/jarvis.exe"
            sha256 = Get-FileSha256 -Path $executable
            sizeBytes = [int64]$executableItem.Length
            producer = $producerMetadata
            commit = $Commit
            identifier = $Identifier
          }
        }
        $report.productProducerDependency.status = 'SATISFIED_BY_ACTUAL_EVIDENCE'
        break
      }
      [System.Threading.Thread]::Sleep(250)
    }
    if (-not $evidenceConfirmed) {
      throw "Authenticated native evidence did not reach PASS within $EvidenceTimeoutSeconds seconds."
    }
  }
  finally {
    $cleanupErrors = @()
    try {
      Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $SessionRoot
      Assert-NoReparsePathComponents `
        -TrustedRoot $RepoRoot `
        -Candidate $absoluteDirectories['native/profile']
    }
    catch {
      $cleanupErrors += 'optimized/path-validation-failed'
    }
    try {
      $protectedAfterRun = ConvertTo-ProtectedMetadata -Snapshot (Get-ProtectedAfterSnapshot)
      if (
        ($protectedAfterRun | ConvertTo-Json -Depth 20 -Compress) -cne
        ($protectedBefore | ConvertTo-Json -Depth 20 -Compress)
      ) {
        throw 'Protected state drift.'
      }
    }
    catch {
      $cleanupErrors += 'protected-state/assertion-failed'
    }

    if ($null -ne $rootIdentity) {
      $cleanupResult = Invoke-IdentityBoundCleanupLane `
        -Lane 'optimized' `
        -RootIdentity $rootIdentity `
        -RetainedDescendants ([object[]]$trackedDescendants.Values) `
        -SessionOwner $sessionOwnerIdentity `
        -SessionStartedAtUtc $SessionStartedAtUtc `
        -ProtectedPids $protectedPids
      $trackedDescendants = @{}
      foreach ($descendant in $cleanupResult.provenDescendants) {
        $trackedDescendants[[int]$descendant.pid] = $descendant
      }
      $cleanupErrors += @($cleanupResult.errors)
      $stoppedPids = @($cleanupResult.stoppedPids)
    }
    $report.ownedProcesses.descendants = [object[]]@(
      $trackedDescendants.Values |
      Sort-Object { [int]$_.pid } |
      ForEach-Object { ConvertTo-OwnedProcessMetadata -Process $_ }
    )
    $report.ownedProcesses.stoppedPids = [object[]]$stoppedPids
    if ($cleanupErrors.Count -gt 0) {
      throw "Identity cleanup completed with categorical errors: $($cleanupErrors -join ', ')."
    }
  }

  $report.ownedProcesses.status = 'EVIDENCE_CONFIRMED_AND_IDENTITY_CLEANED'
  $report.ownedProcesses['exitCode'] = if ($nativeProcess.HasExited) {
    [int]$nativeProcess.ExitCode
  }
  else {
    $null
  }
  $report['execution'] = [ordered]@{
    status = 'OPTIMIZED_NATIVE_EVIDENCE_PASS'
    exitCode = $report.ownedProcesses.exitCode
    runtimeHandshake = [string]$report.runtimeHandshake.status
    deniedEffects = [string]$report.deniedEffects.status
    profileDisposition = 'PRESERVED_FOR_EVIDENCE'
  }
}

if ($BuildReleaseExecutable) {
  $PortReservation.listener.Stop()
  Invoke-IsolatedBuild -Arguments $releaseArguments -ConfigPath $releaseOverridePath
  Invoke-OptimizedNativeChild
}
elseif ($BuildUnsignedNsisArtifact) {
  $PortReservation.listener.Stop()
  Invoke-IsolatedBuild -Arguments $nsisArguments -ConfigPath $nsisOverridePath
  $artifactPath = Get-AbsolutePath -Path (
    Join-Path $RepoRoot $expectedArtifactRelativePath
  )
  Assert-NoReparsePathComponents -TrustedRoot $RepoRoot -Candidate $artifactPath
  $artifactItem = Get-Item -LiteralPath $artifactPath -Force
  if (
    $artifactItem.PSIsContainer -or
    ($artifactItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or
    $artifactItem.Length -le 0
  ) {
    throw 'Unsigned NSIS artifact must be a positive-size regular non-reparse file.'
  }
  $report.outcomes.unsignedNsisArtifact = [ordered]@{
    status = 'PASS'
    evidence = [ordered]@{
      relativePath = $expectedArtifactRelativePath
      sha256 = Get-FileSha256 -Path $artifactPath
      sizeBytes = [int64]$artifactItem.Length
      configHash = Get-FileSha256 -Path $nsisOverridePath
      commit = $Commit
      identifier = $Identifier
    }
  }
  $report['execution'] = [ordered]@{
    status = 'UNSIGNED_NSIS_ARTIFACT_VERIFIED_INSTALLER_NOT_LAUNCHED'
    installerLaunch = $false
    signing = $false
    publishing = $false
  }
}
elseif ($RunContainedDevSession) {
  Invoke-ContainedDevSession
  $report['execution'] = [ordered]@{
    status = 'CONTAINED_DEV_EVIDENCE_PASS'
    runtimeHandshake = [string]$report.runtimeHandshake.status
    deniedEffects = [string]$report.deniedEffects.status
    harnessHandoff = [string]$report.harnessHandoff.status
  }
}
elseif ($RunCargoLibraryTests) {
  Invoke-ContainedCargoLibraryTests
}

Assert-ProtectedStateStableAtBoundary
Write-JsonFile -Path $manifestPath -Value $report
$report | ConvertTo-Json -Depth 32 -Compress
