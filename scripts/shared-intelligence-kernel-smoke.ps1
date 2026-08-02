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
$LogicalNativeExecutable = Join-Path $AppRoot 'src-tauri\target\debug\jarvis.exe'
$ExpectedNativeExecutables = @([IO.Path]::GetFullPath($LogicalNativeExecutable))
$SmokeCliDirectory = Join-Path $AppRoot 'src-tauri\target\debug\examples'
$TauriCommand = Join-Path $RepositoryRoot 'node_modules\.bin\tauri.cmd'
$ProfileBase = Join-Path ([IO.Path]::GetTempPath()) 'vibespace-sik-smoke-profiles'
$Task22EvidenceBase = Join-Path $RepositoryRoot '.superpowers\sdd\evidence\task-22'
$NativeStartupTimeoutMinutes = 12
$DriverPhaseTimeoutMinutes = 10
$ProcessTreeCleanupTimeoutSeconds = 60
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
    'VITE_JARVIS_LOCAL_ADMIN',
    'VIBESPACE_SIK_SMOKE',
    'VIBESPACE_SIK_CDP_PORT',
    'VIBESPACE_SIK_PROFILE',
    'VIBESPACE_SIK_NONCE',
    'APPDATA',
    'LOCALAPPDATA',
    'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
    'WEBVIEW2_USER_DATA_FOLDER',
    'TAURI_CONFIG',
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

function Test-PathInSet {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string[]]$Allowed
    )

    foreach ($allowedPath in $Allowed) {
        if (Test-PathEqual -Left $Candidate -Right $allowedPath) {
            return $true
        }
    }
    return $false
}

function New-SmokeTauriConfigJson {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Identifier
    )

    return @{
        identifier = $Identifier
        app        = @{
            macOSPrivateApi = $true
            windows         = @(
                @{
                    label                     = 'main'
                    title                     = 'VibeSpace Smoke'
                    width                     = 1280
                    height                    = 820
                    minWidth                  = 800
                    minHeight                 = 600
                    decorations               = $true
                    resizable                 = $true
                    transparent               = $false
                    visible                   = $false
                    focus                     = $false
                    skipTaskbar               = $true
                    additionalBrowserArgs     = '--js-flags=--max-old-space-size=4096 --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding'
                }
            )
        }
    } | ConvertTo-Json -Compress -Depth 5
}

