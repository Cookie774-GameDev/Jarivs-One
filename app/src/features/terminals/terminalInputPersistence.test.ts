import { describe, expect, it } from 'vitest';
import { createPersistedInputTracker } from './terminalInputPersistence';

describe('createPersistedInputTracker', () => {
  it('tracks ordinary and Unicode draft input', () => {
    const tracker = createPersistedInputTracker();
    expect(tracker.push('echo 😀').draft).toBe('echo 😀');
    expect(tracker.currentDraft()).toBe('echo 😀');
  });

  it('backspaces one Unicode code point and clears on Ctrl+C', () => {
    const tracker = createPersistedInputTracker('echo 😀');
    expect(tracker.push('\x7f').draft).toBe('echo ');
    expect(tracker.push('\x03')).toEqual({
      draft: '',
      submittedText: null,
      flushNow: true,
    });
  });

  it('returns submitted text and clears the persisted draft on Enter', () => {
    const tracker = createPersistedInputTracker('npm test');
    expect(tracker.push('\r')).toEqual({
      draft: '',
      submittedText: 'npm test',
      flushNow: true,
    });
  });

  it('never records the reported SGR mouse sequence', () => {
    const tracker = createPersistedInputTracker('safe');
    const result = tracker.push('\x1b[<35;24;22M\x1b[<0;24;22m');
    expect(result.draft).toBe('safe');
  });

  it('holds split CSI input until the final byte and discards it', () => {
    const tracker = createPersistedInputTracker('safe');
    expect(tracker.push('\x1b[').draft).toBe('safe');
    expect(tracker.push('<35;24;22M').draft).toBe('safe');
  });

  it('discards arrow, function-key, SS3, and focus sequences', () => {
    const tracker = createPersistedInputTracker('safe');
    tracker.push('\x1b[A\x1b[15~\x1bOP\x1b[I\x1b[O');
    expect(tracker.currentDraft()).toBe('safe');
  });

  it('discards split OSC and DCS payloads', () => {
    const tracker = createPersistedInputTracker('safe');
    tracker.push('\x1b]0;private');
    tracker.push(' title\x07');
    tracker.push('\x1bP1;2|private');
    tracker.push(' payload\x1b\\');
    expect(tracker.currentDraft()).toBe('safe');
  });

  it('keeps bracketed paste text but not delimiters or pasted newlines', () => {
    const tracker = createPersistedInputTracker();
    tracker.push('\x1b[200~echo one\n');
    const result = tracker.push('two\x1b[201~');
    expect(result.draft).toBe('echo onetwo');
    expect(result.submittedText).toBeNull();
    expect(result.flushNow).toBe(false);
  });

  it('submits normal pasted text only when Enter arrives outside bracketed paste', () => {
    const tracker = createPersistedInputTracker();
    tracker.push('\x1b[200~npm test\x1b[201~');
    expect(tracker.push('\r').submittedText).toBe('npm test');
  });

  it('sanitizes orphan mouse fragments even if the ESC byte was already lost', () => {
    const tracker = createPersistedInputTracker('safe');
    tracker.push('[<35;24;22M<35;25;22M');
    expect(tracker.currentDraft()).toBe('safe');
  });

  it('bounds the draft to 4 KiB and supports replacement/reset', () => {
    const tracker = createPersistedInputTracker('old');
    tracker.replaceDraft(`prefix-${'😀'.repeat(2_000)}`);
    expect(new TextEncoder().encode(tracker.currentDraft()).byteLength).toBeLessThanOrEqual(4_096);
    tracker.reset();
    expect(tracker.currentDraft()).toBe('');
  });
});
