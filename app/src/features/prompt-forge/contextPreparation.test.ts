import { describe, expect, it, vi } from 'vitest';
import type { ContextChatAttachment } from '@/features/context/contextChatIntegration';
import type { SharedContextRetrievalResult } from '@/features/context/contextResponseIntegration';
import type { ProviderConnection } from '@/lib/ai/adapters/types';
import type { ModelPickerOption } from '@/lib/ai/useAccessibleChatModels';
import { createPromptForgeJob } from './contracts';
import {
  createPromptForgeContextPreparer,
  promptForgeModelOptionsFromPicker,
  promptForgeSourcesFromContext,
} from './contextPreparation';
import type { PromptForgeSourceCandidate } from './sourcePack';

const now = 10_000;
const attachment: ContextChatAttachment = {
  projectId: 'project-1',
  rootDir: 'C:\\workspace',
  generatedAt: 9_000,
  nodeId: 'composer-component',
  mapId: 'map-1',
  title: 'Composer',
  kind: 'symbol',
  summary: 'The Composer owns draft text.',
  attachmentLevel: 'entity',
  source: { type: 'local_folder', label: 'VibeSpace' },
  freshness: 'current',
  itemCount: 1,
  lastIndexedAt: 9_500,
  exactExcerpt: 'export function Composer() { return "draft"; }',
  path: 'app/src/features/chat/Composer.tsx',
};

const retrieval: SharedContextRetrievalResult = Object.freeze({
  queryId: 'query-1',
  mapRevisions: Object.freeze({ 'map-1': 9_000 }),
  items: Object.freeze([
    Object.freeze({
      id: 'attachment-1',
      mapId: 'map-1',
      sourceId: 'source-1',
      sourceKind: 'local_folder',
      entity: Object.freeze({
        entityId: 'composer-component',
        kind: 'component',
        label: 'Composer',
        sourceId: 'source-1',
        path: 'app/src/features/chat/Composer.tsx',
        lineStart: 1,
        lineEnd: 1,
      }),
      exactExcerpt: 'export function Composer() { return "draft"; }',
      summary: 'The Composer owns draft text.',
      freshness: 'current',
      ranking: Object.freeze({
        score: 1,
        reasons: Object.freeze(['explicit_attachment', 'lexical_match'] as const),
      }),
      citation: Object.freeze({
        label: 'Composer',
        action: Object.freeze({
          kind: 'open_source',
          sourceKind: 'local_folder',
          mapId: 'map-1',
          entityId: 'composer-component',
          path: 'app/src/features/chat/Composer.tsx',
          lineStart: 1,
          lineEnd: 1,
        }),
      }),
      provenance: Object.freeze({ sourceRevision: '9000', indexedAt: 9_500 }),
    }),
  ]),
  relatedEntities: Object.freeze([]),
  omittedCount: 0,
  staleItems: Object.freeze([]),
  warnings: Object.freeze([]),
  builtAt: now,
  sourceLabels: Object.freeze({ 'source-1': 'VibeSpace' }),
  evidenceKinds: Object.freeze({ 'attachment-1': 'exact_excerpt' }),
});

const localConnection: ProviderConnection = {
  id: 'ollama-local',
  adapterId: 'ollama',
  providerId: 'ollama',
  displayName: 'Ollama',
  mode: 'local',
  authSource: 'none',
  capabilities: {
    text: true,
    images: false,
    files: false,
    tools: false,
    modelSelection: true,
    structuredOutput: false,
    streaming: true,
    cancellation: true,
    resumeSession: false,
    systemPrompt: true,
    workingDirectory: false,
    usage: false,
    subscriptionQuota: false,
    localOnly: true,
  },
  promptTransport: 'native-system',
  enabled: true,
};

const pickerOptions: readonly ModelPickerOption[] = Object.freeze([
  Object.freeze({
    id: 'ollama-local:qwen3:8b',
    provider: 'ollama',
    modelId: 'qwen3:8b',
    label: 'Qwen 3 8B',
    connectionId: 'ollama-local',
    connection: Object.freeze(localConnection),
    available: true,
  }),
]);

function job(
  patch: Partial<{
    privacyMode: 'local_only' | 'provider_allowed';
    allowPublicResearch: boolean;
  }> = {},
) {
  return createPromptForgeJob({
    id: 'forge-job-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    projectId: 'project-1',
    originalDraft: 'Keep "draft" and the number 42.',
    originalAttachments: [],
    modelSelection: { mode: 'prefer_local' },
    privacyMode: patch.privacyMode ?? 'local_only',
    allowPublicResearch: patch.allowPublicResearch ?? false,
    now: 100,
  });
}

