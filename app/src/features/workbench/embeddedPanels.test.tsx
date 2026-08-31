import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReferencePanel } from './ReferencePanel';
import { EmbeddedSurface, isEmbeddedSurfaceKind } from './EmbeddedSurface';
import { PanelPalette } from './PanelPalette';
import type { WorkbenchPanel } from './types';

vi.mock('@/features/ade', () => ({
  ChatGptAdePage: () => <div data-testid="chatgpt-ade-page">ChatGPT ADE unavailable truth</div>,
}));

vi.mock('@/features/chat', () => ({
  ChatThread: () => <div data-testid="workbench-chat-thread">thread</div>,
  Composer: () => <div data-testid="workbench-chat-composer">composer</div>,
  EmptyChat: () => <div>empty</div>,
  ensureActiveChat: vi.fn(async () => 'chat-1'),
}));

vi.mock('@/lib/fs', () => ({
  listDirectory: vi.fn(async () => ({ ok: true, path: 'C:\\proj', entries: [] })),
  readTextFile: vi.fn(async () => ({ ok: true, path: 'x', content: 'hello' })),
  writeTextFile: vi.fn(async () => ({ ok: true, path: 'x' })),
  describeFsError: () => 'error',
}));

vi.mock('@/features/files/projectFiles', async () => {
  const actual = await vi.importActual<typeof import('@/features/files/projectFiles')>(
    '@/features/files/projectFiles',
  );
  return {
    ...actual,
    getStoredProjectRoot: () => 'C:\\proj',
    chooseProjectFolder: vi.fn(async () => null),
    setStoredProjectRoot: vi.fn(),
  };
});

function panel(
  kind: WorkbenchPanel['kind'],
  settings: WorkbenchPanel['settings'] = {},
): WorkbenchPanel {
  return {
    id: `${kind}-1`,
    kind,
    title: kind,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    z: 1,
    minimized: false,
    status: 'idle',
    settings,
  };
}

describe('Workbench embedded panels', () => {
  it('offers and renders the truthful ChatGPT ADE surface as an embedded panel', async () => {
    const onAdd = vi.fn();
    render(<PanelPalette onAdd={onAdd} />);

    screen.getByRole('button', { name: 'Add ChatGPT ADE' }).click();
    expect(onAdd).toHaveBeenCalledWith('ade');
    expect(isEmbeddedSurfaceKind('ade')).toBe(true);

    render(<EmbeddedSurface panel={panel('ade')} />);
    expect(await screen.findByTestId('chatgpt-ade-page')).toBeTruthy();
    expect(screen.getByTestId('workbench-embedded-ade')).toBeTruthy();
  });

  it('renders real files surface instead of route-redirect placeholder copy', () => {
    render(<ReferencePanel panel={panel('files')} onUpdate={() => undefined} />);
    expect(screen.getByTestId('workbench-files-panel')).toBeTruthy();
    expect(screen.queryByText(/lightweight live reference/i)).toBeNull();
  });

  it('renders real Jarvis chat surface instead of placeholder card', async () => {
    render(<ReferencePanel panel={panel('jarvis')} onUpdate={() => undefined} />);
    expect(await screen.findByTestId('workbench-jarvis-panel')).toBeTruthy();
    expect(screen.queryByText(/lightweight live reference/i)).toBeNull();
  });

  it('renders editor without raw dual-pane mirror of the same text as preview by default', () => {
    render(
      <ReferencePanel
        panel={panel('editor', { note: 'const x = 1;', language: 'ts', previewEnabled: false })}
        onUpdate={() => undefined}
      />,
    );
    expect(screen.getByTestId('workbench-editor-panel')).toBeTruthy();
    expect(screen.getByLabelText('Editor content')).toBeTruthy();
    expect(screen.queryByLabelText('Editor preview')).toBeNull();
    expect(screen.queryByLabelText('Markdown preview')).toBeNull();
  });
});
