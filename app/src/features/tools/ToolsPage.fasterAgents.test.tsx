import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toolState = vi.hoisted(() => ({
  tools: [],
  importMany: vi.fn(() => 0),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('./toolStore', () => ({
  useToolStore: (selector: (state: typeof toolState) => unknown) => selector(toolState),
  slugify: (value: string) => value.toLowerCase().replace(/\s+/gu, '-'),
  parseToolStepsJson: vi.fn(() => []),
}));
vi.mock('@/lib/actions', () => ({
  getBuiltinActions: vi.fn(() => []),
  runAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./open-in-terminal/OpenInTerminalDialog', () => ({
  OpenInTerminalDialog: () => null,
}));
vi.mock('./faster-agents/FasterAgentsToolCard', () => ({
  FasterAgentsToolCard: () => <button type="button">Run Faster Agents</button>,
}));
vi.mock('./command-center/CommandCenterToolCard', () => ({
  CommandCenterToolCard: () => null,
}));
vi.mock('@/features/wellness', () => ({
  EmpireFreezerToolCard: () => null,
}));

import { ToolsPage } from './ToolsPage';

describe('ToolsPage Faster Agents integration', () => {
  afterEach(cleanup);

  it('includes Faster Agents as a first-party preloaded tool', () => {
    render(<ToolsPage />);
    expect(screen.getByRole('heading', { name: 'Preloaded tools' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run Faster Agents' })).toBeTruthy();
  });
});
