import { describe, expect, it } from 'vitest';

import { getAllActions } from '@/lib/actions';
import { buildJarvisActionCatalog } from './catalog';
import {
  actionCatalogCsv,
  actionCatalogMarkdown,
  searchActionCatalog,
} from './documentation';

describe('Jarvis action developer documentation', () => {
  const catalog = buildJarvisActionCatalog(getAllActions());

  it('generates searchable documentation from the typed runtime source of truth', () => {
    expect(searchActionCatalog(catalog, 'terminal output').map((item) => item.id))
      .toContain('terminal.collect_output');
    const markdown = actionCatalogMarkdown(catalog);
    expect(markdown).toContain('`terminal.create`');
    expect(markdown).toContain('Approval');
  });

  it('exports safe CSV without serializing handlers or credential fields', () => {
    const csv = actionCatalogCsv(catalog);
    expect(csv.split('\n')[0]).toBe('id,version,title,category,risk,approval,capabilities,permissions,platforms,available');
    expect(csv).toContain('terminal.create');
    expect(csv).not.toContain('function');
    expect(csv).not.toMatch(/api.?key|password|access.?token/i);
  });
});
