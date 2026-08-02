import { describe, expect, it } from 'vitest';
import { parseContextSearchQuery } from './searchQuery';

function field(fieldName: string, value: string, start: number, end: number, exact = false) {
  return {
    kind: 'field',
    field: fieldName,
    operator: 'eq',
    value,
    exact,
    span: { start, end },
  };
}

function term(value: string, start: number, end: number, exact = false) {
  return { kind: 'term', value, exact, span: { start, end } };
}

function boolean(kind: 'and' | 'or', operands: readonly object[], start: number, end: number) {
  return { kind, operands, span: { start, end } };
}

describe('Context structured-search query parser', () => {
  it('parses every frozen-goal query example into an immutable AST', () => {
    const severityQuery = 'property.severity:(critical OR high)';
    const taskQuery = 'task:todo Stripe';
    const subscriptionQuery = '"subscription bypass" -property.status:archived';
    const symbolQuery = 'kind:symbol name:resolveEntitlement';
    const examples = [
      ['tag:#security', field('tag', '#security', 0, 13)],
      ['path:"Security Audits"', field('path', 'Security Audits', 0, 22, true)],
      [
        severityQuery,
        boolean(
          'or',
          [
            field(
              'property.severity',
              'critical',
              severityQuery.indexOf('critical'),
              severityQuery.indexOf('critical') + 'critical'.length,
            ),
            field(
              'property.severity',
              'high',
              severityQuery.indexOf('high'),
              severityQuery.indexOf('high') + 'high'.length,
            ),
          ],
          0,
          severityQuery.length,
        ),
      ],
      [
        taskQuery,
        boolean(
          'and',
          [
            field('task', 'todo', 0, 'task:todo'.length),
            term('Stripe', taskQuery.indexOf('Stripe'), taskQuery.length),
          ],
          0,
          taskQuery.length,
        ),
      ],
      [
        subscriptionQuery,
        boolean(
          'and',
          [
            term('subscription bypass', 0, '"subscription bypass"'.length, true),
            {
              kind: 'not',
              operand: field(
                'property.status',
                'archived',
                subscriptionQuery.indexOf('property.status'),
                subscriptionQuery.length,
              ),
              span: {
                start: subscriptionQuery.indexOf('-'),
                end: subscriptionQuery.length,
              },
            },
          ],
          0,
          subscriptionQuery.length,
        ),
      ],
      [
        symbolQuery,
        boolean(
          'and',
          [
            field('kind', 'symbol', 0, 'kind:symbol'.length),
            field('name', 'resolveEntitlement', symbolQuery.indexOf('name:'), symbolQuery.length),
          ],
          0,
          symbolQuery.length,
        ),
      ],
      [
        'imports:"@/lib/entitlements"',
        field('imports', '@/lib/entitlements', 0, 'imports:"@/lib/entitlements"'.length, true),
      ],
      [
        'github.repo:"Cookie774-GameDev/VibeSpace"',
        field(
          'github.repo',
          'Cookie774-GameDev/VibeSpace',
          0,
          'github.repo:"Cookie774-GameDev/VibeSpace"'.length,
          true,
        ),
      ],
      ['github.branch:main', field('github.branch', 'main', 0, 'github.branch:main'.length)],
      [
        'changed_after:2026-07-01',
        field('changed_after', '2026-07-01', 0, 'changed_after:2026-07-01'.length),
      ],
      [
        'linked_to:"Stripe Webhook"',
        field('linked_to', 'Stripe Webhook', 0, 'linked_to:"Stripe Webhook"'.length, true),
      ],
      [
        'backlinks_to:"VibeSpace Access"',
        field(
          'backlinks_to',
          'VibeSpace Access',
          0,
          'backlinks_to:"VibeSpace Access"'.length,
          true,
        ),
      ],
    ] as const;
    for (const [query, expectedAst] of examples) {
      const result = parseContextSearchQuery(query);
      expect(result, query).toMatchObject({ ok: true });
      if (!result.ok) continue;
      expect(result.value.version).toBe(1);
      expect(result.value.query).toBe(query);
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.ast)).toBe(true);
      expect(result.value.ast).toEqual(expectedAst);
      if ('operands' in result.value.ast) {
        expect(Object.isFrozen(result.value.ast.operands)).toBe(true);
      }
    }
  });

  it('uses NOT, explicit AND, implicit conjunction, and OR with deterministic precedence', () => {
    const result = parseContextSearchQuery(
      'task:todo Stripe OR language:rust AND NOT freshness:stale',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ast).toMatchObject({
      kind: 'or',
      operands: [
        {
          kind: 'and',
          operands: [
            { kind: 'field', field: 'task', operator: 'eq', value: 'todo' },
            { kind: 'term', value: 'Stripe', exact: false },
          ],
        },
        {
          kind: 'and',
          operands: [
            { kind: 'field', field: 'language', operator: 'eq', value: 'rust' },
            {
              kind: 'not',
              operand: {
                kind: 'field',
                field: 'freshness',
                operator: 'eq',
                value: 'stale',
              },
            },
          ],
        },
      ],
    });
  });

  it('scopes parenthesized field alternatives and preserves exact phrases', () => {
    const result = parseContextSearchQuery(
      'property.severity:(critical OR high) AND path:"Security Audits"',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ast).toMatchObject({
      kind: 'and',
      operands: [
        {
          kind: 'or',
          operands: [
            {
              kind: 'field',
              field: 'property.severity',
              operator: 'eq',
              value: 'critical',
              exact: false,
            },
            {
              kind: 'field',
              field: 'property.severity',
              operator: 'eq',
              value: 'high',
              exact: false,
            },
          ],
        },
        {
          kind: 'field',
          field: 'path',
          operator: 'eq',
          value: 'Security Audits',
          exact: true,
        },
      ],
    });
  });

  it('parses comparisons and inclusive calendar-date ranges', () => {
    const result = parseContextSearchQuery(
      'property.risk>=7 AND property.review_date:[2026-07-01 TO 2026-07-31]',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ast).toMatchObject({
      kind: 'and',
      operands: [
        {
          kind: 'field',
          field: 'property.risk',
          operator: 'gte',
          value: '7',
        },
        {
          kind: 'field',
          field: 'property.review_date',
          operator: 'range',
          value: {
            start: '2026-07-01',
            end: '2026-07-31',
            inclusiveStart: true,
            inclusiveEnd: true,
          },
        },
      ],
    });
  });

  it('reports malformed syntax and fields at exact source locations', () => {
    expect(parseContextSearchQuery('unknown:value')).toEqual({
      ok: false,
      reason: 'query_field_invalid',
      error: {
        message: 'Unknown search field "unknown".',
        offset: 0,
        length: 7,
        line: 1,
        column: 1,
      },
    });
    expect(parseContextSearchQuery('path:"open')).toEqual({
      ok: false,
      reason: 'query_syntax_invalid',
      error: {
        message: 'Unterminated quoted phrase.',
        offset: 5,
        length: 5,
        line: 1,
        column: 6,
      },
    });
    expect(parseContextSearchQuery('(task:todo OR language:rust')).toEqual({
      ok: false,
      reason: 'query_syntax_invalid',
      error: {
        message: 'Expected closing parenthesis.',
        offset: 27,
        length: 1,
        line: 1,
        column: 28,
      },
    });
  });

  it('rejects invalid dates, regex/executable syntax, controls, and excessive work', () => {
    expect(
      parseContextSearchQuery('property.review_date:[2026-02-31 TO 2026-03-01]'),
    ).toMatchObject({
      ok: false,
      reason: 'query_value_invalid',
      error: { offset: 22 },
    });
    expect(parseContextSearchQuery('/subscription.*/')).toMatchObject({
      ok: false,
      reason: 'query_syntax_invalid',
    });
    for (const query of ['foo\u2028bar', 'foo\u2029bar', 'foo\u0085bar', 'foo\u00a0bar']) {
      expect(parseContextSearchQuery(query)).toEqual({
        ok: false,
        reason: 'query_input_invalid',
      });
    }
    for (const query of ['$((touch))', '`touch`', 'one|two', 'one&two']) {
      expect(parseContextSearchQuery(query)).toMatchObject({
        ok: false,
        reason: 'query_syntax_invalid',
      });
    }
    for (const query of [
      'property.severity:(high OR)',
      'property.severity:(high AND)',
      'property.severity:(NOT)',
      'property.severity:(-)',
      'property.severity:(())',
    ]) {
      expect(parseContextSearchQuery(query)).toMatchObject({
        ok: false,
        reason: 'query_syntax_invalid',
        error: { offset: expect.any(Number), column: expect.any(Number) },
      });
    }
    expect(parseContextSearchQuery('task:todo\u0000hidden')).toEqual({
      ok: false,
      reason: 'query_input_invalid',
    });
    expect(parseContextSearchQuery('x'.repeat(4_097))).toEqual({
      ok: false,
      reason: 'query_input_too_large',
    });
    expect(parseContextSearchQuery(`${'('.repeat(33)}term${')'.repeat(33)}`)).toMatchObject({
      ok: false,
      reason: 'query_input_too_large',
    });
    expect(parseContextSearchQuery({ query: 'task:todo' })).toEqual({
      ok: false,
      reason: 'query_input_invalid',
    });
    expect(parseContextSearchQuery('property.__proto__:unsafe')).toMatchObject({
      ok: false,
      reason: 'query_field_invalid',
      error: { offset: 0 },
    });
    expect(
      parseContextSearchQuery('property.review_date:[2026-08-01 TO 2026-07-01]'),
    ).toMatchObject({
      ok: false,
      reason: 'query_value_invalid',
      error: { offset: 22 },
    });
    expect(parseContextSearchQuery('path:"a \\"quoted\\" folder"')).toMatchObject({
      ok: true,
      value: {
        ast: {
          kind: 'field',
          field: 'path',
          value: 'a "quoted" folder',
          exact: true,
        },
      },
    });
  });
});
