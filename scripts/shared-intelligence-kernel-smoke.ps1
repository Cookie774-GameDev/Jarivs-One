[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Validate')]
    [switch]$ValidateOnly,

    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [ValidateNotNullOrEmpty()]
    [Alias('EvidenceDir')]
    [string]$EvidenceDirectory,

    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [ValidateNotNullOrEmpty()]
    [string[]]$Scenarios
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot = $PSScriptRoot
$RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $ScriptRoot '..'))
$AppRoot = Join-Path $RepositoryRoot 'app'
$CargoManifest = Join-Path $AppRoot 'src-tauri\Cargo.toml'
$DriverPath = Join-Path $ScriptRoot 'shared-intelligence-kernel-smoke-driver.mjs'
$ExpectedNativeExecutable = Join-Path $AppRoot 'src-tauri\target\debug\jarvis.exe'
$SmokeCliDirectory = Join-Path $AppRoot 'src-tauri\target\debug\examples'
$TauriCommand = Join-Path $RepositoryRoot 'node_modules\.bin\tauri.cmd'
$ProfileBase = Join-Path ([IO.Path]::GetTempPath()) 'vibespace-sik-smoke-profiles'
$AllowedScenarios = @(
    'transport_provider_success',
    'transport_cli_success',
    'voice_turn_stop',
    'native_stt_voice_turn',
    'approval_safe_auto',
    'approval_confirm',
    'approval_dangerous',
    'artifact_provider',
    'artifact_file_action',
    'artifact_terminal',
    'schedule_dispatch',
    'schedule_transport_retry',
    'live_evidence_restart',
    'command_center_reduced_motion',
    'hive_dispatch',
    'partial_response',
    'provider_failure',
    'cancel_before_claim',
    'cancel_running',
    'cancel_completion_race'
)
$RestartScenarios = @(
    'schedule_transport_retry',
    'live_evidence_restart'
)
$ChildEnvironmentNames = @(
    'VITE_SIK_SMOKE',
    'VIBESPACE_SIK_SMOKE',
    'VIBESPACE_SIK_CDP_PORT',
    'VIBESPACE_SIK_PROFILE',
    'VIBESPACE_SIK_NONCE',
    'APPDATA',
    'LOCALAPPDATA',
    'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
    'WEBVIEW2_USER_DATA_FOLDER',
    'PATH'
)

function Get-CanonicalExistingPath {
    param([Parameter(Mandatory = $true)][string]$LiteralPath)

    return [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $LiteralPath -ErrorAction Stop).ProviderPath)
}

