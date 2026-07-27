import type { PluginConnection, PluginManifest } from '@/features/plugins/types';

function connectionMatchesProject(connection: PluginConnection, projectId: string | null): boolean {
  return (
    connection.enabledProjectIds.includes('*') ||
    Boolean(projectId && connection.enabledProjectIds.includes(projectId))
  );
}

/**
 * PF-252 is specifically the connected-plugin catalog. Even credential-free
 * local plugins need an enabled connection record before automatic admission.
 */
export function isPromptForgePluginConnected(
  manifest: PluginManifest | undefined,
  connection: PluginConnection | undefined,
  projectId: string | null,
): boolean {
  if (!manifest || !connection || connection.state !== 'connected' || !connection.enabled) {
    return false;
  }
  if (manifest.authType === 'none' && manifest.status !== 'implemented') return false;
  return connectionMatchesProject(connection, projectId);
}

/**
 * Credential-free installed plugins need no account connection. Every
 * credentialed plugin must be connected, enabled, and active for the current
 * project (or explicitly enabled for all projects) before Prompt Forge may
 * describe it as available.
 */
export function isPromptForgePluginAvailable(
  manifest: PluginManifest | undefined,
  connection: PluginConnection | undefined,
  projectId: string | null,
): boolean {
  if (!manifest) return false;
  if (manifest.authType === 'none') return manifest.status === 'implemented';
  return isPromptForgePluginConnected(manifest, connection, projectId);
}
