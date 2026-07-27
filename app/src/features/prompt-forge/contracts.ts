import type { ProviderId } from '@/types';

export const PROMPT_FORGE_STATUSES = Object.freeze([
  'idle',
  'collecting_context',
  'searching_project',
  'searching_public_sources',
  'building_source_pack',
  'generating',
  'validating',
  'ready',
  'cancelled',
  'failed',
] as const);

export type PromptForgeStatus = (typeof PROMPT_FORGE_STATUSES)[number];

export type PromptForgeModelSelection =
  | Readonly<{ mode: 'current_chat_model' }>
  | Readonly<{ mode: 'prefer_local' }>
  | Readonly<{ mode: 'single'; providerId: ProviderId; modelId: string }>;

export type PromptForgePrivacyMode = 'local_only' | 'provider_allowed';

export type PromptForgeAttachmentKind =
  | 'file'
  | 'image'
  | 'terminal'
  | 'context_map'
  | 'plugin'
  | 'skill'
  | 'agent';

export type PromptForgeAttachmentSnapshot = Readonly<{
  id: string;
  kind: PromptForgeAttachmentKind;
  label: string;
  reference: string;
}>;

export type PromptForgeSourceMetadata = Readonly<{
  id: string;
  kind: string;
  label: string;
  reference: string;
  observedAt: number;
  whySelected: string;
}>;

export type PromptForgeValidationSnapshot = Readonly<{
  passed: boolean;
  missingCount: number;
  checkedAt: number;
}>;

export type PromptForgeJob = Readonly<{
  schemaVersion: 1;
  id: string;
  revision: number;
  chatId: string;
  originalDraft: string;
  originalAttachments: readonly PromptForgeAttachmentSnapshot[];
  modelSelection: PromptForgeModelSelection;
  privacyMode: PromptForgePrivacyMode;
  allowPublicResearch: boolean;
  selectedSourceIds: readonly string[];
  retrievedSources: readonly PromptForgeSourceMetadata[];
  status: PromptForgeStatus;
  generatedDraft: string | null;
  validation: PromptForgeValidationSnapshot | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  errorCode: string | null;
}>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const CONTROL_AND_BIDI =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_DRAFT_CHARS = 100_000;
const MAX_GENERATED_CHARS = 200_000;
const MAX_ATTACHMENTS = 64;
const MAX_SOURCES = 128;
const ATTACHMENT_KINDS = new Set<PromptForgeAttachmentKind>([
  'file',
  'image',
  'terminal',
  'context_map',
  'plugin',
  'skill',
  'agent',
]);
const PROVIDERS = new Set<ProviderId>([
  'google',
  'groq',
  'openai',
  'anthropic',
  'openrouter',
  'deepseek',
  'mistral',
  'together',
  'xai',
  'ollama',
  'local',
]);

function fail(detail: string): never {
  throw new Error(`Invalid Prompt Forge ${detail}`);
}

function id(value: unknown, detail: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(detail);
  return value;
}

function text(value: unknown, maximum: number, detail: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!allowEmpty && value.trim().length === 0) ||
    CONTROL_AND_BIDI.test(value)
  ) {
    fail(detail);
  }
  return value;
}

function time(value: unknown, detail: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(detail);
  return value as number;
}

export function normalizePromptForgeModelSelection(value: unknown): PromptForgeModelSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('model selection');
  }
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) return fail('model selection');
  if (record.mode === 'current_chat_model' || record.mode === 'prefer_local') {
    if (keys.length !== 1) return fail('model selection');
    return Object.freeze({ mode: record.mode });
  }
  if (
    record.mode !== 'single' ||
    keys.length !== 3 ||
    !keys.every((key) => ['mode', 'providerId', 'modelId'].includes(key as string)) ||
    typeof record.providerId !== 'string' ||
    !PROVIDERS.has(record.providerId as ProviderId)
  ) {
    return fail('model selection');
  }
  return Object.freeze({
    mode: 'single',
    providerId: record.providerId as ProviderId,
    modelId: text(record.modelId, 200, 'model selection'),
  });
}

function attachment(value: PromptForgeAttachmentSnapshot): PromptForgeAttachmentSnapshot {
  if (
    typeof value !== 'object' ||
    value === null ||
    !ATTACHMENT_KINDS.has(value.kind) ||
    Reflect.ownKeys(value).length !== 4
  ) {
    return fail('attachment');
  }
  return Object.freeze({
    id: id(value.id, 'attachment ID'),
    kind: value.kind,
    label: text(value.label, 500, 'attachment label'),
    reference: text(value.reference, 2_048, 'attachment reference'),
  });
}

function sourceMetadata(value: PromptForgeSourceMetadata): PromptForgeSourceMetadata {
  return Object.freeze({
    id: id(value.id, 'source ID'),
    kind: id(value.kind, 'source kind'),
    label: text(value.label, 500, 'source label'),
    reference: text(value.reference, 2_048, 'source reference'),
    observedAt: time(value.observedAt, 'source observation time'),
    whySelected: text(value.whySelected, 1_000, 'source reason'),
  });
}