function Test-PathEqual {
    param(
        [Parameter(Mandatory = $true)][string]$Left,
        [Parameter(Mandatory = $true)][string]$Right
    )

    return [string]::Equals(
        [IO.Path]::GetFullPath($Left).TrimEnd('\', '/'),
        [IO.Path]::GetFullPath($Right).TrimEnd('\', '/'),
        [StringComparison]::OrdinalIgnoreCase
    )
}

function Test-StrictDescendantPath {
    param(
        [Parameter(Mandatory = $true)][string]$Child,
        [Parameter(Mandatory = $true)][string]$Parent
    )

    $canonicalChild = [IO.Path]::GetFullPath($Child).TrimEnd('\', '/')
    $canonicalParent = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    if ([string]::Equals($canonicalChild, $canonicalParent, [StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }
    return $canonicalChild.StartsWith(
        $canonicalParent + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase
    )
}

function Get-FreshLoopbackPort {
    param([int[]]$ExcludedPorts = @())

    while ($true) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
        $listener.Stop()
        if ($ExcludedPorts -notcontains $port) {
            return $port
        }
    }
}

function New-LowercaseHexNonce {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($bytes)
    $generator.Dispose()
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function Get-CimProcessSnapshot {
    return @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | ForEach-Object {
            $creationUtc = $null
            if ($null -ne $_.CreationDate) {
                $creationUtc = ([DateTime]$_.CreationDate).ToUniversalTime().ToString('O')
            }
            [pscustomobject]@{
                ProcessId       = [int]$_.ProcessId
                ParentProcessId = [int]$_.ParentProcessId
                ExecutablePath  = if ([string]::IsNullOrWhiteSpace($_.ExecutablePath)) {
                    $null
                }
                else {
                    [IO.Path]::GetFullPath([string]$_.ExecutablePath)
                }
                CreationUtc     = $creationUtc
            }
        })
}

function Get-Descendants {
    param(
        [Parameter(Mandatory = $true)][int]$RootPid,
        [Parameter(Mandatory = $true)][object[]]$Snapshot
    )

    $result = New-Object System.Collections.Generic.List[object]
    $frontier = @([pscustomobject]@{ ProcessId = $RootPid; Depth = 0 })
    $visited = @{}
    while ($frontier.Count -gt 0) {
        $current = $frontier[0]
        if ($frontier.Count -eq 1) {
            $frontier = @()
        }
        else {
            $frontier = @($frontier[1..($frontier.Count - 1)])
        }
        if ($visited.ContainsKey([string]$current.ProcessId)) {
            continue
        }
        $visited[[string]$current.ProcessId] = $true
        foreach ($child in @($Snapshot | Where-Object { $_.ParentProcessId -eq $current.ProcessId })) {
            $record = [pscustomobject]@{
                ProcessId       = $child.ProcessId
                ParentProcessId = $child.ParentProcessId
                ExecutablePath  = $child.ExecutablePath
                CreationUtc     = $child.CreationUtc
                Depth           = $current.Depth + 1
            }
            $result.Add($record)
            $frontier += [pscustomobject]@{ ProcessId = $child.ProcessId; Depth = $record.Depth }
        }
    }
    return @($result)
}

function Add-RecordedProcessTree {
    param(
        [Parameter(Mandatory = $true)][int]$RootPid,
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [object[]]$Snapshot = $(Get-CimProcessSnapshot)
    )

    $root = @($Snapshot | Where-Object { $_.ProcessId -eq $RootPid })
    $tree = @($root | ForEach-Object {
            [pscustomobject]@{
                ProcessId       = $_.ProcessId
                ParentProcessId = $_.ParentProcessId
                ExecutablePath  = $_.ExecutablePath
                CreationUtc     = $_.CreationUtc
                Depth           = 0
            }
        }) + @(Get-Descendants -RootPid $RootPid -Snapshot $Snapshot)
    foreach ($process in $tree) {
        if ($null -ne $process.CreationUtc -and $null -ne $process.ExecutablePath) {
            $key = [string]$process.ProcessId
            if (-not $Records.ContainsKey($key)) {
                $Records[$key] = [pscustomobject]@{
                    ProcessId      = $process.ProcessId
                    ParentProcessId = $process.ParentProcessId
                    ExecutablePath = $process.ExecutablePath
                    CreationUtc    = $process.CreationUtc
                    Depth          = $process.Depth
                }
            }
        }
    }
}

function Stop-RecordedProcessTree {
    param(
        [int]$RootPid,
        [Parameter(Mandatory = $true)][hashtable]$Records
    )

    if ($RootPid -le 0) {
        return
    }
    $snapshot = Get-CimProcessSnapshot
    $tree = @($snapshot | Where-Object { $Records.ContainsKey([string]$_.ProcessId) } | ForEach-Object {
            $recordedDepth = $Records[[string]$_.ProcessId].Depth
            [pscustomobject]@{
                ProcessId       = $_.ProcessId
                ParentProcessId = $_.ParentProcessId
                ExecutablePath  = $_.ExecutablePath
                CreationUtc     = $_.CreationUtc
                Depth           = $recordedDepth
            }
        })
    foreach ($process in @($tree | Sort-Object -Property Depth -Descending)) {
        $key = [string]$process.ProcessId
        if (-not $Records.ContainsKey($key)) {
            Write-Warning "Skipping unrecorded smoke descendant PID $($process.ProcessId)."
            continue
        }
        $recorded = $Records[$key]
        if (
            $null -eq $process.CreationUtc -or
            $null -eq $process.ExecutablePath -or
            $process.CreationUtc -ne $recorded.CreationUtc -or
            -not (Test-PathEqual -Left $process.ExecutablePath -Right $recorded.ExecutablePath)
        ) {
            Write-Warning "Skipping smoke PID $($process.ProcessId) because its identity changed."
            continue
        }
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForRecordedProcessTreeExit {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [Parameter(Mandatory = $true)][DateTime]$Deadline
    )

    while ([DateTime]::UtcNow -lt $Deadline) {
        $remaining = @(Get-CimProcessSnapshot | Where-Object {
                $key = [string]$_.ProcessId
                if (-not $Records.ContainsKey($key)) {
                    return $false
                }
                $recorded = $Records[$key]
                return (
                    $null -ne $_.CreationUtc -and
                    $null -ne $_.ExecutablePath -and
                    $_.CreationUtc -eq $recorded.CreationUtc -and
                    (Test-PathEqual -Left $_.ExecutablePath -Right $recorded.ExecutablePath)
                )
            })
        if ($remaining.Count -eq 0) {
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'kernel_smoke_process_tree_stop_timeout'
}

function Wait-ForNativeDescendant {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Launcher,
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [Parameter(Mandatory = $true)][string]$ExpectedExecutable,
        [Parameter(Mandatory = $true)][DateTime]$Deadline
    )

    while ([DateTime]::UtcNow -lt $Deadline) {
        if ($Launcher.HasExited) {
            throw "kernel_smoke_launcher_exited:$($Launcher.ExitCode)"
        }
        $snapshot = Get-CimProcessSnapshot
        Add-RecordedProcessTree -RootPid $Launcher.Id -Records $Records -Snapshot $snapshot
        $descendants = @(Get-Descendants -RootPid $Launcher.Id -Snapshot $snapshot)
        $wrongPathJarvis = @($descendants | Where-Object {
                $null -ne $_.ExecutablePath -and
                [IO.Path]::GetFileName($_.ExecutablePath) -ieq 'jarvis.exe' -and
                -not (Test-PathEqual -Left $_.ExecutablePath -Right $ExpectedExecutable)
            })
        if ($wrongPathJarvis.Count -ne 0) {
            throw 'kernel_smoke_native_wrong_path_descendant'
        }
        $matches = @($descendants | Where-Object {
                $null -ne $_.ExecutablePath -and
                (Test-PathEqual -Left $_.ExecutablePath -Right $ExpectedExecutable)
            })
        $allExactMatches = @($snapshot | Where-Object {
                $null -ne $_.ExecutablePath -and
                (Test-PathEqual -Left $_.ExecutablePath -Right $ExpectedExecutable)
            })
        $nonDescendantMatches = @($allExactMatches | Where-Object {
                $candidateId = $_.ProcessId
                $matches.ProcessId -notcontains $candidateId
            })
        if ($nonDescendantMatches.Count -ne 0) {
            throw 'kernel_smoke_native_non_descendant'
        }
        if ($matches.Count -gt 1) {
            throw 'kernel_smoke_native_ambiguous'
        }
        if ($matches.Count -eq 1 -and $null -ne $matches[0].CreationUtc) {
            return $matches[0]
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'kernel_smoke_native_descendant_timeout'
}

function Wait-ForCdpEndpoint {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][DateTime]$Deadline
    )

    while ([DateTime]::UtcNow -lt $Deadline) {
        $client = New-Object Net.Sockets.TcpClient
        $pending = $client.BeginConnect([Net.IPAddress]::Loopback, $Port, $null, $null)
        if ($pending.AsyncWaitHandle.WaitOne(250) -and $client.Connected) {
            $client.EndConnect($pending)
            $client.Dispose()
            return
        }
        $client.Dispose()
        Start-Sleep -Milliseconds 100
    }
    throw 'kernel_smoke_cdp_timeout'
}

function Save-Environment {
    param([Parameter(Mandatory = $true)][string[]]$Names)

    $saved = @{}
    foreach ($name in $Names) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    return $saved
}

function Restore-Environment {
    param([Parameter(Mandatory = $true)][hashtable]$Saved)

    foreach ($name in $Saved.Keys) {
        [Environment]::SetEnvironmentVariable($name, $Saved[$name], 'Process')
    }
}

function Set-ChildEnvironment {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Values
    )

    foreach ($name in $Values.Keys) {
        [Environment]::SetEnvironmentVariable($name, [string]$Values[$name], 'Process')
    }
}

function ConvertTo-ProcessArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Assert-StaticContract {
    $source = Get-Content -Raw -LiteralPath $PSCommandPath
    if (([regex]::Matches($source, '(?im)^\s*finally\s*\{')).Count -ne 1) {
        throw 'kernel_smoke_outer_finally_contract_invalid'
    }
    foreach ($required in @(
            '$Dev = $null',
            '127.0.0.1',
            'RandomNumberGenerator',
            'CreationUtc',
            'WindowStyle Hidden',
            '--expected-native-pid',
            '--expected-profile',
            '--expected-nonce',
            '$RestartScenarios',
            'phase$phase.driver.stdout.log',
            'kernel_smoke_restart_unexpected',
            'Wait-ForRecordedProcessTreeExit',
            'ExcludedPorts'
        )) {
        if (-not $source.Contains($required)) {
            throw "kernel_smoke_static_contract_missing:$required"
        }
    }
}

$Dev = $null
$Driver = $null
$Profile = $null
$CanonicalProfileBase = $null
$CanonicalEvidence = $null
$EnvironmentRestored = $false
$SavedEnvironment = Save-Environment -Names $ChildEnvironmentNames
$DevRecords = @{}
$DriverRecords = @{}
$DriverStandardOutput = $null
$DriverStandardError = $null

try {
    Assert-StaticContract
    if (-not (Test-Path -LiteralPath $DriverPath -PathType Leaf)) {
        throw 'kernel_smoke_driver_missing'
    }
    if (-not (Test-Path -LiteralPath $CargoManifest -PathType Leaf)) {
        throw 'kernel_smoke_cargo_manifest_missing'
    }
    if (-not (Test-Path -LiteralPath $TauriCommand -PathType Leaf)) {
        throw 'kernel_smoke_tauri_command_missing'
    }

    & node --check $DriverPath
    if ($LASTEXITCODE -ne 0) {
        throw 'kernel_smoke_driver_syntax_invalid'
    }
    & npm.cmd --prefix $RepositoryRoot ls playwright-core --depth=0
    $playwrightExitCode = $LASTEXITCODE
    if ($playwrightExitCode -ne 0) {
        throw 'kernel_smoke_playwright_prerequisite_missing'
    }

    if ($ValidateOnly) {
        Write-Output 'shared-intelligence-kernel-smoke validation passed'
        return
    }

    foreach ($scenario in $Scenarios) {
        if ($AllowedScenarios -notcontains $scenario) {
            throw "kernel_smoke_scenario_invalid:$scenario"
        }
    }
    if (@($Scenarios | Select-Object -Unique).Count -ne $Scenarios.Count) {
        throw 'kernel_smoke_scenarios_must_be_unique'
    }
    if (-not [IO.Path]::IsPathRooted($EvidenceDirectory)) {
        throw 'kernel_smoke_evidence_directory_must_be_absolute'
    }

    New-Item -ItemType Directory -Path $ProfileBase -Force | Out-Null
    $CanonicalProfileBase = Get-CanonicalExistingPath -LiteralPath $ProfileBase
    $runId = [Guid]::NewGuid().ToString('N').ToLowerInvariant()
    $Profile = Join-Path $CanonicalProfileBase $runId
    $appData = Join-Path $Profile 'AppData\Roaming'
    $localAppData = Join-Path $Profile 'AppData\Local'
    $webViewProfile = Join-Path $Profile 'WebView2'
    New-Item -ItemType Directory -Path $appData, $localAppData, $webViewProfile -Force | Out-Null
    $Profile = Get-CanonicalExistingPath -LiteralPath $Profile
    if (-not (Test-StrictDescendantPath -Child $Profile -Parent $CanonicalProfileBase)) {
        throw 'kernel_smoke_profile_containment_invalid'
    }
    $appData = Get-CanonicalExistingPath -LiteralPath $appData
    $localAppData = Get-CanonicalExistingPath -LiteralPath $localAppData
    $webViewProfile = Get-CanonicalExistingPath -LiteralPath $webViewProfile

    $expandedEvidence = [IO.Path]::GetFullPath($EvidenceDirectory)
    if (
        (Test-PathEqual -Left $expandedEvidence -Right $RepositoryRoot) -or
        (Test-StrictDescendantPath -Child $expandedEvidence -Parent $RepositoryRoot) -or
        (Test-PathEqual -Left $expandedEvidence -Right $Profile) -or
        (Test-StrictDescendantPath -Child $expandedEvidence -Parent $Profile) -or
        (Test-StrictDescendantPath -Child $Profile -Parent $expandedEvidence)
    ) {
        throw 'kernel_smoke_evidence_containment_invalid'
    }
    New-Item -ItemType Directory -Path $expandedEvidence -Force | Out-Null
    $CanonicalEvidence = Get-CanonicalExistingPath -LiteralPath $EvidenceDirectory
    if (
        -not (Test-PathEqual -Left $expandedEvidence -Right $CanonicalEvidence) -or
        (Test-PathEqual -Left $CanonicalEvidence -Right $RepositoryRoot) -or
        (Test-StrictDescendantPath -Child $CanonicalEvidence -Parent $RepositoryRoot) -or
        (Test-PathEqual -Left $CanonicalEvidence -Right $Profile) -or
        (Test-StrictDescendantPath -Child $CanonicalEvidence -Parent $Profile) -or
        (Test-StrictDescendantPath -Child $Profile -Parent $CanonicalEvidence)
    ) {
        throw 'kernel_smoke_evidence_containment_invalid'
    }

    $CdpPort = Get-FreshLoopbackPort
    $Nonce = New-LowercaseHexNonce
    if ($Nonce -notmatch '^[a-f0-9]{64}$') {
        throw 'kernel_smoke_nonce_generation_failed'
    }
    $tauriIdentifier = "ai.jarvis.desktop.smoke.s$runId"
    $tauriConfigPath = Join-Path $Profile 'tauri-smoke-config.json'
    $tauriConfigJson = @{ identifier = $tauriIdentifier } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText(
        $tauriConfigPath,
        $tauriConfigJson,
        (New-Object Text.UTF8Encoding($false))
    )

    & cargo build --manifest-path $CargoManifest --example vibespace_kernel_smoke_cli
    $cargoExitCode = $LASTEXITCODE
    if ($cargoExitCode -ne 0) {
        throw 'kernel_smoke_cli_build_failed'
    }

    $ExpectedNativeExecutable = [IO.Path]::GetFullPath($ExpectedNativeExecutable)
    $baseline = Get-CimProcessSnapshot
    $preexisting = @($baseline | Where-Object {
            $null -ne $_.ExecutablePath -and
            (Test-PathEqual -Left $_.ExecutablePath -Right $ExpectedNativeExecutable)
        })
    if ($preexisting.Count -ne 0) {
        throw 'kernel_smoke_native_preexisting'
    }

    $childEnvironment = @{
        VITE_SIK_SMOKE                       = '1'
        VIBESPACE_SIK_SMOKE                  = '1'
        VIBESPACE_SIK_CDP_PORT               = [string]$CdpPort
        VIBESPACE_SIK_PROFILE                = $Profile
        VIBESPACE_SIK_NONCE                  = $Nonce
        APPDATA                              = $appData
        LOCALAPPDATA                         = $localAppData
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$CdpPort --user-data-dir=`"$webViewProfile`""
        WEBVIEW2_USER_DATA_FOLDER            = $webViewProfile
        PATH                                 = "$SmokeCliDirectory$([IO.Path]::PathSeparator)$($SavedEnvironment['PATH'])"
    }
    Set-ChildEnvironment -Values $childEnvironment
    $Dev = Start-Process `
        -FilePath $TauriCommand `
        -ArgumentList @(
            'dev',
            '--no-watch',
            '--config',
            (ConvertTo-ProcessArgument -Value $tauriConfigPath)
        ) `
        -WorkingDirectory $AppRoot `
        -WindowStyle Hidden `
        -PassThru
    Restore-Environment -Saved $SavedEnvironment
    $EnvironmentRestored = $true

    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    $nativeMatch = Wait-ForNativeDescendant `
        -Launcher $Dev `
        -Records $DevRecords `
        -ExpectedExecutable $ExpectedNativeExecutable `
        -Deadline $deadline
    $NativePid = [int]$nativeMatch.ProcessId
    $NativeCreationUtc = $nativeMatch.CreationUtc
    if (-not $DevRecords.ContainsKey([string]$NativePid)) {
        throw 'kernel_smoke_native_creation_time_unrecorded'
    }
    if ($DevRecords[[string]$NativePid].CreationUtc -ne $NativeCreationUtc) {
        throw 'kernel_smoke_native_creation_time_mismatch'
    }

    Wait-ForCdpEndpoint -Port $CdpPort -Deadline $deadline

    foreach ($scenario in $Scenarios) {
        for ($phase = 1; $phase -le 2; $phase++) {
            $DriverRecords = @{}
            $DriverStandardOutput = Join-Path $CanonicalEvidence "$scenario.phase$phase.driver.stdout.log"
            $DriverStandardError = Join-Path $CanonicalEvidence "$scenario.phase$phase.driver.stderr.log"
            $driverArguments = @(
                $DriverPath,
                '--cdp-port', [string]$CdpPort,
                '--scenario', $scenario,
                '--evidence-dir', $CanonicalEvidence,
                '--expected-native-pid', [string]$NativePid,
                '--expected-profile', $Profile,
                '--expected-nonce', $Nonce
            ) | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }
            $Driver = Start-Process `
                -FilePath (Get-Command node -ErrorAction Stop).Source `
                -ArgumentList $driverArguments `
                -WorkingDirectory $RepositoryRoot `
                -WindowStyle Hidden `
                -RedirectStandardOutput $DriverStandardOutput `
                -RedirectStandardError $DriverStandardError `
                -PassThru
            while (-not $Driver.HasExited) {
                Add-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords
                Add-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
                Start-Sleep -Milliseconds 100
                $Driver.Refresh()
            }
            Add-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords
            $driverExitCode = $Driver.ExitCode
            if ($driverExitCode -eq 0) {
                $Driver = $null
                break
            }
            if ($driverExitCode -ne 10) {
                throw "kernel_smoke_driver_failed:${scenario}:$driverExitCode"
            }
            if ($RestartScenarios -notcontains $scenario -or $phase -ne 1) {
                throw "kernel_smoke_restart_unexpected:${scenario}:phase${phase}"
            }

            $Driver = $null
            $previousCdpPort = $CdpPort
            $previousNonce = $Nonce
            $previousNativePid = $NativePid
            Add-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
            Stop-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
            Wait-ForRecordedProcessTreeExit `
                -Records $DevRecords `
                -Deadline ([DateTime]::UtcNow.AddSeconds(30))
            $Dev = $null

            $remainingNative = @(Get-CimProcessSnapshot | Where-Object {
                    $null -ne $_.ExecutablePath -and
                    (Test-PathEqual -Left $_.ExecutablePath -Right $ExpectedNativeExecutable)
                })
            if ($remainingNative.Count -ne 0) {
                throw 'kernel_smoke_native_remained_after_restart_stop'
            }

            $CdpPort = Get-FreshLoopbackPort -ExcludedPorts @($previousCdpPort)
            $Nonce = New-LowercaseHexNonce
            if ($Nonce -notmatch '^[a-f0-9]{64}$' -or $Nonce -eq $previousNonce) {
                throw 'kernel_smoke_restart_nonce_generation_failed'
            }
            $childEnvironment.VIBESPACE_SIK_CDP_PORT = [string]$CdpPort
            $childEnvironment.VIBESPACE_SIK_NONCE = $Nonce
            $childEnvironment.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$CdpPort --user-data-dir=`"$webViewProfile`""

            $DevRecords = @{}
            $EnvironmentRestored = $false
            Set-ChildEnvironment -Values $childEnvironment
            $Dev = Start-Process `
                -FilePath $TauriCommand `
                -ArgumentList @(
                    'dev',
                    '--no-watch',
                    '--config',
                    (ConvertTo-ProcessArgument -Value $tauriConfigPath)
                ) `
                -WorkingDirectory $AppRoot `
                -WindowStyle Hidden `
                -PassThru
            Restore-Environment -Saved $SavedEnvironment
            $EnvironmentRestored = $true

            $deadline = [DateTime]::UtcNow.AddMinutes(5)
            $nativeMatch = Wait-ForNativeDescendant `
                -Launcher $Dev `
                -Records $DevRecords `
                -ExpectedExecutable $ExpectedNativeExecutable `
                -Deadline $deadline
            $NativePid = [int]$nativeMatch.ProcessId
            $NativeCreationUtc = $nativeMatch.CreationUtc
            if ($NativePid -eq $previousNativePid) {
                throw 'kernel_smoke_restart_native_pid_not_fresh'
            }
            if (-not $DevRecords.ContainsKey([string]$NativePid)) {
                throw 'kernel_smoke_native_creation_time_unrecorded'
            }
            if ($DevRecords[[string]$NativePid].CreationUtc -ne $NativeCreationUtc) {
                throw 'kernel_smoke_native_creation_time_mismatch'
            }
            Wait-ForCdpEndpoint -Port $CdpPort -Deadline $deadline
        }
    }
}
finally {
    if (-not $EnvironmentRestored) {
        Restore-Environment -Saved $SavedEnvironment
        $EnvironmentRestored = $true
    }
    if ($null -ne $Driver) {
        Add-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords
        Stop-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords
    }
    if ($null -ne $Dev) {
        Add-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
        Stop-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
    }
    if ($null -ne $Profile -and $null -ne $CanonicalProfileBase -and (Test-Path -LiteralPath $Profile)) {
        $canonicalRemovalTarget = Get-CanonicalExistingPath -LiteralPath $Profile
        if (-not (Test-StrictDescendantPath -Child $canonicalRemovalTarget -Parent $CanonicalProfileBase)) {
            throw 'kernel_smoke_cleanup_containment_invalid'
        }
        Remove-Item -LiteralPath $canonicalRemovalTarget -Recurse -Force
    }
}
