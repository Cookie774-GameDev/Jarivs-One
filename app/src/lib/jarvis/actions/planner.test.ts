import { describe, expect, it, vi } from 'vitest';
import type { JarvisActionDefinition } from './catalog';
import {
  createJarvisPlan,
  executeJarvisPlan,
  reviewJarvisPlan,
} from './planner';

function action(
  id: string,
  patch: Partial<JarvisActionDefinition> = {},
): JarvisActionDefinition {
  return {
    id,
    version: 1,
    title: id,
    description: `${id} test action`,
    category: 'test',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    outputSchema: { type: 'object' },
    requiredCapabilities: [],
    requiredPermissions: [],
    supportedPlatforms: ['windows', 'macos', 'linux'],
    risk: 'read-only',
    approval: 'never',
    supportsProgress: false,
    supportsCancellation: false,
    supportsRollback: false,
    preconditions: [],
    possibleNextActions: [],
    exposeToAI: true,
    handler: vi.fn(async () => ({ ok: true as const, summary: 'verified' })),
    ...patch,
  };
}

describe('Jarvis typed planner', () => {
  it('rejects invented action ids before execution', () => {
    expect(() => createJarvisPlan({
      goal: 'Do a made-up thing',
      requestedSteps: [{ action: 'invented.action', input: {} }],
      catalog: [action('known.action')],
    })).toThrow(/not registered/i);
  });

  it('requires approval for external side effects but not read-only actions', () => {
    const catalog = [
      action('status.read'),
      action('terminal.create', { risk: 'external-side-effect', approval: 'always' }),
    ];
    const plan = createJarvisPlan({
      goal: 'Inspect and create',
      requestedSteps: [
        { action: 'status.read', input: {} },
        { action: 'terminal.create', input: {} },
      ],
      catalog,
    });

    expect(reviewJarvisPlan(plan, catalog, { previouslyApproved: [] })).toMatchObject({
      requiresApproval: true,
      approvalStepIds: [plan.steps[1]?.id],
    });
  });

  it('deduplicates repeated execution with the same idempotency key', async () => {
    const definition = action('status.read');
    const catalog = [definition];
    const plan = createJarvisPlan({
      goal: 'Read once',
      idempotencyKey: 'same-request',
      requestedSteps: [{ action: 'status.read', input: {} }],
      catalog,
    });

    const first = await executeJarvisPlan(plan, catalog);
    const second = await executeJarvisPlan(plan, catalog);

    expect(first.status).toBe('completed');
    expect(second).toEqual(first);
    expect(definition.handler).toHaveBeenCalledTimes(1);
    expect(first.steps[0]?.verification.status).toBe('verified');
  });
});
