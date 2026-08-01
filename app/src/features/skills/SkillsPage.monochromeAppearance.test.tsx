import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillManifest } from './loader';

const mocks = vi.hoisted(() => {
  const manifest: SkillManifest = {
    name: 'fixture_skill',
    title: 'Fixture Skill',
    description: 'A deterministic skill used to verify the authoring surface.',
    kind: 'skill',
    tools: ['files'],
    body: '## Use\n\nUse this fixture to verify the editor preview.',
    source: 'project',
    filePath: 'local/fixture_skill.md',
    catalogId: 'fixture_skill',
    isPreset: false,
    enabled: true,
    tags: ['fixture'],
    emoji: '✦',
    colorHue: 35,
  };
  return { manifest };
});

vi.mock('@/features/skills/registry', () => ({
  skillRegistry: {
    list: vi.fn(() => [mocks.manifest]),
    loadFromDisk: vi.fn(async () => [mocks.manifest]),
    subscribe: vi.fn(() => () => undefined),
    refresh: vi.fn(),
    setEnabled: vi.fn(),
  },
}));

vi.mock('@/features/skills/skillsStore', () => ({
  readSkillsStore: () => ({
    addCustomSkill: vi.fn(() => 'custom_ai'),
    deletedPresets: [],
    presetOverrides: {},
    restoreAllPresets: vi.fn(),
  }),
}));

import { SkillsPage } from './SkillsPage';
import { SkillDetail } from './SkillDetail';
import { skillRegistry } from './registry';

describe('SkillsPage MonoChrome appearance', () => {
  afterEach(cleanup);

  it('flattens the rendered skill manifest without removing ordinary-theme presentation', async () => {
    const { container } = render(<SkillsPage />);
    await screen.findByText('Fixture Skill');

    const route = container.querySelector<HTMLElement>('[data-monochrome-route="skills"]');
    const card = route?.querySelector<HTMLElement>('[data-monochrome-surface="skill-manifest"]');
    expect(card).not.toBeNull();

    expect(card!.className).toContain('shadow-soft');
    expect(card!.className).toContain('hover:shadow-lift');
    expect(card!.getAttribute('style')).toContain('border-left-color');
    expect(card!.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(card!.className).toContain('[html[data-theme=monochrome]_&]:hover:shadow-none');
    expect(card!.className).toContain('[html[data-theme=monochrome]_&]:rounded-sm');
    expect(card!.className).toContain('[html[data-theme=monochrome]_&]:bg-panel');
    expect(card!.className).toContain('[html[data-theme=monochrome]_&]:!border-l-accent-cyan');

    const selection = screen.getByRole('button', { name: 'Select Fixture Skill' });
    fireEvent.click(selection);
    await waitFor(() => expect(selection.getAttribute('aria-pressed')).toBe('true'));
    expect(card!.className).toContain('ring-1 ring-accent-copper');
    expect(card!.className).toContain('[html[data-theme=monochrome]_&]:ring-0');
    expect(selection.className).toContain(
      '[html[data-theme=monochrome]_&]:focus-visible:outline-accent-cyan',
    );
    const enabledSwitch = screen.getByRole('switch', { name: 'Disable skill' });
    expect(enabledSwitch.className).toContain('[html[data-theme=monochrome]_&_span]:shadow-none');
  });

  it('uses a mutually exclusive keyboard filter without dangling tab ownership', async () => {
    render(<SkillsPage />);
    await screen.findByText('Fixture Skill');

    const filters = screen.getByRole('radiogroup', { name: 'Skill filters' });
    const all = screen.getByRole('radio', { name: 'All' });
    const presets = screen.getByRole('radio', { name: 'Presets' });
    const custom = screen.getByRole('radio', { name: 'Custom' });

    expect(filters.contains(all)).toBe(true);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(all.getAttribute('aria-checked')).toBe('true');
    expect(presets.getAttribute('aria-checked')).toBe('false');
    expect(custom.getAttribute('aria-checked')).toBe('false');
    expect(all.hasAttribute('aria-controls')).toBe(false);
    expect(all.className).toContain('data-[state=active]:shadow-sm');
    expect(all.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');

    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(presets);
    expect(presets.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('No matches.')).toBeTruthy();

    fireEvent.click(custom);
    expect(custom.getAttribute('aria-checked')).toBe('true');
    expect(await screen.findByText('Fixture Skill')).toBeTruthy();
  });

  it('flattens the selected skill editor header and preview while preserving authoring controls', async () => {
    const { container } = render(<SkillsPage />);
    await screen.findByText('Fixture Skill');
    fireEvent.click(screen.getByRole('button', { name: 'Select Fixture Skill' }));

    const header = container.querySelector<HTMLElement>(
      '[data-monochrome-surface="skill-editor-header"]',
    );
    expect(header).not.toBeNull();
    expect(header!.getAttribute('style')).toContain('border-left-color');
    expect(header!.className).toContain('[html[data-theme=monochrome]_&]:!border-l-accent-cyan');

    const previewTab = screen.getByRole('tab', { name: 'Preview' });
    fireEvent.mouseDown(previewTab, { button: 0, ctrlKey: false });
    fireEvent.click(previewTab);
    await waitFor(() => expect(previewTab.getAttribute('aria-selected')).toBe('true'));
    await waitFor(() =>
      expect(
        container.querySelector<HTMLElement>('[data-monochrome-surface="skill-preview"]'),
      ).not.toBeNull(),
    );
    const preview = container.querySelector<HTMLElement>(
      '[data-monochrome-surface="skill-preview"]',
    );
    expect(preview!.className).toContain('shadow-soft');
    expect(preview!.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(preview!.className).toContain('[html[data-theme=monochrome]_&]:rounded-sm');
    expect(preview!.className).toContain('[html[data-theme=monochrome]_&]:bg-panel');

    expect(screen.getByRole('button', { name: 'Create with Jarvis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('stops the skill reload spinner when reduced motion is requested', async () => {
    let finishReload: ((manifests: SkillManifest[]) => void) | undefined;
    vi.mocked(skillRegistry.loadFromDisk).mockImplementationOnce(
      () =>
        new Promise<SkillManifest[]>((resolve) => {
          finishReload = resolve;
        }),
    );
    render(<SkillDetail manifest={mocks.manifest} onToggleEnabled={vi.fn()} />);

    const reload = screen.getByRole('button', { name: 'Reload from disk' });
    fireEvent.click(reload);
    const spinner = reload.querySelector('svg');
    expect(spinner?.getAttribute('class')).toContain('animate-spin');
    expect(spinner?.getAttribute('class')).toContain('motion-reduce:animate-none');

    finishReload?.([mocks.manifest]);
    await waitFor(() => expect(reload).not.toHaveProperty('disabled', true));
  });
});
