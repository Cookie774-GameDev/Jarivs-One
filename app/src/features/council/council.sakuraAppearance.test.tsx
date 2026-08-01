import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Agent, Message } from '@/types';
import { useAgentStore } from '@/stores/agents';
import { AgentPanel } from './AgentPanel';
import { CouncilView } from './CouncilView';

const agent = {
  id: 'agent-sakura',
  slug: 'sakura-reviewer',
  name: 'Sakura Reviewer',
  description: '',
  system_prompt: '',
  model: {},
  tools_allowed: [],
  memory_scope: 'none',
  capabilities: [],
} as unknown as Agent;

const messages = [
  {
    id: 'message-user',
    chat_id: 'chat-sakura',
    role: 'user',
    parts: [{ kind: 'text', text: 'Review the browser boundary.' }],
    created_at: 1,
    updated_at: 1,
  },
  {
    id: 'message-agent',
    chat_id: 'chat-sakura',
    role: 'assistant',
    agent_id: agent.id,
    parts: [{ kind: 'text', text: 'Remote pixels remain isolated.' }],
    created_at: 2,
    updated_at: 2,
  },
] as Message[];

const cssPath = join(process.cwd(), 'src/features/council/council.sakura.css');
const css = (existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '').replace(/\s+/g, ' ').trim();

describe('Council Sakura messaging chrome', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    act(() => {
      useAgentStore.setState(useAgentStore.getInitialState(), true);
    });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useAgentStore.setState(useAgentStore.getInitialState(), true);
    });
    vi.unstubAllGlobals();
  });

  it('marks the app-owned council header, canvas, and empty state without changing copy', () => {
    render(<CouncilView agentIds={[]} />);

    const root = screen.getByText('Council').closest('[data-vibespace-owned-chrome]');
    expect(root?.getAttribute('data-vibespace-owned-chrome')).toBe('council');
    expect(root?.querySelector('[data-sakura-council-surface="header"]')).not.toBeNull();
    expect(root?.querySelector('[data-sakura-council-surface="canvas"]')).not.toBeNull();
    expect(screen.getByText('No active agents in this council. Add one to begin.')).not.toBeNull();
  });

  it('exposes real message roles and run state as non-color styling hooks', () => {
    act(() => {
      useAgentStore.setState({
        runStates: { [agent.id]: 'thinking' },
        verbs: { [agent.id]: 'Reviewing' },
      });
    });

    render(<AgentPanel agent={agent} messages={messages} />);

    const panel = screen.getByText('Sakura Reviewer').closest('[data-agent-id]');
    expect(panel?.getAttribute('data-sakura-council-surface')).toBe('agent-panel');
    expect(panel?.querySelector('[data-message-role="user"]')).not.toBeNull();
    expect(panel?.querySelector('[data-message-role="assistant"]')).not.toBeNull();
    expect(panel?.querySelector('[data-run-state="thinking"]')).not.toBeNull();
  });

  it('keeps council styling Sakura-scoped and free of specificity overrides', () => {
    expect(css).toContain("html[data-theme='sakura'] [data-vibespace-owned-chrome='council']");
    expect(css).toContain('var(--sakura-panel-fallback)');
    expect(css).not.toContain('!important');
  });
});
