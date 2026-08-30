import { describe, expect, it, vi } from 'vitest';
import { executeInstantCommand, type InstantCommandDependencies } from './execute';
import { parseInstantCommand } from './parse';
import type { LiveTerminalTarget } from './types';

const target: LiveTerminalTarget = {
  sessionId: 'tty-codex',
  paneId: 'pane-codex',
  projectId: 'project-a',
  ordinal: 1,
  provider: 'codex',
  label: 'Codex',
  processIdentity: {
    projectId: 'project-a',
    processInstanceId: 'process-codex',
    pid: 4242,
    processStartedAt: 1_723_456_789_000,
    runtimeGeneration: 'runtime-a',
  },
};

describe('instant command local latency', () => {
  it('keeps parse/resolve/queue acceptance below 500 ms at p95', async () => {
    const dependencies: InstantCommandDependencies = {
      executeLegacy: vi.fn(async () => ({ ok: true, message: 'legacy' })),
      enqueueBatch: vi.fn(() => ['jterm-benchmark']),
      routeToTerminal: vi.fn(),
      openModelPicker: vi.fn(),
      readTargets: vi.fn(async () => [target]),
    };
    const samples: number[] = [];

    for (let index = 0; index < 40; index += 1) {
      const startedAt = performance.now();
      const command = parseInstantCommand(`Codex, benchmark-${index}`);
      expect(command).toMatchObject({ kind: 'agent-message', payload: `benchmark-${index}` });
      await executeInstantCommand(command!, dependencies);
      samples.push(performance.now() - startedAt);
    }

    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(500);
  });
});
