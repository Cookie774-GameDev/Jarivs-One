import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const featureRoot = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(featureRoot, path), 'utf8');

const routeContracts = [
  ['kanban/KanbanPage.tsx', 'kanban/sakura-kanban.css', 'kanban'],
  ['schedule/SchedulePage.tsx', 'schedule/sakura-schedule.css', 'schedule'],
  ['projects/ProjectDetail.tsx', 'projects/sakura-projects.css', 'project-detail'],
  ['preview/PreviewStudio.tsx', 'preview/sakura-preview.css', 'preview'],
  ['benchmarks/BenchmarksPage.tsx', 'benchmarks/sakura-benchmarks.css', 'benchmarks'],
  ['ambient/AmbientHome.tsx', 'ambient/sakura-ambient.css', 'ambient'],
] as const;

describe('remaining route Sakura appearance', () => {
  it.each(routeContracts)(
    '%s declares an isolated Sakura route contract',
    (sourcePath, cssPath, route) => {
      const source = read(sourcePath);
      const css = read(cssPath);

      expect(source).toContain(`data-sakura-route="${route}"`);
      expect(source).toContain(`./${cssPath.split('/').at(-1)}'`);
      expect(css).toContain(`html[data-theme='sakura'] [data-sakura-route='${route}']`);
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('@media (forced-colors: active)');
      expect(css).not.toMatch(/!important|url\s*\(/);
    },
  );

  it('themes app-owned Kanban chrome and exposes completion state without changing item logic', () => {
    const source = read('kanban/KanbanPage.tsx');
    const css = read('kanban/sakura-kanban.css');

    expect(source).toContain('data-sakura-surface="kanban-column"');
    expect(source).toContain("data-sakura-state={done ? 'complete' : 'open'}");
    expect(css).toContain("[data-sakura-surface='kanban-card']");
    expect(css).toContain("[data-sakura-state='complete']");
  });

  it('themes schedule chrome with complete, attention, and error semantics', () => {
    const source = read('schedule/SchedulePage.tsx');
    const css = read('schedule/sakura-schedule.css');

    expect(source).toContain('data-sakura-surface="schedule-calendar"');
    expect(source).toContain('data-sakura-surface="schedule-timeline"');
    expect(source).toContain('data-sakura-surface="schedule-editor"');
    expect(css).toContain("[data-sakura-state='complete']");
    expect(css).toContain("[data-sakura-state='attention']");
    expect(css).toContain("[data-sakura-state='error']");
  });

  it('covers task composer, cards, drafts, and snooze chrome with semantic states', () => {
    const files = ['TaskComposer.tsx', 'TaskCard.tsx', 'DraftTaskList.tsx', 'SnoozePopover.tsx'];
    for (const file of files) {
      expect(read(`tasks/${file}`)).toContain("import './sakura-tasks.css'");
    }

    const css = read('tasks/sakura-tasks.css');
    expect(css).toContain("[data-sakura-surface='task-composer']");
    expect(css).toContain("[data-sakura-surface='task-card']");
    expect(css).toContain("[data-sakura-surface='task-draft']");
    expect(css).toContain("[data-sakura-surface='task-snooze']");
    expect(css).toContain("[data-sakura-state='complete']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('protects user preview pixels while theming only studio controls and frames', () => {
    const source = read('preview/PreviewStudio.tsx');
    const css = read('preview/sakura-preview.css');

    expect(source).toContain('data-sakura-content="preview-user-content"');
    expect(css).toContain("[data-sakura-surface='preview-toolbar']");
    expect(css).toContain("[data-sakura-surface='preview-device']");
    expect(css).not.toContain('[data-sakura-content');
    expect(css).not.toMatch(/\biframe\b/);
  });

  it('uses the prototype Sakura celebration palette only for the Sakura theme', () => {
    const confetti = read('celebrate/Confetti.tsx');
    const host = read('celebrate/index.ts');

    expect(confetti).toContain(
      "const SAKURA_PALETTE = ['#eeabb7', '#ef6f88', '#f5cec8', '#ffd978', '#9ed0b8']",
    );
    expect(confetti).toContain("document.documentElement.dataset.theme === 'sakura'");
    expect(host).toContain("'data-sakura-surface': 'celebration-host'");
  });
});
