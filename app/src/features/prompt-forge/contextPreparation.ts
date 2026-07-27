import type { ContextChatAttachment } from '@/features/context/contextChatIntegration';
import {
  retrievePromptForgeContext,
  type SharedContextRetrievalResult,
} from '@/features/context/contextResponseIntegration';
import type { ContextAttachment } from '@/features/context/tree';
import type { ContextEntityKind, ContextSourceKind } from '@/features/context/contracts';
import type { ModelPickerOption } from '@/lib/ai/useAccessibleChatModels';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import type { PromptForgeJob } from './contracts';
import {
  resolvePromptForgeModelSelection,
  type PromptForgeCurrentChatSelection,
  type PromptForgeModelOption,
} from './modelSelection';
import { extractPromptPreservationContract } from './preservation';
import type { PromptForgePreparer } from './promptForgeService';
import {
  buildPromptForgeSourcePack,
  DEFAULT_PROMPT_FORGE_BUDGET,
  type PromptForgeSourceBudget,
  type PromptForgeSourceCandidate,
  type PromptForgeSourceKind,
  type PromptForgeSourceTrust,
} from './sourcePack';

export type PromptForgePublicResearchPort = (
  input: Readonly<{
    job: PromptForgeJob;
    signal: AbortSignal;
    now: number;
  }>,
) => Promise<readonly PromptForgeSourceCandidate[]>;
export type PromptForgeAdditionalSourceCollector = PromptForgePublicResearchPort;

export interface PromptForgeContextPreparerOptions {
  contextAttachments: readonly (ContextAttachment | ContextChatAttachment)[];
  modelOptions: readonly PromptForgeModelOption[];
  currentChatSelection: PromptForgeCurrentChatSelection;
  offlineMode: boolean;
  defaultLocalModel: string;
  additionalSources?: readonly PromptForgeSourceCandidate[];
  collectAdditionalSources?: PromptForgeAdditionalSourceCollector;
  excludedSourceIds?: readonly string[];
  budget?: PromptForgeSourceBudget;
  retrieveContext?: typeof retrievePromptForgeContext;
  researchPublicSources?: PromptForgePublicResearchPort;
  now?: () => number;
}

const SYMBOL_KINDS = new Set<ContextEntityKind>([
  'symbol',
  'module',
  'class',
  'function',
  'method',
  'component',
  'route',
  'endpoint',
  'database_table',
  'property',
]);
const FILE_KINDS = new Set<ContextEntityKind>(['file', 'migration', 'test', 'dependency']);
const CANVAS_KINDS = new Set<ContextEntityKind>(['canvas', 'canvas_object']);
const ATTACHMENT_KINDS = new Set<ContextEntityKind>([
  'attachment',
  'image',
  'audio',
  'video',
  'pdf',
  'url',
]);

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Prompt Forge was cancelled.', 'AbortError');
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableSourceId(namespace: string, value: string): string {
  const slug = value.replace(/[^A-Za-z0-9._:/@-]+/gu, '-').replace(/^-+|-+$/gu, '');
  const prefix = slug.length > 0 ? slug.slice(0, 160) : 'source';
  return `${namespace}:${prefix}:${hashText(value)}`;
}

function normalizedReferenceText(value: string): string {
  return value.normalize('NFKC').replaceAll('\\', '/').toLocaleLowerCase('en-US');
}

function containsWholeReference(query: string, reference: string): boolean {
  if (reference.length < 3) return false;
  let offset = 0;
  while (offset <= query.length - reference.length) {
    const index = query.indexOf(reference, offset);
    if (index < 0) return false;
    const before = index > 0 ? query[index - 1] : undefined;
    const after = query[index + reference.length];
    const isWord = (value: string | undefined) =>
      value !== undefined && /[\p{L}\p{N}_-]/u.test(value);
    if (!isWord(before) && !isWord(after)) return true;
    offset = index + 1;
  }
  return false;
}

