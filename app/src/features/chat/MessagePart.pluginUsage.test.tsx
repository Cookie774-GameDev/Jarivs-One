import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Part } from '@/types';
import { MessagePart } from './MessagePart';

function pluginAction(
  status: Extract<Part, { kind: 'action_proposal' }>['status'],
): Extract<Part, { kind: 'action_proposal' }> {
  return {
    kind: 'action_proposal',
    call_id: 'github-plugin-call',
    action_id: 'github.identity',
    params: {},
    status,
  };
}

describe('MessagePart plugin activity', () => {
  it('renders an executed canonical plugin action as a plugin usage card', () => {
    const part = pluginAction('success');
    render(<MessagePart part={part} allParts={[part]} />);

    expect(screen.getByLabelText('GitHub plugin activity')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByText(/Action proposal:/i)).toBeNull();
  });

  it('preserves the approval renderer before a plugin action executes', () => {
    const part = pluginAction('pending');
    render(<MessagePart part={part} allParts={[part]} />);

    expect(screen.queryByLabelText('GitHub plugin activity')).toBeNull();
    expect(screen.getByText(/Action proposal:/i)).toBeTruthy();
  });
});

