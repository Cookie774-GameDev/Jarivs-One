import type { PromptForgeSourceCandidate } from '@/features/prompt-forge/sourcePack';
import {
  buildContextChatAttachment,
  type ContextChatAttachment,
} from '@/features/context/contextChatIntegration';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import type { CanvasAiContext } from './aiContext';

export interface ActiveCanvasAiScope {
  readonly accountId: string;
  readonly projectId: string | null;
}

export interface ActiveCanvasAiContextProvider {
  readonly accountId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly canvasId: string;
  readonly getContext: () => CanvasAiContext;
}

interface ActivePublication extends ActiveCanvasAiContextProvider {
  readonly lease: number;
  cachedContext: CanvasAiContext | null;
}

export type CanvasChatAttachmentMode = 'current' | 'selection';

let activePublication: ActivePublication | null = null;
let leaseSequence = 0;
const MAX_CANVAS_CHAT_ATTACHMENTS = 8;
const MAX_CHAT_SUMMARY_CHARACTERS = 4_096;

function boundedIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new TypeError(`${label} must be a non-empty bounded identifier`);
  }
  return normalized;
}

/**
 * Publishes a lazy provider for the one visible Canvas route. The provider is
 * evaluated only after an exact account/project read, so large canvases do not
 * pay model-context compilation costs during ordinary editing or camera moves.
 */
export function publishActiveCanvasAiContextProvider(
  input: ActiveCanvasAiContextProvider,
): () => void {
  const accountId = boundedIdentity(input.accountId, 'Canvas account id');
  const ownerId = boundedIdentity(input.ownerId, 'Canvas owner id');
  if (accountId !== ownerId) {
    activePublication = null;
    return () => undefined;
  }
  const lease = ++leaseSequence;
  activePublication = {
    accountId,
    ownerId,
    projectId: boundedIdentity(input.projectId, 'Canvas project id'),
    canvasId: boundedIdentity(input.canvasId, 'Canvas id'),
    getContext: input.getContext,
    cachedContext: null,
    lease,
  };
  return () => {
    if (activePublication?.lease === lease) {
      activePublication = null;
    }
  };
}

export function readActiveCanvasAiContext(scope: ActiveCanvasAiScope): CanvasAiContext | null {
  const publication = activePublication;
  if (
    publication === null ||
    scope.projectId === null ||
    publication.accountId !== scope.accountId ||
    publication.projectId !== scope.projectId
  ) {
    return null;
  }
  if (publication.cachedContext !== null) {
    return publication.cachedContext;
  }
  try {
    const context = publication.getContext();
    if (
      context.canvas.id !== publication.canvasId ||
      context.canvas.projectId !== publication.projectId
    ) {
      return null;
    }
    publication.cachedContext = context;
    return context;
  } catch {
    return null;
  }
}

function boundedSummary(value: string, fallback: string): string {
  const normalized = value.trim().slice(0, MAX_CHAT_SUMMARY_CHARACTERS);
  return normalized || fallback;
}

function currentCanvasSummary(context: CanvasAiContext): string {
  const objectTypes = Object.entries(context.canvas.blockKinds)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(', ');
  return boundedSummary(
    [context.prompt, objectTypes ? `Object types: ${objectTypes}` : 'Object types: none']
      .filter(Boolean)
      .join('\n'),
    `Active canvas ${context.canvas.id} with ${context.canvas.blockCount} blocks.`,
  );
}

/**
 * Converts the lazily compiled active Canvas projection into the existing
 * request-scoped Context attachment contract consumed by the Jarvis runtime.
 * Binary bytes and owner identity are absent from CanvasAiContext and therefore
 * cannot cross this boundary.
 */
export function buildActiveCanvasChatAttachments(
  scope: ActiveCanvasAiScope,
  mode: CanvasChatAttachmentMode,
): readonly ContextChatAttachment[] {
  const context = readActiveCanvasAiContext(scope);
  if (context === null) return Object.freeze([]);
  try {
    const source = {
      type: 'linked_vibespace_content' as const,
      label: `Canvas: ${context.canvas.title || 'Untitled canvas'}`,
    };
    if (mode === 'current') {
      return Object.freeze([
        buildContextChatAttachment({
          projectId: context.canvas.projectId,
          rootDir: '',
          generatedAt: context.canvas.updatedAt,
          nodeId: `canvas:${context.canvas.id}`,
          mapId: context.canvas.id,
          title: context.canvas.title || 'Untitled canvas',
          kind: 'root',
          summary: currentCanvasSummary(context),
          attachmentLevel: 'map_summary',
          source,
          freshness: 'current',
          itemCount: Math.max(1, Math.min(1_000_000, context.canvas.blockCount)),
          lastIndexedAt: context.canvas.updatedAt,
          childrenCount: context.canvas.blockCount,
        }),
      ]);
    }

    return Object.freeze(
      context.selection.slice(0, MAX_CANVAS_CHAT_ATTACHMENTS).map((block) =>
        buildContextChatAttachment({
          projectId: context.canvas.projectId,
          rootDir: '',
          generatedAt: context.canvas.updatedAt,
          nodeId: `canvas:${context.canvas.id}:${block.id}`,
          mapId: context.canvas.id,
          title: block.label || `Canvas object ${block.id}`,
          kind: 'note',
          summary: boundedSummary(block.content, block.label || `Canvas object ${block.id}`),
          attachmentLevel: 'block',
          source,
          freshness: 'current',
          itemCount: 1,
          lastIndexedAt: block.updatedAt,
          modifiedAt: block.updatedAt,
          ...(block.content.trim() ? { exactExcerpt: block.content } : {}),
        }),
      ),
    );
  } catch {
    return Object.freeze([]);
  }
}

export function mergeActiveCanvasPromptForgeSources(
  sources: readonly PromptForgeSourceCandidate[],
  scope: ActiveCanvasAiScope,
  canvasRouteActive: boolean,
): readonly PromptForgeSourceCandidate[] {
  if (!canvasRouteActive) {
    return deepFreezeJarvisCopy([...sources]) as readonly PromptForgeSourceCandidate[];
  }
  const context = readActiveCanvasAiContext(scope);
  if (context === null) {
    return deepFreezeJarvisCopy([...sources]) as readonly PromptForgeSourceCandidate[];
  }
  const merged = [...sources];
  const knownIds = new Set(merged.map(({ id }) => id));
  for (const source of context.promptForgeSources) {
    if (!knownIds.has(source.id)) {
      knownIds.add(source.id);
      merged.push(source);
    }
  }
  return deepFreezeJarvisCopy(merged) as readonly PromptForgeSourceCandidate[];
}

export function clearActiveCanvasAiContextForTests(): void {
  activePublication = null;
}
