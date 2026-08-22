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
  it('builds a five-question agent discovery prompt with a strict proposal return contract', () => {
    const prompt = buildJarvisCreatorPrompt('agent', {
      currentName: 'Existing Agent',
      currentDescription: 'Existing description',
    });

    expect(prompt).toContain('Create an agent with Jarvis');
    expect(prompt.match(/^\d\./gm)).toHaveLength(5);
    expect(prompt).toContain('Current agent: Existing Agent');
    expect(prompt).toContain('What do you want this agent to do?');
    expect(prompt).toContain('What inputs, tools, folders, and external services are in scope?');
    expect(prompt).toContain('What must the agent never do, and what needs approval?');
    expect(prompt).toContain('What form should the result take, and how will it be checked?');
    expect(prompt).toContain('What project or workspace scope is appropriate?');
    expect(prompt).toContain('temperature');
    expect(prompt).toContain('written responses');
    expect(prompt).toContain('return an apply-ready draft immediately');
    expect(prompt).toContain('role, mission, behavior rules, boundaries, tools, output style, quality bar, and avoid-list');
    expect(prompt).toContain('production-style');
    expect(prompt).toContain('concrete');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('proposal');
    expect(prompt).toContain('Do not create anything until the user explicitly applies the proposal');
  });

  it('builds a five-question skill discovery prompt with a strict proposal return contract', () => {
    const prompt = buildJarvisCreatorPrompt('skill', {
      currentName: 'Custom Skill',
      currentDescription: 'Existing skill description',
    });

    expect(prompt).toContain('Create a skill with Jarvis');
    expect(prompt.match(/^\d\./gm)).toHaveLength(5);
    expect(prompt).toContain('Current skill: Custom Skill');
    expect(prompt).toContain('What do you want this skill to do?');
    expect(prompt).toContain('What inputs, tools, folders, and external services are in scope?');
    expect(prompt).toContain('What must the skill never do, and what needs approval?');
    expect(prompt).toContain('What form should the result take, and how will it be checked?');
    expect(prompt).toContain('What project or workspace scope is appropriate?');
    expect(prompt).toContain('written responses');
    expect(prompt).toContain('return an apply-ready draft immediately');
    expect(prompt).toContain('role, mission, behavior rules, boundaries, tools, output style, quality bar, and avoid-list');
    expect(prompt).toContain('production-style');
    expect(prompt).toContain('concrete');
    expect(prompt).toContain('systemPromptAddendum');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('proposal');
    expect(prompt).toContain('Do not create anything until the user explicitly applies the proposal');
  });

  it('builds focused discovery question blocks before a creator can draft an artifact', () => {
    const agentBlock = buildJarvisCreatorQuestionBlock('agent');
    const skillBlock = buildJarvisCreatorQuestionBlock('skill');

    expect(agentBlock.id).toBe('jarvis_creator_agent');
    expect(skillBlock.id).toBe('jarvis_creator_skill');
    expect(agentBlock.questions).toHaveLength(5);
    expect(skillBlock.questions).toHaveLength(5);
    expect(agentBlock.questions[0]).toMatchObject({
      id: 'goal_audience',
      type: 'text',
    });
    expect(agentBlock.questions.map((question) => question.id)).toEqual([
      'goal_audience',
      'scope_inputs_tools',
      'boundaries_approvals',
      'output_verification',
      'project_memory_scope',
    ]);
    expect(agentBlock.questions.every((question) => question.required)).toBe(true);
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
        proposal: {
          purpose: 'Plan product launches.',
          triggers: ['launch planning'],
          permitted: ['files'],
          approvals: ['Ask before changing files.'],
          inputs: ['project brief'],
          outputs: ['launch plan'],
          verification: ['Check milestones are complete.'],
        },
      }),
      '```',
    ].join('\n'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.name).toBe('Launch Planner');
    expect(result.draft.capabilities).toEqual(['planning', 'writing']);
    expect(result.draft.temperature).toBe(1.15);
    expect(result.draft.proposal).toMatchObject({
      purpose: 'Plan product launches.',
      approvals: ['Ask before changing files.'],
    });
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
        proposal: {
          purpose: 'Polish copy without changing meaning.',
          triggers: ['rough copy'],
          permitted: ['files'],
          approvals: ['Do not publish automatically.'],
          inputs: ['draft copy'],
          outputs: ['polished copy'],
          verification: ['Preserve facts and links.'],
        },
      }),
      '```',
    ].join('\n'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.title).toBe('Polish Writer');
    expect(result.draft.systemPromptAddendum).toContain('production polish');
    expect(result.draft.proposal?.verification).toEqual(['Preserve facts and links.']);
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
    expect(draft.draft.title).toBeTruthy();
    expect(draft.draft.description).toBeTruthy();
    expect(draft.draft.systemPromptAddendum).toContain('Selecting from a provided list');
    expect(draft.draft.body).toContain(draft.draft.title);
  });

  it('extracts skill name, description, runtime instructions, and body from labeled markdown', () => {
    const markdown = [
      'To create a conversational AI that politely reminds your team members not to duplicate checks on tasks or projects, I propose implementing the following features:',
      '',
      '**Skill Name:** "Smart Check Reminder"',
      '',
      '**Behavior:**',
      '1. **Introduction**: When prompted with a task or project, ask the user if they\'ve completed it before.',
      '2. **Reminder Message**: If no answer is provided, deliver a gentle reminder message.',
      'Example: "Hi [Name], I noticed you mentioned this task/project earlier. Have you already completed the check?"',
    ].join('\n');

    const draft = parseLooseJarvisCreatorSkillDraft(markdown);
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.draft.title).toBe('Smart Check Reminder');
    expect(draft.draft.description.toLowerCase()).not.toContain('skill name');
    expect(draft.draft.systemPromptAddendum).toContain('Introduction');
    expect(draft.draft.systemPromptAddendum).toContain('Reminder Message');
    expect(draft.draft.systemPromptAddendum).not.toMatch(/^To create a conversational AI/i);
    expect(draft.draft.body).toContain('# Smart Check Reminder');
    expect(draft.draft.body).toContain('## Instructions');
  });

  it('accepts skill JSON with alias keys (name / runtime_instructions / library body)', () => {
    const result = parseJarvisCreatorDraft('skill', [
      '```json',
      JSON.stringify({
        name: 'Smart Check Reminder',
        summary: 'Politely remind teammates not to re-check work.',
        tools: 'files, web',
        runtime_instructions: 'Ask if the check was already done before reminding.',
        library_body: '## Use\n\nUse when teammates re-open closed checks.',
        emoji: '🔔',
      }),
      '```',
    ].join('\n'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.title).toBe('Smart Check Reminder');
    expect(result.draft.description).toContain('Politely remind');
    expect(result.draft.tools).toEqual(['files', 'web']);
    expect(result.draft.systemPromptAddendum).toContain('already done');
    expect(result.draft.body).toContain('re-open closed checks');
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
