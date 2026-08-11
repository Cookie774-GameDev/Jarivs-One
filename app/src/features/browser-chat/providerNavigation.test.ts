import { describe, expect, it } from 'vitest';

import { normalizeProviderNavigation, validateProviderNavigationUrl } from './providerNavigation';

describe('Browser Chat provider navigation adapters', () => {
  it.each([
    [
      'chatgpt',
      'https://chatgpt.com/c/conversation-1?temporary-chat=true#fragment',
      {
        provider: 'chatgpt',
        kind: 'conversation',
        conversationKey: 'conversation-1',
        normalizedUrl: 'https://chatgpt.com/c/conversation-1',
      },
    ],
    [
      'chatgpt',
      'https://chatgpt.com/g/g-p-project-1/project',
      {
        provider: 'chatgpt',
        kind: 'project',
        projectKey: 'g-p-project-1',
        normalizedUrl: 'https://chatgpt.com/g/g-p-project-1/project',
      },
    ],
    [
      'claude',
      'https://claude.ai/chat/conversation-2',
      {
        provider: 'claude',
        kind: 'conversation',
        conversationKey: 'conversation-2',
        normalizedUrl: 'https://claude.ai/chat/conversation-2',
      },
    ],
    [
      'claude',
      'https://claude.ai/project/project-2',
      {
        provider: 'claude',
        kind: 'project',
        projectKey: 'project-2',
        normalizedUrl: 'https://claude.ai/project/project-2',
      },
    ],
    [
      'gemini',
      'https://gemini.google.com/app/conversation-3',
      {
        provider: 'gemini',
        kind: 'conversation',
        conversationKey: 'conversation-3',
        normalizedUrl: 'https://gemini.google.com/app/conversation-3',
      },
    ],
  ] as const)(
    'normalizes supported %s top-level navigation without page content',
    (provider, rawUrl, expected) => {
      expect(normalizeProviderNavigation(provider, rawUrl)).toEqual(expected);
    },
  );

  it.each([
    ['chatgpt', 'https://chatgpt.com/'],
    ['claude', 'https://claude.ai/'],
    ['gemini', 'https://gemini.google.com/'],
  ] as const)('recognizes the %s provider home without inventing a binding', (provider, rawUrl) => {
    expect(normalizeProviderNavigation(provider, rawUrl)).toEqual({
      provider,
      kind: 'home',
      normalizedUrl: rawUrl,
    });
  });

  it.each([
    ['chatgpt', 'http://chatgpt.com/c/conversation-1'],
    ['chatgpt', 'https://chatgpt.com.evil.example/c/conversation-1'],
    ['chatgpt', 'https://user:password@chatgpt.com/c/conversation-1'],
    ['claude', 'https://claude.ai:444/chat/conversation-1'],
    ['claude', 'https://claude.ai/settings/profile'],
    ['gemini', 'https://gemini.google.com/share/conversation-1'],
  ] as const)('rejects spoofed or unsupported %s navigation: %s', (provider, rawUrl) => {
    expect(normalizeProviderNavigation(provider, rawUrl)).toBeNull();
  });

  it('validates resume URLs for the required navigation kind', () => {
    expect(
      validateProviderNavigationUrl(
        'chatgpt',
        'https://chatgpt.com/c/conversation-1',
        'conversation',
      ),
    ).toBe('https://chatgpt.com/c/conversation-1');
    expect(() =>
      validateProviderNavigationUrl(
        'chatgpt',
        'https://chatgpt.com/g/g-p-project-1/project',
        'conversation',
      ),
    ).toThrow('browser_chat_provider_navigation_invalid');
  });
});
