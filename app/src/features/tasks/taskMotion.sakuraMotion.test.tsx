import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftTask, Task } from '@/types/task';
import { DraftTaskList } from './DraftTaskList';
import { TaskCard } from './TaskCard';
import { useTaskStore } from './store';

const motionProbe = vi.hoisted(() => ({
  layoutInputs: [] as unknown[],
  layoutResult: false as boolean,
  legacyTransitions: [] as unknown[],
  themedTransition: { duration: 0.123, ease: 'linear' } as const,
}));

vi.mock('@/features/appearance/themeMotion', () => ({
  useThemeMotionLayout: (legacyLayout: unknown) => {
    motionProbe.layoutInputs.push(legacyLayout);
    return motionProbe.layoutResult;
  },
  useThemeMotionTransition: (legacyTransition: unknown) => {
    motionProbe.legacyTransitions.push(legacyTransition);
    return motionProbe.themedTransition;
  },
}));

vi.mock('motion/react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const motionElement = (tag: 'div' | 'span') =>
    ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
      (
        { animate: _animate, children, exit, initial: _initial, layout, transition, ...props },
        ref,
      ) =>
        ReactModule.createElement(
          tag,
          {
            ...props,
            ref,
            'data-motion-exit': JSON.stringify(exit),
            'data-motion-layout': String(layout),
            'data-motion-transition': JSON.stringify(transition),
          },
          children as React.ReactNode,
        ),
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: motionElement('div'),
      span: motionElement('span'),
    },
  };
});

const task = {
  id: 'task-1',
  workspace_id: 'workspace-1',
  title: 'Review motion policy',
  status: 'open',
  priority: 'normal',
  effort: 3,
  context_tags: [],
  energy_required: 'medium',
  reminders: [],
  created_by: 'user_text',
  source_refs: [],
  created_at: 1,
  updated_at: 1,
} as unknown as Task;

const draft = {
  id: 'draft-1',
  task: { title: 'Accept calm motion' },
  confidence: 0.9,
  trigger_phrase: 'accept calm motion',
  source_ref: { kind: 'chat_message', id: 'message-1' },
  created_at: 1,
} as unknown as DraftTask;

const themedTransitionText = JSON.stringify(motionProbe.themedTransition);

describe('Task Sakura Motion consumers', () => {
  beforeEach(() => {
    motionProbe.layoutInputs.length = 0;
    motionProbe.layoutResult = false;
    motionProbe.legacyTransitions.length = 0;
    act(() => useTaskStore.setState(useTaskStore.getInitialState(), true));
  });

  afterEach(() => {
    act(() => useTaskStore.setState(useTaskStore.getInitialState(), true));
  });

  it('routes TaskCard through the shared policy while preserving its task label', () => {
    const rendered = render(<TaskCard task={task} />);

    expect(screen.getByRole('button', { name: 'Review motion policy' })).toBeTruthy();
    expect(motionProbe.legacyTransitions).toEqual([
      { type: 'spring', stiffness: 420, damping: 32 },
    ]);
    expect(motionProbe.layoutInputs).toEqual([true]);
    const card = rendered.container.querySelector('[data-motion-layout="false"]');
    expect(card).toBeTruthy();
    expect(card?.getAttribute('data-motion-exit')).toBe(JSON.stringify({ opacity: 0 }));
    expect(
      rendered.container.querySelector(`[data-motion-transition='${themedTransitionText}']`),
    ).toBeTruthy();
  });

  it('routes DraftTaskList through the shared policy while preserving its actions', () => {
    act(() => useTaskStore.setState({ drafts: [draft] }));
    const rendered = render(<DraftTaskList />);

    expect(screen.getByText('Accept calm motion')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept suggestion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject suggestion' })).toBeTruthy();
    expect(motionProbe.legacyTransitions).toEqual([
      { type: 'spring', stiffness: 420, damping: 32 },
    ]);
    expect(motionProbe.layoutInputs).toEqual([true]);
    const draftCard = rendered.container.querySelector('[data-motion-layout="false"]');
    expect(draftCard).toBeTruthy();
    expect(draftCard?.getAttribute('data-motion-exit')).toBe(JSON.stringify({ opacity: 0 }));
    expect(
      rendered.container.querySelector(`[data-motion-transition='${themedTransitionText}']`),
    ).toBeTruthy();
  });

  it('preserves the exact height exit for prior themes when layout remains enabled', () => {
    motionProbe.layoutResult = true;
    const taskCard = render(<TaskCard task={task} />);
    expect(
      taskCard.container
        .querySelector('[data-motion-layout="true"]')
        ?.getAttribute('data-motion-exit'),
    ).toBe(JSON.stringify({ opacity: 0, height: 0 }));
    taskCard.unmount();

    act(() => useTaskStore.setState({ drafts: [draft] }));
    const draftList = render(<DraftTaskList />);
    expect(
      draftList.container
        .querySelector('[data-motion-layout="true"]')
        ?.getAttribute('data-motion-exit'),
    ).toBe(JSON.stringify({ opacity: 0, height: 0 }));
  });
});
