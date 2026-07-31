import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDevelopmentSurface } from '../../../developmentSurface';
import * as fixtureModule from './SakuraStyleBoardFixture';

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'src/features/appearance/sakura/SakuraStyleBoardFixture.tsx',
);

const EXPECTED_PRIMITIVES = [
  'Avatar',
  'Badge',
  'Button',
  'Card',
  'Checkbox',
  'Dialog',
  'Input',
  'Label',
  'Popover',
  'Separator',
  'Skeleton',
  'Switch',
  'Tabs',
  'Textarea',
  'Toast',
  'Tooltip',
] as const;

const EXPECTED_SURFACES = [
  'shell',
  'top-bar',
  'navigation',
  'chat',
  'jarvis',
  'terminal',
  'context',
  'canvas-toolbar',
  'usage',
  'billing',
  'access-lock',
] as const;

const EXPECTED_STATES = [
  'default',
  'hover',
  'focus-visible',
  'active',
  'disabled',
  'validation-error',
  'loading',
  'open',
  'selected',
] as const;

describe('Sakura development style board', () => {
  it('exists as a dedicated Sakura-owned development fixture', () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
  });

  it('exposes an exact development-only request boundary', () => {
    expect(typeof fixtureModule.isSakuraStyleBoardRequest).toBe('function');
  });

  it('admits only the exact opt-in query in a development build', () => {
    const request = fixtureModule.isSakuraStyleBoardRequest;

    expect(request({ devBuild: true, search: '?sakura-style-board=1' })).toBe(true);
    expect(request({ devBuild: false, search: '?sakura-style-board=1' })).toBe(false);
    expect(request({ devBuild: true, search: '' })).toBe(false);
    expect(request({ devBuild: true, search: '?sakura-style-board=true' })).toBe(false);
  });

  it('uses one deterministic precedence decision when development flags conflict', () => {
    expect(resolveDevelopmentSurface('?monochrome-workbench=1')).toBe('monochrome');
    expect(resolveDevelopmentSurface('?sakura-style-board=1')).toBe('sakura');
    expect(resolveDevelopmentSurface('?sakura-style-board=1&monochrome-workbench=1')).toBe(
      'monochrome',
    );
    expect(resolveDevelopmentSurface('?sakura-style-board=true')).toBeNull();
    expect(resolveDevelopmentSurface('')).toBeNull();
  });

  it('exports the isolated fixture component', () => {
    expect(typeof fixtureModule.SakuraStyleBoardFixture).toBe('function');
  });

  it('renders only for the exact development request', () => {
    const productionView = render(
      <fixtureModule.SakuraStyleBoardFixture devBuild={false} search="?sakura-style-board=1" />,
    );
    expect(productionView.container.childElementCount).toBe(0);

    render(<fixtureModule.SakuraStyleBoardFixture devBuild search="?sakura-style-board=1" />);
    expect(screen.getByRole('heading', { name: 'Sakura shared interface study' })).toBeTruthy();
  });

  it('renders the frozen shared primitives and representative product surfaces', () => {
    const view = render(
      <fixtureModule.SakuraStyleBoardFixture devBuild search="?sakura-style-board=1" />,
    );

    for (const primitive of EXPECTED_PRIMITIVES) {
      expect(
        view.container.querySelector(`[data-sakura-primitive="${primitive}"]`),
        primitive,
      ).not.toBeNull();
    }

    for (const surface of EXPECTED_SURFACES) {
      expect(
        view.container.querySelector(`[data-sakura-surface="${surface}"]`),
        surface,
      ).not.toBeNull();
    }
  });

  it('renders every deterministic shared-control state with native semantics', () => {
    const view = render(
      <fixtureModule.SakuraStyleBoardFixture devBuild search="?sakura-style-board=1" />,
    );

    for (const state of EXPECTED_STATES) {
      expect(view.container.querySelector(`[data-sakura-state~="${state}"]`), state).not.toBeNull();
    }

    expect(
      (screen.getByRole('button', { name: 'Syncing fixture' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText('Run name').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Use at least three characters');
    expect(screen.getByRole('status', { name: 'Loading synthetic result' })).toBeTruthy();
  });

  it('uses the shared development entry without joining production routes or navigation', () => {
    const mainSource = readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    const developmentEntrySource = readFileSync(
      path.resolve(process.cwd(), 'src/developmentEntry.tsx'),
      'utf8',
    );
    const developmentSurfaceSource = readFileSync(
      path.resolve(process.cwd(), 'src/developmentSurface.ts'),
      'utf8',
    );

    expect(mainSource).toMatch(/import\.meta\.env\.DEV/u);
    expect(developmentSurfaceSource).toMatch(/sakura-style-board/u);
    expect(mainSource).toMatch(/import\(['"]\.\/developmentEntry['"]\)/u);
    expect(mainSource).not.toMatch(/SakuraStyleBoardFixture/u);
    expect(mainSource).toMatch(/dataset\.theme = .*sakura/u);
    expect(mainSource).toMatch(/<DevelopmentEntry surface=\{devSurface\}/u);
    expect(developmentEntrySource).toMatch(
      /import\(['"]\.\/features\/appearance\/sakura\/SakuraStyleBoardFixture['"]\)/u,
    );
    expect(developmentEntrySource).not.toMatch(
      /URLSearchParams[\s\S]*get\(['"]sakura-style-board['"]\)/u,
    );

    for (const relativePath of [
      'src/App.tsx',
      'src/components/layout/PageRouter.tsx',
      'src/components/layout/NavPane.tsx',
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/SakuraStyleBoardFixture|sakura-style-board/u);
    }
  });

  it('keeps the shared control semantics and visible outcomes interactive', async () => {
    render(<fixtureModule.SakuraStyleBoardFixture devBuild search="?sakura-style-board=1" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Include project context' });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');

    const motionSwitch = screen.getByRole('switch', { name: 'Calm motion' });
    fireEvent.click(motionSwitch);
    expect(motionSwitch.getAttribute('aria-checked')).toBe('false');

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    await act(async () => {
      chatTab.focus();
      fireEvent.keyDown(chatTab, { key: 'ArrowRight' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const terminalTab = screen.getByRole('tab', { name: 'Terminal' });
    await waitFor(() => expect(document.activeElement).toBe(terminalTab));
    expect(screen.getByRole('tabpanel', { name: 'Terminal' }).textContent).toContain(
      '$ focused-check',
    );

    const reviewTrigger = screen.getByRole('button', { name: 'Review fixture' });
    fireEvent.click(reviewTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Review Sakura fixture' });
    expect(dialog).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole('dialog', { name: 'Review Sakura fixture' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(reviewTrigger));

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(await screen.findByText('Fixture checked')).toBeTruthy();
  });
});