function exactContextReferenceMatch(
  userText: string,
  item: SharedContextRetrievalResult['items'][number],
): boolean {
  const query = normalizedReferenceText(userText);
  if (!query.trim()) return false;
  const path = item.entity.path ? normalizedReferenceText(item.entity.path) : null;
  if (path && containsWholeReference(query, path)) return true;
  const basename = path?.split('/').at(-1);
  const label = normalizedReferenceText(item.entity.label);
  return [basename, label].some(
    (reference): reference is string =>
      typeof reference === 'string' && containsWholeReference(query, reference),
  );
}

function sourceKind(entityKind: ContextEntityKind): PromptForgeSourceKind {
  if (entityKind === 'terminal') return 'terminal';
  if (entityKind === 'skill') return 'skill';
  if (entityKind === 'chat' || entityKind === 'message') return 'chat';
  if (CANVAS_KINDS.has(entityKind)) return 'canvas';
  if (ATTACHMENT_KINDS.has(entityKind)) return 'attachment';
  if (SYMBOL_KINDS.has(entityKind)) return 'project_symbol';
  if (FILE_KINDS.has(entityKind)) return 'project_file';
  return 'context_map';
}

function sourceTrust(kind: ContextSourceKind): PromptForgeSourceTrust {
  if (kind === 'github_repository') return 'external';
  if (kind === 'linked_vibespace_content') return 'user';
  return 'project';
}

function sourceReference(item: SharedContextRetrievalResult['items'][number]): string {
  if (!item.entity.path) {
    return `context://${encodeURIComponent(item.mapId)}/${encodeURIComponent(item.entity.entityId)}`;
  }
  if (!item.entity.lineStart) return item.entity.path;
  if (!item.entity.lineEnd || item.entity.lineEnd === item.entity.lineStart) {
    return `${item.entity.path}#L${item.entity.lineStart}`;
  }
  return `${item.entity.path}#L${item.entity.lineStart}-L${item.entity.lineEnd}`;
}

export function promptForgeSourcesFromContext(
  result: SharedContextRetrievalResult,
  projectId: string | null,
  now: number,
  userText = '',
): readonly PromptForgeSourceCandidate[] {
  return deepFreezeJarvisCopy(
    result.items.map((item) => ({
      id: stableSourceId('context', `${item.mapId}\u0000${item.id}`),
      kind: sourceKind(item.entity.kind),
      label: item.entity.label,
      reference: sourceReference(item),
      content: item.exactExcerpt,
      verified: true,
      explicit: item.ranking.reasons.includes('explicit_attachment'),
      projectScoped: projectId !== null,
      trust: sourceTrust(item.sourceKind),
      exactMatch: exactContextReferenceMatch(userText, item),
      lexicalScore: item.ranking.reasons.includes('lexical_match') ? 1 : 0,
      semanticScore: item.ranking.reasons.includes('semantic_match') ? 1 : null,
      taskIntentScore: item.ranking.reasons.includes('task_intent') ? 1 : 0,
      observedAt: Math.min(now, Math.max(0, item.provenance.indexedAt)),
      whySelected:
        item.ranking.reasons.length > 0
          ? item.ranking.reasons.join(', ')
          : 'Selected by shared Context retrieval.',
    })),
  ) as readonly PromptForgeSourceCandidate[];
}

export function promptForgeModelOptionsFromPicker(
  options: readonly ModelPickerOption[],
): readonly PromptForgeModelOption[] {
  return Object.freeze(
    options.map((option) =>
      Object.freeze({
        id: option.id,
        providerId: option.provider,
        modelId: option.modelId,
        label: option.label,
        ...(option.connectionId ? { connectionId: option.connectionId } : {}),
        ...(option.connection ? { connectionMode: option.connection.mode } : {}),
        localOnly:
          option.connection?.mode === 'local' ||
          option.provider === 'ollama' ||
          option.provider === 'local',
        available: option.available !== false,
      }),
    ),
  );
}

