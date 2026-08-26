import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { getLastSettingsTab, rememberSettingsTab } from '@/features/settings/settingsTabMemory';
import {
  OPEN_MCP_MANAGER_EVENT,
  consumePendingMcpManagerOpenRequest,
  requestOpenMcpManager,
} from './openMcpManager';

describe('requestOpenMcpManager', () => {
  afterEach(() => {
    vi.useRealTimers();
    consumePendingMcpManagerOpenRequest();
    rememberSettingsTab('plans');
    useUIStore.setState({ settingsOpen: false });
  });

  it('opens Settings and requests the existing Plugins MCP panel locally', () => {
    vi.useFakeTimers();
    const tabs: string[] = [];
    let panelRequests = 0;
    const onTab = (event: Event) => {
      tabs.push((event as CustomEvent<{ tab?: string }>).detail?.tab ?? '');
    };
    const onPanel = () => {
      panelRequests += 1;
    };
    window.addEventListener('jarvis:settings:tab', onTab);
    window.addEventListener(OPEN_MCP_MANAGER_EVENT, onPanel);

    requestOpenMcpManager();

    expect(useUIStore.getState().settingsOpen).toBe(true);
    expect(getLastSettingsTab()).toBe('plugins');
    expect(consumePendingMcpManagerOpenRequest()).toBe(true);
    vi.runAllTimers();
    expect(tabs).toEqual(['plugins']);
    expect(panelRequests).toBe(1);

    window.removeEventListener('jarvis:settings:tab', onTab);
    window.removeEventListener(OPEN_MCP_MANAGER_EVENT, onPanel);
  });
});
