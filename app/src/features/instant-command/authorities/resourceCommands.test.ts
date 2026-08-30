import { describe, expect, it, vi } from 'vitest';
import { executeResourceCommand, type ResourceCommandPort } from './resourceCommands';

function port(): ResourceCommandPort {
  return {
    list: vi.fn(async () => [
      { id: 'tool_1', displayName: 'Release Audit' },
      { id: 'tool_2', displayName: 'release audit' },
      { id: 'tool_3', displayName: 'Formatter' },
    ]),
    validate: vi.fn(async () => true),
    execute: vi.fn(async () => ({ status: 'queued' as const, receiptId: 'resource_1' })),
  };
}

describe('resource command authority', () => {
  it('prefers stable IDs and fails closed on ambiguous names', async () => {
    const authority = port();
    await expect(
      executeResourceCommand(
        { id: 'tool.open', family: 'tool', selector: 'Release Audit' },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_ambiguous' });
    expect(authority.execute).not.toHaveBeenCalled();

    await expect(
      executeResourceCommand({ id: 'tool.open', family: 'tool', selector: 'tool_2' }, authority),
    ).resolves.toMatchObject({ ok: true, code: 'queued' });
  });

  it('validates exact tool input schema before approval-gated execution', async () => {
    const authority = port();
    await executeResourceCommand(
      { id: 'tool.run', family: 'tool', selector: 'tool_3', args: { target: 'src' } },
      authority,
    );
    expect(authority.validate).toHaveBeenCalledWith('tool_3', { target: 'src' });
    expect(authority.execute).toHaveBeenCalledOnce();
  });

  it('rejects credential material and non-read file actions before authority dispatch', async () => {
    const authority = port();
    await expect(
      executeResourceCommand(
        {
          id: 'plugin.connect',
          family: 'plugin',
          selector: 'tool_3',
          args: { apiKey: 'not-allowed' },
        },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    await expect(
      executeResourceCommand({ id: 'file.delete', family: 'file', selector: 'tool_3' }, authority),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    expect(authority.execute).not.toHaveBeenCalled();
  });
});
