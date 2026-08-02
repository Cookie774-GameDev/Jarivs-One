import { describe, expect, it } from 'vitest';
import {
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  type CanvasDocument,
} from './contracts';
import { createCanvasHistory } from './history';
import {
  CANVAS_AI_ACTIONS,
  CANVAS_AI_SELECTION_ACTIONS,
  CANVAS_AI_WHOLE_CANVAS_ACTIONS,
  CanvasAiValidationError,
  applyCanvasAiPreview,
  createCanvasAiDispatch,
  createCanvasAiPreview,
  createCanvasAiRequest,
  type CanvasAiRequest,
} from './aiActions';

const NOW = 1_750_000_000_000;

function document(): CanvasDocument {
  const empty = createCanvasDocument({
    id: 'canvas-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    now: NOW - 100,
    title: 'Launch notes',
  });
  return withBlockAdded(
    empty,
    createCanvasBlock({
      id: 'source-1',
      content: { kind: 'note', text: 'Ship the desktop beta in September.' },
      now: NOW - 50,
    }),
    NOW - 50,
  );
}

function selectionRequest(overrides: Record<string, unknown> = {}): CanvasAiRequest {
  return createCanvasAiRequest({
    id: 'request-1',
    canvasId: 'canvas-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    action: 'summarize',
    scope: { kind: 'selection', blockIds: ['source-1'] },
    prompt: null,
    modelSelection: { mode: 'prefer_local' },
    privacyMode: 'local_only',
    sourceReferences: [
      {
        id: 'source-ref-1',
        kind: 'canvas-block',
        reference: 'source-1',
        label: 'Launch note',
      },
    ],
    createdAt: NOW,
    ...overrides,
  });
}

function wholeCanvasRequest(overrides: Record<string, unknown> = {}): CanvasAiRequest {
  return createCanvasAiRequest({
    id: 'request-whole',
    canvasId: 'canvas-1',
    projectId: 'project-1',
    ownerId: 'owner-1',
    action: 'identify-missing-areas',
    scope: { kind: 'whole-canvas' },
    prompt: null,
    modelSelection: {
      mode: 'single',
      providerId: 'anthropic',
      modelId: 'claude-sonnet',
      connectionId: 'anthropic-main',
    },
    privacyMode: 'provider_allowed',
    sourceReferences: [],
    createdAt: NOW,
    ...overrides,
  });
}

