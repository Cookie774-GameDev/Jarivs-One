import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({
  navOpen: true,
  inspectorOpen: false,
  voiceListening: false,
  composerSttListening: false,
  composerStt: true,
  chatFullscreen: false,
  route: 'chat',
  toggleNav: vi.fn(),
  toggleInspector: vi.fn(),
  setVoiceModalOpen: vi.fn(),
  setPaletteOpen: vi.fn(),
  setSettingsOpen: vi.fn(),
  setLauncherOpen: vi.fn(),
  setAssistantOpen: vi.fn(),
  setWhatsNewOpen: vi.fn(),
  setNewsPanelOpen: vi.fn(),
  toggleChatFullscreen: vi.fn(),
  setRoute: vi.fn(),
}));
const smokeGate = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: typeof ui) => unknown) => selector(ui),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      workspaceId: 'workspace-smoke',
      projectId: 'project-smoke',
      displayName: 'Smoke',
      plan: 'pro',
    }),
}));

vi.mock('@/features/whats-new', () => ({
  useWhatsNew: () => ({ hasUpdate: false, currentVersion: 'test' }),
}));

vi.mock('@/features/call/store', () => ({
  useCallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ status: 'idle' }),
}));

vi.mock('@/features/call', () => ({
  isCallConfigured: () => false,
  loadCallService: vi.fn(),
}));

vi.mock('@/lib/admin', () => ({ useAppAdmin: () => false }));
vi.mock('@/lib/jarvis/smoke/config', () => ({
  isKernelSmokeEnabled: () => smokeGate.enabled,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Hint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TopBar } from './TopBar';

function renderTopBar(enabled: boolean) {
  smokeGate.enabled = enabled;
  render(<TopBar />);
}

describe('TopBar voice smoke evidence', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('fails closed without the exact development smoke flag', async () => {
    renderTopBar(false);

    const opener = screen.getByRole('button', { name: 'Open Jarvis voice panel' });
    expect(opener.getAttribute('data-sik-evidence')).toBeNull();
  });

  it('places the unique voice.open selector on the genuine opener', async () => {
    renderTopBar(true);

    const opener = screen.getByRole('button', { name: 'Open Jarvis voice panel' });
    expect(opener.getAttribute('data-sik-evidence')).toBe('voice.open');
    expect(document.querySelectorAll('[data-sik-evidence="voice.open"]')).toHaveLength(1);

    fireEvent.click(opener);
    expect(ui.setVoiceModalOpen).toHaveBeenCalledWith(true);
  });
});
