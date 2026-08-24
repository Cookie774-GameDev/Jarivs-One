import { describe, expect, it } from 'vitest';
import { createStabilityDiagnostics } from './stabilityDiagnostics';

describe('stability diagnostics', () => {
  it('keeps a bounded local ring of non-content recovery metrics', () => {
    const diagnostics = createStabilityDiagnostics(2);

    diagnostics.record({ type: 'renderer-heartbeat', at: 1 });
    diagnostics.record({ type: 'resource-pressure', at: 2, usedBytes: 80, limitBytes: 100 });
    diagnostics.record({ type: 'terminal-output-trimmed', at: 3, droppedCharacters: 4 });

    expect(diagnostics.snapshot()).toEqual([
      { type: 'resource-pressure', at: 2, usedBytes: 80, limitBytes: 100 },
      { type: 'terminal-output-trimmed', at: 3, droppedCharacters: 4 },
    ]);
  });

  it('preserves chronological order across repeated capacity wraps and returns copies', () => {
    const diagnostics = createStabilityDiagnostics(3);

    for (let at = 1; at <= 8; at += 1) {
      diagnostics.record({ type: 'renderer-heartbeat', at });
    }

    const first = diagnostics.snapshot();
    expect(first).toEqual([
      { type: 'renderer-heartbeat', at: 6 },
      { type: 'renderer-heartbeat', at: 7 },
      { type: 'renderer-heartbeat', at: 8 },
    ]);

    (first[0] as { at: number }).at = 999;
    expect(diagnostics.snapshot()).toEqual([
      { type: 'renderer-heartbeat', at: 6 },
      { type: 'renderer-heartbeat', at: 7 },
      { type: 'renderer-heartbeat', at: 8 },
    ]);
  });

  it('retains no diagnostics when configured with zero capacity', () => {
    const diagnostics = createStabilityDiagnostics(0);

    diagnostics.record({ type: 'renderer-heartbeat', at: 1 });

    expect(diagnostics.snapshot()).toEqual([]);
  });
});
