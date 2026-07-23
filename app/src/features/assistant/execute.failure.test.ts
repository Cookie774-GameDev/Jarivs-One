import { beforeEach, describe, expect, it, vi } from 'vitest';

const workbenchWindowMocks = vi.hoisted(() => ({
  openOrFocusWorkbenchWindow: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/features/workbench/window', () => ({
  openOrFocusWorkbenchWindow: workbenchWindowMocks.openOrFocusWorkbenchWindow,
  openDetachedWorkbench: vi.fn(async () => ({ ok: true })),
  isWorkbenchDetachedSearch: () => false,
}));

import { executeIntent } from './execute';

describe('assistant executor failure reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workbenchWindowMocks.openOrFocusWorkbenchWindow.mockReset().mockResolvedValue({ ok: true });
  });

  it.each([
    ['Error', new Error('synthetic window implementation detail')],
    ['non-Error', 'synthetic non-error implementation detail'],
  ])('uses precise safe JARVIS copy for an unexpected %s throw', async (_label, thrown) => {
    workbenchWindowMocks.openOrFocusWorkbenchWindow.mockRejectedValueOnce(thrown);

    const result = await executeIntent({ kind: 'workbench', action: 'open' });

    expect(result).toEqual({
      ok: false,
      message:
        'The action failed, sir. Action: Assistant command (workbench). Cause: The command executor returned an unexpected failure.',
    });
    expect(result.message).not.toBe('Something went wrong.');
    expect(result.message).not.toContain(String(thrown instanceof Error ? thrown.message : thrown));
  });
});
