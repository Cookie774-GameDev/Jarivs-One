import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAccountPreviews,
  clearPreview,
  getPreview,
  setPreview,
} from './streamingPreviewStore';

const preview = {
  accountId: 'account-a',
  runId: 'run-1',
  requestId: 'request-1',
  chatId: 'chat-1',
  text: 'Safe preview.',
  updatedAt: 10,
};

describe('streaming preview store', () => {
  beforeEach(() => {
    clearAccountPreviews('account-a');
    clearAccountPreviews('account-b');
  });

  it('replaces and clears previews by exact account and run', () => {
    setPreview(preview);
    setPreview({ ...preview, text: 'Replacement.', updatedAt: 11 });
    setPreview({ ...preview, accountId: 'account-b', text: 'Other account.' });

    expect(getPreview('account-a', 'run-1')?.text).toBe('Replacement.');
    expect(getPreview('account-b', 'run-1')?.text).toBe('Other account.');

    clearPreview('account-a', 'run-1');
    expect(getPreview('account-a', 'run-1')).toBeNull();
    expect(getPreview('account-b', 'run-1')).not.toBeNull();

    clearAccountPreviews('account-b');
    expect(getPreview('account-b', 'run-1')).toBeNull();
  });

  it('detaches and freezes caller-owned preview data', () => {
    const caller = { ...preview };
    setPreview(caller);
    caller.text = 'Mutated';

    const stored = getPreview('account-a', 'run-1');
    expect(stored?.text).toBe('Safe preview.');
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('never reads or writes browser persistence', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    setPreview(preview);
    getPreview('account-a', 'run-1');
    clearPreview('account-a', 'run-1');
    clearAccountPreviews('account-a');

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
