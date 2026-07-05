import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  JARVIS_CREATOR_APPLY_AGENT_EVENT,
  JARVIS_CREATOR_APPLY_SKILL_EVENT,
} from '@/features/jarvis-creator/contracts';
import { MessagePart } from './MessagePart';

describe('MessagePart Jarvis creator draft actions', () => {
  it('dispatches an agent draft apply event from valid Jarvis JSON', () => {
    const listener = vi.fn();
    window.addEventListener(JARVIS_CREATOR_APPLY_AGENT_EVENT, listener);
    render(
      <MessagePart
        allParts={[]}
        part={{
          kind: 'text',
          text: [
            '```json',
            JSON.stringify({
              name: 'Launch Planner',
              description: 'Plans launches.',
              system_prompt: 'You plan launches.',
              capabilities: ['planning'],
              tools_allowed: ['files'],
            }),
            '```',
          ].join('\n'),
        }}
        creatorDraftKind="agent"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Apply agent draft/i }));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: { name: 'Launch Planner' } });
    window.removeEventListener(JARVIS_CREATOR_APPLY_AGENT_EVENT, listener);
  });

  it('dispatches a skill draft apply event from valid Jarvis JSON', () => {
    const listener = vi.fn();
    window.addEventListener(JARVIS_CREATOR_APPLY_SKILL_EVENT, listener);
    render(
      <MessagePart
        allParts={[]}
        part={{
          kind: 'text',
          text: [
            '```json',
            JSON.stringify({
              title: 'Polish Writer',
              description: 'Polishes copy.',
              tools: ['files'],
              systemPromptAddendum: 'Polish copy.',
              body: '## Use',
            }),
            '```',
          ].join('\n'),
        }}
        creatorDraftKind="skill"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Apply skill draft/i }));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: { title: 'Polish Writer' } });
    window.removeEventListener(JARVIS_CREATOR_APPLY_SKILL_EVENT, listener);
  });

  it('shows a push-to-skill button for creator markdown and dispatches a fallback draft', () => {
    const listener = vi.fn();
    window.addEventListener(JARVIS_CREATOR_APPLY_SKILL_EVENT, listener);
    render(
      <MessagePart
        allParts={[]}
        part={{
          kind: 'text',
          text: [
            '**Additional aspects:**',
            '',
            '* Allow users to customize their conversation experience.',
            '* Selecting from a provided list of FAQs.',
            '* Stopping conversations when the user asks for help.',
          ].join('\n'),
        }}
        creatorDraftKind="skill"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Push to skill/i }));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        title: 'Jarvis Skill Draft',
        systemPromptAddendum: expect.stringContaining('Selecting from a provided list'),
      },
    });
    window.removeEventListener(JARVIS_CREATOR_APPLY_SKILL_EVENT, listener);
  });

  it('shows a push-to-agent button for creator markdown and dispatches a fallback draft only after click', () => {
    const listener = vi.fn();
    window.addEventListener(JARVIS_CREATOR_APPLY_AGENT_EVENT, listener);
    render(
      <MessagePart
        allParts={[]}
        part={{
          kind: 'text',
          text: [
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
          ].join('\n'),
        }}
        creatorDraftKind="agent"
      />,
    );

    expect(listener).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Push to agent/i }));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        name: 'Security Review Agent',
        description: expect.stringContaining('reviews pull requests'),
        system_prompt: expect.stringContaining('Ask before changing files'),
        capabilities: ['reasoning'],
        tools_allowed: [],
        temperature: 0.4,
      },
    });
    window.removeEventListener(JARVIS_CREATOR_APPLY_AGENT_EVENT, listener);
  });

  it('does not show creator push buttons in normal Jarvis conversations', () => {
    render(
      <MessagePart
        allParts={[]}
        part={{
          kind: 'text',
          text: [
            '## Security Review Agent',
            '',
            'This agent reviews pull requests for security risks and unsafe data handling before release.',
            '',
            '**Behavior rules:**',
            '- Read the code and cite exact files.',
            '- Ask before changing files.',
            '',
            '**Avoid:**',
            '- Do not invent vulnerabilities.',
          ].join('\n'),
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: /Push to agent/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Apply agent draft/i })).toBeNull();
  });
});
