import { HarnessError } from './errors';
import { resolveOpenCodeProvider } from './providerTranslator';
import type { HarnessModelSelection, HarnessProvider } from './types';

export function resolveOpenCodeModelSelection(input: {
  providerId: string;
  modelId: string;
  providers: readonly HarnessProvider[];
}): HarnessModelSelection {
  const provider = resolveOpenCodeProvider(input.providerId, input.providers);
  const modelIsAvailable = provider.models.some((model) => model.id === input.modelId);

  if (!modelIsAvailable) {
    throw new HarnessError({
      code: 'MODEL_NOT_AVAILABLE',
      message: `Model "${input.modelId}" is not available for "${provider.id}".`,
      repair: 'Refresh models or select an available model.',
      recoverable: true,
    });
  }

  return {
    providerId: provider.id,
    modelId: input.modelId,
  };
}
