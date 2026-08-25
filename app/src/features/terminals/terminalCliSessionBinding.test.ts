import { describe, expect, it } from 'vitest';

import {
  loadTerminalCliSessionBindings,
  migrateTerminalCliSessionBindingRecord,
  persistVerifiedTerminalCliSessionBinding,
  TERMINAL_CLI_SESSION_BINDINGS_KEY,
  type TerminalCliSessionBindingStorage,
} from './terminalCliSessionBinding';

class MemoryStorage implements TerminalCliSessionBindingStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const binding = {
  version: 1 as const,
  adapterId: 'openai-codex' as const,
  executable: 'codex',
  detectedVersion: '0.134.0',
  providerSessionId: '019bc371-82cf-7d82-ad0b-96d026aaca73',
  canonicalWorkingDirectory: 'C:\\workspace\\vibespace',
  paneId: 'pane-a',
  projectId: 'project-a',
  captureMethod: 'provider-event' as const,
  verifiedAt: 1_780_000_000_000,
  verificationState: 'verified' as const,
  resumeCapability: 'exact-id' as const,
};

describe('terminal CLI session binding persistence', () => {
  it('round-trips only the bounded versioned provider identity contract', () => {
    const storage = new MemoryStorage();

    expect(persistVerifiedTerminalCliSessionBinding(storage, binding)).toEqual({ ok: true });
    expect(loadTerminalCliSessionBindings(storage)).toEqual([binding]);
    expect(JSON.parse(storage.getItem(TERMINAL_CLI_SESSION_BINDINGS_KEY) ?? '{}')).toEqual({
      version: 1,
      bindings: [binding],
    });
  });

  it('migrates a legacy terminal row to unverified without treating its PTY session id as a provider id', () => {
    const migrated = migrateTerminalCliSessionBindingRecord({
      sessionId: 'pty-session-123',
      paneId: 'pane-a',
      projectId: 'project-a',
      command: 'codex',
      cwd: 'C:\\workspace\\vibespace',
      transcript: 'secret terminal output',
    });

    expect(migrated).toEqual({
      version: 1,
      adapterId: 'openai-codex',
      executable: 'codex',
      detectedVersion: null,
      providerSessionId: null,
      canonicalWorkingDirectory: 'C:\\workspace\\vibespace',
      paneId: 'pane-a',
      projectId: 'project-a',
      captureMethod: 'legacy-migration',
      verifiedAt: null,
      verificationState: 'unverified',
      resumeCapability: 'exact-id',
    });
    expect(JSON.stringify(migrated)).not.toContain('pty-session-123');
    expect(JSON.stringify(migrated)).not.toContain('secret terminal output');
  });

  it.each([
    { ...binding, providerSessionId: '--last' },
    { ...binding, providerSessionId: 'abc;calc' },
    { ...binding, canonicalWorkingDirectory: '..\\escape' },
    { ...binding, paneId: '' },
    { ...binding, projectId: 'project/a' },
    { ...binding, verifiedAt: Number.NaN },
  ])('rejects malformed verified binding %# without writing storage', (candidate) => {
    const storage = new MemoryStorage();

    expect(persistVerifiedTerminalCliSessionBinding(storage, candidate)).toEqual({
      ok: false,
      reason: 'binding_invalid',
    });
    expect(storage.values.size).toBe(0);
  });

  it('fails closed over malformed storage and keeps only valid rows from a mixed envelope', () => {
    const malformed = new MemoryStorage();
    malformed.setItem(TERMINAL_CLI_SESSION_BINDINGS_KEY, '{not-json');
    expect(loadTerminalCliSessionBindings(malformed)).toEqual([]);

    const mixed = new MemoryStorage();
    mixed.setItem(
      TERMINAL_CLI_SESSION_BINDINGS_KEY,
      JSON.stringify({
        version: 1,
        bindings: [binding, { ...binding, providerSessionId: 'latest' }],
      }),
    );
    expect(loadTerminalCliSessionBindings(mixed)).toEqual([binding]);
  });

  it('replaces the same pane binding while retaining other panes in stable order', () => {
    const storage = new MemoryStorage();
    persistVerifiedTerminalCliSessionBinding(storage, binding);
    persistVerifiedTerminalCliSessionBinding(storage, {
      ...binding,
      paneId: 'pane-b',
      providerSessionId: '119bc371-82cf-7d82-ad0b-96d026aaca73',
    });
    persistVerifiedTerminalCliSessionBinding(storage, {
      ...binding,
      providerSessionId: '219bc371-82cf-7d82-ad0b-96d026aaca73',
      verifiedAt: binding.verifiedAt + 1,
    });

    expect(loadTerminalCliSessionBindings(storage).map((row) => row.paneId)).toEqual([
      'pane-b',
      'pane-a',
    ]);
    expect(loadTerminalCliSessionBindings(storage)[1]?.providerSessionId).toBe(
      '219bc371-82cf-7d82-ad0b-96d026aaca73',
    );
  });
});
