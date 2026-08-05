import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserChatStore } from './browserChatStore';
import { BrowserChatHub } from './BrowserChatHub';

vi.mock('./BrowserProviderSurface', () => ({
  BrowserProviderSurface: ({ provider }: { provider: { label: string } }) => (
    <div aria-label={`${provider.label} provider surface`}>{provider.label} real provider page</div>
  ),
}));

describe('BrowserChatHub', () => {
  beforeEach(() => {
    browserChatStore.setState({
      engine: 'browser',
      providerId: 'chatgpt',
      chatPreferences: {},
      preferManagedSurface: true,
      providerRuntime: {},
    });
  });
  afterEach(cleanup);

  it('shows the three provider-owned surfaces with separate page and bridge status', () => {
    render(<BrowserChatHub />);

    expect(screen.getByRole('tab', { name: 'ChatGPT' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Claude/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Gemini/i })).toBeTruthy();
    expect(screen.getByText(/page status/i)).toBeTruthy();
    expect(screen.getByText(/tool bridge/i)).toBeTruthy();
    expect(screen.getByText(/provider subscription and limits still apply/i)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps Claude and Gemini gated as future providers without scraping remote history', () => {
    render(<BrowserChatHub />);

    const claude = screen.getByRole('tab', { name: /Claude/i });
    const gemini = screen.getByRole('tab', { name: /Gemini/i });
    expect(claude).toHaveProperty('disabled', true);
    expect(gemini).toHaveProperty('disabled', true);
    fireEvent.click(claude);
    expect(browserChatStore.getState().providerId).toBe('chatgpt');
    expect(screen.getByLabelText('ChatGPT provider surface')).toBeTruthy();
    expect(document.body.textContent).toMatch(/does not.*read provider messages/i);
    expect(document.body.textContent).not.toMatch(/sync remote history/i);
  });
});
