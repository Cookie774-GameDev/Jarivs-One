import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function repositoryRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'app' ? path.dirname(cwd) : cwd;
}

const root = repositoryRoot();
const launcherPath = path.join(root, 'scripts', 'shared-intelligence-kernel-smoke.ps1');
const driverPath = path.join(root, 'scripts', 'shared-intelligence-kernel-smoke-driver.mjs');
const launcher = readFileSync(launcherPath, 'utf8');
const driver = readFileSync(driverPath, 'utf8');

describe('shared intelligence kernel smoke harness contract', () => {
  it('keeps one outer cleanup boundary and tolerates partial startup', () => {
    expect((launcher.match(/^finally/gm) ?? []).length).toBe(1);
    expect(launcher.indexOf('$Dev = $null')).toBeLessThan(launcher.indexOf('\ntry {'));
    expect(launcher).toContain('if ($null -ne $Driver)');
    expect(launcher).toContain('if ($null -ne $Dev)');
    expect(launcher).toContain('if (-not $EnvironmentRestored)');
  });

  it('waits for recorded process trees to exit before deleting the disposable profile', () => {
    const cleanup = launcher.slice(launcher.lastIndexOf('\nfinally {'));
    const driverStop = cleanup.indexOf('Stop-RecordedProcessTree -RootPid $Driver.Id');
    const driverWait = cleanup.indexOf('Wait-ForRecordedProcessTreeExit', driverStop);
    const devStop = cleanup.indexOf('Stop-RecordedProcessTree -RootPid $Dev.Id');
    const devWait = cleanup.indexOf('Wait-ForRecordedProcessTreeExit', devStop);
    const profileRemoval = cleanup.indexOf(
      'Remove-Item -LiteralPath $canonicalRemovalTarget -Recurse -Force',
    );

    expect(driverStop).toBeGreaterThan(0);
    expect(driverWait).toBeGreaterThan(driverStop);
    expect(devStop).toBeGreaterThan(driverWait);
    expect(devWait).toBeGreaterThan(devStop);
    expect(profileRemoval).toBeGreaterThan(devWait);
  });

  it('bounds the driver wait before reading its exact exit code', () => {
    const completion = launcher.slice(
      launcher.indexOf('function Complete-HiddenRedirectedProcess'),
      launcher.indexOf('function Get-CimProcessSnapshot'),
    );
    const waitForExit = completion.indexOf(
      '$Capture.Process.WaitForExit($ProcessWaitMilliseconds)',
    );
    const exitCode = completion.indexOf('return [int]$Capture.Process.ExitCode');

    expect(waitForExit).toBeGreaterThan(0);
    expect(exitCode).toBeGreaterThan(waitForExit);
    expect(completion).not.toContain('$Capture.Process.WaitForExit()');
    expect(launcher).toContain(
      '$driverExitCode = Complete-HiddenRedirectedProcess -Capture $DriverCapture',
    );
  });

  it('streams redirected driver output directly to evidence files', () => {
    const startup = launcher.slice(
      launcher.indexOf('function Start-HiddenRedirectedProcess'),
      launcher.indexOf('function Complete-HiddenRedirectedProcess'),
    );

    expect(startup).toContain('BaseStream.CopyToAsync($standardOutputStream)');
    expect(startup).toContain('BaseStream.CopyToAsync($standardErrorStream)');
    expect(startup).not.toContain('ReadToEndAsync');
  });

  it('flushes driver logs and attempts every cleanup phase before reporting failures', () => {
    const cleanup = launcher.slice(launcher.lastIndexOf('\nfinally {'));
    const driverGuard = cleanup.indexOf('if ($null -ne $Driver)');
    const driverWait = cleanup.indexOf('Wait-ForRecordedProcessTreeExit', driverGuard);
    const cleanupCatch = cleanup.indexOf('catch {', driverWait);
    const logFlush = cleanup.indexOf(
      'Complete-HiddenRedirectedProcess -Capture $DriverCapture',
      cleanupCatch,
    );
    const devGuard = cleanup.indexOf('if ($null -ne $Dev)', logFlush);
    const profileGuard = cleanup.indexOf('if ($null -ne $Profile', devGuard);
    const aggregateThrow = cleanup.indexOf('throw "kernel_smoke_cleanup_failed:', profileGuard);

    expect(driverWait).toBeGreaterThan(driverGuard);
    expect(cleanupCatch).toBeGreaterThan(driverWait);
    expect(logFlush).toBeGreaterThan(cleanupCatch);
    expect(devGuard).toBeGreaterThan(logFlush);
    expect(profileGuard).toBeGreaterThan(devGuard);
    expect(aggregateThrow).toBeGreaterThan(profileGuard);
    expect(cleanup).not.toContain('throw $driverCleanupError');
  });

  it('binds a fresh loopback port and cryptographic nonce into child-only state', () => {
    expect(launcher).toContain('[Net.IPAddress]::Loopback, 0');
    expect(launcher).toContain('[Security.Cryptography.RandomNumberGenerator]::Create()');
    expect(launcher).toContain("$Nonce -notmatch '^[a-f0-9]{64}$'");
    expect(launcher).toContain('VIBESPACE_SIK_CDP_PORT');
    expect(launcher).toContain('VIBESPACE_SIK_PROFILE');
    expect(launcher).toContain('VIBESPACE_SIK_NONCE');
    expect(launcher).toContain("'TAURI_CONFIG'");
    expect(launcher).toContain('macOSPrivateApi = $true');
    expect(launcher).toContain('Set-ChildEnvironment -Values @{ TAURI_CONFIG = $tauriConfigJson }');
    const startup = launcher.indexOf('$Dev = Start-Process');
    const restored = launcher.indexOf('Restore-Environment -Saved $SavedEnvironment', startup);
    const driverLoop = launcher.indexOf('foreach ($scenario in $Scenarios)', restored);
    expect(startup).toBeGreaterThan(0);
    expect(restored).toBeGreaterThan(startup);
    expect(driverLoop).toBeGreaterThan(restored);
  });

  it('attests the exact descendant executable and PID creation identity', () => {
    expect(launcher).toContain('target\\debug\\jarvis.exe');
    expect(launcher).toContain('Wait-ForNativeDescendant `');
    expect(launcher).toContain('-Launcher $Dev `');
    expect(launcher).toContain('Get-Descendants -RootPid $Launcher.Id -Snapshot $snapshot');
    expect(launcher).toContain('return $result.ToArray()');
    expect(launcher).toContain('kernel_smoke_native_wrong_path_descendant');
    expect(launcher).toContain('kernel_smoke_native_non_descendant');
    expect(launcher).toContain('kernel_smoke_native_ambiguous');
    expect(launcher).toContain('CreationUtc');
    expect(launcher).toContain('kernel_smoke_native_creation_time_mismatch');
    expect(launcher).not.toMatch(/Stop-Process\s+-Name/i);
    expect(launcher).not.toMatch(/taskkill[^\r\n]*\/im/i);
  });

  it('uses hidden startup, strict disposable-profile containment, and all six driver arguments', () => {
    expect(launcher).toContain('-WindowStyle Hidden');
    expect(launcher).toContain('Test-StrictDescendantPath');
    expect(launcher).toContain('kernel_smoke_cleanup_containment_invalid');
    for (const argument of [
      '--cdp-port',
      '--scenario',
      '--evidence-dir',
      '--expected-native-pid',
      '--expected-profile',
      '--expected-nonce',
    ]) {
      expect(launcher).toContain(`'${argument}'`);
      expect(driver).toContain(`'${argument}'`);
    }
  });

  it('uses only the root Playwright dependency and closed evidence selectors', () => {
    expect(driver).toContain("import { chromium } from 'playwright-core'");
    expect(launcher).toContain('ls playwright-core --depth=0');
    expect(driver).toContain('chromium.connectOverCDP(`http://127.0.0.1:');
    expect(driver).toContain('`[data-sik-evidence="${id}"]`');
    expect(driver).not.toMatch(/\.evaluate\s*\(/);
    expect(driver).not.toMatch(/localStorage|sessionStorage|[?&]scenario=/);
    expect(driver).not.toMatch(/repository|messageRepo|runRepo|eventRepo/);
    expect(driver).toContain("await selectSmokeTransport(page, 'cli')");
    expect(driver).toContain("await selectSmokeTransport(page, 'native')");
    expect(driver).toContain("'model.transport-native'");
    expect(driver).toContain("'model.transport-cli'");
  });

  it('reports closed page and allowlisted selector timeouts without leaking Playwright errors', () => {
    expect(driver).toContain("fail('kernel_smoke_page_closed')");
    expect(driver).toContain('fail(`kernel_smoke_evidence_missing:${id}`)');
    expect(driver).toContain('if (!SELECTOR_IDS.includes(id))');
    expect(driver).toContain("'smoke.binding-error'");
    expect(driver).toContain("'smoke.dispatch-kind'");
    expect(driver).toContain("'smoke.runtime-state'");
    expect(driver).toContain("'data-runtime-state'");
    expect(driver).toContain('kernel_smoke_provider_not_reached:');
    expect(driver).toContain("'data-dispatch-kind'");
    expect(driver).toContain('kernel_smoke_unprotected_provider_dispatch');
    expect(driver).toContain('kernel_smoke_dispatch_state_timeout');
    expect(driver).toContain('kernel_smoke_transport_state_timeout');
    expect(driver).toContain('kernel_smoke_run_state_timeout');
    expect(driver).toContain('kernel_smoke_unexpected_run_status:');
    expect(driver).toContain("lastStatus ?? 'invalid'");
    expect(driver).toContain("safeRuntimeState");
    expect(driver).toContain('kernel_smoke_native_binding_rejected:');
    expect(driver).toContain("'sik_smoke_port_not_bound'");
    expect(driver).not.toMatch(/innerText|textContent/);
  });

  it('requires account-scoped chat runtime readiness before every real composer submit', () => {
    expect(driver).toContain("'chat.runtime-ready'");
    const submitFixture = driver.slice(
      driver.indexOf('async function submitChatFixture'),
      driver.indexOf('async function selectSmokeTransport'),
    );
    const readiness = submitFixture.indexOf("requireUniqueEvidence(page, 'chat.runtime-ready')");
    const submit = submitFixture.indexOf("clickEvidence(page, 'chat.submit')");

    expect(readiness).toBeGreaterThan(0);
    expect(submit).toBeGreaterThan(readiness);
  });

  it('waits for the protected voice turn to become cancellable before clicking stop', () => {
    const voiceScenario = driver.slice(
      driver.indexOf("case 'voice_turn_stop':"),
      driver.indexOf("case 'native_stt_voice_turn':"),
    );
    const running = voiceScenario.indexOf("waitForRunStatus(page, ['running'])");
    const voiceState = voiceScenario.indexOf(
      "requireUniqueEvidence(page, 'voice.state')",
      running,
    );
    const cancellable = voiceScenario.indexOf(
      "waitForAttribute(voiceState, 'data-voice-state', ['thinking', 'speaking'])",
    );
    const stop = voiceScenario.indexOf("clickEvidence(page, 'voice.stop')");
    const cancelled = voiceScenario.indexOf("waitForRunStatus(page, ['cancelled'])");
    const terminalBefore = voiceScenario.indexOf('const beforeRuntimeSettled = await readAttributes');
    const runtime = voiceScenario.indexOf("requireUniqueEvidence(page, 'smoke.runtime-state')");
    const runtimeCancelled = voiceScenario.indexOf(
      "waitForAttribute(runtime, 'data-runtime-state', ['cancelled'])",
    );
    const terminalAfter = voiceScenario.indexOf('const afterRuntimeSettled = await readAttributes');
    const noSuccess = voiceScenario.indexOf('assertNoVoiceSuccessEvidence(afterRuntimeSettled)');
    const stableTerminal = voiceScenario.indexOf(
      "beforeRuntimeSettled['data-run-digest'] !== afterRuntimeSettled['data-run-digest']",
    );

    expect(running).toBeGreaterThan(0);
    expect(voiceState).toBeGreaterThan(running);
    expect(cancellable).toBeGreaterThan(voiceState);
    expect(stop).toBeGreaterThan(cancellable);
    expect(cancelled).toBeGreaterThan(stop);
    expect(terminalBefore).toBeGreaterThan(cancelled);
    expect(runtime).toBeGreaterThan(terminalBefore);
    expect(runtimeCancelled).toBeGreaterThan(runtime);
    expect(terminalAfter).toBeGreaterThan(runtimeCancelled);
    expect(noSuccess).toBeGreaterThan(terminalAfter);
    expect(stableTerminal).toBeGreaterThan(noSuccess);
    expect(voiceScenario).not.toContain('setTimeout');
  });

  it('fails closed when the driver is invoked directly without its attested arguments', () => {
    const result = spawnSync(process.execPath, [driverPath], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('kernel_smoke_arguments_invalid');
  });

  it('persists restart checkpoints before requesting one bounded relaunch', () => {
    expect(driver).toContain('const restartCheckpoint = await readRestartCheckpoint(options)');
    expect(driver).toContain('runScenario(page, options.scenario, restartCheckpoint)');
    expect(driver).toContain("if (outcome === 'RESTART_REQUIRED')");
    expect(driver).toContain('await writeRestartCheckpoint(options, binding, restartBefore)');
    expect(driver).toContain('process.exitCode = 10');
    expect(driver).toContain('restartCheckpoint.binding.profileSha256 !== binding.profileSha256');
    expect(driver.indexOf("if (outcome === 'RESTART_REQUIRED')")).toBeLessThan(
      driver.indexOf('const evidence = Object.freeze'),
    );
  });
});
