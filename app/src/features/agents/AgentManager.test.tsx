import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentId } from '@/types';
import { useAgentStore } from '@/stores/agents';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from '@/lib/ai/models';
import { resetProviderModelCache } from '@/lib/ai/providerModelCatalog';
import { AgentManager } from './AgentManager';

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    agentRepo: {
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('@/lib/ai/providers/ollama', () => ({
  isOllamaReachable: vi.fn(async () => false),
  listOllamaModels: vi.fn(async () => []),
}));

const baseAgent: Agent = {
  id: 'agent_alpha' as AgentId,
  slug: 'alpha',
  name: 'Alpha Agent',
  description: 'Existing description',
  system_prompt: 'Existing prompt\n\nKeep this formatting.',
  model: { provider: 'google', model: 'gemini-2.5-flash' },
  tools_allowed: ['files.read'],
  memory_scope: 'project',
  capabilities: ['writing'],
  skills: ['summarize'],
  temperature: 0.7,
  effort: 'medium',
  persona: 'jarvis',
  builtin: false,
  created_at: 1,
  updated_at: 1,
};

const secondAgent: Agent = {
  ...baseAgent,
  id: 'agent_beta' as AgentId,
  slug: 'beta',
  name: 'Beta Agent',
  updated_at: 2,
};

async function repoMocks() {
  const { agentRepo } = await import('@/lib/db');
  vi.mocked(agentRepo.getById).mockResolvedValue(baseAgent);
  vi.mocked(agentRepo.update).mockImplementation(async (_id, patch) => ({
    ...baseAgent,
    ...patch,
    model: patch.model ?? baseAgent.model,
    updated_at: 3,
  }));
  return agentRepo;
}

describe('AgentManager save lifecycle', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetProviderModelCache();
    syncDiscoveredOllamaModels([]);
    useAuthStore.setState({
      apiKeys: { google: 'test-key' },
      offlineMode: false,
      plan: 'free',
      defaultProvider: 'google',
      defaultLocalModel: '',
    });
    useAgentStore.setState({ agents: {}, runStates: {}, verbs: {}, tokens: {} });
    useAgentStore.getState().registerMany([baseAgent, secondAgent]);
    await repoMocks();
  });

  it('enables Save immediately for valid name and prompt changes, then resets after persistence', async () => {
    const agentRepo = await repoMocks();
    render(<AgentManager />);
    const save = screen.getByRole('button', { name: 'Save agent' });
    expect(save).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alpha Renamed' } });
    expect(save).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText('System prompt'), {
      target: { value: 'Updated prompt\n\nKeep formatting.' },
    });
    fireEvent.click(save);

    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledTimes(1));
    expect(agentRepo.update).toHaveBeenCalledWith(
      baseAgent.id,
      expect.objectContaining({ name: 'Alpha Renamed', system_prompt: 'Updated prompt\n\nKeep formatting.' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save agent' })).toHaveProperty('disabled', true));
  });

  it('tracks skills, tools, capabilities, model settings, toggles, and advanced fields', async () => {
    const agentRepo = await repoMocks();
    render(<AgentManager />);

    fireEvent.change(screen.getByLabelText('Skills'), { target: { value: 'summarize, planning' } });
    fireEvent.change(screen.getByLabelText('Allowed tools'), { target: { value: 'files.read, files.write' } });
    fireEvent.change(screen.getByLabelText('Capabilities'), { target: { value: 'writing, planning' } });
    fireEvent.change(screen.getByLabelText('Memory scope'), { target: { value: 'workspace' } });
    fireEvent.change(screen.getByLabelText('Reasoning effort'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Persona'), { target: { value: 'athena' } });
    fireEvent.change(screen.getByLabelText('Max output tokens'), { target: { value: '4096' } });
    fireEvent.change(screen.getByLabelText('Appearance hue'), { target: { value: '210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save agent' }));

    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledTimes(1));
    expect(agentRepo.update).toHaveBeenCalledWith(baseAgent.id, expect.objectContaining({
      skills: ['planning', 'summarize'],
      tools_allowed: ['files.read', 'files.write'],
      capabilities: ['planning', 'writing'],
      memory_scope: 'workspace',
      effort: 'high',
      persona: 'athena',
      max_output_tokens: 4096,
      color_hue: 210,
    }));
  });

  it('prevents duplicate saves while persistence is in flight', async () => {
    const agentRepo = await repoMocks();
    let resolveUpdate!: (agent: Agent) => void;
    vi.mocked(agentRepo.update).mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    render(<AgentManager />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'One Save' } });
    const save = screen.getByRole('button', { name: 'Save agent' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Save agent' }).textContent).toContain('Saving...');

    resolveUpdate({ ...baseAgent, name: 'One Save', updated_at: 4 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save agent' }).textContent).toContain('Saved'));
  });

  it('preserves edits after failure and retries through the same Save action', async () => {
    const agentRepo = await repoMocks();
    vi.mocked(agentRepo.update)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce({ ...baseAgent, name: 'Retry Me', updated_at: 5 });
    render(<AgentManager />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Retry Me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save agent' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Your edits are still here');
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Retry Me');
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledTimes(2));
  });

  it('saves a dirty Agent with Ctrl+S', async () => {
    const agentRepo = await repoMocks();
    render(<AgentManager />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Keyboard save' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledTimes(1));
  });

  it('warns before switching and supports explicit revert', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AgentManager />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: /Beta Agent/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Unsaved name');

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Alpha Agent');
    expect(screen.getByRole('button', { name: 'Save agent' })).toHaveProperty('disabled', true);
  });
});
