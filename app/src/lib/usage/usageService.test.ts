import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CODEX_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import { OLLAMA_LOCAL_CONNECTION } from '@/lib/ai/adapters/nativeCatalog';
import { messageRepo } from '@/lib/db/repositories';
import { getAllUsage, getUsage, parseUsageSlashCommand } from './usageService';

vi.mock('@/lib/db/repositories', () => ({
  messageRepo: { listByChat: vi.fn() },
}));

describe('truthful usage service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates only current-chat response metadata and never invents quota zero', async () => {
    vi.mocked(messageRepo.listByChat).mockResolvedValue([{
      id: 'm1', chat_id: 'chat-1', role: 'assistant', parts: [], created_at: 1, updated_at: 1,
      usage: { provider: 'openai', input_tokens: 8, output_tokens: 3 },
    }] as never);
    const usage = await getUsage(CODEX_CLI_CONNECTION, 'chat-1' as never, 'default');
    expect(messageRepo.listByChat).toHaveBeenCalledWith('chat-1');
    expect(usage.currentChat.totalTokens).toMatchObject({ value: 11, provenance: 'local-exact' });
    expect(usage.quota.value).toBeUndefined();
    expect(usage.quota.provenance).toBe('unavailable');
  });

  it('labels local runtime as having no subscription quota', async () => {
    vi.mocked(messageRepo.listByChat).mockResolvedValue([]);
    const usage = await getUsage(OLLAMA_LOCAL_CONNECTION, 'chat-2' as never);
    expect(usage.quota).toMatchObject({ provenance: 'unavailable', reason: 'No subscription quota.' });
    expect(usage.currentChat.requests.value).toBeUndefined();
  });

  it('loads the chat once for an all-connection summary', async () => {
    vi.mocked(messageRepo.listByChat).mockResolvedValue([]);
    const usage = await getAllUsage([CODEX_CLI_CONNECTION, OLLAMA_LOCAL_CONNECTION], 'chat-3' as never);
    expect(usage).toHaveLength(2);
    expect(messageRepo.listByChat).toHaveBeenCalledOnce();
  });

  it.each([
    ['/usage', 'default'], ['/usage refresh', 'refresh'], ['/usage session', 'session'], ['/usage all', 'all'],
  ])('intercepts %s as %s', (command, mode) => {
    expect(parseUsageSlashCommand(command)).toBe(mode);
  });
});
