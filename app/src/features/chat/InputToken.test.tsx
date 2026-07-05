import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InputToken } from './InputToken';

describe('InputToken visual variants', () => {
  it('renders confirmed command tokens with a warm animated treatment', () => {
    render(<InputToken type="command" label="/agents: Agents page/editor" />);

    const token = screen.getByText('/agents: Agents page/editor').closest('div');
    expect(token?.className).toContain('jarvis-confirmed-token');
    expect(token?.className).toContain('from-amber');
  });

  it('renders selected agent mentions as distinct colored tokens', () => {
    render(<InputToken type="agent" label="@builder" />);

    const token = screen.getByText('@builder').closest('div');
    expect(token?.className).toContain('jarvis-agent-token');
    expect(token?.className).toContain('from-cyan');
  });
});
