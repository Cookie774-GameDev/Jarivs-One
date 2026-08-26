import type { Part } from '@/types';

export type OpenCodeChecklistTool = 'todo' | 'todowrite';
export type OpenCodeChecklistStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface OpenCodeChecklistTodo {
  id: string;
  content: string;
  status: OpenCodeChecklistStatus;
}

export interface OpenCodeChecklistSnapshot {
  tool: OpenCodeChecklistTool;
  callId: string;
  todos: readonly OpenCodeChecklistTodo[];
  truncated?: true;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, maximum) : '';
}

function checklistStatus(value: unknown): OpenCodeChecklistStatus {
  const normalized = boundedText(value, 32)
    .toLocaleLowerCase('en-US')
    .replace(/[\s-]+/gu, '_');
  if (normalized === 'in_progress' || normalized === 'active' || normalized === 'running') {
    return 'in_progress';
  }
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done') {
    return 'completed';
  }
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  return 'pending';
}

export function sanitizeOpenCodeChecklistSnapshot(
  tool: unknown,
  callId: unknown,
  input: unknown,
): OpenCodeChecklistSnapshot | null {
  const normalizedTool = boundedText(tool, 32).toLocaleLowerCase('en-US');
  if (normalizedTool !== 'todo' && normalizedTool !== 'todowrite') return null;
  const exactCallId = boundedText(callId, 256);
  if (!exactCallId) return null;
  const source = record(input);
  const candidates = Array.isArray(source?.todos)
    ? source.todos
    : Array.isArray(source?.tasks)
      ? source.tasks
      : [];
  const todos = candidates.slice(0, 100).flatMap((candidate, index) => {
    const item = record(candidate);
    const content = boundedText(item?.content ?? item?.title ?? item?.label, 500);
    if (!content) return [];
    const id = boundedText(item?.id, 128) || `item-${index + 1}`;
    return [
      Object.freeze({
        id,
        content,
        status: checklistStatus(item?.status ?? item?.state),
      }),
    ];
  });
  return Object.freeze({
    tool: normalizedTool,
    callId: exactCallId,
    todos: Object.freeze(todos),
    ...(candidates.length > 100 ? { truncated: true as const } : {}),
  });
}

export function openCodeChecklistParts(snapshots: readonly OpenCodeChecklistSnapshot[]): Part[] {
  return snapshots.map((snapshot) => ({
    kind: 'tool_call' as const,
    tool: snapshot.tool,
    call_id: snapshot.callId,
    args: { todos: snapshot.todos.map((todo) => ({ ...todo })) },
  }));
}
