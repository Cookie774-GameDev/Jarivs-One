import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFullscreenStore } from '@/features/fullscreen';
import { useUIStore } from '@/stores/ui';
import { Appearance } from './Appearance';

describe('Appearance theme selector', () => {
  afterEach(() => {
    cleanup();
    useUIStore.setState({ theme: 'default' });
    useFullscreenStore.setState({
      focusActive: false,
      systemActive: false,
      activationOrder: [],
      preferences: {
        rememberFocusMode: false,
        rememberSystemFullscreen: false,
        restoreFullscreenOnRestart: false,
        systemFullscreenBehavior: 'always-hidden',
      },
      nativeAvailability: 'web-preview',
      nativePending: false,
      error: null,
    });
  });

  it('renders exactly five accessible theme choices and applies VibeSpace', () => {
    useUIStore.setState({ theme: 'default' });
    render(<Appearance />);

    const themes = screen.getByRole('radiogroup', { name: 'App theme' });
    expect(within(themes).getAllByRole('radio')).toHaveLength(5);
    expect(within(themes).getByRole('radio', { name: /Default/ }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: /VibeSpace/ }));
    expect(useUIStore.getState().theme).toBe('vibespace');
    expect(document.documentElement.dataset.theme).toBe('vibespace');
  });

  it('offers Sakura as the cel-painted fifth choice and applies it', () => {
    render(<Appearance />);

    const sakura = screen.getByRole('radio', { name: /Sakura/ });
    expect(sakura.textContent).toContain('Cel-painted dusk workspace.');
    expect(sakura.querySelector('svg')?.getAttribute('class')).toMatch(/\blucide\b/);

    fireEvent.click(sakura);
    expect(useUIStore.getState().theme).toBe('sakura');
    expect(document.documentElement.dataset.theme).toBe('sakura');
    expect(document.documentElement.dataset.themePreference).toBe('sakura');
  });

  it('offers MonoChrome as the terminal-inspired fourth choice without surfacing Light', () => {
    render(<Appearance />);

    const monochrome = screen.getByRole('radio', { name: /MonoChrome/ });
    expect(monochrome.textContent).toContain('Terminal-inspired developer console.');
    expect(screen.queryByRole('radio', { name: /Light/ })).toBeNull();

    fireEvent.click(monochrome);
    expect(useUIStore.getState().theme).toBe('monochrome');
    expect(document.documentElement.dataset.theme).toBe('monochrome');
  });

  it('exposes independent system fullscreen behavior and safe restoration preferences', () => {
    render(<Appearance />);

    const systemToggle = screen.getByRole('switch', { name: 'True System Fullscreen' });
    expect(systemToggle.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/installed VibeSpace desktop app/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Reveal on Edge Hover' }));
    expect(useFullscreenStore.getState().preferences.systemFullscreenBehavior).toBe(
      'reveal-on-edge-hover',
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Remember Workspace Focus Mode' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Remember True System Fullscreen' }));
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Restore fullscreen state when VibeSpace restarts',
      }),
    );

    expect(useFullscreenStore.getState().preferences).toMatchObject({
      rememberFocusMode: true,
      rememberSystemFullscreen: true,
      restoreFullscreenOnRestart: true,
    });
  });
});
