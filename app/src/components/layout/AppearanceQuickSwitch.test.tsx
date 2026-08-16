import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SELECTABLE_THEMES } from '@/features/appearance/themes';
import { useUIStore } from '@/stores/ui';
import { AppearanceQuickSwitch } from './AppearanceQuickSwitch';

describe('AppearanceQuickSwitch', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({ theme: 'default' });
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  it('offers exactly Default and VibeSpace and reflects the current quick theme', () => {
    render(<AppearanceQuickSwitch />);

    const group = screen.getByRole('group', { name: 'App appearance' });
    const buttons = group.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'VibeSpace' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('writes both choices through the existing persisted UI theme action', () => {
    render(<AppearanceQuickSwitch />);

    fireEvent.click(screen.getByRole('button', { name: 'VibeSpace' }));
    expect(useUIStore.getState().theme).toBe('vibespace');
    expect(document.documentElement.getAttribute('data-theme')).toBe('vibespace');
    expect(screen.getByRole('button', { name: 'VibeSpace' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(useUIStore.getState().theme).toBe('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('true');
  });

  it.each(['jarvis', 'light'] as const)('does not mislabel the %s theme as a quick choice', (theme) => {
    useUIStore.setState({ theme });
    render(<AppearanceQuickSwitch />);

    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'VibeSpace' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps both choices accessibly named in compact chrome', () => {
    render(<AppearanceQuickSwitch compact />);

    expect(screen.getByRole('button', { name: 'Default' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'VibeSpace' })).not.toBeNull();
    expect(screen.getByRole('group', { name: 'App appearance' }).getAttribute('data-compact')).toBe('true');
  });

  it('is mounted in both TopBar layouts and leaves the four-theme registry intact', () => {
    const topBarSource = readFileSync(resolve(process.cwd(), 'src/components/layout/TopBar.tsx'), 'utf8');
    const appearanceSettingsSource = readFileSync(
      resolve(process.cwd(), 'src/features/settings/sections/Appearance.tsx'),
      'utf8',
    );

    expect(topBarSource.match(/<AppearanceQuickSwitch(?:\s|\/|>)/g)).toHaveLength(2);
    expect(appearanceSettingsSource).toContain('SELECTABLE_THEMES.map');
    expect(SELECTABLE_THEMES.map((theme) => theme.id)).toEqual([
      'jarvis',
      'vibespace',
      'default',
      'light',
    ]);
  });
});

describe('VibeSpace shell material contract', () => {
  const appShellSource = readFileSync(resolve(process.cwd(), 'src/components/layout/AppShell.tsx'), 'utf8');
  const themeCss = readFileSync(resolve(process.cwd(), 'src/styles/vibespace-theme.css'), 'utf8').toLowerCase();

  it('provides structural shell, folded-spine, sheet-stack, and workspace hooks', () => {
    for (const hook of [
      'vibespace-shell',
      'vibespace-shell__spine',
      'vibespace-shell__sheet-stack',
      'vibespace-shell__workspace',
    ]) {
      expect(appShellSource).toContain(hook);
    }
    expect(appShellSource).toMatch(/vibespace-shell__spine[^>]*aria-hidden="true"/);
  });

  it('uses the locked paper palette and strictly theme-scoped structural selectors', () => {
    for (const color of [
      '#e9d4b7',
      '#f8e9d1',
      '#fff7e8',
      '#3b2a20',
      '#df846f',
      '#947db7',
      '#879a7c',
      '#7f98aa',
      '#c98c42',
      '#302e4d',
    ]) {
      expect(themeCss).toContain(color);
    }

    for (const hook of [
      '.vibespace-shell',
      '.vibespace-shell__spine',
      '.vibespace-shell__sheet-stack',
      '.vibespace-shell__workspace',
      '.appearance-quick-switch',
    ]) {
      expect(themeCss).toContain(`html[data-theme='vibespace'] ${hook}`);
    }
  });

  it('builds real folded and stacked material with responsive motion safeguards', () => {
    expect(themeCss).toContain('.vibespace-shell__sheet-stack::before');
    expect(themeCss).toContain('.vibespace-shell__sheet-stack::after');
    expect(themeCss).toContain('repeating-conic-gradient');
    expect(themeCss).toContain('repeating-linear-gradient');
    expect(themeCss).toContain('clip-path');
    expect(themeCss).toContain('box-shadow');
    expect(themeCss).toMatch(/@media\s*\(max-width:\s*720px\)/);
    expect(themeCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
