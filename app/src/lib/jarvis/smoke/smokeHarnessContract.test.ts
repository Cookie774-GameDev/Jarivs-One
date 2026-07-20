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

  it('binds a fresh loopback port and cryptographic nonce into child-only state', () => {
    expect(launcher).toContain('[Net.IPAddress]::Loopback, 0');
    expect(launcher).toContain('[Security.Cryptography.RandomNumberGenerator]::Create()');
    expect(launcher).toContain("$Nonce -notmatch '^[a-f0-9]{64}$'");
    expect(launcher).toContain('VIBESPACE_SIK_CDP_PORT');
    expect(launcher).toContain('VIBESPACE_SIK_PROFILE');
    expect(launcher).toContain('VIBESPACE_SIK_NONCE');
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
