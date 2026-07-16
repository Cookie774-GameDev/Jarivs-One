import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderCapabilities, ProviderConnection } from '@/lib/ai/adapters/types';
import type { Chat } from '@/types/chat';
import type { SyncQueueRow } from './schema';

const state = vi.hoisted(() => ({
  chats: new Map<string, Record<string, unknown>>(),
  syncRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('./index', () => ({
  db: {
    chats: {
      async add(row: Record<string, unknown>) {
        state.chats.set(row.id as string, { ...row });
      },
      async get(id: string) {
        return state.chats.get(id);
      },
      async update(id: string, patch: Record<string, unknown>) {
        const row = state.chats.get(id);
        if (!row) return 0;
        state.chats.set(id, { ...row, ...patch });
        return 1;
      },
    },
    sync_queue: {
      where() {
        return {
          equals(status: string) {
            return {
              filter(predicate: (row: Record<string, unknown>) => boolean) {
                return {
                  async first() {
                    return state.syncRows.find(
                      (row) => row.status === status && predicate(row),
                    );
                  },
                };
              },
            };
          },
        };
      },
      async add(row: Record<string, unknown>) {
        state.syncRows.push({ ...row });
      },
      async update(id: string, patch: Record<string, unknown>) {
        const row = state.syncRows.find((candidate) => candidate.id === id);
        if (row) Object.assign(row, patch);
      },
    },
  },
}));

import { chatRepo } from './repositories';

const capabilities: ProviderCapabilities = {
  text: true,
  images: false,
  files: false,
  tools: true,
  modelSelection: true,
  structuredOutput: true,
  streaming: true,
  cancellation: true,
  resumeSession: true,
  systemPrompt: true,
  workingDirectory: true,
  usage: true,
  subscriptionQuota: true,
  localOnly: true,
};

const codexConnection: ProviderConnection = {
  id: 'openai-codex',
  adapterId: 'codex-cli',
  providerId: 'openai',
  displayName: 'OpenAI Codex subscription',
  mode: 'external-cli',
  authSource: 'codex-cli-login',
  modelId: 'gpt-5.2-codex',
  capabilities,
  enabled: true,
};

const localConnection: ProviderConnection = {
  ...codexConnection,
  id: 'ollama-local',
  adapterId: 'ollama',
  providerId: 'ollama',
  displayName: 'Ollama local',
  mode: 'local',
  authSource: 'none',
  modelId: 'llama3.2',
};

describe('chat repository connections', () => {
  beforeEach(() => {
    state.chats.clear();
    state.syncRows.length = 0;
  });

  it('round-trips the exact selected connection through local create and update', async () => {
    const created = await chatRepo.create({
      id: 'cht_connection' as Chat['id'],
      workspace_id: 'wsp_test' as Chat['workspace_id'],
      title: 'CLI chat',
      mode: 'chat',
      active_agent_ids: [],
      connection: codexConnection,
    });

    expect(created.connection).toEqual(codexConnection);
    expect((await chatRepo.getById(created.id))?.connection).toEqual(codexConnection);

    const updated = await chatRepo.update(created.id, { connection: localConnection });
    expect(updated.connection).toEqual(localConnection);
    expect((await chatRepo.getById(created.id))?.connection).toEqual(localConnection);
  });

  it('omits the local connection from cloud sync payload serialization', async () => {
    await chatRepo.create({
      id: 'cht_sync' as Chat['id'],
      workspace_id: 'wsp_test' as Chat['workspace_id'],
      title: 'Local-only connection',
      mode: 'chat',
      active_agent_ids: [],
      connection: codexConnection,
    });

    expect(state.syncRows).toHaveLength(1);
    const queued = state.syncRows[0] as unknown as SyncQueueRow;
    expect(queued.table).toBe('chats');
    expect(queued.payload).not.toHaveProperty('connection');
  });
});