function validationSnapshot(
  value: PromptForgeValidationSnapshot | null,
): PromptForgeValidationSnapshot | null {
  if (value === null) return null;
  if (
    typeof value.passed !== 'boolean' ||
    !Number.isSafeInteger(value.missingCount) ||
    value.missingCount < 0
  ) {
    return fail('validation');
  }
  return Object.freeze({
    passed: value.passed,
    missingCount: value.missingCount,
    checkedAt: time(value.checkedAt, 'validation time'),
  });
}

export function createPromptForgeJob(input: {
  id: string;
  chatId: string;
  originalDraft: string;
  originalAttachments: readonly PromptForgeAttachmentSnapshot[];
  modelSelection: PromptForgeModelSelection;
  privacyMode: PromptForgePrivacyMode;
  allowPublicResearch: boolean;
  now: number;
}): PromptForgeJob {
  if (
    !Array.isArray(input.originalAttachments) ||
    input.originalAttachments.length > MAX_ATTACHMENTS
  ) {
    return fail('attachments');
  }
  if (!['local_only', 'provider_allowed'].includes(input.privacyMode)) {
    return fail('privacy mode');
  }
  if (typeof input.allowPublicResearch !== 'boolean') {
    return fail('public research authority');
  }
  const now = time(input.now, 'job time');
  return Object.freeze({
    schemaVersion: 1,
    id: id(input.id, 'job ID'),
    revision: 1,
    chatId: id(input.chatId, 'chat ID'),
    originalDraft: text(input.originalDraft, MAX_DRAFT_CHARS, 'draft'),
    originalAttachments: Object.freeze(input.originalAttachments.map(attachment)),
    modelSelection: normalizePromptForgeModelSelection(input.modelSelection),
    privacyMode: input.privacyMode,
    allowPublicResearch: input.allowPublicResearch,
    selectedSourceIds: Object.freeze([]),
    retrievedSources: Object.freeze([]),
    status: 'idle',
    generatedDraft: null,
    validation: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorCode: null,
  });
}

const LEGAL_TRANSITIONS: Readonly<Record<PromptForgeStatus, readonly PromptForgeStatus[]>> =
  Object.freeze({
    idle: ['collecting_context', 'cancelled'],
    collecting_context: [
      'searching_project',
      'searching_public_sources',
      'building_source_pack',
      'generating',
      'cancelled',
      'failed',
    ],
    searching_project: ['searching_public_sources', 'building_source_pack', 'cancelled', 'failed'],
    searching_public_sources: ['building_source_pack', 'cancelled', 'failed'],
    building_source_pack: ['generating', 'cancelled', 'failed'],
    generating: ['validating', 'cancelled', 'failed'],
    validating: ['ready', 'cancelled', 'failed'],
    ready: ['collecting_context', 'generating', 'cancelled'],
    cancelled: ['collecting_context'],
    failed: ['collecting_context'],
  });

export function transitionPromptForgeJob(
  job: PromptForgeJob,
  update: {
    expectedRevision: number;
    status: PromptForgeStatus;
    selectedSourceIds?: readonly string[];
    retrievedSources?: readonly PromptForgeSourceMetadata[];
    generatedDraft?: string | null;
    validation?: PromptForgeValidationSnapshot | null;
    errorCode?: string | null;
    now: number;
  },
): PromptForgeJob {
  if (update.expectedRevision !== job.revision) fail('job revision');
  if (!LEGAL_TRANSITIONS[job.status].includes(update.status)) fail('job transition');
  const now = time(update.now, 'job time');
  if (now < job.updatedAt) fail('job time');
  const selectedSourceIds = update.selectedSourceIds ?? job.selectedSourceIds;
  const retrievedSources = update.retrievedSources ?? job.retrievedSources;
  if (selectedSourceIds.length > MAX_SOURCES || retrievedSources.length > MAX_SOURCES) {
    fail('job sources');
  }
  const generatedDraft =
    update.generatedDraft === undefined
      ? job.generatedDraft
      : update.generatedDraft === null
        ? null
        : text(update.generatedDraft, MAX_GENERATED_CHARS, 'generated prompt');
  const terminal = ['ready', 'cancelled', 'failed'].includes(update.status);
  return Object.freeze({
    ...job,
    revision: job.revision + 1,
    status: update.status,
    selectedSourceIds: Object.freeze(selectedSourceIds.map((value) => id(value, 'source ID'))),
    retrievedSources: Object.freeze(retrievedSources.map(sourceMetadata)),
    generatedDraft,
    validation:
      update.validation === undefined ? job.validation : validationSnapshot(update.validation),
    updatedAt: now,
    completedAt: terminal ? now : null,
    errorCode:
      update.errorCode === undefined
        ? update.status === 'failed'
          ? job.errorCode
          : null
        : update.errorCode === null
          ? null
          : id(update.errorCode, 'error code'),
  });
}
