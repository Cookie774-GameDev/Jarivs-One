import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { SettingsModal } from './SettingsModal';

vi.mock('@/lib/admin', () => ({
  useAppAdmin: () => false,
}));

describe('SettingsModal MonoChrome appearance', () => {
  const initialUiState = useUIStore.getState();

  afterEach(() => {
    act(() => useUIStore.setState(initialUiState, true));
  });

  it('removes overlay blur and motion without removing the ordinary presentation', () => {
    act(() => useUIStore.setState({ settingsOpen: true }));
    render(<SettingsModal initialTab="appearance" />);

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    const overlay = document.querySelector<HTMLElement>(
      '[data-monochrome-overlay="settings-modal"]',
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('backdrop-blur-sm');
    expect(overlay?.className).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
    expect(overlay?.className).toContain(
      '[html[data-theme=monochrome]_&]:data-[state=open]:!animate-none',
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(dialog.className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');
  });
});
