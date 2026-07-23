import { describe, expect, it } from 'vitest';
import { planJarvisDelegation } from './delegationDecision';

describe('planJarvisDelegation', () => {
  it.each([
    ['Audit the entire repository deeply and map the authentication flow.', 'repository'],
    ['Research this using at least five independent sources.', 'research'],
    ['Plan the major cross-cutting refactor across many files.', 'large_change'],
    ['Write a polished specialist implementation specification.', 'document'],
    ['Create the Canva landing-page design from this brand brief.', 'design'],
    ['Inspect the chat system and terminal system in parallel.', 'parallel'],
  ] as const)('delegates %s for a bounded %s reason', (request, reason) => {
    const decision = planJarvisDelegation(request);

    expect(decision).toMatchObject({ status: 'delegate', reason });
    if (decision.status !== 'delegate') throw new Error('Expected delegation');
    expect(decision.tasks.length).toBeGreaterThan(0);
    expect(decision.tasks.length).toBeLessThanOrEqual(3);
    expect(new Set(decision.tasks.map((task) => task.role)).size).toBe(decision.tasks.length);
  });

  it.each([
    'Hello.',
    'Quick status question: what percent is complete?',
    'Quick question: what time is it?',
    'Open Settings.',
    'Switch to Gemini.',
    'Toggle the sidebar.',
  ])('keeps trivial work direct: %s', (request) => {
    expect(planJarvisDelegation(request)).toMatchObject({ status: 'direct' });
  });

  it('redacts secret-shaped text before constructing a task', () => {
    const decision = planJarvisDelegation(
      'Audit the entire repository deeply. Password: correct-horse-battery-staple',
    );

    expect(decision.status).toBe('delegate');
    expect(JSON.stringify(decision)).not.toMatch(/correct-horse|password:/i);
    expect(JSON.stringify(decision)).toContain('[redacted]');
  });

  it('returns detached deeply frozen decisions', () => {
    const request = { text: 'Research this using several independent sources.' };
    const decision = planJarvisDelegation(request.text);
    request.text = 'mutated';

    expect(Object.isFrozen(decision)).toBe(true);
    expect(decision.status).toBe('delegate');
    if (decision.status !== 'delegate') throw new Error('Expected delegation');
    expect(Object.isFrozen(decision.tasks)).toBe(true);
    expect(Object.isFrozen(decision.tasks[0])).toBe(true);
    expect(JSON.stringify(decision)).not.toContain('mutated');
  });
});
