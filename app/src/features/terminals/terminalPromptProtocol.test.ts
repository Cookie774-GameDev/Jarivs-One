import { describe, expect, it } from 'vitest';
import { createTerminalPromptProtocolTracker } from './terminalPromptProtocol';

describe('terminal prompt protocol tracker', () => {
  it('fails closed until a complete OSC 133 command-start marker arrives', () => {
    const tracker = createTerminalPromptProtocolTracker({ localShell: true });

    expect(tracker.snapshot()).toMatchObject({
      promptProtocol: 'none',
      atPrompt: false,
      localShell: true,
    });
    tracker.observeOutput('\u001b]133;');
    expect(tracker.snapshot().atPrompt).toBe(false);
    tracker.observeOutput('B\u0007');
    expect(tracker.snapshot()).toMatchObject({
      promptProtocol: 'osc133',
      atPrompt: true,
    });
    tracker.observeOutput('\u001b]133;C\u0007');
    expect(tracker.snapshot().atPrompt).toBe(false);
  });

  it('tracks split alternate-screen entry and exit without screen-text guessing', () => {
    const tracker = createTerminalPromptProtocolTracker({ localShell: true });
    tracker.observeOutput('\u001b]133;B\u0007');

    tracker.observeOutput('\u001b[?10');
    tracker.observeOutput('49h');
    expect(tracker.snapshot()).toMatchObject({
      alternateScreen: true,
      atPrompt: false,
    });
    tracker.observeOutput('\u001b[?1049l');
    expect(tracker.snapshot()).toMatchObject({
      alternateScreen: false,
      atPrompt: false,
    });
  });

  it('applies explicit runtime guards and never infers safety from visible prompt-like text', () => {
    const tracker = createTerminalPromptProtocolTracker({ localShell: true });

    tracker.observeOutput('PS C:\\project> Password: $ ');
    expect(tracker.snapshot()).toMatchObject({
      promptProtocol: 'none',
      atPrompt: false,
      passwordPrompt: false,
    });
    tracker.setRuntimeGuards({
      interactiveProgram: true,
      passwordPrompt: true,
      sshSession: true,
    });
    tracker.observeOutput('\u001b]133;B\u0007');
    expect(tracker.snapshot()).toMatchObject({
      promptProtocol: 'osc133',
      atPrompt: false,
      interactiveProgram: true,
      passwordPrompt: true,
      sshSession: true,
    });
  });

  it('returns immutable snapshots and rejects accessor-backed guard updates', () => {
    const tracker = createTerminalPromptProtocolTracker({ localShell: true });
    const snapshot = tracker.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);

    let getterCalls = 0;
    expect(() =>
      tracker.setRuntimeGuards({
        get interactiveProgram() {
          getterCalls += 1;
          return false;
        },
        passwordPrompt: false,
        sshSession: false,
      }),
    ).toThrow(/runtime guards/i);
    expect(getterCalls).toBe(0);
  });

  it('recognizes an OSC string terminator split across output chunks', () => {
    const tracker = createTerminalPromptProtocolTracker({ localShell: true });

    tracker.observeOutput('\u001b]133;B\u001b');
    expect(tracker.snapshot().atPrompt).toBe(false);
    tracker.observeOutput('\\');
    expect(tracker.snapshot()).toMatchObject({
      promptProtocol: 'osc133',
      atPrompt: true,
    });
  });

  it('keeps remote and guarded sessions closed until fresh verified prompt evidence', () => {
    const remote = createTerminalPromptProtocolTracker({ localShell: false });
    remote.observeOutput('\u001b]133;B\u0007');
    expect(remote.snapshot()).toMatchObject({
      promptProtocol: 'osc133',
      atPrompt: false,
      localShell: false,
    });

    const local = createTerminalPromptProtocolTracker({ localShell: true });
    local.observeOutput('\u001b]133;B\u0007');
    local.setRuntimeGuards({
      interactiveProgram: true,
      passwordPrompt: false,
      sshSession: false,
    });
    local.setRuntimeGuards({
      interactiveProgram: false,
      passwordPrompt: false,
      sshSession: false,
    });
    expect(local.snapshot().atPrompt).toBe(false);
    local.observeOutput('\u001b]133;B\u0007');
    expect(local.snapshot().atPrompt).toBe(true);
  });

  it('discards an oversized unterminated protocol sequence instead of carrying it forward', () => {
    const tracker = createTerminalPromptProtocolTracker({ localShell: true });

    tracker.observeOutput(`\u001b]133;${'x'.repeat(300)}`);
    tracker.observeOutput('B\u0007');
    expect(tracker.snapshot()).toMatchObject({
      promptProtocol: 'none',
      atPrompt: false,
    });
  });
});
