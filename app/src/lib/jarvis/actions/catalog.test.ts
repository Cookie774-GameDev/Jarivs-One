import { describe, expect, it } from 'vitest';
import { getAllActions } from '@/lib/actions/runner';
import type { ActionDef } from '@/lib/actions/types';
import {
  buildJarvisActionCatalog,
  validateJarvisActionCatalog,
} from './catalog';

describe('Jarvis action catalog', () => {
  it('normalizes every executable action into a versioned typed definition', () => {
    const catalog = buildJarvisActionCatalog(getAllActions());

    expect(catalog.length).toBeGreaterThan(40);
    expect(validateJarvisActionCatalog(catalog)).toEqual([]);
    expect(catalog.every((action) => action.version === 1)).toBe(true);
    expect(catalog.every((action) => typeof action.handler === 'function')).toBe(true);

    expect(catalog.find((action) => action.id === 'terminal.bulkOpen')).toMatchObject({
      risk: 'external-side-effect',
      approval: 'always',
      inputSchema: {
        type: 'object',
        properties: expect.objectContaining({ count: expect.objectContaining({ type: 'number' }) }),
      },
    });
  });

  it('rejects credential-shaped fields from model-visible action schemas', () => {
    const invalid: ActionDef = {
      id: 'unsafe.secret',
      category: 'custom',
      label: 'Unsafe secret',
      description: 'Unsafe test action.',
      params: [{ key: 'apiKey', label: 'API key', type: 'string' }],
      run: async () => ({ ok: true }),
    };

    const errors = validateJarvisActionCatalog(buildJarvisActionCatalog([invalid]));

    expect(errors.join('\n')).toMatch(/credential field/i);
  });
});
