import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '@/stores/agents';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import type { Agent, AgentId, ProjectId, WorkspaceId } from '@/types';
import { AgentDetail } from './AgentDetail';

const { chatCreateMock, getActiveProfileMock } = vi.hoisted(() => ({
  chatCreateMock: vi.fn(),
  getActiveProfileMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ chatRepo: { create: chatCreateMock } }));
vi.mock('@/lib/db/jarvisRepositories', () => ({
  jarvisProfileRepo: { getActive: getActiveProfileMock },
}));

const MONO = '[html[data-theme=monochrome]_&]';

const ordinaryAgent: Agent = {
  id: 'agent_ordinary' as AgentId,
  slug: 'writer',
  name: 'Writer',
  description: 'Ordinary agent',
  system_prompt: 'ORDINARY AGENT SYSTEM PROMPT',
  model: { provider: 'google', model: 'gemini-2.5-flash' },
  tools_allowed: ['files.read'],
  memory_scope: 'project',
  capabilities: ['writing'],
  temperature: 0.4,
  builtin: true,
  created_at: 1,
  updated_at: 1,
};

describe('AgentDetail MonoChrome appearance', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState(useAgentStore.getInitialState(), true);
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useAuthStore.setState({
      localUserId: 'account-a',
      cloudSession: null,
      workspaceId: 'workspace-a' as WorkspaceId,
      projectId: 'project-a' as ProjectId,
      apiKeys: {},
      offlineMode: false,
      plan: 'free',
      defaultLocalModel: '',
    });
    useUIStore.setState({
      activeAgentId: ordinaryAgent.id,
      activeChatId: null,
      chatMode: 'chat',
      route: 'agent-detail',
    });
    useAgentStore.getState().registerAgent(ordinaryAgent);
    getActiveProfileMock.mockResolvedValue(undefined);
    chatCreateMock.mockResolvedValue({ id: 'chat-created' });
  });

  it('gates every rendered gradient owner without removing content or ordinary-theme gradients', () => {
    const { container } = render(<AgentDetail />);

    const route = container.querySelector<HTMLElement>('[data-monochrome-route="agent-detail"]');
    expect(route).not.toBeNull();

    // Gradient owner #1: the accent "Start chat" button (bg-accent-gradient utility).
    const buttonOwners = Array.from(
      route!.querySelectorAll<HTMLElement>('[class*="accent-gradient"]'),
    );
    expect(buttonOwners).toHaveLength(1);
    const startChat = buttonOwners[0]!;
    expect(startChat.tagName).toBe('BUTTON');
    // Ordinary-theme gradient utility must remain so Default/VibeSpace/Jarvis keep the gradient.
    expect(startChat.className).toContain('bg-accent-gradient');
    // Missing MonoChrome gate (RED until the component-local gate is added).
    expect(startChat.className).toContain(`${MONO}:bg-none`);

    // Gradient owner #2: the deterministic header avatar (inline gradient background).
    const avatar = route!.querySelector<HTMLElement>('[data-vibespace-avatar]');
    expect(avatar).not.toBeNull();
    // Ordinary-theme inline gradient must remain for the other themes.
    expect(avatar!.getAttribute('style') ?? '').toContain('gradient');
    // The narrow component-local gate lives on the badge wrapper and targets the avatar descendant.
    const badgeWrapper = avatar!.parentElement;
    expect(badgeWrapper).not.toBeNull();
    expect(badgeWrapper!.className).toContain(
      '[html[data-theme=monochrome]_&_[data-vibespace-avatar]]:bg-none',
    );

    // Behavior, copy, and accessibility are preserved.
    expect(screen.getByRole('heading', { name: 'Writer' })).toBeTruthy();
    expect(screen.getByText('Ordinary agent')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start chat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to agents' })).toBeTruthy();
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('Temperature')).toBeTruthy();
    expect(screen.getByText('writing')).toBeTruthy();
    expect(screen.getByText('project')).toBeTruthy();
    expect(screen.getByText('ORDINARY AGENT SYSTEM PROMPT')).toBeTruthy();
  });

  it('flattens the empty-state paper background only in MonoChrome', () => {
    useUIStore.setState({ activeAgentId: null });

    const { container } = render(<AgentDetail />);
    const route = container.querySelector<HTMLElement>(
      '[data-monochrome-route="agent-detail"][data-monochrome-state="empty"]',
    );

    expect(route).not.toBeNull();
    expect(route!.className).toContain('bg-paper-warm');
    expect(route!.className).toContain(`${MONO}:bg-background`);
    expect(route!.className).toContain(`${MONO}:bg-none`);
    expect(screen.getByText('No agent selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open agent manager' })).toBeTruthy();
  });
});
