import { describe, expect, it, vi } from 'vitest';

import type { ActionDef } from './types';
import {
  CORE_ACTION_IDS,
  createJarvisCoreActions,
  parseAgentBatch,
  waitForAgentBatch,
  waitForTerminalExecutions,
} from './registryJarvisCore';

function action(
  id: string,
  run = vi.fn(async () => ({ ok: true as const, summary: 'done' })),
): ActionDef {
  return {
    id,
    category: 'custom',
    label: id,
    description: id,
    params: [],
    run,
  };
}

describe('Jarvis canonical core actions', () => {
  it('registers every stable action id exactly once', () => {
    const actions = createJarvisCoreActions(() => undefined);
    expect(actions.map((item) => item.id)).toEqual(CORE_ACTION_IDS);
    expect(new Set(actions.map((item) => item.id)).size).toBe(actions.length);
    expect(actions.map((item) => item.id)).not.toContain('plugin.invoke');
  });

  it('never exposes a model-controlled filesystem root on automatic file search', () => {
    const search = createJarvisCoreActions(() => undefined).find(
      (item) => item.id === 'file.search',
    )!;

    expect(search.autoApprove).toBe(true);
    expect(search.params.map((param) => param.key)).toEqual(['query', 'maxResults']);
  });

  it('maps terminal.create_many onto the real terminal queue action', async () => {
    const run = vi.fn(async () => ({ ok: true as const, summary: 'queued' }));
    const legacy = [action('terminal.bulkOpen', run)];
    const actions = createJarvisCoreActions((id) => legacy.find((item) => item.id === id));

    const result = await actions
      .find((item) => item.id === 'terminal.create_many')!
      .run({ count: 3, cwd: 'C:\\work' }, { source: 'ai', chatId: 'chat-1' });

    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledWith(
      { count: 3, cwd: 'C:\\work', command: '' },
      { source: 'ai', chatId: 'chat-1' },
    );
  });

  it('fails truthfully when a required host action is unavailable', async () => {
    const action = createJarvisCoreActions(() => undefined).find(
      (item) => item.id === 'terminal.create',
    )!;

    await expect(action.run({}, { source: 'ai' })).resolves.toEqual({
      ok: false,
      error: 'Required host action terminal.bulkOpen is unavailable.',
    });
  });

  it('verifies every queued terminal actually reaches a started state', async () => {
    let reads = 0;
    const result = await waitForTerminalExecutions(['one', 'two'], {
      timeoutMs: 100,
      read: () => {
        reads += 1;
        return reads === 1
          ? { one: { status: 'queued' }, two: { status: 'starting' } }
          : {
              one: { status: 'running', sessionId: 's1' },
              two: { status: 'running', sessionId: 's2' },
            };
      },
      sleep: async () => undefined,
      now: (() => {
        let now = 0;
        return () => ++now;
      })(),
    });
    expect(result).toEqual({ ok: true, sessionIds: ['s1', 's2'] });
  });

  it('does not report failed or timed-out terminal launches as complete', async () => {
    await expect(
      waitForTerminalExecutions(['one'], {
        timeoutMs: 100,
        read: () => ({ one: { status: 'failed' } }),
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/failed/i) });

    let now = 0;
    await expect(
      waitForTerminalExecutions(['one'], {
        timeoutMs: 2,
        read: () => ({ one: { status: 'queued' } }),
        sleep: async () => undefined,
        now: () => ++now,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/within/i) });
  });

  it('stops terminal and agent observers when their parent run is cancelled', async () => {
    await expect(
      waitForTerminalExecutions(['one'], {
        timeoutMs: 50,
        read: () => ({ one: { status: 'queued' } }),
        cancelled: () => true,
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/cancelled/i) });

    await expect(
      waitForAgentBatch(['a'], {
        timeoutMs: 50,
        read: () => ({ a: { status: 'running' } }),
        cancelled: () => true,
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/cancelled/i) });
  });

  it('validates bounded multi-agent task batches and observes completion', async () => {
    expect(
      parseAgentBatch(
        JSON.stringify([
          { task: 'Inspect chat files only.' },
          { task: 'Inspect terminal files only.' },
        ]),
      ),
    ).toEqual([{ task: 'Inspect chat files only.' }, { task: 'Inspect terminal files only.' }]);
    expect(parseAgentBatch(JSON.stringify([{ task: '' }]))).toBeNull();

    const result = await waitForAgentBatch(['a', 'b'], {
      timeoutMs: 50,
      read: () => ({
        a: { status: 'done', summary: 'Chat inspected.' },
        b: { status: 'done', summary: 'Terminals inspected.' },
      }),
      sleep: async () => undefined,
      now: () => 0,
    });
    expect(result).toEqual({ ok: true, summaries: ['Chat inspected.', 'Terminals inspected.'] });
  });

  it('surfaces blocked child agents instead of claiming batch completion', async () => {
    await expect(
      waitForAgentBatch(['a'], {
        timeoutMs: 50,
        read: () => ({ a: { status: 'blocked', error: 'Needs a decision.' } }),
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).resolves.toEqual({ ok: false, error: 'Agent a is blocked: Needs a decision.' });
  });
});
