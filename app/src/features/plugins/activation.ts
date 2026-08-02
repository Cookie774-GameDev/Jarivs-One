import { PLUGIN_CATALOG } from './catalog';
import { selectPluginConnectionsForAccount, usePluginStore } from './store';
import type { PluginManifest } from './types';

export type ActivePluginFilter = {
  category?: string;
  tag?: string;
  feature?: string;
};

export function listActivePlugins(
  accountId: string,
  filter?: ActivePluginFilter,
): PluginManifest[] {
  if (!accountId || accountId.trim() !== accountId) return [];
  const connections = selectPluginConnectionsForAccount(usePluginStore.getState(), accountId);
  return PLUGIN_CATALOG.filter((plugin) => {
    const connection = connections[plugin.id];
    if (!connection || connection.state !== 'connected' || !connection.enabled) return false;
    if (filter?.category && plugin.category !== filter.category) return false;
    if (filter?.tag && !plugin.tags.includes(filter.tag)) return false;
    if (filter?.feature && !plugin.supportedFeatures.includes(filter.feature)) return false;
    return true;
  });
}

export function isPluginActive(
  accountId: string,
  pluginId: string,
  projectId?: string | null,
): boolean {
  if (!accountId || accountId.trim() !== accountId) return false;
  const connection = selectPluginConnectionsForAccount(usePluginStore.getState(), accountId)[
    pluginId
  ];
  if (!connection || connection.state !== 'connected' || !connection.enabled) return false;
  return (
    connection.enabledProjectIds.includes('*') ||
    Boolean(projectId && connection.enabledProjectIds.includes(projectId))
  );
}

export function listActiveAiModelPlugins(accountId: string): PluginManifest[] {
  return listActivePlugins(accountId, { tag: 'ai' }).filter((plugin) => Boolean(plugin.httpTest));
}

export function listActiveVoicePlugins(accountId: string): PluginManifest[] {
  return listActivePlugins(accountId).filter(
    (plugin) =>
      plugin.tags.some((tag) => ['voice', 'tts', 'stt', 'speech'].includes(tag)) ||
      plugin.supportedFeatures.some((feature) => /voice|tts|stt|speech/i.test(feature)),
  );
}
