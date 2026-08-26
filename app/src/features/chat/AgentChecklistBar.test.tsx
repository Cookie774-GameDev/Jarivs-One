import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';
import {
  AgentChecklistBar,
  deriveAgentChecklist,
  deriveOpenCodeChecklist,
  deriveOpenCodeChecklistEvidence,
  readBoundedAgentChecklistEvidence,
} from './AgentChecklistBar';
import type { Message } from '@/types';

vi.mock('@/components/progress/WarmHexProgress', () => ({
  WarmHexProgress: ({
    progress,
    label,
    detail,
  }: {
    progress: number;
    label: string;
    detail?: string;
  }) => (
    <div role="progressbar" aria-label={label} aria-valuenow={progress}>
      {detail}
    </div>
  ),
}));

const run = {
  id: 'run-1',
  hiveStackPlan: {
    steps: [
      { stepId: 'step-1', label: 'Inspect files' },
      { stepId: 'step-2', label: 'Run tests' },
    ],
  },
} as unknown as JarvisRun;

const events = [
  {
    runId: 'run-1',
    canonicalResultEvidence: { stepId: 'step-1', state: 'completed' },
  },
  {
    runId: 'run-1',
    producerSourceEvidence: {
      producerKind: 'hive',
      producerIdentity: { stepId: 'step-2' },
      phase: 'start',
      state: 'started',
    },
  },
] as JarvisEvent[];

