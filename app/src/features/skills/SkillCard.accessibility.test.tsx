import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillManifest } from './loader';
import { SkillCard } from './SkillCard';

const manifest: SkillManifest = {
  name: 'accessibility_fixture',
  title: 'Accessibility Fixture',
  description: 'Verifies independent card selection and enabled state.',
  kind: 'skill',
  tools: [],
  body: 'Use the accessibility fixture.',
  source: 'project',
  filePath: 'local/accessibility_fixture.md',
  catalogId: 'accessibility_fixture',
  isPreset: false,
  enabled: true,
  tags: ['fixture'],
  emoji: '✦',
  colorHue: 35,
};

describe('SkillCard accessibility', () => {
  afterEach(cleanup);

  it('keeps selection and enabled state as independent sibling controls', () => {
    const onSelect = vi.fn();
    const onToggleEnabled = vi.fn();
    const { container } = render(
      <SkillCard
        manifest={manifest}
        selected={false}
        onSelect={onSelect}
        onToggleEnabled={onToggleEnabled}
      />,
    );

    const card = container.querySelector<HTMLElement>('[data-monochrome-surface="skill-manifest"]');
    const selection = screen.getByRole('button', { name: 'Select Accessibility Fixture' });
    const enabledSwitch = screen.getByRole('switch', { name: 'Disable skill' });

    expect(card?.getAttribute('role')).toBeNull();
    expect(card?.contains(selection)).toBe(true);
    expect(card?.contains(enabledSwitch)).toBe(true);
    expect(selection.contains(enabledSwitch)).toBe(false);
    expect(selection.tagName).toBe('BUTTON');
    expect(selection.getAttribute('aria-pressed')).toBe('false');
    expect(selection.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['absolute', 'inset-0']),
    );
    expect(enabledSwitch.parentElement?.parentElement?.className).toContain('pointer-events-none');
    expect(enabledSwitch.parentElement?.className).toContain('pointer-events-auto');

    fireEvent.click(selection);
    expect(onSelect).toHaveBeenCalledWith('accessibility_fixture');

    fireEvent.click(enabledSwitch);
    expect(onToggleEnabled).toHaveBeenCalledWith('accessibility_fixture', false);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('gives the actual enabled switch a target at least 24px tall', () => {
    render(
      <SkillCard
        manifest={manifest}
        selected={false}
        onSelect={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );

    const enabledSwitch = screen.getByRole('switch', { name: 'Disable skill' });
    expect(enabledSwitch.className.split(/\s+/)).toContain('h-6');
  });

  it.each([
    { key: 'Enter', label: 'Enter' },
    { key: ' ', label: 'Space' },
  ])('selects once for a native $label keyboard activation', ({ key }) => {
    const onSelect = vi.fn();
    render(
      <SkillCard
        manifest={manifest}
        selected={false}
        onSelect={onSelect}
        onToggleEnabled={vi.fn()}
      />,
    );

    const selection = screen.getByRole('button', { name: 'Select Accessibility Fixture' });
    fireEvent.keyDown(selection, { key });
    if (key === ' ') fireEvent.keyUp(selection, { key });
    fireEvent.click(selection, { detail: 0 });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