describe('Prompt Forge context preparation', () => {
  it('recognizes exact normalized Context paths without treating partial names as exact', () => {
    expect(
      promptForgeSourcesFromContext(
        retrieval,
        'project-1',
        now,
        'Update app\\src\\features\\chat\\Composer.tsx',
      )[0],
    ).toMatchObject({ exactMatch: true });
    expect(
      promptForgeSourcesFromContext(retrieval, 'project-1', now, 'Update Composition')[0],
    ).toMatchObject({ exactMatch: false });
  });

  it('preserves related Canvas identity and shared retrieval ranking signals', () => {
    const canvasResult: SharedContextRetrievalResult = Object.freeze({
      ...retrieval,
      items: Object.freeze([
        Object.freeze({
          ...retrieval.items[0]!,
          id: 'canvas-object-1',
          entity: Object.freeze({
            ...retrieval.items[0]!.entity,
            entityId: 'canvas-object-1',
            kind: 'canvas_object' as const,
            label: 'Authentication flow',
            path: undefined,
            lineStart: undefined,
            lineEnd: undefined,
          }),
          exactExcerpt: 'Sign in → verify entitlement → open workspace',
          summary: 'Selected authentication flow from the related Canvas document.',
          ranking: Object.freeze({
            score: 0.92,
            reasons: Object.freeze([
              'explicit_attachment',
              'task_intent',
              'lexical_match',
              'semantic_match',
            ] as const),
          }),
          citation: Object.freeze({
            label: 'Authentication flow',
            action: Object.freeze({
              kind: 'open_source' as const,
              sourceKind: 'local_folder' as const,
              mapId: 'map-1',
              entityId: 'canvas-object-1',
            }),
          }),
        }),
      ]),
      evidenceKinds: Object.freeze({ 'canvas-object-1': 'exact_excerpt' as const }),
    });

    expect(
      promptForgeSourcesFromContext(
        canvasResult,
        'project-1',
        now,
        'Update the Authentication flow',
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'canvas',
        label: 'Authentication flow',
        explicit: true,
        projectScoped: true,
        exactMatch: true,
        lexicalScore: 1,
        semanticScore: 1,
        taskIntentScore: 1,
        content: 'Sign in → verify entitlement → open workspace',
      }),
    ]);
  });

  it('uses the shared Context retrieval result to build a cited, injection-fenced source pack', async () => {
    const retrieveContext = vi.fn(async () => ({
      ...retrieval,
      omittedCount: 2,
      warnings: Object.freeze(['Context retrieval reached its token budget.']),
    }));
    const collectAdditionalSources = vi.fn(async () => [
      {
        id: 'agent:jarvis',
        kind: 'agent' as const,
        label: 'Jarvis',
        reference: 'agent://jarvis',
        content: 'Primary VibeSpace assistant.',
        verified: true,
        explicit: true,
        projectScoped: true,
        trust: 'user' as const,
        lexicalScore: 0,
        semanticScore: null,
        observedAt: now,
        whySelected: 'Explicitly attached.',
      },
    ]);
    const stage = vi.fn(async () => undefined);
    const preparer = createPromptForgeContextPreparer({
      contextAttachments: [attachment],
      modelOptions: promptForgeModelOptionsFromPicker(pickerOptions),
      currentChatSelection: { mode: 'none' },
      offlineMode: false,
      defaultLocalModel: 'qwen3:8b',
      retrieveContext,
      collectAdditionalSources,
      now: () => now,
    });

    const prepared = await preparer({
      job: job(),
      signal: new AbortController().signal,
      stage,
    });

    expect(retrieveContext).toHaveBeenCalledOnce();
    expect(retrieveContext).toHaveBeenCalledWith({
      projectId: 'project-1',
      chatId: 'chat-1',
      userText: 'Keep "draft" and the number 42.',
      attachments: [attachment],
      now,
    });
    expect(stage.mock.calls).toEqual([['searching_project'], ['building_source_pack']]);
    expect(prepared.resolvedModel).toMatchObject({
      modelId: 'qwen3:8b',
      connectionId: 'ollama-local',
      local: true,
    });
    expect(prepared.sourcePack.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'project_symbol',
          label: 'Composer',
          reference: 'app/src/features/chat/Composer.tsx#L1',
          explicit: true,
        }),
        expect.objectContaining({ kind: 'agent', label: 'Jarvis' }),
      ]),
    );
    expect(prepared.sourcePack.markdown).toContain('UNTRUSTED SOURCE DATA');
    expect(prepared.sourcePack.markdown).toContain('export function Composer');
    expect(prepared.sourcePack.warnings).toEqual(
      expect.arrayContaining([
        'Context retrieval reached its token budget.',
        'Shared Context retrieval omitted 2 additional sources.',
      ]),
    );
    expect(prepared.preservation.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'quote', value: '"draft"' }),
        expect.objectContaining({
          kind: 'directive',
          value: 'Keep "draft" and the number 42.',
        }),
      ]),
    );
    expect(prepared.sourcesConsidered).toBe(4);
  });

  it('maps connection-qualified picker options without losing runtime or availability identity', () => {
    expect(promptForgeModelOptionsFromPicker(pickerOptions)).toEqual([
      {
        id: 'ollama-local:qwen3:8b',
        providerId: 'ollama',
        modelId: 'qwen3:8b',
        label: 'Qwen 3 8B',
        connectionId: 'ollama-local',
        connectionMode: 'local',
        localOnly: true,
        available: true,
      },
    ]);
  });

  it('runs explicit public research only with provider privacy and per-run authorization', async () => {
    const publicSource: PromptForgeSourceCandidate = {
      id: 'web-docs',
      kind: 'public_web',
      label: 'Official docs',
      reference: 'https://example.com/docs',
      content: 'Current official guidance.',
      verified: true,
      explicit: false,
      projectScoped: false,
      trust: 'official',
      lexicalScore: 1,
      semanticScore: null,
      observedAt: now,
      whySelected: 'Matches the request.',
    };
    const researchPublicSources = vi.fn(async () => [publicSource]);
    const build = (
      privacyMode: 'local_only' | 'provider_allowed',
      excludedSourceIds: readonly string[] = [],
    ) =>
      createPromptForgeContextPreparer({
        contextAttachments: [],
        modelOptions: promptForgeModelOptionsFromPicker(pickerOptions),
        currentChatSelection: { mode: 'none' },
        offlineMode: false,
        defaultLocalModel: 'qwen3:8b',
        retrieveContext: async () => ({ ...retrieval, items: Object.freeze([]) }),
        researchPublicSources,
        excludedSourceIds,
        now: () => now,
      });

    const localStage = vi.fn(async () => undefined);
    const local = await build('local_only')({
      job: job({ privacyMode: 'local_only', allowPublicResearch: true }),
      signal: new AbortController().signal,
      stage: localStage,
    });
    expect(researchPublicSources).not.toHaveBeenCalled();
    expect(local.sourcePack.sources).toHaveLength(0);
    expect(localStage).not.toHaveBeenCalledWith('searching_public_sources');

    const providerStage = vi.fn(async () => undefined);
    const provider = await build('provider_allowed')({
      job: job({ privacyMode: 'provider_allowed', allowPublicResearch: true }),
      signal: new AbortController().signal,
      stage: providerStage,
    });
    expect(researchPublicSources).toHaveBeenCalledOnce();
    expect(providerStage.mock.calls).toEqual([
      ['searching_project'],
      ['searching_public_sources'],
      ['building_source_pack'],
    ]);
    expect(provider.sourcePack.sources).toEqual([
      expect.objectContaining({ id: 'web-docs', kind: 'public_web' }),
    ]);

    const excluded = await build('provider_allowed', ['web-docs'])({
      job: job({ privacyMode: 'provider_allowed', allowPublicResearch: true }),
      signal: new AbortController().signal,
      stage: vi.fn(async () => undefined),
    });
    expect(excluded.sourcePack.sources).toHaveLength(0);
  });

  it('stops after shared retrieval when cancellation is requested', async () => {
    const controller = new AbortController();
    const stage = vi.fn(async () => undefined);
    const preparer = createPromptForgeContextPreparer({
      contextAttachments: [],
      modelOptions: promptForgeModelOptionsFromPicker(pickerOptions),
      currentChatSelection: { mode: 'none' },
      offlineMode: false,
      defaultLocalModel: 'qwen3:8b',
      retrieveContext: async () => {
        controller.abort();
        return retrieval;
      },
      now: () => now,
    });

    await expect(
      preparer({
        job: job(),
        signal: controller.signal,
        stage,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(stage).toHaveBeenCalledOnce();
    expect(stage).toHaveBeenCalledWith('searching_project');
  });
});
