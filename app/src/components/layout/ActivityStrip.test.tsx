import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from '@/stores/agents';
import { CouncilActivityStrip } from './ActivityStrip';

describe('CouncilActivityStrip', () => {
  beforeEach(() => {
    act(() => {
      useAgentStore.setState({ agents: {}, runStates: {}, tokens: {}, verbs: {} });
    });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useAgentStore.setState(useAgentStore.getInitialState(), true);
    });
  });

  it('keeps the empty-state text readable without changing ordinary-theme color', () => {
    render(<CouncilActivityStrip />);

    const waiting = screen.getByText('Waiting for council to start…');
    expect(waiting.className).toContain('text-muted-foreground/70');
    expect(waiting.className).toContain('[html[data-theme=monochrome]_&]:text-muted-foreground');
  });
});