describe('Canvas AI action requests and routing', () => {
  it('exposes every selection and whole-canvas action without overlap', () => {
    expect(CANVAS_AI_SELECTION_ACTIONS).toEqual([
      'summarize',
      'rewrite',
      'expand',
      'extract-action-items',
      'generate-mind-map',
      'generate-flowchart',
      'generate-system-diagram',
      'generate-database',
      'generate-presentation-outline',
      'organize',
      'label-clusters',
      'find-duplicates',
      'send-to-prompt-forge',
    ]);
    expect(CANVAS_AI_WHOLE_CANVAS_ACTIONS).toEqual([
      'generate-from-prompt',
      'answer-from-selection',
      'identify-missing-areas',
      'create-release-plan',
      'create-repository-architecture',
      'create-storyboard',
    ]);
    expect(CANVAS_AI_ACTIONS).toHaveLength(19);
    expect(new Set(CANVAS_AI_ACTIONS)).toHaveProperty('size', 19);
  });

  it('creates an immutable source-aware selection request and Jarvis router dispatch', () => {
    const request = selectionRequest();
    const dispatch = createCanvasAiDispatch(request);

    expect(request.previewRequired).toBe(true);
    expect(request.router).toBe('jarvis-model-router');
    expect(dispatch).toMatchObject({
      requestId: 'request-1',
      router: 'jarvis-model-router',
      purpose: 'canvas_summarize',
      destination: 'canvas',
      modelSelection: { mode: 'prefer_local' },
      privacyMode: 'local_only',
    });
    expect(dispatch.messages).toHaveLength(1);
    expect(dispatch.messages[0]?.content).toContain('source-ref-1');
    expect(dispatch.messages[0]?.content).not.toContain('Ship the desktop beta');
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.sourceReferences)).toBe(true);
    expect(Object.isFrozen(dispatch)).toBe(true);
  });

  it('maps structural and presentation actions to the shared router purposes', () => {
    expect(createCanvasAiDispatch(selectionRequest({ action: 'generate-mind-map' })).purpose).toBe(
      'canvas_mind_map',
    );
    expect(
      createCanvasAiDispatch(selectionRequest({ action: 'generate-presentation-outline' })).purpose,
    ).toBe('canvas_presentation');
    expect(
      createCanvasAiDispatch(
        wholeCanvasRequest({
          action: 'generate-from-prompt',
          prompt: 'Plan a launch campaign',
        }),
      ).purpose,
    ).toBe('canvas_generate');
    expect(
      createCanvasAiDispatch(selectionRequest({ action: 'send-to-prompt-forge' })),
    ).toMatchObject({ purpose: 'prompt_forge', destination: 'prompt-forge' });
  });

  it('rejects action/scope mismatches and missing selection sources', () => {
    expect(() =>
      selectionRequest({
        action: 'create-storyboard',
      }),
    ).toThrow(CanvasAiValidationError);
    expect(() =>
      wholeCanvasRequest({
        action: 'summarize',
      }),
    ).toThrow(CanvasAiValidationError);
    expect(() =>
      selectionRequest({
        sourceReferences: [],
      }),
    ).toThrow(/source/i);
    expect(() =>
      wholeCanvasRequest({
        action: 'answer-from-selection',
      }),
    ).toThrow(/source/i);
    expect(() =>
      selectionRequest({
        sourceReferences: [
          {
            id: 'source-ref-1',
            kind: 'canvas-block',
            reference: 'source-1',
            label: 'Launch note',
          },
          {
            id: 'source-ref-extra',
            kind: 'canvas-block',
            reference: 'source-2',
            label: 'Unselected note',
          },
        ],
      }),
    ).toThrow(/outside.*selection/i);
  });

  it('requires a prompt for generation and rejects malformed, unsafe, or oversized input', () => {
    expect(() => wholeCanvasRequest({ action: 'generate-from-prompt', prompt: null })).toThrow(
      /prompt/i,
    );
    expect(() => selectionRequest({ prompt: 'rewrite\u202ethis' })).toThrow(/unsafe/i);
    expect(() => selectionRequest({ prompt: 'x'.repeat(20_001) })).toThrow(/20,000/i);
    expect(() =>
      selectionRequest({
        extra: 'forged',
      }),
    ).toThrow(/unexpected/i);
    expect(() =>
      selectionRequest({
        sourceReferences: [
          {
            id: 'source-ref-1',
            kind: 'project-file',
            reference: '../../secrets.env',
            label: 'Secrets',
          },
        ],
      }),
    ).toThrow(/unsafe/i);
  });

  it('enforces exact local/cloud privacy choices', () => {
    expect(() =>
      selectionRequest({
        modelSelection: {
          mode: 'single',
          providerId: 'openai',
          modelId: 'gpt-5',
        },
      }),
    ).toThrow(/local_only/i);
    expect(() => selectionRequest({ modelSelection: { mode: 'current_chat_model' } })).toThrow(
      /local_only/i,
    );

    expect(
      selectionRequest({
        modelSelection: {
          mode: 'single',
          providerId: 'ollama',
          modelId: 'qwen3',
        },
      }).modelSelection,
    ).toEqual({ mode: 'single', providerId: 'ollama', modelId: 'qwen3' });

    expect(() =>
      selectionRequest({
        action: 'send-to-prompt-forge',
        privacyMode: 'provider_allowed',
      }),
    ).toThrow(/Prompt Forge.*local_only/i);
  });
});

