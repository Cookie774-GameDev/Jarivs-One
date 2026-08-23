import { describe, expect, it } from 'vitest';
import type { DevLogEntry } from '@/features/dev-console';
import { buildOpenCodeSystemTimeline, translateOpenCodeSystemEntry } from './opencodeSystemLog';

function entry(overrides: Partial<DevLogEntry>): DevLogEntry {
  return {
    id: 1,
    ts: Date.UTC(2026, 7, 23, 15, 0, 0),
    channel: 'ai',
    level: 'info',
    message: 'AI request → @jarvis',
    ...overrides,
  };
}

describe('OpenCode system log', () => {
  it('translates RLM evidence into one plain-language step without private payloads', () => {
    const translated = translateOpenCodeSystemEntry(
      entry({
        id: 2,
        message: 'VibeSpace Context route → rlm',
        durationMs: 1284.42,
        detail: {
          route: 'rlm',
          candidateCount: 37,
          evidenceCount: 6,
          query: 'private user question',
          evidenceSources: [{ sourceId: 'C:/private/file.ts' }],
        },
      }),
    );

    expect(translated).toMatchObject({
      kind: 'context',
      title: 'RLM found useful project context',
      status: 'success',
      durationMs: 1284.42,
    });
    expect(translated?.summary).toContain('6 trusted pieces');
    expect(JSON.stringify(translated)).not.toContain('private user question');
    expect(JSON.stringify(translated)).not.toContain('C:/private/file.ts');
  });

  it('ignores polling and unrelated app traffic', () => {
    expect(
      translateOpenCodeSystemEntry(
        entry({ channel: 'invoke', message: 'invoke siyuan_runtime_status', durationMs: 4 }),
      ),
    ).toBeNull();
    expect(
      translateOpenCodeSystemEntry(
        entry({ channel: 'fetch', message: 'GET https://example.com/weather', durationMs: 20 }),
      ),
    ).toBeNull();
  });

  it('reports provider completion with the exact visible identity and timing', () => {
    const translated = translateOpenCodeSystemEntry(
      entry({
        id: 3,
        message: 'AI done ← @jarvis (120+40 tok, $0.0000)',
        durationMs: 2450,
        detail: { provider: 'opencode-go', model: 'deepseek-v3.2', usage: { input_tokens: 120 } },
      }),
    );

    expect(translated).toMatchObject({
      kind: 'model',
      title: 'OpenCode finished the answer',
      status: 'success',
      summary: 'opencode-go · deepseek-v3.2',
      durationMs: 2450,
    });
  });

  it('explains a SiYuan Context Map sync instead of exposing a native request name', () => {
    const translated = translateOpenCodeSystemEntry(
      entry({
        id: 4,
        message: 'SiYuan Context map synchronized',
        durationMs: 387,
        detail: { fileCount: 4, updated: false },
      }),
    );
    expect(translated).toMatchObject({
      kind: 'siyuan',
      title: 'SiYuan added the Context Map',
      summary: '4 files are ready in the local project vault.',
      durationMs: 387,
    });
  });

  it('collapses repeated identical steps instead of creating a polling firehose', () => {
    const rows = buildOpenCodeSystemTimeline([
      entry({ id: 10, message: 'VibeSpace Context route → direct', detail: { route: 'direct' } }),
      entry({
        id: 11,
        ts: Date.UTC(2026, 7, 23, 15, 0, 1),
        message: 'VibeSpace Context route → direct',
        detail: { route: 'direct' },
      }),
      entry({
        id: 12,
        ts: Date.UTC(2026, 7, 23, 15, 0, 2),
        message: 'AI done ← @jarvis (10+2 tok, $0.0000)',
        detail: { provider: 'opencode', model: 'flash' },
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.repeatCount).toBe(2);
  });
});
