// @vitest-environment jsdom

import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { useWorkbenchStore } from './store';
import { ChatGptAdeRedirect } from './ChatGptAdeRedirect';

describe('ChatGptAdeRedirect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkbenchStore.getState().resetWorkbench();
    useUIStore.setState({ route: 'ade' });
  });
  afterEach(() => act(() => useUIStore.getState().resetUI()));

  it('opens one real ChatGPT desktop panel and hands navigation to Workbench', async () => {
    const { container, rerender } = render(<ChatGptAdeRedirect />);
    await waitFor(() => expect(useUIStore.getState().route).toBe('workbench'));
    expect(container.textContent).toBe('');
    expect(useWorkbenchStore.getState().panels.filter((panel) => panel.settings.nativeAppId === 'chatgpt')).toHaveLength(1);
    expect(useWorkbenchStore.getState().panels.find((panel) => panel.settings.nativeAppId === 'chatgpt')).toMatchObject({
      kind: 'native-app',
      title: 'ChatGPT',
    });

    act(() => useUIStore.setState({ route: 'ade' }));
    rerender(<ChatGptAdeRedirect />);
    await waitFor(() => expect(useUIStore.getState().route).toBe('workbench'));
    expect(useWorkbenchStore.getState().panels.filter((panel) => panel.settings.nativeAppId === 'chatgpt')).toHaveLength(1);
  });
});
