import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({
  navOpen: true,
  inspectorOpen: false,
  voiceListening: false,
  composerSttListening: false,
  composerStt: true,
  route: 'canvas',
  toggleNav: vi.fn(),
  toggleInspector: vi.fn(),
  setVoiceModalOpen: vi.fn(),
  setPaletteOpen: vi.fn(),
  setSettingsOpen: vi.fn(),
  setLauncherOpen: vi.fn(),
  setAssistantOpen: vi.fn(),
  setWhatsNewOpen: vi.fn(),
  setNewsPanelOpen: vi.fn(),
  setRoute: vi.fn(),
}));

vi.mock('@/stores/ui', () => ({
  createDefaultDoneNotifications: () => ({}),
  useUIStore: (selector: (state: typeof ui) => unknown) => selector(ui),
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      workspaceId: 'workspace-canvas',
      projectId: 'project-canvas',
      displayName: 'Builder',
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
vi.mock('@/lib/jarvis/smoke/config', () => ({ isKernelSmokeEnabled: () => false }));
vi.mock('@/components/ui/tooltip', () => ({
  Hint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TopBar } from './TopBar';

describe('TopBar route breadcrumb', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    ui.route = 'canvas';
  });

  it('renders the canonical Canvas route label instead of undefined', () => {
    render(<TopBar />);

    expect(
      screen.getByRole('button', { name: 'Current route: Canvas. Open route switcher' }).textContent,
    ).toBe('Canvas');
  });

  it.each([
    ['preview', 'Preview'],
    ['browser', 'Browser'],
  ])('has a breadcrumb label for hidden route %s', (route, label) => {
    ui.route = route;
    render(<TopBar />);
    expect(
      screen.getByRole('button', { name: `Current route: ${label}. Open route switcher` }).textContent,
    ).toBe(label);
  });
});
