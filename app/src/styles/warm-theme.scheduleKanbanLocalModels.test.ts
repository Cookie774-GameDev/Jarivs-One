import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('warm schedule, Kanban, and Local Models surfaces', () => {
  it('marks all requested surfaces and avoids an opaque white surface contract', async () => {
    const [css, kanban, schedule, localModels] = await Promise.all([
      readSource('./warm-theme.css'),
      readSource('../features/kanban/KanbanPage.tsx'),
      readSource('../features/schedule/SchedulePage.tsx'),
      readSource('../features/settings/sections/LocalModels.tsx'),
    ]);

    expect(kanban).toContain('data-warm-surface="kanban-input"');
    expect(kanban).toContain('data-warm-surface="kanban-card"');
    expect(schedule).toContain('data-warm-surface="schedule-field-group"');
    expect(localModels).toContain('data-warm-surface="local-model-catalog"');
    expect(css).toContain("[data-warm-surface='local-model-catalog']");
    expect(css).toContain("[data-warm-surface='schedule-field-group']");
    expect(css).not.toMatch(
      /\[data-warm-surface='local-model-catalog'\][^{]*\{[^}]*#fff(?:fff)?(?:\s|;|!)/i,
    );
  });
});
