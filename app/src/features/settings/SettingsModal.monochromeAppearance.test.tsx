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

  it('keeps every navigation label on an explicit integer line box', () => {
    act(() => useUIStore.setState({ settingsOpen: true }));
    render(<SettingsModal initialTab="appearance" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(10);
    for (const tab of tabs) {
      expect(tab.className).toContain('h-8');
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('py-0');
      const label = tab.querySelector('span');
      expect(label?.className).toContain('h-4');
      expect(label?.className).toContain('leading-4');
    }
  });

  it('gives reduced-motion Settings an integer sidebar paint origin', () => {
    act(() => useUIStore.setState({ settingsOpen: true }));
    render(<SettingsModal initialTab="appearance" />);

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.className).toContain('motion-reduce:!left-0');
    expect(dialog.className).toContain('motion-reduce:!right-0');
    expect(dialog.className).toContain(
      'motion-reduce:!top-[round(nearest,calc(50vh-min(380px,45vh)),1px)]',
    );
    expect(dialog.className).toContain('motion-reduce:!bottom-auto');
    expect(dialog.className).toContain('motion-reduce:!mx-auto');
    expect(dialog.className).toContain('motion-reduce:!my-0');
    expect(dialog.className).toContain('motion-reduce:!transform-none');

    const heading = screen.getByText('Settings', { selector: 'span' });
    expect(heading.parentElement?.className).toContain('h-[54px]');
    expect(heading.parentElement?.className).toContain('py-0');
    expect(heading.parentElement?.className).toContain('items-center');
  });
});