function Show-SmokeNativeWindowOffscreen {
    param(
        [Parameter(Mandatory = $true)][int]$NativePid,
        [Parameter(Mandatory = $true)][DateTime]$Deadline
    )

    if (-not ('VibeSpaceSmokeWindow' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class VibeSpaceSmokeWindow
{
    public delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SWP_NOOWNERZORDER = 0x0200;
    private const uint SWP_ASYNCWINDOWPOS = 0x4000;

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder className, int maximumCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(
        IntPtr window,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags
    );

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    public static long[] GetTauriWindows(uint targetProcessId)
    {
        var windows = new List<long>();
        EnumWindows((window, _) =>
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId == targetProcessId)
            {
                var className = new StringBuilder(128);
                GetClassName(window, className, className.Capacity);
                if (string.Equals(className.ToString(), "Tauri Window", StringComparison.Ordinal))
                {
                    windows.Add(window.ToInt64());
                }
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static bool MoveOffscreenWithoutActivation(long rawWindow)
    {
        var window = new IntPtr(rawWindow);
        return SetWindowPos(
            window,
            HWND_BOTTOM,
            -32000,
            -32000,
            1280,
            820,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS
        );
    }

    public static int[] ReadRect(long rawWindow)
    {
        Rect rect;
        if (!GetWindowRect(new IntPtr(rawWindow), out rect))
        {
            return Array.Empty<int>();
        }
        return new[] { rect.Left, rect.Top, rect.Right, rect.Bottom };
    }

    public static bool IsVisible(long rawWindow)
    {
        return IsWindowVisible(new IntPtr(rawWindow));
    }

    public static uint ForegroundProcessId()
    {
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero)
        {
            return 0;
        }
        uint processId;
        GetWindowThreadProcessId(foreground, out processId);
        return processId;
    }
}
'@
    }

    while ([DateTime]::UtcNow -lt $Deadline) {
        $windows = @([VibeSpaceSmokeWindow]::GetTauriWindows([uint32]$NativePid))
        if ($windows.Count -gt 1) {
            throw 'kernel_smoke_native_window_ambiguous'
        }
        if ($windows.Count -eq 1) {
            $window = [int64]$windows[0]
            if ([VibeSpaceSmokeWindow]::MoveOffscreenWithoutActivation($window)) {
                Start-Sleep -Milliseconds 100
                $rect = @([VibeSpaceSmokeWindow]::ReadRect($window))
                if (
                    $rect.Count -eq 4 -and
                    $rect[0] -le -30000 -and
                    $rect[1] -le -30000 -and
                    [VibeSpaceSmokeWindow]::IsVisible($window) -and
                    [VibeSpaceSmokeWindow]::ForegroundProcessId() -ne [uint32]$NativePid
                ) {
                    return
                }
            }
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'kernel_smoke_native_window_position_timeout'
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

function Start-HiddenRedirectedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$StandardOutputPath,
        [Parameter(Mandatory = $true)][string]$StandardErrorPath
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $ArgumentList -join ' '
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $standardOutputStream = [IO.File]::Open(
        $StandardOutputPath,
        [IO.FileMode]::Create,
        [IO.FileAccess]::Write,
        [IO.FileShare]::Read
    )
    $standardErrorStream = [IO.File]::Open(
        $StandardErrorPath,
        [IO.FileMode]::Create,
        [IO.FileAccess]::Write,
        [IO.FileShare]::Read
    )
    try {
        $process = [Diagnostics.Process]::new()
        $process.StartInfo = $startInfo
        if (-not $process.Start()) {
            $process.Dispose()
            throw 'kernel_smoke_driver_start_failed'
        }
        return [pscustomobject]@{
            Process              = $process
            StandardOutputTask   = $process.StandardOutput.BaseStream.CopyToAsync($standardOutputStream)
            StandardErrorTask    = $process.StandardError.BaseStream.CopyToAsync($standardErrorStream)
            StandardOutputReader = $process.StandardOutput
            StandardErrorReader  = $process.StandardError
            StandardOutputStream = $standardOutputStream
            StandardErrorStream  = $standardErrorStream
            Completed            = $false
        }
    }
    catch {
        $standardOutputStream.Dispose()
        $standardErrorStream.Dispose()
        throw
    }
}

function Complete-RedirectCopy {
    param(
        [Parameter(Mandatory = $true)][Threading.Tasks.Task]$Task,
        [Parameter(Mandatory = $true)][IO.TextReader]$Reader,
        [Parameter(Mandatory = $true)][IO.Stream]$Destination,
        [Parameter(Mandatory = $true)][int]$StreamWaitMilliseconds
    )

    $completed = $false
    try {
        $completed = $Task.Wait($StreamWaitMilliseconds)
    }
    catch {
        $completed = $Task.IsCompleted
    }
    if (-not $completed) {
        try {
            $Reader.Dispose()
        }
        catch {
            # The bounded caller reports capture failure below; cleanup continues.
        }
        try {
            $completed = $Task.Wait($StreamWaitMilliseconds)
        }
        catch {
            $completed = $Task.IsCompleted
        }
    }
    $destinationCompleted = $true
    try {
        $Destination.Flush()
    }
    catch {
        $destinationCompleted = $false
    }
    try {
        $Destination.Dispose()
    }
    catch {
        $destinationCompleted = $false
    }
    return (
        $completed -and
        $destinationCompleted -and
        -not $Task.IsFaulted -and
        -not $Task.IsCanceled
    )
}

function Complete-HiddenRedirectedProcess {
    param(
        [Parameter(Mandatory = $true)][object]$Capture,
        [ValidateRange(100, 30000)][int]$ProcessWaitMilliseconds = 5000,
        [ValidateRange(100, 30000)][int]$StreamWaitMilliseconds = 2000
    )

    if (-not $Capture.Completed) {
        $processExited = $Capture.Process.HasExited
        if (-not $processExited) {
            $processExited = $Capture.Process.WaitForExit($ProcessWaitMilliseconds)
        }
        if (-not $processExited) {
            try {
                $Capture.Process.Kill($true)
            }
            catch {
                try {
                    $Capture.Process.Kill()
                }
                catch {
                    # Bounded failure is reported after both log streams are flushed.
                }
            }
            $processExited = $Capture.Process.WaitForExit($ProcessWaitMilliseconds)
        }
        $standardOutputCompleted = Complete-RedirectCopy `
            -Task $Capture.StandardOutputTask `
            -Reader $Capture.StandardOutputReader `
            -Destination $Capture.StandardOutputStream `
            -StreamWaitMilliseconds $StreamWaitMilliseconds
        $standardErrorCompleted = Complete-RedirectCopy `
            -Task $Capture.StandardErrorTask `
            -Reader $Capture.StandardErrorReader `
            -Destination $Capture.StandardErrorStream `
            -StreamWaitMilliseconds $StreamWaitMilliseconds
        $Capture.Completed = $true
        if (-not $processExited) {
            throw 'kernel_smoke_driver_exit_timeout'
        }
        if (-not $standardOutputCompleted -or -not $standardErrorCompleted) {
            throw 'kernel_smoke_driver_log_capture_failed'
        }
    }
    return [int]$Capture.Process.ExitCode
}

function Get-CimProcessSnapshot {
    $CimSnapshotMaxAttempts = 5
    for ($attempt = 1; $attempt -le $CimSnapshotMaxAttempts; $attempt++) {
        try {
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
        catch {
            if ($attempt -ge $CimSnapshotMaxAttempts) {
                throw 'kernel_smoke_process_snapshot_unavailable'
            }
            Start-Sleep -Milliseconds 250
        }
    }
}

function Convert-ProcessCreationUtc {
    param([Parameter(Mandatory = $true)][string]$CreationUtc)

    return [DateTime]::Parse(
        $CreationUtc,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    ).ToUniversalTime()
}

function Test-RecordedProcessIdentity {
    param(
        [Parameter(Mandatory = $true)][object]$Current,
        [Parameter(Mandatory = $true)][object]$Recorded
    )

    return (
        [int]$Current.ProcessId -eq [int]$Recorded.ProcessId -and
        $null -ne $Current.CreationUtc -and
        $null -ne $Current.ExecutablePath -and
        $Current.CreationUtc -eq $Recorded.CreationUtc -and
        (Test-PathEqual -Left $Current.ExecutablePath -Right $Recorded.ExecutablePath)
    )
}

function Register-RecordedProcessRoot {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [object[]]$Snapshot = $(Get-CimProcessSnapshot)
    )

    if ($Process.HasExited) {
        throw 'kernel_smoke_process_root_exited_before_registration'
    }
    try {
        $launchCreationUtc = $Process.StartTime.ToUniversalTime()
    }
    catch {
        throw 'kernel_smoke_process_root_identity_unavailable'
    }
    $matches = @($Snapshot | Where-Object { $_.ProcessId -eq $Process.Id })
    if (
        $matches.Count -ne 1 -or
        $null -eq $matches[0].CreationUtc -or
        $null -eq $matches[0].ExecutablePath
    ) {
        throw 'kernel_smoke_process_root_identity_unavailable'
    }
    $snapshotCreationUtc = Convert-ProcessCreationUtc -CreationUtc $matches[0].CreationUtc
    if (
        [Math]::Abs(($snapshotCreationUtc - $launchCreationUtc).Ticks) -gt
        [TimeSpan]::TicksPerMillisecond
    ) {
        throw 'kernel_smoke_process_root_identity_changed'
    }
    $key = [string]$Process.Id
    if ($Records.ContainsKey($key)) {
        throw 'kernel_smoke_process_root_already_registered'
    }
    $Records[$key] = [pscustomobject]@{
        ProcessId       = [int]$matches[0].ProcessId
        ParentProcessId = [int]$matches[0].ParentProcessId
        ExecutablePath  = $matches[0].ExecutablePath
        CreationUtc     = $matches[0].CreationUtc
        CreationTimeUtc = $snapshotCreationUtc
        Depth           = 0
    }
}

function Get-Descendants {
    param(
        [Parameter(Mandatory = $true)][object]$RootProcess,
        [Parameter(Mandatory = $true)][object[]]$Snapshot
    )

    $rootCreationUtc = Convert-ProcessCreationUtc -CreationUtc $RootProcess.CreationUtc
    $result = New-Object System.Collections.Generic.List[object]
    $frontier = @([pscustomobject]@{
            ProcessId       = [int]$RootProcess.ProcessId
            ParentProcessId = [int]$RootProcess.ParentProcessId
            ExecutablePath  = $RootProcess.ExecutablePath
            CreationUtc     = $RootProcess.CreationUtc
            CreationTimeUtc = $rootCreationUtc
            Depth           = 0
        })
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
            throw 'kernel_smoke_process_ancestry_invalid'
        }
        $visited[[string]$current.ProcessId] = $true
        foreach ($child in @($Snapshot | Where-Object { $_.ParentProcessId -eq $current.ProcessId })) {
            if ($null -eq $child.CreationUtc -or $null -eq $child.ExecutablePath) {
                continue
            }
            $childCreationUtc = Convert-ProcessCreationUtc -CreationUtc $child.CreationUtc
            if ($childCreationUtc -lt $current.CreationTimeUtc) {
                continue
            }
            $record = [pscustomobject]@{
                ProcessId       = [int]$child.ProcessId
                ParentProcessId = [int]$child.ParentProcessId
                ExecutablePath  = $child.ExecutablePath
                CreationUtc     = $child.CreationUtc
                CreationTimeUtc = $childCreationUtc
                Depth           = $current.Depth + 1
            }
            $result.Add($record)
            $frontier += $record
        }
    }
    return $result.ToArray()
}

function Get-VerifiedRecordedProcessTree {
    param(
        [Parameter(Mandatory = $true)][int]$RootPid,
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [Parameter(Mandatory = $true)][object[]]$Snapshot
    )

    $key = [string]$RootPid
    if (-not $Records.ContainsKey($key)) {
        throw 'kernel_smoke_process_root_unregistered'
    }
    $root = @($Snapshot | Where-Object { $_.ProcessId -eq $RootPid })
    if ($root.Count -eq 0) {
        return @()
    }
    if ($root.Count -ne 1 -or -not (Test-RecordedProcessIdentity -Current $root[0] -Recorded $Records[$key])) {
        return @()
    }
    return @($Records[$key]) + @(Get-Descendants -RootProcess $root[0] -Snapshot $Snapshot)
}

function Add-RecordedProcessTree {
    param(
        [Parameter(Mandatory = $true)][int]$RootPid,
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [object[]]$Snapshot = $(Get-CimProcessSnapshot)
    )

    $tree = @(Get-VerifiedRecordedProcessTree `
            -RootPid $RootPid `
            -Records $Records `
            -Snapshot $Snapshot)
    foreach ($process in $tree) {
        $key = [string]$process.ProcessId
        if ($Records.ContainsKey($key)) {
            if (-not (Test-RecordedProcessIdentity -Current $process -Recorded $Records[$key])) {
                $recorded = $Records[$key]
                if (
                    $null -eq $process.CreationTimeUtc -or
                    $null -eq $recorded.CreationTimeUtc -or
                    $process.CreationTimeUtc -le $recorded.CreationTimeUtc
                ) {
                    throw 'kernel_smoke_recorded_process_identity_changed'
                }
                $Records[$key] = [pscustomobject]@{
                    ProcessId       = [int]$process.ProcessId
                    ParentProcessId = [int]$process.ParentProcessId
                    ExecutablePath  = $process.ExecutablePath
                    CreationUtc     = $process.CreationUtc
                    CreationTimeUtc = $process.CreationTimeUtc
                    Depth           = $process.Depth
                }
            }
            continue
        }
        $Records[$key] = [pscustomobject]@{
            ProcessId       = [int]$process.ProcessId
            ParentProcessId = [int]$process.ParentProcessId
            ExecutablePath  = $process.ExecutablePath
            CreationUtc     = $process.CreationUtc
            CreationTimeUtc = $process.CreationTimeUtc
            Depth           = $process.Depth
        }
    }
    return $tree
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
        foreach ($process in @($remaining | Sort-Object {
                    $Records[[string]$_.ProcessId].Depth
                } -Descending)) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'kernel_smoke_process_tree_stop_timeout'
}

function Wait-ForNativeDescendant {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Launcher,
        [Parameter(Mandatory = $true)][hashtable]$Records,
        [Parameter(Mandatory = $true)][string[]]$ExpectedExecutables,
        [Parameter(Mandatory = $true)][DateTime]$Deadline
    )

    while ([DateTime]::UtcNow -lt $Deadline) {
        if ($Launcher.HasExited) {
            throw "kernel_smoke_launcher_exited:$($Launcher.ExitCode)"
        }
        $snapshot = Get-CimProcessSnapshot
        $tree = @(Add-RecordedProcessTree `
                -RootPid $Launcher.Id `
                -Records $Records `
                -Snapshot $snapshot)
        $descendants = @($tree | Where-Object { $_.Depth -gt 0 })
        $wrongPathJarvis = @($descendants | Where-Object {
                $null -ne $_.ExecutablePath -and
                [IO.Path]::GetFileName($_.ExecutablePath) -ieq 'jarvis.exe' -and
                -not (Test-PathInSet -Candidate $_.ExecutablePath -Allowed $ExpectedExecutables)
            })
        if ($wrongPathJarvis.Count -ne 0) {
            throw 'kernel_smoke_native_wrong_path_descendant'
        }
        $matches = @($descendants | Where-Object {
                $null -ne $_.ExecutablePath -and
                (Test-PathInSet -Candidate $_.ExecutablePath -Allowed $ExpectedExecutables)
            })
        $allExactMatches = @($snapshot | Where-Object {
                $null -ne $_.ExecutablePath -and
                (Test-PathInSet -Candidate $_.ExecutablePath -Allowed $ExpectedExecutables)
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
            'Register-RecordedProcessRoot',
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
$DriverCapture = $null

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
    $smokeProject = Join-Path $Profile 'SmokeProject'
    New-Item -ItemType Directory -Path $smokeProject -Force | Out-Null
    $smokeProject = Get-CanonicalExistingPath -LiteralPath $smokeProject
    if (-not (Test-StrictDescendantPath -Child $smokeProject -Parent $Profile)) {
        throw 'kernel_smoke_project_containment_invalid'
    }

    $expandedEvidence = [IO.Path]::GetFullPath($EvidenceDirectory)
    $task22EvidenceAllowed = Test-StrictDescendantPath -Child $expandedEvidence -Parent $Task22EvidenceBase
    if (
        (Test-PathEqual -Left $expandedEvidence -Right $RepositoryRoot) -or
        (
            (Test-StrictDescendantPath -Child $expandedEvidence -Parent $RepositoryRoot) -and
            -not $task22EvidenceAllowed
        ) -or
        (Test-PathEqual -Left $expandedEvidence -Right $Profile) -or
        (Test-StrictDescendantPath -Child $expandedEvidence -Parent $Profile) -or
        (Test-StrictDescendantPath -Child $Profile -Parent $expandedEvidence)
    ) {
        throw 'kernel_smoke_evidence_containment_invalid'
    }
    New-Item -ItemType Directory -Path $expandedEvidence -Force | Out-Null
    $CanonicalEvidence = Get-CanonicalExistingPath -LiteralPath $EvidenceDirectory
    $canonicalTask22EvidenceAllowed = Test-StrictDescendantPath -Child $CanonicalEvidence -Parent $Task22EvidenceBase
    if (
        -not (Test-PathEqual -Left $expandedEvidence -Right $CanonicalEvidence) -or
        (Test-PathEqual -Left $CanonicalEvidence -Right $RepositoryRoot) -or
        (
            (Test-StrictDescendantPath -Child $CanonicalEvidence -Parent $RepositoryRoot) -and
            -not $canonicalTask22EvidenceAllowed
        ) -or
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
    # The profile, nonce, and CDP port are unique per run. Keep the dedicated
    # non-production app identifier stable so retries do not force a complete
    # Rust relink solely because the identifier string changed.
    $tauriIdentifier = 'ai.jarvis.desktop.smoke'
    $tauriConfigPath = Join-Path $Profile 'tauri-smoke-config.json'
    $tauriConfigJson = New-SmokeTauriConfigJson -Identifier $tauriIdentifier
    [IO.File]::WriteAllText(
        $tauriConfigPath,
        $tauriConfigJson,
        (New-Object Text.UTF8Encoding($false))
    )

    Set-ChildEnvironment -Values @{ TAURI_CONFIG = $tauriConfigJson }
    $cargoExitCode = 0
    if ($Scenarios -contains 'transport_cli_success') {
        & cargo build --manifest-path $CargoManifest --example vibespace_kernel_smoke_cli
        $cargoExitCode = $LASTEXITCODE
    }
    Restore-Environment -Saved $SavedEnvironment
    $EnvironmentRestored = $true
    if ($cargoExitCode -ne 0) {
        throw 'kernel_smoke_cli_build_failed'
    }

    $cargoTargetRoot = Join-Path $AppRoot 'src-tauri\target'
    if (Test-Path -LiteralPath $cargoTargetRoot -PathType Container) {
        $cargoTargetItem = Get-Item -LiteralPath $cargoTargetRoot -Force
        $physicalCargoTargetRoot = $cargoTargetRoot
        if ($null -ne $cargoTargetItem.LinkType) {
            $linkTargets = @($cargoTargetItem.Target)
            if ($linkTargets.Count -ne 1 -or [string]::IsNullOrWhiteSpace($linkTargets[0])) {
                throw 'kernel_smoke_target_link_invalid'
            }
            $physicalCargoTargetRoot = [string]$linkTargets[0]
            if (-not [IO.Path]::IsPathRooted($physicalCargoTargetRoot)) {
                $physicalCargoTargetRoot = Join-Path `
                    (Split-Path -Parent $cargoTargetRoot) `
                    $physicalCargoTargetRoot
            }
        }
        $physicalCargoTargetRoot = Get-CanonicalExistingPath -LiteralPath $physicalCargoTargetRoot
        $physicalNativeExecutable = Join-Path $physicalCargoTargetRoot 'debug\jarvis.exe'
        $ExpectedNativeExecutables = @(
            $ExpectedNativeExecutables
            $physicalNativeExecutable
        ) | Sort-Object -Unique
    }
    $baseline = Get-CimProcessSnapshot
    $preexisting = @($baseline | Where-Object {
            $null -ne $_.ExecutablePath -and
            (Test-PathInSet -Candidate $_.ExecutablePath -Allowed $ExpectedNativeExecutables)
        })
    if ($preexisting.Count -ne 0) {
        throw 'kernel_smoke_native_preexisting'
    }

    $childEnvironment = @{
        VITE_SIK_SMOKE                       = '1'
        VITE_JARVIS_LOCAL_ADMIN              = '1'
        VIBESPACE_SIK_SMOKE                  = '1'
        VIBESPACE_SIK_CDP_PORT               = [string]$CdpPort
        VIBESPACE_SIK_PROFILE                = $Profile
        VIBESPACE_SIK_NONCE                  = $Nonce
        APPDATA                              = $appData
        LOCALAPPDATA                         = $localAppData
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$CdpPort --user-data-dir=`"$webViewProfile`""
        WEBVIEW2_USER_DATA_FOLDER            = $webViewProfile
        TAURI_CONFIG                         = $tauriConfigJson
        PATH                                 = "$SmokeCliDirectory$([IO.Path]::PathSeparator)$($SavedEnvironment['PATH'])"
    }
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
    Register-RecordedProcessRoot -Process $Dev -Records $DevRecords
    Restore-Environment -Saved $SavedEnvironment
    $EnvironmentRestored = $true

    $deadline = [DateTime]::UtcNow.AddMinutes($NativeStartupTimeoutMinutes)
    $nativeMatch = Wait-ForNativeDescendant `
        -Launcher $Dev `
        -Records $DevRecords `
        -ExpectedExecutables $ExpectedNativeExecutables `
        -Deadline $deadline
    $NativePid = [int]$nativeMatch.ProcessId
    $NativeCreationUtc = $nativeMatch.CreationUtc
    if (-not $DevRecords.ContainsKey([string]$NativePid)) {
        throw 'kernel_smoke_native_creation_time_unrecorded'
    }
    if ($DevRecords[[string]$NativePid].CreationUtc -ne $NativeCreationUtc) {
        throw 'kernel_smoke_native_creation_time_mismatch'
    }

    Show-SmokeNativeWindowOffscreen -NativePid $NativePid -Deadline $deadline
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
            $DriverCapture = Start-HiddenRedirectedProcess `
                -FilePath (Get-Command node -ErrorAction Stop).Source `
                -ArgumentList $driverArguments `
                -WorkingDirectory $RepositoryRoot `
                -StandardOutputPath $DriverStandardOutput `
                -StandardErrorPath $DriverStandardError
            $Driver = $DriverCapture.Process
            Register-RecordedProcessRoot -Process $Driver -Records $DriverRecords
            $driverDeadline = [DateTime]::UtcNow.AddMinutes($DriverPhaseTimeoutMinutes)
            while (-not $Driver.HasExited) {
                if ([DateTime]::UtcNow -ge $driverDeadline) {
                    throw "kernel_smoke_driver_phase_timeout:${scenario}:phase${phase}"
                }
                [void](Add-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords)
                [void](Add-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords)
                Start-Sleep -Milliseconds 100
                $Driver.Refresh()
            }
            [void](Add-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords)
            $driverExitCode = Complete-HiddenRedirectedProcess -Capture $DriverCapture
            if ($driverExitCode -eq 0) {
                $Driver = $null
                $DriverCapture = $null
                break
            }
            if ($driverExitCode -ne 10) {
                throw "kernel_smoke_driver_failed:${scenario}:$driverExitCode"
            }
            if ($RestartScenarios -notcontains $scenario -or $phase -ne 1) {
                throw "kernel_smoke_restart_unexpected:${scenario}:phase${phase}"
            }

            $Driver = $null
            $DriverCapture = $null
            $previousCdpPort = $CdpPort
            $previousNonce = $Nonce
            $previousNativePid = $NativePid
            [void](Add-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords)
            Stop-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
            Wait-ForRecordedProcessTreeExit `
                -Records $DevRecords `
                -Deadline ([DateTime]::UtcNow.AddSeconds($ProcessTreeCleanupTimeoutSeconds))
            $Dev = $null

            $remainingNative = @(Get-CimProcessSnapshot | Where-Object {
                    $null -ne $_.ExecutablePath -and
                    (Test-PathInSet -Candidate $_.ExecutablePath -Allowed $ExpectedNativeExecutables)
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
            Register-RecordedProcessRoot -Process $Dev -Records $DevRecords
            Restore-Environment -Saved $SavedEnvironment
            $EnvironmentRestored = $true

            $deadline = [DateTime]::UtcNow.AddMinutes($NativeStartupTimeoutMinutes)
            $nativeMatch = Wait-ForNativeDescendant `
                -Launcher $Dev `
                -Records $DevRecords `
                -ExpectedExecutables $ExpectedNativeExecutables `
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
            Show-SmokeNativeWindowOffscreen -NativePid $NativePid -Deadline $deadline
            Wait-ForCdpEndpoint -Port $CdpPort -Deadline $deadline
        }
    }
}
finally {
    $cleanupFailures = [Collections.Generic.List[string]]::new()
    if (-not $EnvironmentRestored) {
        try {
            Restore-Environment -Saved $SavedEnvironment
            $EnvironmentRestored = $true
        }
        catch {
            [void]$cleanupFailures.Add('environment')
        }
    }
    if ($null -ne $Driver) {
        try {
            [void](Add-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords)
            Stop-RecordedProcessTree -RootPid $Driver.Id -Records $DriverRecords
            Wait-ForRecordedProcessTreeExit `
                -Records $DriverRecords `
                -Deadline ([DateTime]::UtcNow.AddSeconds($ProcessTreeCleanupTimeoutSeconds))
        }
        catch {
            [void]$cleanupFailures.Add('driver_tree')
        }
        if ($null -ne $DriverCapture) {
            try {
                [void](Complete-HiddenRedirectedProcess -Capture $DriverCapture)
            }
            catch {
                [void]$cleanupFailures.Add('driver_logs')
            }
        }
    }
    if ($null -ne $Dev) {
        try {
            [void](Add-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords)
            Stop-RecordedProcessTree -RootPid $Dev.Id -Records $DevRecords
            Wait-ForRecordedProcessTreeExit `
                -Records $DevRecords `
                -Deadline ([DateTime]::UtcNow.AddSeconds($ProcessTreeCleanupTimeoutSeconds))
        }
        catch {
            [void]$cleanupFailures.Add('native_tree')
        }
    }
    if ($null -ne $Profile -and $null -ne $CanonicalProfileBase -and (Test-Path -LiteralPath $Profile)) {
        try {
            $canonicalRemovalTarget = Get-CanonicalExistingPath -LiteralPath $Profile
            if (-not (Test-StrictDescendantPath -Child $canonicalRemovalTarget -Parent $CanonicalProfileBase)) {
                throw 'kernel_smoke_cleanup_containment_invalid'
            }
            Remove-Item -LiteralPath $canonicalRemovalTarget -Recurse -Force
        }
        catch {
            [void]$cleanupFailures.Add('profile')
        }
    }
    if ($cleanupFailures.Count -ne 0) {
        throw "kernel_smoke_cleanup_failed:$($cleanupFailures -join ',')"
    }
}
