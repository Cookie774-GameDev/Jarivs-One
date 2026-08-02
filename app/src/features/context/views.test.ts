import { describe, expect, it } from 'vitest';
import {
  duplicateContextSavedView,
  executeContextSavedView,
  parseContextSavedView,
  type ContextViewRowV1,
} from './views';

const securityView = {
  version: 1,
  id: 'view-security',
  mapId: 'map-one',
  name: 'Security blockers',
  type: 'table',
  filter: {
    kind: 'and',
    operands: [
      { kind: 'comparison', field: 'kind', operator: 'eq', value: 'markdown_note' },
      {
        kind: 'comparison',
        field: 'property.severity',
        operator: 'in',
        value: ['critical', 'high'],
      },
      { kind: 'comparison', field: 'property.status', operator: 'eq', value: 'open' },
      {
        kind: 'comparison',
        field: 'property.release_blocker',
        operator: 'eq',
        value: true,
      },
    ],
  },
  sorts: [
    { field: 'property.severity', direction: 'asc' },
    { field: 'title', direction: 'asc' },
  ],
  groupBy: 'property.severity',
  pinnedRowIds: ['note-high'],
  fields: [
    { field: 'title', visible: true, order: 0, width: 260 },
    { field: 'property.status', visible: false, order: 1, width: 120 },
    { field: 'property.severity', visible: true, order: 2, width: 120 },
  ],
  aggregates: [
    { id: 'all', operation: 'count' },
    { id: 'blockers', operation: 'count_true', field: 'property.release_blocker' },
  ],
  formulas: [],
  createdAt: 100,
  updatedAt: 100,
} as const;

function row(
  id: string,
  title: string,
  severity: string,
  blocker: boolean,
  extra: Partial<ContextViewRowV1> = {},
): ContextViewRowV1 {
  return {
    id,
    kind: 'markdown_note',
    title,
    path: `notes/${title}.md`,
    sourceId: 'source-one',
    updatedAt: 1_752_600_000_000,
    properties: {
      severity,
      status: 'open',
      release_blocker: blocker,
    },
    ...extra,
  };
}

