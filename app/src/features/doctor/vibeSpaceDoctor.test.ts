import { describe, expect, it, vi } from 'vitest';
import { runVibeSpaceDoctorWithDependencies } from './vibeSpaceDoctor';

describe('VibeSpace slash Doctor', () => {
  it('repairs supported storage and OpenCode failures and returns chat-ready output', async () => {
    const refreshOpenCode = vi.fn().mockResolvedValue(undefined);
    const repairOpenCode = vi.fn().mockResolvedValue(undefined);
    const report = await runVibeSpaceDoctorWithDependencies({
      nativeRuntime: true,
      runStorage: vi.fn().mockResolvedValue({ code: 'recovered_after_retry', attempts: 2 }),
      refreshOpenCode,
      repairOpenCode,
      getOpenCodeState: vi
        .fn()
        .mockReturnValueOnce({ kind: 'failed', recoverable: true, message: 'not ready' })
        .mockReturnValue({ kind: 'ready', source: 'system', version: '1.18.21' }),
      getOpenCodeConnection: vi.fn().mockReturnValue({
        source: 'system',
        version: '1.18.21',
        generation: 'opencode-server-test',
      }),
      waitForOpenCodeSettled: vi.fn().mockResolvedValue(undefined),
      runAdditionalChecks: vi.fn().mockResolvedValue([
        { label: 'Agents', ok: true, detail: 'Ready · 4 loaded' },
        { label: 'Skills', ok: true, detail: 'Ready · 12 available' },
        { label: 'Terminals', ok: true, detail: 'Ready · 1 saved session' },
        { label: 'Optimization', ok: true, detail: 'Ready · balanced' },
        { label: 'Settings', ok: true, detail: 'Readable' },
      ]),
      now: vi.fn().mockReturnValueOnce(100).mockReturnValue(450),
    });

    expect(refreshOpenCode).toHaveBeenCalledTimes(1);
    expect(repairOpenCode).toHaveBeenCalledTimes(1);
    expect(report.ok).toBe(true);
    expect(report.text).toContain('Local chat storage — Recovered safely after 2 attempts');
    expect(report.text).toContain('OpenCode — Ready · system 1.18.21');
    expect(report.text).toContain('Agents — Ready · 4 loaded');
    expect(report.text).toContain('Skills — Ready · 12 available');
    expect(report.text).toContain('Terminals — Ready · 1 saved session');
    expect(report.text).toContain('Optimization — Ready · balanced');
    expect(report.text).toContain('Settings — Readable');
    expect(report.text).toContain('Completed in 350 ms');
  });

  it('fails unknown categories safely without claiming a universal repair', async () => {
    const report = await runVibeSpaceDoctorWithDependencies({
      nativeRuntime: true,
      runStorage: vi.fn().mockResolvedValue({
        code: 'unexpected_failure',
        attempts: 1,
        diagnosticCode: 'storage_unrecognized_failure',
      }),
      refreshOpenCode: vi.fn().mockRejectedValue(new Error('private details')),
      repairOpenCode: vi.fn(),
      getOpenCodeState: vi
        .fn()
        .mockReturnValue({ kind: 'failed', recoverable: true, message: 'OpenCode unavailable' }),
      getOpenCodeConnection: vi.fn(),
      waitForOpenCodeSettled: vi.fn().mockResolvedValue(undefined),
      runAdditionalChecks: vi
        .fn()
        .mockResolvedValue([{ label: 'Agents', ok: false, detail: 'Check failed safely' }]),
      now: vi.fn().mockReturnValue(0),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain('No destructive cleanup was attempted');
    expect(report.text).toContain('storage_unrecognized_failure');
    expect(report.text).not.toContain('private details');
  });

  it('reports that native OpenCode repair needs the desktop app in browser mode', async () => {
    const repairOpenCode = vi.fn();
    const report = await runVibeSpaceDoctorWithDependencies({
      nativeRuntime: false,
      runStorage: vi.fn().mockResolvedValue({ code: 'healthy', attempts: 1 }),
      refreshOpenCode: vi.fn(),
      repairOpenCode,
      getOpenCodeState: vi.fn().mockReturnValue({ kind: 'checking' }),
      getOpenCodeConnection: vi.fn(),
      waitForOpenCodeSettled: vi.fn(),
      runAdditionalChecks: vi.fn().mockResolvedValue([]),
      now: vi.fn().mockReturnValue(0),
    });

    expect(repairOpenCode).not.toHaveBeenCalled();
    expect(report.text).toContain('OpenCode — Native check unavailable in browser preview');
  });
});
