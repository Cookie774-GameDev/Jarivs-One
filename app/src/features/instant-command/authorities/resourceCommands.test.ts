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
    consumeGrant: vi.fn(async () => true),
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
      {
        id: 'tool.run',
        family: 'tool',
        selector: 'tool_3',
        args: { target: 'src' },
        approval: { commandId: 'tool.run', targetId: 'tool_3', nonce: 'grant_1' },
      },
      authority,
    );
    expect(authority.validate).toHaveBeenCalledWith('tool_3', { target: 'src' });
    expect(authority.consumeGrant).toHaveBeenCalledWith('approval', {
      commandId: 'tool.run',
      targetId: 'tool_3',
      nonce: 'grant_1',
    });
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

  it('requires exact confirmation and approval bindings for guarded families', async () => {
    const authority = port();
    await expect(
      executeResourceCommand(
        { id: 'project.archive', family: 'project', selector: 'tool_3' },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'confirmation_required' });
    await expect(
      executeResourceCommand(
        { id: 'plugin.connect', family: 'plugin', selector: 'tool_3' },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'confirmation_required' });
    expect(authority.execute).not.toHaveBeenCalled();
  });

  it('dispatches targetless create/list commands without inventing an entity', async () => {
    const authority = port();
    await expect(
      executeResourceCommand({ id: 'chat.create', family: 'chat' }, authority),
    ).resolves.toMatchObject({ ok: true, code: 'queued' });
    expect(authority.list).not.toHaveBeenCalled();
    expect(authority.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chat.create', family: 'chat' }),
    );
  });

  it('rejects unknown family commands and raw transcript context', async () => {
    const authority = port();
    await expect(
      executeResourceCommand({ id: 'chat.destroy_everything', family: 'chat' }, authority),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    await expect(
      executeResourceCommand(
        {
          id: 'context.give_terminals',
          family: 'context',
          selector: 'tool_3',
          args: { transcript: 'raw conversation' },
          approval: {
            commandId: 'context.give_terminals',
            targetId: 'tool_3',
            nonce: 'grant_context',
          },
        },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    expect(authority.execute).not.toHaveBeenCalled();
  });

  it('consumes an exact nonce-bound grant once and rejects reuse', async () => {
    const authority = port();
    vi.mocked(authority.consumeGrant).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const request = {
      id: 'project.archive',
      family: 'project' as const,
      selector: 'tool_3',
      confirmation: {
        commandId: 'project.archive',
        targetId: 'tool_3',
        nonce: 'grant_once',
      },
    };

    await expect(executeResourceCommand(request, authority)).resolves.toMatchObject({ ok: true });
    await expect(executeResourceCommand(request, authority)).resolves.toEqual({
      ok: false,
      code: 'confirmation_required',
      message: 'That resource grant is expired or already used.',
    });
    expect(authority.execute).toHaveBeenCalledOnce();
  });

  it('rejects wrong or unbounded bindings before grant consumption or resource listing', async () => {
    const authority = port();
    await expect(
      executeResourceCommand(
        {
          id: 'project.archive',
          family: 'project',
          selector: 'tool_3',
          confirmation: {
            commandId: 'project.archive',
            targetId: 'tool_2',
            nonce: 'grant_wrong',
          },
        },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'confirmation_required' });
    expect(authority.consumeGrant).not.toHaveBeenCalled();

    vi.mocked(authority.list).mockClear();
    await expect(
      executeResourceCommand(
        { id: 'tool.open', family: 'tool', selector: `bad\nselector` },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_missing' });
    expect(authority.list).not.toHaveBeenCalled();
  });

  it('keeps authority receipt IDs and backend exceptions out of user receipts', async () => {
    const authority = port();
    vi.mocked(authority.execute).mockResolvedValueOnce({
      status: 'rejected',
      receiptId: 'private-backend-receipt',
    });
    const rejected = await executeResourceCommand(
      { id: 'tool.open', family: 'tool', selector: 'tool_3' },
      authority,
    );
    expect(rejected).toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Resource command rejected.',
    });
    expect(JSON.stringify(rejected)).not.toContain('private-backend-receipt');

    vi.mocked(authority.list).mockRejectedValueOnce(new Error('private repository detail'));
    const failed = await executeResourceCommand(
      { id: 'tool.open', family: 'tool', selector: 'tool_3' },
      authority,
    );
    expect(failed).toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Resource command failed.',
    });
    expect(JSON.stringify(failed)).not.toContain('private repository detail');
  });
});
