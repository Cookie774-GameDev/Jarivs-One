import { useUIStore } from '@/stores/ui';
import { prefetchSettingsTab } from '@/features/settings/settingsPrefetch';
import { rememberSettingsTab } from '@/features/settings/settingsTabMemory';

export const OPEN_MCP_MANAGER_EVENT = 'jarvis:plugins:mcp:open';

let pendingOpenRequest = false;

export function consumePendingMcpManagerOpenRequest(): boolean {
  const pending = pendingOpenRequest;
  pendingOpenRequest = false;
  return pending;
}

export function requestOpenMcpManager(): void {
  pendingOpenRequest = true;
  rememberSettingsTab('plugins');
  prefetchSettingsTab('plugins');
  useUIStore.getState().setSettingsOpen(true);

  // Settings and Plugins are lazy-rendered. The pending flag covers the first
  // mount; the event covers an already-cached Plugins panel.
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('jarvis:settings:tab', { detail: { tab: 'plugins' } }));
    window.dispatchEvent(new CustomEvent(OPEN_MCP_MANAGER_EVENT));
  }, 0);
}