describe('AgentChecklistBar', () => {
  it('derives exact step state only from the current run journal evidence', () => {
    expect(deriveAgentChecklist(run, events)).toEqual([
      { id: 'step-1', label: 'Inspect files', status: 'completed' },
      { id: 'step-2', label: 'Run tests', status: 'running' },
    ]);
    expect(
      deriveAgentChecklist(run, [{ ...events[0], runId: 'different-run' }] as JarvisEvent[]),
    ).toEqual([
      { id: 'step-1', label: 'Inspect files', status: 'pending' },
      { id: 'step-2', label: 'Run tests', status: 'pending' },
    ]);
  });

  it('shows an exact denominator and expands the real plan labels', () => {
    render(<AgentChecklistBar run={run} events={events} />);
    expect(
      screen.getByRole('progressbar', { name: 'Agent checklist' }).getAttribute('aria-valuenow'),
    ).toBe('50');
    expect(screen.queryByText('Inspect files')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand agent checklist' }));
    expect(screen.getByText('Inspect files')).toBeTruthy();
    expect(screen.getByText('Run tests')).toBeTruthy();
  });

  it('does not call degraded work complete and hides percentages for incomplete history', () => {
    const degraded = [
      {
        runId: 'run-1',
        canonicalResultEvidence: { stepId: 'step-1', state: 'degraded' },
      },
    ] as JarvisEvent[];
    render(<AgentChecklistBar run={run} events={degraded} coverageComplete={false} />);
    expect(
      screen.getByRole('progressbar', { name: 'Agent checklist' }).hasAttribute('aria-valuenow'),
    ).toBe(false);
  });

  it('labels a bounded history window as truncated rather than still reconciling', () => {
    render(
      <AgentChecklistBar run={run} events={events} coverageComplete={false} coverageTruncated />,
    );
    expect(screen.getByText(/history exceeds the bounded evidence window/i)).toBeTruthy();
    expect(screen.queryByText(/still reconciling/i)).toBeNull();
  });

  it('stays absent when no authoritative checklist exists', () => {
    const { container } = render(
      <AgentChecklistBar run={{ ...run, hiveStackPlan: undefined }} events={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('projects the latest bounded OpenCode todo milestone snapshot with exact statuses', () => {
    const messages = [
      {
        id: 'message-1',
        chat_id: 'chat-1',
        role: 'assistant',
        created_at: 1,
        updated_at: 1,
        parts: [
          {
            kind: 'tool_call',
            tool: 'todowrite',
            call_id: 'todo-call-1',
            args: {
              todos: [
                { content: 'Design the game loop', status: 'completed' },
                { content: 'Build the first level', status: 'in_progress' },
                { content: 'Verify controller input', status: 'pending' },
              ],
            },
          },
        ],
      },
    ] as unknown as Message[];

    expect(deriveOpenCodeChecklist(messages)).toEqual([
      { id: 'todo-call-1:0', label: 'Design the game loop', status: 'completed' },
      { id: 'todo-call-1:1', label: 'Build the first level', status: 'running' },
      { id: 'todo-call-1:2', label: 'Verify controller input', status: 'pending' },
    ]);
    render(<AgentChecklistBar run={undefined} events={[]} messages={messages} />);
    expect(screen.getByText(/1 completed · 1 of 3 settled/i)).toBeTruthy();
  });

  it('keeps canonical Hive plan evidence authoritative over an OpenCode todo snapshot', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            kind: 'tool_call',
            tool: 'todo',
            call_id: 'todo-call-2',
            args: { tasks: [{ title: 'Unrelated tool task', state: 'done' }] },
          },
        ],
      },
    ] as unknown as Message[];
    expect(deriveAgentChecklist(run, events, messages).map((item) => item.label)).toEqual([
      'Inspect files',
      'Run tests',
    ]);
  });

  it('does not invent a checklist from ordinary assistant prose or malformed tool payloads', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          { kind: 'text', text: 'Milestone 1: build a game. Milestone 2: ship it.' },
          { kind: 'tool_call', tool: 'todowrite', call_id: 'bad', args: { todos: 'not-an-array' } },
        ],
      },
    ] as unknown as Message[];
    expect(deriveOpenCodeChecklist(messages)).toEqual([]);
  });

  it('marks a bounded OpenCode snapshot as truncated instead of fabricating 100 percent', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            kind: 'tool_call',
            tool: 'todowrite',
            call_id: 'large-plan',
            args: {
              todos: Array.from({ length: 101 }, (_, index) => ({
                content: `Milestone ${index + 1}`,
                status: index < 100 ? 'completed' : 'pending',
              })),
            },
          },
        ],
      },
    ] as unknown as Message[];
    expect(deriveOpenCodeChecklistEvidence(messages)).toMatchObject({
      coverageComplete: false,
      coverageTruncated: true,
    });
    render(<AgentChecklistBar run={undefined} events={[]} messages={messages} />);
    expect(
      screen.getByRole('progressbar', { name: 'Agent checklist' }).hasAttribute('aria-valuenow'),
    ).toBe(false);
    expect(screen.getByText(/history exceeds the bounded evidence window/i)).toBeTruthy();
  });

  it('lets the newest valid empty OpenCode snapshot clear an older milestone list', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            kind: 'tool_call',
            tool: 'todowrite',
            call_id: 'old-plan',
            args: { todos: [{ content: 'Old milestone', status: 'pending' }] },
          },
          {
            kind: 'tool_call',
            tool: 'todowrite',
            call_id: 'clear-plan',
            args: { todos: [] },
          },
        ],
      },
    ] as unknown as Message[];
    expect(deriveOpenCodeChecklist(messages)).toEqual([]);
    const { container } = render(
      <AgentChecklistBar run={undefined} events={[]} messages={messages} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('allows a bounded event backfill to retry after a transient repository failure', () => {
    const source = readFileSync(resolve('src/features/chat/ChatThread.tsx'), 'utf8');
    const guard = source.indexOf('backfillCompletedRunId !== run.id');
    const pageRead = source.indexOf(
      'const backfill = await readBoundedAgentChecklistEvidence(',
      guard,
    );
    const completed = source.indexOf('backfillCompletedRunId = run.id', pageRead);
    const outerCatch = source.indexOf('} catch {', completed);

    expect(guard).toBeGreaterThan(-1);
    expect(pageRead).toBeGreaterThan(guard);
    expect(completed).toBeGreaterThan(pageRead);
    expect(outerCatch).toBeGreaterThan(completed);
  });

  it('distinguishes exactly 20,000 events from evidence beyond the bounded window', async () => {
    const event = events[0]!;
    const exactLoader = vi.fn(async (afterSeq: number, limit: number) =>
      Array.from({ length: Math.min(limit, Math.max(0, 20_000 - afterSeq)) }, (_, index) => ({
        ...event,
        seq: afterSeq + index + 1,
      })),
    );
    const exact = await readBoundedAgentChecklistEvidence(exactLoader);
    expect(exact).toMatchObject({ coverageComplete: true, coverageTruncated: false });
    expect(exact.events).toHaveLength(20_000);
    expect(exactLoader).toHaveBeenLastCalledWith(20_000, 1);

    const overflowLoader = vi.fn(async (afterSeq: number, limit: number) =>
      Array.from({ length: Math.min(limit, Math.max(0, 20_001 - afterSeq)) }, (_, index) => ({
        ...event,
        seq: afterSeq + index + 1,
      })),
    );
    const overflow = await readBoundedAgentChecklistEvidence(overflowLoader);
    expect(overflow).toMatchObject({ coverageComplete: false, coverageTruncated: true });
    expect(overflow.events).toHaveLength(20_000);
  });
});
