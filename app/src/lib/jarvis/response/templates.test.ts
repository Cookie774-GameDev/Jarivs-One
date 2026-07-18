import { describe, expect, it } from 'vitest';
import { verifiedResponseTemplate } from './templates';
import type { JarvisVerifiedFacts } from './modeClassifier';

function facts(status?: string): JarvisVerifiedFacts {
  return {
    ...(status
      ? { executionState: { status, verifiedBy: 'journal', lastEventSeq: 1 } as never }
      : {}),
    modelState: 'authenticated',
    plugins: [],
    mcps: [],
  };
}

describe('verifiedResponseTemplate', () => {
  it.each([
    ['awaiting_approval', /approval is required/i, /completed|running/i],
    ['running', /running/i, /completed successfully/i],
    ['completed', /completed successfully/i, /still running/i],
    ['partial', /partially complete|unfinished/i, /completed successfully/i],
    ['failed', /failed/i, /completed successfully/i],
    ['cancelled', /cancelled before completion/i, /completed successfully/i],
    ['timed_out', /timed out/i, /completed successfully/i],
  ] as const)('narrates %s without contradicting it', (status, required, forbidden) => {
    const text = verifiedResponseTemplate(facts(status));
    expect(text).toMatch(required);
    expect(text).not.toMatch(forbidden);
  });

  it('distinguishes available, connected, and authenticated integrations', () => {
    const text = verifiedResponseTemplate({
      ...facts(),
      plugins: [
        { id: 'available-plugin', state: 'available', operations: [] },
        { id: 'connected-plugin', state: 'connected', operations: [] },
      ],
      mcps: [{ id: 'authenticated-mcp', state: 'authenticated', operations: [] }],
    });
    expect(text).toContain('available-plugin is available');
    expect(text).toContain('connected-plugin is connected');
    expect(text).toContain('authenticated-mcp is authenticated');
  });

  it.each([
    ['queued', /queued and not running/i, /completed/i],
    ['running', /running and not completed/i, /completed with/i],
    ['completed', /completed with executor verification/i, /not completed/i],
  ] as const)(
    'narrates terminal %s from verified executor state',
    (terminalState, required, forbidden) => {
      const text = verifiedResponseTemplate({ ...facts(), terminalState });
      expect(text).toMatch(required);
      expect(text).not.toMatch(forbidden);
    },
  );

  it('reports an unavailable model without inventing a switch', () => {
    expect(verifiedResponseTemplate({ ...facts(), modelState: 'unavailable' })).toBe(
      'The selected model is unavailable. No model switch was made.',
    );
  });

  it('labels provider-only completion as unverified', () => {
    const text = verifiedResponseTemplate({
      ...facts(),
      executionState: { status: 'completed', verifiedBy: 'provider', lastEventSeq: 0 },
    });
    expect(text).toMatch(/provider reported completion|verification is still required/i);
    expect(text).not.toMatch(/completed successfully/i);
  });
});
