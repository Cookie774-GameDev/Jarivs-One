import { describe, expect, it } from 'vitest';
import { openCodeChecklistParts, sanitizeOpenCodeChecklistSnapshot } from './openCodeChecklist';

describe('bounded OpenCode checklist transport', () => {
  it('keeps only bounded milestone identity, labels, and statuses', () => {
    const snapshot = sanitizeOpenCodeChecklistSnapshot('todowrite', 'call-1', {
      todos: [
        {
          id: 'milestone-1',
          content: '  Design   the maze  ',
          status: 'in progress',
          secret: 'must-not-survive',
          path: 'C:/private',
        },
      ],
      prompt: 'must-not-survive',
    });
    expect(snapshot).toEqual({
      tool: 'todowrite',
      callId: 'call-1',
      todos: [{ id: 'milestone-1', content: 'Design the maze', status: 'in_progress' }],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/secret|private|prompt/iu);
  });

  it('rejects every non-checklist tool and truncates oversized lists truthfully', () => {
    expect(sanitizeOpenCodeChecklistSnapshot('read', 'call-1', { path: 'C:/private' })).toBeNull();
    const snapshot = sanitizeOpenCodeChecklistSnapshot('todo', 'call-2', {
      tasks: Array.from({ length: 101 }, (_, index) => ({
        title: `Milestone ${index + 1}`,
        state: 'pending',
      })),
    });
    expect(snapshot?.todos).toHaveLength(100);
    expect(snapshot?.truncated).toBe(true);
  });

  it('converts only OpenCode snapshots into persisted tool-call parts', () => {
    expect(
      openCodeChecklistParts([
        {
          tool: 'todo',
          callId: 'call-3',
          todos: [{ id: 'one', content: 'Ship the maze', status: 'pending' }],
        },
      ]),
    ).toEqual([
      {
        kind: 'tool_call',
        tool: 'todo',
        call_id: 'call-3',
        args: { todos: [{ id: 'one', content: 'Ship the maze', status: 'pending' }] },
      },
    ]);
    expect(openCodeChecklistParts([])).toEqual([]);
  });
});