function validatePublicResearchSources(
  sources: readonly PromptForgeSourceCandidate[],
): readonly PromptForgeSourceCandidate[] {
  if (!Array.isArray(sources) || sources.some((source) => source.kind !== 'public_web')) {
    throw new Error('Invalid Prompt Forge public research result.');
  }
  return sources;
}

export function createPromptForgeContextPreparer(
  rawOptions: PromptForgeContextPreparerOptions,
): PromptForgePreparer {
  const options = deepFreezeJarvisCopy({
    contextAttachments: rawOptions.contextAttachments,
    modelOptions: rawOptions.modelOptions,
    currentChatSelection: rawOptions.currentChatSelection,
    offlineMode: rawOptions.offlineMode,
    defaultLocalModel: rawOptions.defaultLocalModel,
    additionalSources: rawOptions.additionalSources ?? [],
    excludedSourceIds: rawOptions.excludedSourceIds ?? [],
    budget: rawOptions.budget ?? DEFAULT_PROMPT_FORGE_BUDGET,
  });
  const retrieveContext = rawOptions.retrieveContext ?? retrievePromptForgeContext;
  const collectAdditionalSources = rawOptions.collectAdditionalSources;
  const researchPublicSources = rawOptions.researchPublicSources;
  const clock = rawOptions.now ?? Date.now;

  return async ({ job, signal, stage }) => {
    abortIfRequested(signal);
    const resolvedModel = resolvePromptForgeModelSelection(job.modelSelection, {
      currentChatSelection: options.currentChatSelection,
      options: options.modelOptions,
      offlineMode: options.offlineMode,
      defaultLocalModel: options.defaultLocalModel,
    });
    const builtAt = clock();
    await stage('searching_project');
    abortIfRequested(signal);
    const context = await retrieveContext({
      projectId: job.projectId,
      chatId: job.chatId,
      userText: job.originalDraft,
      attachments: options.contextAttachments,
      now: builtAt,
    });
    abortIfRequested(signal);

    const contextSources = promptForgeSourcesFromContext(
      context,
      job.projectId,
      builtAt,
      job.originalDraft,
    );
    const collectedSources = collectAdditionalSources
      ? await collectAdditionalSources({ job, signal, now: builtAt })
      : [];
    abortIfRequested(signal);
    let publicSources: readonly PromptForgeSourceCandidate[] = [];
    const publicResearchAllowed =
      job.allowPublicResearch && job.privacyMode === 'provider_allowed' && !options.offlineMode;
    if (publicResearchAllowed && researchPublicSources) {
      await stage('searching_public_sources');
      abortIfRequested(signal);
      publicSources = validatePublicResearchSources(
        await researchPublicSources({ job, signal, now: builtAt }),
      );
      abortIfRequested(signal);
    }

    await stage('building_source_pack');
    abortIfRequested(signal);
    const excludedSourceIds = new Set(options.excludedSourceIds);
    const allCandidates = [
      ...options.additionalSources,
      ...collectedSources,
      ...contextSources,
      ...publicSources,
    ] as readonly PromptForgeSourceCandidate[];
    const candidates = allCandidates.filter(
      (source) => !excludedSourceIds.has(source.id),
    ) as readonly PromptForgeSourceCandidate[];
    const packed = buildPromptForgeSourcePack({
      candidates,
      budget: options.budget,
      offline: options.offlineMode || job.privacyMode === 'local_only',
      publicResearchAllowed,
      now: builtAt,
    });
    const sourcePack = deepFreezeJarvisCopy({
      ...packed,
      warnings: [
        ...new Set([
          ...context.warnings,
          ...(context.omittedCount > 0
            ? [
                `Shared Context retrieval omitted ${context.omittedCount} additional source${
                  context.omittedCount === 1 ? '' : 's'
                }.`,
              ]
            : []),
          ...packed.warnings,
        ]),
      ],
    }) as typeof packed;
    const preservation = extractPromptPreservationContract(job.originalDraft);
    return Object.freeze({
      resolvedModel,
      sourcePack,
      preservation,
      sourcesConsidered: allCandidates.length + context.omittedCount,
    });
  };
}
