import type { PromptForgeSourceCandidate } from '@/features/prompt-forge/sourcePack';
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

let activePublication: ActivePublication | null = null;
let leaseSequence = 0;

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
