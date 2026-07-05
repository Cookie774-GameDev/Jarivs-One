import { describe, expect, it } from 'vitest';
import type { Agent } from '@/types';
import type { AgentId } from '@/types/common';
import {
  buildConfirmedAgentMention,
  buildSlashReferenceCommand,
  extractAbsoluteFilePaths,
  resolveMentionedAgentIdsForSend,
} from './Composer';
import { findSlashCommandDef } from './SlashCommandTypeahead';

function agent(id: string, slug: string): Agent {
  return {
    id: id as AgentId,
    slug,
    name: slug,
    description: `${slug} description`,
    system_prompt: `${slug} prompt`,
    model: { provider: 'mock', model: 'mock-default' },
    tools_allowed: [],
    memory_scope: 'workspace',
    capabilities: [],
    created_at: 1,
    updated_at: 1,
  };
}

describe('composer file path detection', () => {
  it('extracts a Windows path with spaces from a natural-language request', () => {
    expect(
      extractAbsoluteFilePaths(
        'C:\\Users\\dev\\Documents\\project\\Scripts\\Editor\\context_map.json please summarize this',
      ),
    ).toEqual([
      'C:\\Users\\dev\\Documents\\project\\Scripts\\Editor\\context_map.json',
    ]);
  });

  it('deduplicates repeated file paths', () => {
    const path = 'C:\\project\\AnimalOutputGenerator.cs';
    expect(extractAbsoluteFilePaths(`${path} summarize ${path}`)).toEqual([path]);
  });
});

describe('composer mention and slash confirmation helpers', () => {
  it('resolves selected mention tokens together with typed @agent mentions', () => {
    const builder = agent('agent_builder', 'builder');
    const reviewer = agent('agent_reviewer', 'reviewer');

    expect(
      resolveMentionedAgentIdsForSend(
        '@builder summarize this',
        { [builder.id]: builder, [reviewer.id]: reviewer },
        [buildConfirmedAgentMention(reviewer)],
      ),
    ).toEqual([reviewer.id, builder.id]);
  });

  it('turns page slash commands into chat reference tokens instead of navigation intents', () => {
    const agents = findSlashCommandDef('agents');
    const terminals = findSlashCommandDef('terminals');
    const hive = findSlashCommandDef('hive');

    expect(agents && buildSlashReferenceCommand(agents)).toMatchObject({
      cmd: 'agents',
      label: '/agents: Agents page/editor',
      value: 'reference:agents',
    });
    expect(terminals && buildSlashReferenceCommand(terminals)).toMatchObject({
      cmd: 'terminals',
      label: '/terminals: Terminal surface',
      value: 'reference:terminals',
    });
    expect(hive && buildSlashReferenceCommand(hive)).toMatchObject({
      cmd: 'hive',
      label: '/hive: Hive Balanced',
      value: 'reference:hive',
    });
  });
});
