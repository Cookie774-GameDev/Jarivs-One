import { describe, expect, it } from 'vitest';
import {
  MAX_TERMINAL_SNAPSHOT_BYTES,
  createTerminalSnapshot,
  terminalSnapshotFingerprint,
} from './terminalSnapshot';

function terminal(lines: Array<string | undefined>, rows = 30, cols = 100) {
  return {
    rows,
    cols,
    buffer: {
      active: {
        length: lines.length,
        getLine(index: number) {
          const value = lines[index];
          return value == null
            ? undefined
            : { translateToString: () => value };
        },
      },
    },
  };
}

describe('createTerminalSnapshot', () => {
  it('captures sanitized rendered buffer lines and metadata', () => {
    const snapshot = createTerminalSnapshot(
      terminal(['hello   ', undefined, '\x1b[31msecret-token=demo-value\x1b[0m']),
      {
        projectId: 'project-a',
        paneId: 'pane-a',
        rows: 30,
        cols: 100,
        updatedAt: 42,
        command: 'pwsh.exe',
        interactive: false,
      },
    );

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.text).toContain('hello');
    expect(snapshot.text).toContain('secret-token=[REDACTED]');
    expect(snapshot.text).not.toContain('demo-value');
    expect(snapshot.text).not.toContain('\x1b');
    expect(snapshot.rows).toBe(30);
    expect(snapshot.cols).toBe(100);
  });

  it('caps lines and UTF-8 bytes from the oldest side', () => {
    const lines = Array.from({ length: 5_200 }, (_, index) => `${index}-${'😀'.repeat(30)}`);
    const snapshot = createTerminalSnapshot(terminal(lines), {
      projectId: null,
      paneId: 'pane-big',
      rows: 30,
      cols: 100,
      updatedAt: 42,
      command: null,
      interactive: true,
    });

    expect(new TextEncoder().encode(snapshot.text).byteLength).toBeLessThanOrEqual(
      MAX_TERMINAL_SNAPSHOT_BYTES,
    );
    expect(snapshot.text.split('\n').length).toBeLessThanOrEqual(5_000);
    expect(snapshot.text).toContain('5199-');
    expect(snapshot.text.split('\n').some((line) => line.startsWith('0-'))).toBe(false);
  });

  it('sanitizes command metadata before persistence', () => {
    const snapshot = createTerminalSnapshot(terminal(['ready']), {
      projectId: 'p',
      paneId: 'pane',
      rows: 30,
      cols: 100,
      updatedAt: 1,
      command: 'API_TOKEN=synthetic-token-value npm test\u001b[A',
      interactive: false,
    });

    expect(snapshot.command).toContain('[REDACTED]');
    expect(snapshot.command).not.toContain('synthetic-token-value');
    expect(snapshot.command).not.toContain('\u001b');
  });

  it('produces a stable fingerprint and changes it with content', () => {
    const base = createTerminalSnapshot(terminal(['one']), {
      projectId: 'p',
      paneId: 'pane',
      rows: 30,
      cols: 100,
      updatedAt: 1,
      command: 'pwsh',
      interactive: false,
    });
    const sameContent = { ...base, updatedAt: 2 };
    expect(terminalSnapshotFingerprint(base)).toBe(terminalSnapshotFingerprint(sameContent));
    expect(terminalSnapshotFingerprint({ ...base, text: 'two' })).not.toBe(
      terminalSnapshotFingerprint(base),
    );
  });
});
