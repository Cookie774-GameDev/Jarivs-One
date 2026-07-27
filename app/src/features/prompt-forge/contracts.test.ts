import { describe, expect, it } from 'vitest';
import {
  createPromptForgeJob,
  normalizePromptForgeModelSelection,
  parsePromptForgeJob,
  transitionPromptForgeJob,
} from './contracts';

describe('Prompt Forge contracts', () => {
  it('creates an immutable recoverable job without changing the original draft', () => {
    const job = createPromptForgeJob({
      id: 'forge-job-1',
      accountId: 'account-1',
      chatId: 'chat-1',
      projectId: 'project-1',
      originalDraft: 'Do not remove "this exact quote".',
      originalAttachments: [
        {
          id: 'attachment-1',
          kind: 'file',
          label: 'SPEC.md',
          reference: 'app://attachment/attachment-1',
        },
      ],
      modelSelection: { mode: 'prefer_local' },
      privacyMode: 'local_only',
      allowPublicResearch: false,
      now: 100,
    });

    expect(job.status).toBe('idle');
    expect(job.accountId).toBe('account-1');
    expect(job.projectId).toBe('project-1');
    expect(job.originalDraft).toBe('Do not remove "this exact quote".');
    expect(job.originalAttachments[0]?.label).toBe('SPEC.md');
    expect(job.revision).toBe(1);
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job.originalAttachments)).toBe(true);
  });

  it('advances only through legal idempotent transitions with optimistic revision authority', () => {
    const job = createPromptForgeJob({
      id: 'forge-job-1',
      accountId: 'account-1',
      chatId: 'chat-1',
      projectId: null,
      originalDraft: 'Upgrade this.',
      originalAttachments: [],
      modelSelection: { mode: 'current_chat_model' },
      privacyMode: 'provider_allowed',
      allowPublicResearch: false,
      now: 100,
    });
    const collecting = transitionPromptForgeJob(job, {
      expectedRevision: 1,
      status: 'collecting_context',
      now: 110,
    });
    const generating = transitionPromptForgeJob(collecting, {
      expectedRevision: 2,
      status: 'generating',
      selectedSourceIds: ['source-a'],
      now: 120,
    });
    const ready = transitionPromptForgeJob(generating, {
      expectedRevision: 3,
      status: 'validating',
      generatedDraft: 'Upgraded prompt.',
      now: 130,
    });

    expect(ready.revision).toBe(4);
    expect(ready.originalDraft).toBe('Upgrade this.');
    expect(ready.generatedDraft).toBe('Upgraded prompt.');
    expect(ready.selectedSourceIds).toEqual(['source-a']);
    expect(() =>
      transitionPromptForgeJob(ready, {
        expectedRevision: 2,
        status: 'ready',
        now: 140,
      }),
    ).toThrow(/revision/i);
    expect(() =>
      transitionPromptForgeJob(job, {
        expectedRevision: 1,
        status: 'ready',
        now: 140,
      }),
    ).toThrow(/transition/i);
  });

  it('normalizes only the three authorized model-selection modes', () => {
    expect(normalizePromptForgeModelSelection({ mode: 'current_chat_model' })).toEqual({
      mode: 'current_chat_model',
    });
    expect(normalizePromptForgeModelSelection({ mode: 'prefer_local' })).toEqual({
      mode: 'prefer_local',
    });
    expect(
      normalizePromptForgeModelSelection({
        mode: 'single',
        providerId: 'ollama',
        modelId: 'qwen3:8b',
      }),
    ).toEqual({ mode: 'single', providerId: 'ollama', modelId: 'qwen3:8b' });
    expect(
      normalizePromptForgeModelSelection({
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        connectionId: 'openai-codex',
      }),
    ).toEqual({
      mode: 'single',
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      connectionId: 'openai-codex',
    });
    expect(() =>
      normalizePromptForgeModelSelection({
        mode: 'single',
        providerId: 'unknown',
        modelId: 'made-up',
      }),
    ).toThrow(/model selection/i);
    expect(() => normalizePromptForgeModelSelection({ mode: 'hive' })).toThrow(/model selection/i);
  });

  it('rejects non-boolean public-research authority instead of coercing it', () => {
    expect(() =>
      createPromptForgeJob({
        id: 'forge-job-1',
        accountId: 'account-1',
        chatId: 'chat-1',
        projectId: null,
        originalDraft: 'Upgrade this.',
        originalAttachments: [],
        modelSelection: { mode: 'prefer_local' },
        privacyMode: 'local_only',
        allowPublicResearch: 'false' as unknown as boolean,
        now: 100,
      }),
    ).toThrow(/public research/i);
  });

  it('round-trips a persisted job through a strict closed parser', () => {
    const job = createPromptForgeJob({
      id: 'forge-job-1',
      accountId: 'account-1',
      chatId: 'chat-1',
      projectId: null,
      originalDraft: 'Upgrade this.',
      originalAttachments: [],
      modelSelection: { mode: 'prefer_local' },
      privacyMode: 'local_only',
      allowPublicResearch: false,
      now: 100,
    });
    expect(parsePromptForgeJob(JSON.parse(JSON.stringify(job)))).toEqual(job);
    expect(() => parsePromptForgeJob({ ...job, unexpected: true })).toThrow(/persisted job/i);
    expect(() => parsePromptForgeJob({ ...job, accountId: '../other' })).toThrow(/persisted job/i);
  });
});
