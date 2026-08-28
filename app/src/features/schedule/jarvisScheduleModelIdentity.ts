import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import { getProviderDisplayName } from '@/lib/ai/providerRegistry';

export interface JarvisScheduleModelIdentity {
  provider: string;
  connection: string;
  model: string;
  fast: 'Exact route' | 'Provider default';
  effort: 'Provider default';
  summary: string;
}

function isExactFastRoute(modelId: string): boolean {
  return modelId.toLocaleLowerCase('en-US').endsWith('-fast');
}

/**
 * Describe only the model authority persisted by a Jarvis schedule.
 *
 * Schedule stores an exact provider/connection/model route, but it does not
 * persist separate reasoning-effort or Fast toggles. An exact `-fast` model
 * route is therefore disclosed as such; every other Fast/effort value remains
 * provider-default instead of being inferred from the model name or live UI.
 */
export function describeJarvisScheduleModelIdentity(
  selection: ChatModelSelection,
): JarvisScheduleModelIdentity | null {
  if (selection.mode !== 'single') return null;

  const model = selection.modelId.trim();
  if (!model) return null;
  const providerId = String(selection.providerId);
  const provider =
    providerId.toLocaleLowerCase('en-US') === 'opencode'
      ? 'OpenCode'
      : getProviderDisplayName(selection.providerId);
  const connection = selection.connectionId?.trim() || 'Not recorded';
  const exactFastRoute = isExactFastRoute(model);

  return {
    provider,
    connection,
    model,
    fast: exactFastRoute ? 'Exact route' : 'Provider default',
    effort: 'Provider default',
    summary: [
      `Provider: ${provider}`,
      `Connection: ${connection === 'Not recorded' ? 'not recorded' : connection}`,
      `Model: ${model}`,
      `Fast: ${exactFastRoute ? 'exact route' : 'provider default'}`,
      'Effort: provider default',
    ].join(' · '),
  };
}