describe('Canvas AI previews and atomic insertion', () => {
  it('creates a frozen preview tied to its request, model, and exact sources', () => {
    const request = selectionRequest();
    const preview = createCanvasAiPreview({
      id: 'preview-1',
      request,
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3',
        connectionId: 'ollama-local',
        local: true,
      },
      summary: 'One generated note',
      generatedBlocks: [
        {
          id: 'generated-1',
          content: { kind: 'note', text: 'Desktop beta: September.' },
          sourceReferenceIds: ['source-ref-1'],
        },
      ],
      createdAt: NOW + 10,
    });

    expect(preview.status).toBe('preview');
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.generatedBlocks[0]?.sourceReferences).toEqual([
      {
        id: 'source-ref-1',
        kind: 'canvas-block',
        reference: 'source-1',
        label: 'Launch note',
      },
    ]);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.generatedBlocks[0]?.content)).toBe(true);
  });

  it('allows prompt-generated whole-canvas blocks without invented sources', () => {
    const preview = createCanvasAiPreview({
      id: 'preview-prompt',
      request: wholeCanvasRequest({
        action: 'generate-from-prompt',
        prompt: 'Plan a launch campaign',
      }),
      resolvedModel: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet',
        connectionId: 'anthropic-main',
        local: false,
      },
      summary: 'Generated from the caller prompt',
      generatedBlocks: [
        {
          id: 'generated-prompt',
          content: { kind: 'note', text: 'Launch campaign' },
          sourceReferenceIds: [],
        },
      ],
      createdAt: NOW + 10,
    });

    expect(preview.generatedBlocks[0]?.sourceReferences).toEqual([]);
  });

  it('rejects untraceable, duplicate, scope-incompatible, and oversized model output', () => {
    const request = selectionRequest();
    const base = {
      id: 'preview-1',
      request,
      resolvedModel: {
        providerId: 'ollama' as const,
        modelId: 'qwen3',
        connectionId: 'ollama-local',
        local: true,
      },
      summary: 'Generated output',
      createdAt: NOW + 10,
    };
    expect(() =>
      createCanvasAiPreview({
        ...base,
        generatedBlocks: [
          {
            id: 'generated-1',
            content: { kind: 'text', text: 'Result' },
            sourceReferenceIds: ['unknown-source'],
          },
        ],
      }),
    ).toThrow(/unknown source/i);
    expect(() =>
      createCanvasAiPreview({
        ...base,
        generatedBlocks: [
          {
            id: 'generated-1',
            content: { kind: 'text', text: 'One' },
            sourceReferenceIds: ['source-ref-1'],
          },
          {
            id: 'generated-1',
            content: { kind: 'text', text: 'Two' },
            sourceReferenceIds: ['source-ref-1'],
          },
        ],
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      createCanvasAiPreview({
        ...base,
        resolvedModel: {
          providerId: 'openai',
          modelId: 'gpt-5',
          connectionId: null,
          local: false,
        },
        generatedBlocks: [],
      }),
    ).toThrow(/local_only/i);
    expect(() =>
      createCanvasAiPreview({
        ...base,
        resolvedModel: {
          providerId: 'openai',
          modelId: 'gpt-5',
          connectionId: null,
          local: true,
        },
        generatedBlocks: [],
      }),
    ).toThrow(/local_only/i);
    expect(() =>
      createCanvasAiPreview({
        ...base,
        generatedBlocks: Array.from({ length: 65 }, (_, index) => ({
          id: `generated-${index}`,
          content: { kind: 'text' as const, text: 'Result' },
          sourceReferenceIds: ['source-ref-1'],
        })),
      }),
    ).toThrow(/64/i);
  });

  it('inserts every preview block through one undoable commit and linked activity event', () => {
    const before = document();
    const preview = createCanvasAiPreview({
      id: 'preview-1',
      request: selectionRequest(),
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3',
        connectionId: 'ollama-local',
        local: true,
      },
      summary: 'Two generated blocks',
      generatedBlocks: [
        {
          id: 'generated-1',
          content: { kind: 'heading', level: 2, text: 'Launch' },
          sourceReferenceIds: ['source-ref-1'],
        },
        {
          id: 'generated-2',
          content: { kind: 'note', text: 'Desktop beta: September.' },
          sourceReferenceIds: ['source-ref-1'],
        },
      ],
      createdAt: NOW + 10,
    });

    const transaction = applyCanvasAiPreview({
      id: 'transaction-1',
      activityEventId: 'activity-1',
      preview,
      before,
      insertedAt: NOW + 20,
    });
    const history = createCanvasHistory(before);
    history.commit(transaction.historyCommit);

    expect(transaction.insertedBlockIds).toEqual(['generated-1', 'generated-2']);
    expect(transaction.historyCommit).toMatchObject({
      id: 'transaction-1',
      kind: 'ai-insertion',
      timestamp: NOW + 20,
    });
    expect(history.current().blocks.map((block) => block.id)).toEqual([
      'source-1',
      'generated-1',
      'generated-2',
    ]);
    expect(transaction.activityEvent).toMatchObject({
      id: 'activity-1',
      requestId: 'request-1',
      previewId: 'preview-1',
      transactionId: 'transaction-1',
      action: 'summarize',
      status: 'inserted',
      sourceReferenceIds: ['source-ref-1'],
    });
    expect(history.undo()).toBe(before);
    expect(Object.isFrozen(transaction)).toBe(true);
  });

  it('rejects insertion into a different canvas or inserting a Prompt Forge handoff', () => {
    const before = document();
    const mismatched = selectionRequest({ canvasId: 'canvas-2' });
    const preview = createCanvasAiPreview({
      id: 'preview-1',
      request: mismatched,
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3',
        connectionId: null,
        local: true,
      },
      summary: 'Output',
      generatedBlocks: [],
      createdAt: NOW + 10,
    });
    expect(() =>
      applyCanvasAiPreview({
        id: 'transaction-1',
        activityEventId: 'activity-1',
        preview,
        before,
        insertedAt: NOW + 20,
      }),
    ).toThrow(/scope/i);

    const handoffPreview = createCanvasAiPreview({
      id: 'preview-handoff',
      request: selectionRequest({ action: 'send-to-prompt-forge' }),
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3',
        connectionId: null,
        local: true,
      },
      summary: 'Prompt Forge handoff',
      generatedBlocks: [],
      createdAt: NOW + 10,
    });
    expect(() =>
      applyCanvasAiPreview({
        id: 'transaction-handoff',
        activityEventId: 'activity-handoff',
        preview: handoffPreview,
        before,
        insertedAt: NOW + 20,
      }),
    ).toThrow(/Prompt Forge/i);
  });

  it('rejects insertion when selected Canvas sources do not exist in the target document', () => {
    const before = document();
    const preview = createCanvasAiPreview({
      id: 'preview-missing-source',
      request: selectionRequest({
        scope: { kind: 'selection', blockIds: ['missing-source'] },
        sourceReferences: [
          {
            id: 'source-ref-missing',
            kind: 'canvas-block',
            reference: 'missing-source',
            label: 'Missing source',
          },
        ],
      }),
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3',
        connectionId: null,
        local: true,
      },
      summary: 'Output',
      generatedBlocks: [],
      createdAt: NOW + 10,
    });

    expect(() =>
      applyCanvasAiPreview({
        id: 'transaction-missing-source',
        activityEventId: 'activity-missing-source',
        preview,
        before,
        insertedAt: NOW + 20,
      }),
    ).toThrow(/missing.*source/i);
  });

  it('revalidates the preview at the insertion boundary', () => {
    const before = document();
    const preview = createCanvasAiPreview({
      id: 'preview-1',
      request: selectionRequest(),
      resolvedModel: {
        providerId: 'ollama',
        modelId: 'qwen3',
        connectionId: null,
        local: true,
      },
      summary: 'Output',
      generatedBlocks: [],
      createdAt: NOW + 10,
    });

    expect(() =>
      applyCanvasAiPreview({
        id: 'transaction-1',
        activityEventId: 'activity-1',
        preview: { ...preview, status: 'inserted' },
        before,
        insertedAt: NOW + 20,
      }),
    ).toThrow(/preview/i);
  });
});
