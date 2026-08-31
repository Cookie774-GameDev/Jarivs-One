import { describe, expect, it, vi } from 'vitest';
import type { ActionDef } from '@/lib/actions';
import type { CustomTool } from '@/features/tools';
import { projectInspectorTools } from './Inspector';

function builtin(id: string, label: string): ActionDef {
  return {
    id,
    label,
    description: `${label} description`,
    category: 'navigation',
    params: [],
    run: vi.fn(),
  };
}

function custom(overrides: Partial<CustomTool> = {}): CustomTool {
  return {
    slug: 'open-chat',
    name: 'Open chat',
    description: 'Open the current chat.',
    baseAction: 'nav.chat',
    params: {},
    createdAt: 1,
    updatedAt: 2,
    published: null,
    ...overrides,
  };
}

describe('Inspector canonical tool inventory', () => {
  it('projects canonical built-in and account-scoped custom tools with truthful origins', () => {
    const inventory = projectInspectorTools(
      [builtin('nav.chat', 'Open chat'), builtin('nav.tools', 'Open tools')],
      [custom()],
    );

    expect(inventory.map(({ id, origin, availability }) => ({ id, origin, availability }))).toEqual(
      [
        { id: 'nav.chat', origin: 'built-in', availability: 'available' },
        { id: 'nav.tools', origin: 'built-in', availability: 'available' },
        { id: 'custom.open-chat', origin: 'custom', availability: 'available' },
      ],
    );
  });

  it('marks stale custom wiring unavailable instead of presenting a runnable tool', () => {
    const inventory = projectInspectorTools(
      [builtin('nav.chat', 'Open chat')],
      [
        custom({ slug: 'stale', name: 'Stale tool', baseAction: 'missing.action' }),
        custom({
          slug: 'workflow',
          name: 'Workflow',
          steps: [
            { action: 'nav.chat', params: {} },
            { action: 'missing.step', params: {} },
          ],
        }),
      ],
    );

    expect(inventory.filter(({ origin }) => origin === 'custom')).toEqual([
      expect.objectContaining({ id: 'custom.stale', availability: 'unavailable' }),
      expect.objectContaining({ id: 'custom.workflow', availability: 'unavailable' }),
    ]);
  });
});
