import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReferencePanel } from './ReferencePanel';
import { isEmbeddedSurfaceKind } from './EmbeddedSurface';
import type { WorkbenchPanel } from './types';

vi.mock('./NativeAppPanel', () => ({
  NativeAppPanel: ({ panel }: { panel: WorkbenchPanel }) => (
    <div data-testid="workbench-native-app-panel">{panel.settings.nativeAppId ?? panel.kind}</div>
  ),
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
  it('routes legacy ADE panels to the real native app host instead of an internal page', () => {
    expect(isEmbeddedSurfaceKind('ade')).toBe(false);
    render(<ReferencePanel panel={panel('ade')} onUpdate={() => undefined} />);
    expect(screen.getByTestId('workbench-native-app-panel').textContent).toContain('ade');
    expect(screen.queryByTestId('chatgpt-ade-page')).toBeNull();
    expect(screen.queryByTestId('workbench-embedded-ade')).toBeNull();
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
