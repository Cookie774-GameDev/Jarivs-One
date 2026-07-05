import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsPage } from './SkillsPage';

const addCustomSkill = vi.fn(() => 'custom_ai');

vi.mock('@/features/skills/registry', () => ({
  skillRegistry: {
    list: vi.fn(() => []),
    loadFromDisk: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    refresh: vi.fn(),
    setEnabled: vi.fn(),
  },
}));

vi.mock('@/features/skills/skillsStore', () => ({
  readSkillsStore: () => ({
    addCustomSkill,
    deletedPresets: [],
    presetOverrides: {},
    restoreAllPresets: vi.fn(),
  }),
}));

describe('SkillsPage Jarvis creator integration', () => {
  beforeEach(() => {
    addCustomSkill.mockClear();
  });

  it('does not show a top-level Jarvis creator button before a skill is selected', async () => {
    render(<SkillsPage />);

    await waitFor(() => expect(screen.getByText(/Skill library/i)).toBeTruthy());

    expect(screen.queryByRole('button', { name: /Create with Jarvis/i })).toBeNull();
    expect(addCustomSkill).not.toHaveBeenCalled();
  });
});
