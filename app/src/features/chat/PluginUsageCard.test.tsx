import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Part } from '@/types';
import { PluginUsageCard, resolvePluginActionEvidence } from './PluginUsageCard';

function action(
  actionId: string,
  status: Extract<Part, { kind: 'action_proposal' }>['status'] = 'success',
): Extract<Part, { kind: 'action_proposal' }> {
  return {
    kind: 'action_proposal',
    call_id: `call-${actionId}`,
    action_id: actionId,
    params: { privateValue: 'must-not-render' },
    status,
  };
}

describe('PluginUsageCard', () => {
  it('derives exact plugin identity and invocation count from canonical action registrations', () => {
    const identity = action('github.identity');
    const repository = action('github.repository.read');

    expect(resolvePluginActionEvidence(identity, [identity, repository])).toMatchObject({
      primary: false,
    });
    expect(resolvePluginActionEvidence(repository, [identity, repository])).toMatchObject({
      plugin: { id: 'github', name: 'GitHub' },
      invocationCount: 2,
      tools: [
        { name: 'identity', status: 'success' },
        { name: 'repository_context', status: 'success' },
      ],
    });
    expect(resolvePluginActionEvidence(action('nav.goto'), [identity])).toBeUndefined();
  });

  it('renders a compact truthful connected card without exposing action parameters', () => {
    const identity = action('github.identity');
    const repository = action('github.repository.read');
    render(<PluginUsageCard part={repository} allParts={[identity, repository]} />);

    expect(screen.getByText('Plugin')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByTitle('2 plugin invocations').textContent).toContain('2');
    expect(document.body.textContent).not.toContain('must-not-render');

    fireEvent.click(screen.getByRole('button', { name: 'Expand GitHub plugin activity' }));
    expect(screen.getByText('Identity')).toBeTruthy();
    expect(screen.getByText('Repository Context')).toBeTruthy();
    expect(screen.getAllByText('Connected')).toHaveLength(3);
    expect(document.body.textContent).not.toContain('must-not-render');
    fireEvent.click(screen.getByRole('button', { name: 'Hide GitHub plugin activity' }));
    expect(screen.getByRole('button', { name: 'Show GitHub plugin activity' })).toBeTruthy();
  });

  it('does not describe a failed plugin action as connected', () => {
    const failed = action('github.identity', 'error');
    render(<PluginUsageCard part={failed} allParts={[failed]} />);

    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.queryByText('Connected')).toBeNull();
  });
});
