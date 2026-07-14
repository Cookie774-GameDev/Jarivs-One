import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const navSource = readFileSync(join(process.cwd(), 'src/components/layout/NavPane.tsx'), 'utf8');
const routerSource = readFileSync(join(process.cwd(), 'src/components/layout/PageRouter.tsx'), 'utf8');
const uiSource = readFileSync(join(process.cwd(), 'src/stores/ui.ts'), 'utf8');

describe('NavPane workspace navigation', () => {
  it('removes only the standalone Skills row while retaining Tools and direct Skills routing', () => {
    expect(navSource).not.toMatch(/<RouteItem[\s\S]{0,180}label="Skills"[\s\S]{0,180}target="skills"/);
    expect(navSource).toMatch(/<RouteItem[\s\S]{0,180}label="Tools"[\s\S]{0,180}target="tools"/);

    for (const label of ['Chat', 'Terminals', 'Kanban', 'Schedule', 'Benchmarks', 'History', 'Agents', 'Files']) {
      expect(navSource).toContain(`label="${label}"`);
    }

    expect(routerSource).toContain('skills: SkillsPage');
    expect(uiSource).toMatch(/['"]skills['"]/);
  });
});
