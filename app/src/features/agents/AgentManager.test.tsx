import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const builtinAgent: Agent = {
  ...baseAgent,
  id: 'agent_builtin' as AgentId,
  slug: 'builtin-core',
  name: 'Built-in Core',
  description: 'Protected built-in Agent',
  builtin: true,
  updated_at: 3,
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

  it('inserts an explicit local resource drop into the prompt without submitting or saving', () => {
    render(<AgentManager />);
    const prompt = screen.getByLabelText('System prompt') as HTMLTextAreaElement;
    prompt.setSelectionRange(prompt.value.length, prompt.value.length);

    fireEvent.drop(prompt, {
      dataTransfer: {
        types: ['application/x-jarvis-file'],
        files: [],
        getData: (type: string) => type === 'application/x-jarvis-file'
          ? 'C:\\repo\\src\\safe-file.ts'
          : '',
      },
    });

    expect(prompt.value).toBe(`${baseAgent.system_prompt}C:\\repo\\src\\safe-file.ts`);
    expect(screen.getByRole('button', { name: 'Save agent' })).toHaveProperty('disabled', false);
  });

  it('persists every editable field and reopens the saved values after remount', async () => {
    const agentRepo = await repoMocks();
    let persisted = baseAgent;
    vi.mocked(agentRepo.getById).mockImplementation(async () => persisted);
    vi.mocked(agentRepo.update).mockImplementation(async (_id, patch) => {
      persisted = {
        ...persisted,
        ...patch,
        model: patch.model ?? persisted.model,
        updated_at: 7,
      };
      return persisted;
    });
    const view = render(<AgentManager />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alpha Reopened' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Durable description' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gemini-2.0-flash' } });
    fireEvent.change(screen.getByLabelText(/Temperature/), { target: { value: '1.15' } });
    fireEvent.change(screen.getByLabelText('System prompt'), {
      target: { value: 'Durable prompt\n\nPreserve spacing.' },
    });
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
      name: 'Alpha Reopened',
      description: 'Durable description',
      system_prompt: 'Durable prompt\n\nPreserve spacing.',
      model: expect.objectContaining({ provider: 'google', model: 'gemini-2.0-flash' }),
      temperature: 1.15,
      skills: ['planning', 'summarize'],
      tools_allowed: ['files.read', 'files.write'],
      capabilities: ['planning', 'writing'],
      memory_scope: 'workspace',
      effort: 'high',
      persona: 'athena',
      max_output_tokens: 4096,
      color_hue: 210,
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save agent' }).textContent).toContain('Saved'));

    view.unmount();
    render(<AgentManager />);
    expect(await screen.findByLabelText('Name')).toHaveProperty('value', 'Alpha Reopened');
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Durable description');
    expect(screen.getByLabelText('Model')).toHaveProperty('value', 'gemini-2.0-flash');
    expect(screen.getByLabelText(/Temperature/)).toHaveProperty('value', '1.15');
    expect(screen.getByLabelText('System prompt')).toHaveProperty('value', 'Durable prompt\n\nPreserve spacing.');
    expect(screen.getByLabelText('Skills')).toHaveProperty('value', 'planning, summarize');
    expect(screen.getByLabelText('Allowed tools')).toHaveProperty('value', 'files.read, files.write');
    expect(screen.getByLabelText('Capabilities')).toHaveProperty('value', 'planning, writing');
    expect(screen.getByLabelText('Memory scope')).toHaveProperty('value', 'workspace');
    expect(screen.getByLabelText('Reasoning effort')).toHaveProperty('value', 'high');
    expect(screen.getByLabelText('Persona')).toHaveProperty('value', 'athena');
    expect(screen.getByLabelText('Max output tokens')).toHaveProperty('value', '4096');
    expect(screen.getByLabelText('Appearance hue')).toHaveProperty('value', '210');
  });

  it('keeps a successful local save when the repository reports a non-fatal sync warning', async () => {
    const agentRepo = await repoMocks();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(agentRepo.update).mockImplementation(async (_id, patch) => {
      console.warn('[sync] simulated offline queue failure');
      return {
        ...baseAgent,
        ...patch,
        model: patch.model ?? baseAgent.model,
        updated_at: 8,
      };
    });
    render(<AgentManager />);

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'default' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save agent' }));

    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledTimes(1));
    expect(warn).toHaveBeenCalledWith('[sync] simulated offline queue failure');
    expect(agentRepo.update).toHaveBeenCalledWith(baseAgent.id, expect.objectContaining({
      model: expect.objectContaining({ provider: 'mock', model: 'default-provider' }),
    }));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save agent' }).textContent).toContain('Saved'));
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

  it('rejects an invalid dirty draft without calling the repository', async () => {
    const agentRepo = await repoMocks();
    render(<AgentManager />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save agent' })).toHaveProperty('disabled', true);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    expect((await screen.findByRole('alert')).textContent).toContain('Agent name is required');
    expect(agentRepo.update).not.toHaveBeenCalled();
    expect(agentRepo.create).not.toHaveBeenCalled();
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

  it('does not replace a newly selected built-in draft when an earlier save finishes', async () => {
    const agentRepo = await repoMocks();
    useAgentStore.setState({ agents: {}, runStates: {}, verbs: {}, tokens: {} });
    useAgentStore.getState().registerMany([baseAgent, builtinAgent]);
    vi.mocked(agentRepo.getById).mockImplementation(async (id) =>
      id === builtinAgent.id ? builtinAgent : baseAgent,
    );
    let resolveUpdate!: (agent: Agent) => void;
    vi.mocked(agentRepo.update).mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AgentManager />);

    expect(await screen.findByLabelText('Name')).toHaveProperty('value', 'Built-in Core');
    fireEvent.click(screen.getByRole('button', { name: /Alpha Agent/i }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Alpha Agent'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alpha Saved Later' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save agent' }));
    await waitFor(() => expect(agentRepo.update).toHaveBeenCalledWith(
      baseAgent.id,
      expect.objectContaining({ name: 'Alpha Saved Later' }),
    ));

    fireEvent.click(screen.getByRole('button', { name: /Built-in Core/i }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Built-in Core'));
    await act(async () => {
      resolveUpdate({ ...baseAgent, name: 'Alpha Saved Later', updated_at: 9 });
    });

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Built-in Core'));
    expect(agentRepo.update).toHaveBeenCalledTimes(1);
    expect(agentRepo.update).not.toHaveBeenCalledWith(
      builtinAgent.id,
      expect.anything(),
    );
  });
});
