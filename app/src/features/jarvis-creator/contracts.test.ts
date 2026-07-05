import { describe, expect, it } from 'vitest';
import {
  buildJarvisCreatorQuestionBlock,
  buildJarvisCreatorPrompt,
  parseLooseJarvisCreatorAgentDraft,
  parseLooseJarvisCreatorSkillDraft,
  parseJarvisCreatorDraft,
  JARVIS_CREATOR_START_EVENT,
  JARVIS_CREATOR_APPLY_AGENT_EVENT,
  JARVIS_CREATOR_APPLY_SKILL_EVENT,
} from './contracts';

describe('jarvis creator contracts', () => {
  it('builds a two-question agent prompt with a strict JSON return contract', () => {
    const prompt = buildJarvisCreatorPrompt('agent', {
      currentName: 'Existing Agent',
      currentDescription: 'Existing description',
    });

    expect(prompt).toContain('Create an agent with Jarvis');
    expect(prompt.match(/^\d\./gm)).toHaveLength(2);
    expect(prompt).toContain('Current agent: Existing Agent');
    expect(prompt).toContain('What do you want this agent to do?');
    expect(prompt).toContain('How should it behave in detail');
    expect(prompt).toContain('temperature');
    expect(prompt).toContain('written responses');
    expect(prompt).toContain('return an apply-ready draft immediately');
    expect(prompt).toContain('role, mission, behavior rules, boundaries, tools, output style, quality bar, and avoid-list');
    expect(prompt).toContain('production-style');
    expect(prompt).toContain('concrete');
    expect(prompt).not.toContain('```json');
  });

  it('builds a two-question skill prompt with a strict JSON return contract', () => {
    const prompt = buildJarvisCreatorPrompt('skill', {
      currentName: 'Custom Skill',
      currentDescription: 'Existing skill description',
    });

    expect(prompt).toContain('Create a skill with Jarvis');
    expect(prompt.match(/^\d\./gm)).toHaveLength(2);
    expect(prompt).toContain('Current skill: Custom Skill');
    expect(prompt).toContain('What do you want this skill to do?');
    expect(prompt).toContain('How should it behave in detail');
    expect(prompt).toContain('written responses');
    expect(prompt).toContain('return an apply-ready draft immediately');
    expect(prompt).toContain('role, mission, behavior rules, boundaries, tools, output style, quality bar, and avoid-list');
    expect(prompt).toContain('production-style');
    expect(prompt).toContain('concrete');
    expect(prompt).not.toContain('```json');
  });

  it('builds Cursor-style written-response creator question blocks', () => {
    const agentBlock = buildJarvisCreatorQuestionBlock('agent');
    const skillBlock = buildJarvisCreatorQuestionBlock('skill');

    expect(agentBlock.id).toBe('jarvis_creator_agent');
    expect(skillBlock.id).toBe('jarvis_creator_skill');
    expect(agentBlock.questions).toHaveLength(2);
    expect(skillBlock.questions).toHaveLength(2);
    expect(agentBlock.questions[0]).toMatchObject({
      id: 'goal',
      type: 'text',
    });
    expect(agentBlock.questions[1]).toMatchObject({ id: 'rules_boundaries', type: 'text' });
    expect(skillBlock.questions.every((question) => question.type === 'text')).toBe(true);
  });

  it('parses a valid agent draft from a Jarvis JSON block', () => {
    const result = parseJarvisCreatorDraft('agent', [
      '```json',
      JSON.stringify({
        name: 'Launch Planner',
        description: 'Plans product launches in sharp phases.',
        system_prompt: 'You are a launch planning specialist.',
        capabilities: ['planning', 'writing'],
        tools_allowed: ['files'],
        temperature: 1.15,
      }),
      '```',
    ].join('\n'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.name).toBe('Launch Planner');
    expect(result.draft.capabilities).toEqual(['planning', 'writing']);
    expect(result.draft.temperature).toBe(1.15);
  });

  it('parses a valid skill draft from a Jarvis JSON block', () => {
    const result = parseJarvisCreatorDraft('skill', [
      '```json',
      JSON.stringify({
        title: 'Polish Writer',
        description: 'Makes copy crisp without changing meaning.',
        tools: ['files'],
        systemPromptAddendum: 'Rewrite with concise production polish.',
        body: '## Use\n\nUse this when copy feels rough.',
        emoji: '✦',
      }),
      '```',
    ].join('\n'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.title).toBe('Polish Writer');
    expect(result.draft.systemPromptAddendum).toContain('production polish');
  });

  it('converts creator-style markdown into a skill draft fallback', () => {
    const draft = parseLooseJarvisCreatorSkillDraft([
      '**Additional aspects:**',
      '',
      '* Allow users to customize their conversation experience.',
      '* Selecting from a provided list of FAQs.',
      '* Stopping conversations when the user asks for help.',
    ].join('\n'));

    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.draft.title).toBe('Jarvis Skill Draft');
    expect(draft.draft.description).toContain('Allow users to customize');
    expect(draft.draft.systemPromptAddendum).toContain('Selecting from a provided list');
    expect(draft.draft.body).toContain('Additional aspects');
  });

  it('converts creator-style markdown into a conservative agent draft fallback', () => {
    const draft = parseLooseJarvisCreatorAgentDraft([
      '## Security Review Agent',
      '',
      'This agent reviews pull requests for security risks and unsafe data handling before release.',
      '',
      '**Behavior rules:**',
      '- Read the code and cite exact files.',
      '- Use tools only when the user asks for verification.',
      '- Ask before changing files or running risky commands.',
      '',
      '**Avoid:**',
      '- Do not invent vulnerabilities.',
      '- Do not request secrets.',
    ].join('\n'));

    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.draft).toMatchObject({
      name: 'Security Review Agent',
      description: expect.stringContaining('reviews pull requests'),
      capabilities: ['reasoning'],
      tools_allowed: [],
      temperature: 0.4,
    });
    expect(draft.draft.system_prompt).toContain('Security Review Agent');
    expect(draft.draft.system_prompt).toContain('Ask before changing files');
  });

  it('returns a typed error for malformed Jarvis output', () => {
    const result = parseJarvisCreatorDraft('agent', 'not json');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toMatch(/JSON/i);
  });

  it('exports stable browser event names', () => {
    expect(JARVIS_CREATOR_START_EVENT).toBe('jarvis:creator:start');
    expect(JARVIS_CREATOR_APPLY_AGENT_EVENT).toBe('jarvis:creator:apply-agent');
    expect(JARVIS_CREATOR_APPLY_SKILL_EVENT).toBe('jarvis:creator:apply-skill');
  });
});
