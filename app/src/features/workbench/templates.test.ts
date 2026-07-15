import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES, instantiateTemplate } from './templates';

describe('Workbench templates', () => {
  it('provides every required starting layout', () => {
    expect(BUILT_IN_TEMPLATES.map((template) => template.id)).toEqual([
      'coding',
      'multi-agent',
      'research',
      'web-development',
      'supabase',
      'content',
      'blank',
    ]);
  });

  it('creates fresh panel identities without changing the template', () => {
    const source = BUILT_IN_TEMPLATES.find((template) => template.id === 'web-development')!;
    const first = instantiateTemplate(source);
    const second = instantiateTemplate(source);

    expect(first.filter((panel) => panel.kind === 'terminal')).toHaveLength(4);
    expect(first.filter((panel) => panel.kind === 'browser')).toHaveLength(2);
    expect(first.map((panel) => panel.id)).not.toEqual(second.map((panel) => panel.id));
    expect(source.panels.every((panel) => !('id' in panel))).toBe(true);
  });
});