describe('Context saved views', () => {
  it('accepts every VibeSpace view type as a strict immutable saved-view contract', () => {
    for (const type of [
      'table',
      'list',
      'cards',
      'kanban',
      'calendar',
      'timeline',
      'graph_subset',
      'map',
    ] as const) {
      const result = parseContextSavedView({ ...securityView, id: `view-${type}`, type });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.filter)).toBe(true);
    }

    expect(parseContextSavedView({ ...securityView, name: 'Security Base' })).toEqual({
      ok: false,
      reason: 'view_branding_invalid',
      detail: 'name',
    });
    expect(parseContextSavedView({ ...securityView, arbitrary: true })).toEqual({
      ok: false,
      reason: 'view_contract_invalid',
    });
  });

  it('filters, pins, sorts, groups, lays out fields, and aggregates deterministic rows', () => {
    const view = parseContextSavedView(securityView);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const result = executeContextSavedView({
      view: view.value,
      rows: [
        row('note-critical', 'Critical', 'critical', true),
        row('note-high', 'High', 'high', true),
        row('note-low', 'Low', 'low', true),
        row('note-closed', 'Closed', 'critical', true, {
          properties: {
            severity: 'critical',
            status: 'closed',
            release_blocker: true,
          },
        }),
      ],
      now: 1_752_600_000_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.map(({ id }) => id)).toEqual(['note-high', 'note-critical']);
    expect(result.value.groups).toEqual([
      { key: 'high', rowIds: ['note-high'] },
      { key: 'critical', rowIds: ['note-critical'] },
    ]);
    expect(result.value.visibleFields).toEqual([
      { field: 'title', order: 0, width: 260 },
      { field: 'property.severity', order: 2, width: 120 },
    ]);
    expect(result.value.aggregates).toEqual({ all: 2, blockers: 2 });
    expect(result.value.operations).toEqual([
      'edit_properties',
      'open_source',
      'save_as_template',
      'duplicate',
      'export',
    ]);
    expect(result.value.exportRows).toEqual([
      { title: 'High', 'property.severity': 'high' },
      { title: 'Critical', 'property.severity': 'critical' },
    ]);
  });

  it('evaluates only the four bounded declarative formula families', () => {
    const view = parseContextSavedView({
      ...securityView,
      id: 'view-formulas',
      filter: undefined,
      groupBy: undefined,
      pinnedRowIds: [],
      fields: [
        { field: 'title', visible: true, order: 0, width: 200 },
        { field: 'formula.days_until_review', visible: true, order: 1, width: 140 },
        { field: 'formula.stale_age', visible: true, order: 2, width: 140 },
        { field: 'formula.risk_score', visible: true, order: 3, width: 140 },
        { field: 'formula.completion', visible: true, order: 4, width: 140 },
      ],
      formulas: [
        {
          name: 'days_until_review',
          expression: { kind: 'days_until', field: 'property.review_date' },
        },
        {
          name: 'stale_age',
          expression: { kind: 'stale_age_days', field: 'updated_at' },
        },
        {
          name: 'risk_score',
          expression: {
            kind: 'risk_score',
            severityField: 'property.severity',
            blockerField: 'property.release_blocker',
          },
        },
        {
          name: 'completion',
          expression: {
            kind: 'completion_percentage',
            completedField: 'property.completed',
            totalField: 'property.total',
          },
        },
      ],
    });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const result = executeContextSavedView({
      view: view.value,
      rows: [
        row('note-one', 'One', 'high', true, {
          updatedAt: Date.parse('2026-07-20T00:00:00Z'),
          properties: {
            severity: 'high',
            release_blocker: true,
            review_date: '2026-07-28',
            completed: 3,
            total: 4,
          },
        }),
      ],
      now: Date.parse('2026-07-25T00:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]!.formulaValues).toEqual({
      days_until_review: 3,
      stale_age: 5,
      risk_score: 8,
      completion: 75,
    });
  });

  it('permits map views only when at least one filtered row has valid geography', () => {
    const mapView = parseContextSavedView({
      ...securityView,
      id: 'view-map',
      type: 'map',
      filter: undefined,
      groupBy: undefined,
      pinnedRowIds: [],
    });
    expect(mapView.ok).toBe(true);
    if (!mapView.ok) return;
    expect(
      executeContextSavedView({
        view: mapView.value,
        rows: [row('note-one', 'One', 'high', true)],
        now: 1,
      }),
    ).toEqual({ ok: false, reason: 'map_view_requires_geography' });
    expect(
      executeContextSavedView({
        view: mapView.value,
        rows: [
          row('note-one', 'One', 'high', true, {
            latitude: 41.8781,
            longitude: -87.6298,
          }),
        ],
        now: 1,
      }),
    ).toMatchObject({ ok: true, value: { rows: [{ id: 'note-one' }] } });
  });

  it('duplicates or templates saved views without mutating identity or timestamps', () => {
    const view = parseContextSavedView(securityView);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const duplicate = duplicateContextSavedView({
      view: view.value,
      id: 'view-copy',
      name: 'Security blockers copy',
      now: 200,
      asTemplate: true,
    });
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(duplicate.value).toMatchObject({
      id: 'view-copy',
      name: 'Security blockers copy',
      template: true,
      createdAt: 200,
      updatedAt: 200,
    });
    expect(view.value).toMatchObject({
      id: 'view-security',
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it('rejects JavaScript-like formulas, malformed filters, unsafe rows, and oversized input', () => {
    expect(
      parseContextSavedView({
        ...securityView,
        formulas: [
          {
            name: 'danger',
            expression: { kind: 'javascript', source: 'globalThis.process.exit()' },
          },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: 'view_formula_invalid',
      detail: 'danger',
    });
    expect(
      parseContextSavedView({
        ...securityView,
        filter: { kind: 'and', operands: [] },
      }),
    ).toEqual({
      ok: false,
      reason: 'view_filter_invalid',
    });

    const view = parseContextSavedView(securityView);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(
      executeContextSavedView({
        view: view.value,
        rows: [
          {
            ...row('note-one', 'One', 'high', true),
            path: '../../private.txt',
          },
        ],
        now: 1,
      }),
    ).toEqual({
      ok: false,
      reason: 'view_row_invalid',
      detail: 'note-one',
    });
    expect(
      executeContextSavedView({
        view: view.value,
        rows: Array.from({ length: 10_001 }, (_, index) =>
          row(`note-${index}`, `Note ${index}`, 'high', true),
        ),
        now: 1,
      }),
    ).toEqual({ ok: false, reason: 'view_input_too_large' });
  });

  it('treats hostile runtime objects as invalid instead of throwing', () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => parseContextSavedView(revoked.proxy)).not.toThrow();
    expect(parseContextSavedView(revoked.proxy)).toEqual({
      ok: false,
      reason: 'view_contract_invalid',
    });

    const accessor = { ...securityView } as Record<string, unknown>;
    Object.defineProperty(accessor, 'name', {
      enumerable: true,
      get() {
        throw new Error('must not execute');
      },
    });
    expect(() => parseContextSavedView(accessor)).not.toThrow();
    expect(parseContextSavedView(accessor)).toEqual({
      ok: false,
      reason: 'view_contract_invalid',
    });

    const view = parseContextSavedView(securityView);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const hostileRow = row('note-one', 'One', 'high', true) as unknown as Record<string, unknown>;
    Object.defineProperty(hostileRow, 'title', {
      enumerable: true,
      get() {
        throw new Error('must not execute');
      },
    });
    expect(() =>
      executeContextSavedView({
        view: view.value,
        rows: [hostileRow as unknown as ContextViewRowV1],
        now: 1,
      }),
    ).not.toThrow();
    expect(
      executeContextSavedView({
        view: view.value,
        rows: [hostileRow as unknown as ContextViewRowV1],
        now: 1,
      }),
    ).toEqual({ ok: false, reason: 'view_execution_invalid' });
  });

  it('rejects accepted-shape workloads whose aggregate text work is unsafe', () => {
    const expensiveView = parseContextSavedView({
      ...securityView,
      id: 'view-expensive',
      filter: {
        kind: 'comparison',
        field: 'property.blob',
        operator: 'contains',
        value: 'needle',
      },
      sorts: [{ field: 'property.blob', direction: 'asc' }],
      groupBy: undefined,
      pinnedRowIds: [],
      fields: [{ field: 'title', visible: true, order: 0, width: 200 }],
      aggregates: [],
    });
    expect(expensiveView.ok).toBe(true);
    if (!expensiveView.ok) return;
    expect(
      executeContextSavedView({
        view: expensiveView.value,
        rows: Array.from({ length: 2_000 }, (_, index) =>
          row(`note-${index}`, `Note ${index}`, 'high', true, {
            properties: { blob: `${'x'.repeat(3_990)}needle` },
          }),
        ),
        now: 1,
      }),
    ).toEqual({ ok: false, reason: 'view_input_too_large' });

    const formulaView = parseContextSavedView({
      ...securityView,
      id: 'view-expensive-formulas',
      filter: undefined,
      sorts: [],
      groupBy: undefined,
      pinnedRowIds: [],
      fields: [{ field: 'title', visible: true, order: 0, width: 200 }],
      aggregates: [],
      formulas: Array.from({ length: 32 }, (_, index) => ({
        name: `risk_${index}`,
        expression: {
          kind: 'risk_score',
          severityField: 'property.severity',
          blockerField: 'property.release_blocker',
        },
      })),
    });
    expect(formulaView.ok).toBe(true);
    if (!formulaView.ok) return;
    expect(
      executeContextSavedView({
        view: formulaView.value,
        rows: Array.from({ length: 500 }, (_, index) =>
          row(`note-formula-${index}`, `Formula ${index}`, 'high', true, {
            properties: {
              severity: 'X'.repeat(4_000),
              release_blocker: true,
            },
          }),
        ),
        now: 1,
      }),
    ).toEqual({ ok: false, reason: 'view_input_too_large' });
  });

  it('never emits non-finite formula or aggregate results', () => {
    const view = parseContextSavedView({
      ...securityView,
      id: 'view-overflow',
      filter: undefined,
      groupBy: undefined,
      pinnedRowIds: [],
      aggregates: [{ id: 'total', operation: 'sum', field: 'property.amount' }],
    });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(
      executeContextSavedView({
        view: view.value,
        rows: [
          row('note-one', 'One', 'high', true, {
            properties: { amount: Number.MAX_VALUE },
          }),
          row('note-two', 'Two', 'high', true, {
            properties: { amount: Number.MAX_VALUE },
          }),
        ],
        now: 1,
      }),
    ).toEqual({ ok: false, reason: 'view_execution_invalid' });
    expect(
      executeContextSavedView({
        view: view.value,
        rows: [],
        now: Number.MAX_SAFE_INTEGER,
      }),
    ).toEqual({ ok: false, reason: 'view_execution_invalid' });

    const invalidDateView = parseContextSavedView({
      ...securityView,
      id: 'view-invalid-date',
      filter: undefined,
      groupBy: undefined,
      pinnedRowIds: [],
      fields: [{ field: 'formula.review', visible: true, order: 0, width: 100 }],
      aggregates: [],
      formulas: [
        {
          name: 'review',
          expression: { kind: 'days_until', field: 'property.review_date' },
        },
      ],
    });
    expect(invalidDateView.ok).toBe(true);
    if (!invalidDateView.ok) return;
    const invalidDateResult = executeContextSavedView({
      view: invalidDateView.value,
      rows: [
        row('note-one', 'One', 'high', true, {
          properties: { review_date: '2026-02-31' },
        }),
      ],
      now: Date.parse('2026-02-01T00:00:00Z'),
    });
    expect(invalidDateResult).toMatchObject({
      ok: true,
      value: { rows: [{ formulaValues: { review: 0 } }] },
    });
  });

  it('keeps scalar and list group values collision-free and deeply immutable', () => {
    const view = parseContextSavedView({
      ...securityView,
      id: 'view-groups',
      filter: undefined,
      groupBy: 'property.group',
      pinnedRowIds: [],
      aggregates: [],
    });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const result = executeContextSavedView({
      view: view.value,
      rows: [
        row('note-scalar', 'Scalar', 'high', true, {
          properties: { group: 'a, b' },
        }),
        row('note-list-one', 'List one', 'high', true, {
          properties: { group: ['a', 'b'] },
        }),
        row('note-list-two', 'List two', 'high', true, {
          properties: { group: ['a, b'] },
        }),
      ],
      now: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groups).toHaveLength(3);
    expect(new Set(result.value.groups.map(({ key }) => key)).size).toBe(3);
    expect(Object.isFrozen(result.value.rows[0]!.properties)).toBe(true);
    expect(Object.isFrozen(result.value.groups[0]!.rowIds)).toBe(true);
  });
});
