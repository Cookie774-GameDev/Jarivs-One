import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageRouter } from './PageRouter';
import { useUIStore } from '@/stores/ui';

vi.mock('@/features/workbench', () => ({
  WorkbenchPage: () => <div data-testid="workbench-page">Workbench live surface</div>,
}));

vi.mock('@/features/chat', () => ({
  ChatView: () => <div data-testid="chat-page">Chat</div>,
}));

describe('PageRouter Workbench route', () => {
  afterEach(() => useUIStore.getState().resetUI());

  it('renders the Workbench feature through the first-class route', async () => {
    useUIStore.getState().setRoute('workbench');
    render(<PageRouter />);
    expect(await screen.findByTestId('workbench-page')).toBeTruthy();
  });
});
