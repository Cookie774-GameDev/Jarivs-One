import { describe, expect, it } from 'vitest';
import { CanvasValidationError, type CanvasOwnerId, type CanvasProjectId } from './contracts';
import {
  CANVAS_DATABASE_FIELD_TYPES,
  CANVAS_DATABASE_MAX_COLUMN_WIDTH,
  CANVAS_DATABASE_MAX_FIELDS,
  CANVAS_DATABASE_MAX_FILTERS,
  CANVAS_DATABASE_MAX_LINKS,
  CANVAS_DATABASE_MAX_MULTI_SELECT,
  CANVAS_DATABASE_MAX_RELATION_RECORDS,
  CANVAS_DATABASE_MAX_TEMPLATES,
  CANVAS_DATABASE_MAX_VIEWS,
  CANVAS_DATABASE_MAX_OPTIONS,
  CANVAS_DATABASE_MAX_RECORDS,
  CANVAS_DATABASE_MAX_SORT_RULES,
  CANVAS_DATABASE_MIN_COLUMN_WIDTH,
  CANVAS_DATABASE_VIEW_KINDS,
  assertDatabaseScope,
  createCanvasDatabase,
  createCanvasDatabaseField,
  databaseFieldById,
  databaseRecordById,
  databaseViewById,
  defaultCellForField,
  evaluateDatabaseFilter,
  isCanvasDatabase,
  parseCanvasDatabaseFieldId,
  parseCanvasDatabaseId,
  parseCanvasDatabaseRecordId,
  parseCanvasDatabaseTemplateId,
  parseCanvasDatabaseViewId,
  projectDatabaseView,
  validateDatabaseReferences,
  withFieldAdded,
  withFieldRemoved,
  withFieldRenamed,
  withRecordAdded,
  withRecordCellUpdated,
  withRecordFromTemplate,
  withRecordLinked,
  withRecordRemoved,
  withRecordUnlinked,
  withTemplateAdded,
  withTemplateRemoved,
  withViewAdded,
  withViewRemoved,
  withViewUpdated,
  type CanvasDatabase,
  type CanvasDatabaseCellValue,
  type CreateCanvasDatabaseFieldInput,
} from './databases';

const NOW = 1_700_000_000_000;
const LATER = NOW + 5_000;

const OWNER = 'owner-1' as CanvasOwnerId;
const PROJECT = 'project-1' as CanvasProjectId;
const OTHER_OWNER = 'owner-2' as CanvasOwnerId;
const OTHER_PROJECT = 'project-2' as CanvasProjectId;

function emptyDatabase(overrides: { id?: string; name?: string } = {}): CanvasDatabase {
  return createCanvasDatabase({
    id: overrides.id ?? 'db1',
    ownerId: OWNER,
    projectId: PROJECT,
    name: overrides.name ?? 'Tasks',
    now: NOW,
  });
}

function fieldInput(
  overrides: Partial<CreateCanvasDatabaseFieldInput> & { id: string },
): CreateCanvasDatabaseFieldInput {
  return {
    name: overrides.name ?? 'Field ' + overrides.id,
    type: overrides.type ?? 'text',
    options: overrides.options,
    relatedDatabaseId: overrides.relatedDatabaseId,
    id: overrides.id,
  };
}

function textCell(text: string): CanvasDatabaseCellValue {
  return { type: 'text', text };
}
function numberCell(value: number): CanvasDatabaseCellValue {
  return { type: 'number', value };
}
function checkboxCell(checked: boolean): CanvasDatabaseCellValue {
  return { type: 'checkbox', checked };
}
function selectCell(optionId: string | null): CanvasDatabaseCellValue {
  return { type: 'select', optionId };
}
function multiSelectCell(optionIds: readonly string[]): CanvasDatabaseCellValue {
  return { type: 'multi-select', optionIds };
}
function dateCell(date: string | null): CanvasDatabaseCellValue {
  return { type: 'date', date };
}
function urlCell(url: string | null): CanvasDatabaseCellValue {
  return { type: 'url', url };
}
function fileCell(
  file: { name: string; mimeType: string; size: number } | null,
): CanvasDatabaseCellValue {
  return { type: 'file', file };
}
function relationCell(recordIds: readonly string[]): CanvasDatabaseCellValue {
  return { type: 'relation', recordIds };
}
function statusCell(optionId: string | null): CanvasDatabaseCellValue {
  return { type: 'status', optionId };
}

function selectOptions(): { id: string; label: string; color: string }[] {
  return [
    { id: 'optLow', label: 'Low', color: '#00ff00' },
    { id: 'optHigh', label: 'High', color: '#ff0000' },
  ];
}
function statusOptions(): { id: string; label: string; color: string }[] {
  return [
    { id: 'stTodo', label: 'Todo', color: '#888888' },
    { id: 'stDone', label: 'Done', color: '#00ff00' },
  ];
}

/** Database with a text "Name" field and a number "Score" field plus one record. */
function seededDatabase(): CanvasDatabase {
  let db = emptyDatabase();
  db = withFieldAdded(db, fieldInput({ id: 'fName', name: 'Name', type: 'text' }), NOW);
  db = withFieldAdded(db, fieldInput({ id: 'fScore', name: 'Score', type: 'number' }), NOW);
  db = withRecordAdded(
    db,
    { id: 'r1', cells: { fName: textCell('Alpha'), fScore: numberCell(10) } },
    NOW,
  );
  return db;
}

describe('CANVAS-505: a real local database domain, not a static table', () => {
  it('creates an empty, frozen database scoped to an account and project', () => {
    const db = emptyDatabase();
    expect(db.id).toBe('db1');
    expect(db.ownerId).toBe(OWNER);
    expect(db.projectId).toBe(PROJECT);
    expect(db.name).toBe('Tasks');
    expect(db.fields).toEqual([]);
    expect(db.records).toEqual([]);
    expect(db.views).toEqual([]);
    expect(db.templates).toEqual([]);
    expect(db.localRevision).toBe(0);
    expect(db.createdAt).toBe(NOW);
    expect(db.updatedAt).toBe(NOW);
    expect(Object.isFrozen(db)).toBe(true);
    expect(isCanvasDatabase(db)).toBe(true);
  });

  it('rejects malformed creation input fail-closed', () => {
    expect(() =>
      createCanvasDatabase({ id: '', ownerId: OWNER, projectId: PROJECT, name: 'X', now: NOW }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      createCanvasDatabase({
        id: 'db1',
        ownerId: 'bad id!' as CanvasOwnerId,
        projectId: PROJECT,
        name: 'X',
        now: NOW,
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      createCanvasDatabase({ id: 'db1', ownerId: OWNER, projectId: PROJECT, name: 'X', now: -1 }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      createCanvasDatabase({
        id: 'db1',
        ownerId: OWNER,
        projectId: PROJECT,
        name: 'a'.repeat(300),
        now: NOW,
      }),
    ).toThrow(CanvasValidationError);
  });

  it('produces immutable outputs: transitions never mutate the source', () => {
    const before = emptyDatabase();
    const snapshot = JSON.stringify(before);
    const after = withFieldAdded(before, fieldInput({ id: 'fA', type: 'text' }), LATER);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(after.fields).toHaveLength(1);
    expect(before.fields).toHaveLength(0);
    expect(after.localRevision).toBe(before.localRevision + 1);
    expect(after.updatedAt).toBe(LATER);
    expect(Object.isFrozen(after)).toBe(true);
    expect(() => {
      (after as { name: string }).name = 'hacked';
    }).toThrow();
  });

  it('exposes the supported field and view families', () => {
    for (const type of [
      'text',
      'number',
      'checkbox',
      'select',
      'multi-select',
      'date',
      'url',
      'file',
      'relation',
      'status',
    ]) {
      expect(CANVAS_DATABASE_FIELD_TYPES).toContain(type);
    }
    expect(CANVAS_DATABASE_FIELD_TYPES).not.toContain('formula');
    expect(CANVAS_DATABASE_VIEW_KINDS).toEqual(['table', 'cards', 'kanban', 'list', 'calendar']);
  });
});

describe('CANVAS-506..517: field types validate values and fail closed', () => {
  it('adds each supported field type with a deterministic default cell', () => {
    let db = emptyDatabase();
    const specs: CreateCanvasDatabaseFieldInput[] = [
      fieldInput({ id: 'fText', type: 'text' }),
      fieldInput({ id: 'fNum', type: 'number' }),
      fieldInput({ id: 'fCheck', type: 'checkbox' }),
      fieldInput({ id: 'fSelect', type: 'select', options: selectOptions() }),
      fieldInput({ id: 'fMulti', type: 'multi-select', options: selectOptions() }),
      fieldInput({ id: 'fDate', type: 'date' }),
      fieldInput({ id: 'fUrl', type: 'url' }),
      fieldInput({ id: 'fFile', type: 'file' }),
      fieldInput({ id: 'fRel', type: 'relation', relatedDatabaseId: 'dbOther' }),
      fieldInput({ id: 'fStatus', type: 'status', options: statusOptions() }),
    ];
    for (const spec of specs) {
      db = withFieldAdded(db, spec, NOW);
    }
    expect(db.fields).toHaveLength(10);
    expect(defaultCellForField(databaseFieldById(db, 'fText')!)).toEqual({
      type: 'text',
      text: '',
    });
    expect(defaultCellForField(databaseFieldById(db, 'fNum')!)).toEqual({
      type: 'number',
      value: 0,
    });
    expect(defaultCellForField(databaseFieldById(db, 'fCheck')!)).toEqual({
      type: 'checkbox',
      checked: false,
    });
    expect(defaultCellForField(databaseFieldById(db, 'fSelect')!)).toEqual({
      type: 'select',
      optionId: null,
    });
    expect(defaultCellForField(databaseFieldById(db, 'fMulti')!)).toEqual({
      type: 'multi-select',
      optionIds: [],
    });
    expect(defaultCellForField(databaseFieldById(db, 'fDate')!)).toEqual({
      type: 'date',
      date: null,
    });
    expect(defaultCellForField(databaseFieldById(db, 'fUrl')!)).toEqual({ type: 'url', url: null });
    expect(defaultCellForField(databaseFieldById(db, 'fFile')!)).toEqual({
      type: 'file',
      file: null,
    });
    expect(defaultCellForField(databaseFieldById(db, 'fRel')!)).toEqual({
      type: 'relation',
      recordIds: [],
    });
    expect(defaultCellForField(databaseFieldById(db, 'fStatus')!)).toEqual({
      type: 'status',
      optionId: null,
    });
  });

  it('rejects duplicate field ids and duplicate field names', () => {
    const db = withFieldAdded(
      emptyDatabase(),
      fieldInput({ id: 'fA', name: 'Same', type: 'text' }),
      NOW,
    );
    expect(() =>
      withFieldAdded(db, fieldInput({ id: 'fA', name: 'Other', type: 'text' }), NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withFieldAdded(db, fieldInput({ id: 'fB', name: 'Same', type: 'text' }), NOW),
    ).toThrow(CanvasValidationError);
  });

  it('rejects an unsupported field type such as formula', () => {
    expect(() =>
      withFieldAdded(
        emptyDatabase(),
        { id: 'fF', name: 'F', type: 'formula' } as unknown as CreateCanvasDatabaseFieldInput,
        NOW,
      ),
    ).toThrow(CanvasValidationError);
  });

  it('enforces the field-count bound', () => {
    let db = emptyDatabase();
    for (let i = 0; i < CANVAS_DATABASE_MAX_FIELDS; i += 1) {
      db = withFieldAdded(db, fieldInput({ id: 'f' + i, name: 'N' + i, type: 'text' }), NOW);
    }
    expect(() =>
      withFieldAdded(db, fieldInput({ id: 'fOver', name: 'Over', type: 'text' }), NOW),
    ).toThrow(CanvasValidationError);
  });

  it('requires options for select, multi-select and status fields', () => {
    const db = emptyDatabase();
    expect(() => withFieldAdded(db, fieldInput({ id: 's1', type: 'select' }), NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() => withFieldAdded(db, fieldInput({ id: 's2', type: 'status' }), NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withFieldAdded(
        db,
        fieldInput({
          id: 's3',
          type: 'multi-select',
          options: [{ id: 'a', label: 'A', color: '#ffffff' }],
        }),
        NOW,
      ),
    ).not.toThrow();
  });

  it('rejects malformed options (bad id, bad color, duplicate option id, oversize)', () => {
    const db = emptyDatabase();
    expect(() =>
      withFieldAdded(
        db,
        fieldInput({
          id: 's1',
          type: 'select',
          options: [{ id: 'bad id!', label: 'A', color: '#ffffff' }],
        }),
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withFieldAdded(
        db,
        fieldInput({ id: 's2', type: 'select', options: [{ id: 'a', label: 'A', color: 'red' }] }),
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withFieldAdded(
        db,
        fieldInput({
          id: 's3',
          type: 'select',
          options: [
            { id: 'a', label: 'A', color: '#ffffff' },
            { id: 'a', label: 'B', color: '#000000' },
          ],
        }),
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    const tooMany = Array.from({ length: CANVAS_DATABASE_MAX_OPTIONS + 1 }, (_, i) => ({
      id: 'o' + i,
      label: 'O' + i,
      color: '#ffffff',
    }));
    expect(() =>
      withFieldAdded(db, fieldInput({ id: 's4', type: 'select', options: tooMany }), NOW),
    ).toThrow(CanvasValidationError);
  });

  it('rejects options on field types that do not support them', () => {
    expect(() =>
      withFieldAdded(
        emptyDatabase(),
        fieldInput({ id: 't1', type: 'text', options: selectOptions() }),
        NOW,
      ),
    ).toThrow(CanvasValidationError);
  });

  it('requires a related database id for relation fields and forbids it otherwise', () => {
    const db = emptyDatabase();
    expect(() => withFieldAdded(db, fieldInput({ id: 'rel', type: 'relation' }), NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withFieldAdded(
        db,
        fieldInput({ id: 'txt', type: 'text', relatedDatabaseId: 'dbOther' }),
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withFieldAdded(
        db,
        fieldInput({ id: 'rel2', type: 'relation', relatedDatabaseId: 'dbOther' }),
        NOW,
      ),
    ).not.toThrow();
  });

  it('renames a field and removes a field, cleaning up dependent cells', () => {
    let db = seededDatabase();
    db = withFieldRenamed(db, 'fName', 'Title', LATER);
    expect(databaseFieldById(db, 'fName')!.name).toBe('Title');
    db = withFieldRemoved(db, 'fScore', LATER);
    expect(databaseFieldById(db, 'fScore')).toBeUndefined();
    const record = databaseRecordById(db, 'r1')!;
    expect(record.cells.fScore).toBeUndefined();
    expect(record.cells.fName).toEqual(textCell('Alpha'));
    expect(() => withFieldRemoved(db, 'fMissing', LATER)).toThrow(CanvasValidationError);
  });

  it('refuses to remove a field required by a kanban or calendar view', () => {
    let db = emptyDatabase();
    db = withFieldAdded(
      db,
      fieldInput({ id: 'fStatus', type: 'status', options: statusOptions() }),
      NOW,
    );
    db = withFieldAdded(db, fieldInput({ id: 'fDate', type: 'date' }), NOW);
    db = withViewAdded(
      db,
      { id: 'vKanban', name: 'Kanban', kind: 'kanban', kanbanFieldId: 'fStatus' },
      NOW,
    );
    db = withViewAdded(
      db,
      { id: 'vCalendar', name: 'Calendar', kind: 'calendar', calendarDateFieldId: 'fDate' },
      NOW,
    );

    expect(() => withFieldRemoved(db, 'fStatus', LATER)).toThrow(CanvasValidationError);
    expect(() => withFieldRemoved(db, 'fDate', LATER)).toThrow(CanvasValidationError);
    expect(databaseFieldById(db, 'fStatus')).toBeDefined();
    expect(databaseFieldById(db, 'fDate')).toBeDefined();
  });

  it('rejects transition timestamps older than the current database state', () => {
    const db = withFieldAdded(emptyDatabase(), fieldInput({ id: 'fName', type: 'text' }), LATER);
    expect(() => withFieldRenamed(db, 'fName', 'Earlier', NOW)).toThrow(CanvasValidationError);
  });

  it('createCanvasDatabaseField returns a frozen, validated field', () => {
    const field = createCanvasDatabaseField(fieldInput({ id: 'fX', type: 'text' }));
    expect(Object.isFrozen(field)).toBe(true);
    expect(field.type).toBe('text');
    expect(() => createCanvasDatabaseField(fieldInput({ id: 'bad id!', type: 'text' }))).toThrow(
      CanvasValidationError,
    );
  });
});
function allTypesDatabase(): CanvasDatabase {
  let db = emptyDatabase();
  db = withFieldAdded(db, fieldInput({ id: 'fText', name: 'Text', type: 'text' }), NOW);
  db = withFieldAdded(db, fieldInput({ id: 'fNum', name: 'Num', type: 'number' }), NOW);
  db = withFieldAdded(db, fieldInput({ id: 'fCheck', name: 'Check', type: 'checkbox' }), NOW);
  db = withFieldAdded(
    db,
    fieldInput({ id: 'fSelect', name: 'Select', type: 'select', options: selectOptions() }),
    NOW,
  );
  db = withFieldAdded(
    db,
    fieldInput({ id: 'fMulti', name: 'Multi', type: 'multi-select', options: selectOptions() }),
    NOW,
  );
  db = withFieldAdded(db, fieldInput({ id: 'fDate', name: 'Date', type: 'date' }), NOW);
  db = withFieldAdded(db, fieldInput({ id: 'fUrl', name: 'Url', type: 'url' }), NOW);
  db = withFieldAdded(db, fieldInput({ id: 'fFile', name: 'File', type: 'file' }), NOW);
  db = withFieldAdded(
    db,
    fieldInput({ id: 'fRel', name: 'Rel', type: 'relation', relatedDatabaseId: 'dbOther' }),
    NOW,
  );
  db = withFieldAdded(
    db,
    fieldInput({ id: 'fStatus', name: 'Status', type: 'status', options: statusOptions() }),
    NOW,
  );
  return db;
}

function fullCells(): Record<string, CanvasDatabaseCellValue> {
  return {
    fText: textCell('hello'),
    fNum: numberCell(3),
    fCheck: checkboxCell(true),
    fSelect: selectCell('optLow'),
    fMulti: multiSelectCell(['optLow', 'optHigh']),
    fDate: dateCell('2026-07-28'),
    fUrl: urlCell('https://example.com'),
    fFile: fileCell({ name: 'a.png', mimeType: 'image/png', size: 100 }),
    fRel: relationCell(['recA']),
    fStatus: statusCell('stTodo'),
  };
}

describe('CANVAS-524..530: records add/remove/update with fail-closed validation', () => {
  it('adds a record, fills missing cells with defaults, and stays deterministic', () => {
    const db = allTypesDatabase();
    const next = withRecordAdded(db, { id: 'r1', cells: { fText: textCell('x') } }, LATER);
    const record = databaseRecordById(next, 'r1')!;
    expect(record.cells.fText).toEqual(textCell('x'));
    expect(record.cells.fNum).toEqual(numberCell(0));
    expect(record.cells.fCheck).toEqual(checkboxCell(false));
    expect(record.cells.fSelect).toEqual(selectCell(null));
    expect(record.cells.fMulti).toEqual(multiSelectCell([]));
    expect(record.cells.fDate).toEqual(dateCell(null));
    expect(record.cells.fUrl).toEqual(urlCell(null));
    expect(record.cells.fFile).toEqual(fileCell(null));
    expect(record.cells.fRel).toEqual(relationCell([]));
    expect(record.cells.fStatus).toEqual(statusCell(null));
    expect(next.recordOrder).toEqual(['r1']);
    expect(next.localRevision).toBe(db.localRevision + 1);
    expect(Object.isFrozen(record)).toBe(true);
    expect(db.records).toHaveLength(0);
  });

  it('rejects duplicate record ids', () => {
    let db = withRecordAdded(allTypesDatabase(), { id: 'r1', cells: fullCells() }, NOW);
    expect(() => withRecordAdded(db, { id: 'r1', cells: fullCells() }, NOW)).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects unknown field ids and mismatched cell type tags in cells', () => {
    const db = allTypesDatabase();
    expect(() => withRecordAdded(db, { id: 'r1', cells: { fNope: textCell('x') } }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() => withRecordAdded(db, { id: 'r1', cells: { fText: numberCell(1) } }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withRecordAdded(
        db,
        {
          id: 'r1',
          cells: { fText: { type: 'text', text: 5 } as unknown as CanvasDatabaseCellValue },
        },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
  });

  it('enforces the record-count bound', () => {
    let db = withFieldAdded(emptyDatabase(), fieldInput({ id: 'fT', type: 'text' }), NOW);
    for (let i = 0; i < CANVAS_DATABASE_MAX_RECORDS; i += 1) {
      db = withRecordAdded(db, { id: 'r' + i, cells: { fT: textCell('v' + i) } }, NOW);
    }
    expect(() => withRecordAdded(db, { id: 'rOver', cells: { fT: textCell('x') } }, NOW)).toThrow(
      CanvasValidationError,
    );
  });

  it('validates text values (control characters and oversize rejected)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fText: textCell('bad\u0001') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fText: textCell('a'.repeat(100_001)) } }, NOW),
    ).toThrow(CanvasValidationError);
  });

  it('validates number values (non-finite rejected)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fNum: numberCell(Number.NaN) } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fNum: numberCell(Number.POSITIVE_INFINITY) } }, NOW),
    ).toThrow(CanvasValidationError);
  });

  it('validates select and status values against their options', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fSelect: selectCell('optNope') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fStatus: statusCell('stNope') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fSelect: selectCell(null) } }, NOW),
    ).not.toThrow();
  });

  it('validates multi-select values (unknown option, duplicate, oversize)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fMulti: multiSelectCell(['optNope']) } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(
        db,
        { id: 'r1', cells: { fMulti: multiSelectCell(['optLow', 'optLow']) } },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    const manyOptions = Array.from({ length: CANVAS_DATABASE_MAX_MULTI_SELECT + 1 }, (_, i) => ({
      id: 'm' + i,
      label: 'M' + i,
      color: '#ffffff',
    }));
    let big = withFieldAdded(
      emptyDatabase(),
      fieldInput({ id: 'fBig', name: 'Big', type: 'multi-select', options: manyOptions }),
      NOW,
    );
    const allIds = manyOptions.map((o) => o.id);
    expect(() =>
      withRecordAdded(big, { id: 'r1', cells: { fBig: multiSelectCell(allIds) } }, NOW),
    ).toThrow(CanvasValidationError);
  });

  it('validates date values (invalid calendar dates rejected, valid accepted)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fDate: dateCell('2026-02-30') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fDate: dateCell('not-a-date') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fDate: dateCell('2026-7-8') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fDate: dateCell('2024-02-29') } }, NOW),
    ).not.toThrow();
  });

  it('validates url values fail-closed (unsafe schemes rejected, safe accepted)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fUrl: urlCell('javascript:alert(1)') } }, NOW),
    ).toThrow();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fUrl: urlCell('data:text/html,<script>') } }, NOW),
    ).toThrow();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fUrl: urlCell('//evil.com') } }, NOW),
    ).toThrow();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fUrl: urlCell('https://example.com/x') } }, NOW),
    ).not.toThrow();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fUrl: urlCell(null) } }, NOW),
    ).not.toThrow();
  });

  it('validates file values (mime type, size and name bounds)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(
        db,
        {
          id: 'r1',
          cells: {
            fFile: fileCell({ name: 'a.bin', mimeType: 'application/x-msdownload', size: 10 }),
          },
        },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(
        db,
        { id: 'r1', cells: { fFile: fileCell({ name: 'a.png', mimeType: 'image/png', size: 0 }) } },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(
        db,
        {
          id: 'r1',
          cells: { fFile: fileCell({ name: 'a.png', mimeType: 'image/png', size: 10_000_001 }) },
        },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(
        db,
        { id: 'r1', cells: { fFile: fileCell({ name: '', mimeType: 'image/png', size: 10 }) } },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordAdded(
        db,
        {
          id: 'r1',
          cells: { fFile: fileCell({ name: 'a.png', mimeType: 'image/png', size: 10 }) },
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it('validates relation cell shape (bad ids and oversize rejected)', () => {
    const db = allTypesDatabase();
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fRel: relationCell(['bad id!']) } }, NOW),
    ).toThrow(CanvasValidationError);
    const tooMany = Array.from(
      { length: CANVAS_DATABASE_MAX_RELATION_RECORDS + 1 },
      (_, i) => 'rec' + i,
    );
    expect(() =>
      withRecordAdded(db, { id: 'r1', cells: { fRel: relationCell(tooMany) } }, NOW),
    ).toThrow(CanvasValidationError);
  });

  it('removes a record and cleans relation references in other records', () => {
    let db = withFieldAdded(
      emptyDatabase(),
      fieldInput({ id: 'fRel', type: 'relation', relatedDatabaseId: 'db1' }),
      NOW,
    );
    db = withRecordAdded(db, { id: 'rTarget', cells: {} }, NOW);
    db = withRecordAdded(db, { id: 'rRef', cells: { fRel: relationCell(['rTarget']) } }, NOW);
    expect(databaseRecordById(db, 'rRef')!.cells.fRel).toEqual(relationCell(['rTarget']));
    db = withRecordRemoved(db, 'rTarget', LATER);
    expect(databaseRecordById(db, 'rTarget')).toBeUndefined();
    expect(databaseRecordById(db, 'rRef')!.cells.fRel).toEqual(relationCell([]));
    expect(() => withRecordRemoved(db, 'rMissing', LATER)).toThrow(CanvasValidationError);
  });

  it('does not delete coincidentally matching references into another database', () => {
    let db = withFieldAdded(
      emptyDatabase(),
      fieldInput({ id: 'fExternal', type: 'relation', relatedDatabaseId: 'dbOther' }),
      NOW,
    );
    db = withRecordAdded(db, { id: 'rTarget', cells: {} }, NOW);
    db = withRecordAdded(db, { id: 'rRef', cells: { fExternal: relationCell(['rTarget']) } }, NOW);

    db = withRecordRemoved(db, 'rTarget', LATER);
    expect(databaseRecordById(db, 'rRef')!.cells.fExternal).toEqual(relationCell(['rTarget']));
  });

  it('updates a single cell with validation', () => {
    let db = withRecordAdded(allTypesDatabase(), { id: 'r1', cells: fullCells() }, NOW);
    db = withRecordCellUpdated(db, 'r1', 'fNum', numberCell(99), LATER);
    expect(databaseRecordById(db, 'r1')!.cells.fNum).toEqual(numberCell(99));
    expect(() => withRecordCellUpdated(db, 'r1', 'fNum', textCell('x'), LATER)).toThrow(
      CanvasValidationError,
    );
    expect(() => withRecordCellUpdated(db, 'rMissing', 'fNum', numberCell(1), LATER)).toThrow(
      CanvasValidationError,
    );
    expect(() => withRecordCellUpdated(db, 'r1', 'fNope', numberCell(1), LATER)).toThrow(
      CanvasValidationError,
    );
  });
});

describe('CANVAS-518..523: views and their deterministic projections', () => {
  it('adds table, cards and list views with minimal config', () => {
    let db = seededDatabase();
    db = withViewAdded(db, { id: 'vTable', name: 'Table', kind: 'table' }, NOW);
    db = withViewAdded(db, { id: 'vCards', name: 'Cards', kind: 'cards' }, NOW);
    db = withViewAdded(db, { id: 'vList', name: 'List', kind: 'list' }, NOW);
    expect(db.views).toHaveLength(3);
    expect(databaseViewById(db, 'vTable')!.kind).toBe('table');
  });

  it('requires a select or status grouping field for kanban views', () => {
    const db = seededDatabase();
    expect(() => withViewAdded(db, { id: 'vK', name: 'K', kind: 'kanban' }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withViewAdded(db, { id: 'vK', name: 'K', kind: 'kanban', kanbanFieldId: 'fName' }, NOW),
    ).toThrow(CanvasValidationError);
    let withStatus = withFieldAdded(
      db,
      fieldInput({ id: 'fStatus', name: 'Status', type: 'status', options: statusOptions() }),
      NOW,
    );
    expect(() =>
      withViewAdded(
        withStatus,
        { id: 'vK', name: 'K', kind: 'kanban', kanbanFieldId: 'fStatus' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('requires a date field for calendar views (calendar prerequisite)', () => {
    const db = seededDatabase();
    expect(() => withViewAdded(db, { id: 'vC', name: 'C', kind: 'calendar' }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withViewAdded(
        db,
        { id: 'vC', name: 'C', kind: 'calendar', calendarDateFieldId: 'fName' },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
    const withDate = withFieldAdded(db, fieldInput({ id: 'fDue', name: 'Due', type: 'date' }), NOW);
    expect(() =>
      withViewAdded(
        withDate,
        { id: 'vC', name: 'C', kind: 'calendar', calendarDateFieldId: 'fDue' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('rejects duplicate view ids and names, an unknown kind, and enforces the view bound', () => {
    let db = withViewAdded(seededDatabase(), { id: 'v1', name: 'One', kind: 'table' }, NOW);
    expect(() => withViewAdded(db, { id: 'v1', name: 'Two', kind: 'table' }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() => withViewAdded(db, { id: 'v2', name: 'One', kind: 'table' }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withViewAdded(db, { id: 'v3', name: 'Three', kind: 'grid' as never } as never, NOW),
    ).toThrow(CanvasValidationError);
    let many = seededDatabase();
    for (let i = 0; i < CANVAS_DATABASE_MAX_VIEWS; i += 1) {
      many = withViewAdded(many, { id: 'v' + i, name: 'V' + i, kind: 'table' }, NOW);
    }
    expect(() => withViewAdded(many, { id: 'vOver', name: 'Over', kind: 'table' }, NOW)).toThrow(
      CanvasValidationError,
    );
  });

  it('removes views and validates unknown ids', () => {
    let db = withViewAdded(seededDatabase(), { id: 'v1', name: 'One', kind: 'table' }, NOW);
    db = withViewRemoved(db, 'v1', LATER);
    expect(databaseViewById(db, 'v1')).toBeUndefined();
    expect(() => withViewRemoved(db, 'vMissing', LATER)).toThrow(CanvasValidationError);
  });

  it('updates view config with bounded sort, filters, hidden fields and column widths', () => {
    let db = seededDatabase();
    db = withViewAdded(db, { id: 'v1', name: 'One', kind: 'table' }, NOW);
    db = withViewUpdated(
      db,
      'v1',
      {
        sortRules: [{ fieldId: 'fScore', direction: 'desc' }],
        hiddenFieldIds: ['fScore'],
        columnWidths: { fName: 240 },
      },
      LATER,
    );
    const view = databaseViewById(db, 'v1')!;
    expect(view.sortRules).toEqual([{ fieldId: 'fScore', direction: 'desc' }]);
    expect(view.hiddenFieldIds).toEqual(['fScore']);
    expect(view.columnWidths.fName).toBe(240);
    expect(() => withViewUpdated(db, 'v1', { hiddenFieldIds: ['fNope'] }, LATER)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withViewUpdated(
        db,
        'v1',
        { columnWidths: { fName: CANVAS_DATABASE_MAX_COLUMN_WIDTH + 1 } },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withViewUpdated(
        db,
        'v1',
        { columnWidths: { fName: CANVAS_DATABASE_MIN_COLUMN_WIDTH - 1 } },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    const tooManySorts = Array.from({ length: CANVAS_DATABASE_MAX_SORT_RULES + 1 }, (_, i) => ({
      fieldId: 'fName',
      direction: 'asc' as const,
    }));
    expect(() => withViewUpdated(db, 'v1', { sortRules: tooManySorts }, LATER)).toThrow(
      CanvasValidationError,
    );
    const tooManyFilters = Array.from({ length: CANVAS_DATABASE_MAX_FILTERS + 1 }, () => ({
      fieldId: 'fName',
      operator: 'isEmpty' as const,
    }));
    expect(() => withViewUpdated(db, 'v1', { filters: tooManyFilters }, LATER)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withViewUpdated(
        db,
        'v1',
        {
          sortRules: [
            { fieldId: 'fName', direction: 'asc' },
            { fieldId: 'fName', direction: 'desc' },
          ],
        },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
  });
});
function projectionDatabase(): CanvasDatabase {
  let db = emptyDatabase();
  db = withFieldAdded(db, fieldInput({ id: 'fName', name: 'Name', type: 'text' }), NOW);
  db = withFieldAdded(db, fieldInput({ id: 'fScore', name: 'Score', type: 'number' }), NOW);
  db = withFieldAdded(
    db,
    fieldInput({ id: 'fStatus', name: 'Status', type: 'status', options: statusOptions() }),
    NOW,
  );
  db = withFieldAdded(db, fieldInput({ id: 'fDue', name: 'Due', type: 'date' }), NOW);
  const rows: Array<{
    id: string;
    name: string;
    score: number;
    status: string;
    due: string | null;
  }> = [
    { id: 'r1', name: 'Alpha', score: 10, status: 'stTodo', due: '2026-07-01' },
    { id: 'r2', name: 'Beta', score: 30, status: 'stDone', due: '2026-07-03' },
    { id: 'r3', name: 'Gamma', score: 20, status: 'stTodo', due: '2026-07-02' },
    { id: 'r4', name: 'Delta', score: 30, status: 'stDone', due: null },
  ];
  for (const row of rows) {
    db = withRecordAdded(
      db,
      {
        id: row.id,
        cells: {
          fName: textCell(row.name),
          fScore: numberCell(row.score),
          fStatus: statusCell(row.status),
          fDue: dateCell(row.due),
        },
      },
      NOW,
    );
  }
  return db;
}

describe('CANVAS-518..523 + 524..527: deterministic projections reflect live records', () => {
  it('projects a table view with visible columns and default record order', () => {
    const db = projectionDatabase();
    const withView = withViewAdded(db, { id: 'vT', name: 'T', kind: 'table' }, NOW);
    const projection = projectDatabaseView(withView, 'vT');
    expect(projection.kind).toBe('table');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(projection.columns.map((col) => col.fieldId)).toEqual([
      'fName',
      'fScore',
      'fStatus',
      'fDue',
    ]);
  });

  it('projections update when records are added or removed', () => {
    let db = projectionDatabase();
    db = withViewAdded(db, { id: 'vT', name: 'T', kind: 'table' }, NOW);
    let projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows).toHaveLength(4);
    db = withRecordAdded(db, { id: 'r5', cells: { fName: textCell('Echo') } }, LATER);
    projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows.map((r) => r.id)).toContain('r5');
    db = withRecordRemoved(db, 'r1', LATER);
    projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows.map((r) => r.id)).not.toContain('r1');
  });

  it('sorts deterministically with a stable record-id tie-break', () => {
    let db = projectionDatabase();
    db = withViewAdded(
      db,
      { id: 'vT', name: 'T', kind: 'table', sortRules: [{ fieldId: 'fScore', direction: 'desc' }] },
      NOW,
    );
    const desc = projectDatabaseView(db, 'vT');
    if (desc.kind !== 'table') throw new Error('expected table projection');
    expect(desc.rows.map((r) => r.id)).toEqual(['r2', 'r4', 'r3', 'r1']);
    const asc = withViewUpdated(
      db,
      'vT',
      { sortRules: [{ fieldId: 'fScore', direction: 'asc' }] },
      LATER,
    );
    const ascProjection = projectDatabaseView(asc, 'vT');
    if (ascProjection.kind !== 'table') throw new Error('expected table projection');
    expect(ascProjection.rows.map((r) => r.id)).toEqual(['r1', 'r3', 'r2', 'r4']);
    const again = projectDatabaseView(asc, 'vT');
    expect(again).toEqual(ascProjection);
  });

  it('filters records with bounded operators', () => {
    let db = projectionDatabase();
    db = withViewAdded(
      db,
      {
        id: 'vT',
        name: 'T',
        kind: 'table',
        filters: [{ fieldId: 'fScore', operator: 'greaterThan', value: 15 }],
      },
      NOW,
    );
    let projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r4']);
    db = withViewUpdated(
      db,
      'vT',
      { filters: [{ fieldId: 'fStatus', operator: 'is', value: 'stTodo' }] },
      LATER,
    );
    projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows.map((r) => r.id)).toEqual(['r1', 'r3']);
    db = withViewUpdated(db, 'vT', { filters: [{ fieldId: 'fDue', operator: 'isEmpty' }] }, LATER);
    projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.rows.map((r) => r.id)).toEqual(['r4']);
  });

  it('hides fields and applies column widths in the projection', () => {
    let db = projectionDatabase();
    db = withViewAdded(
      db,
      {
        id: 'vT',
        name: 'T',
        kind: 'table',
        hiddenFieldIds: ['fScore'],
        columnWidths: { fName: 320 },
      },
      NOW,
    );
    const projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.columns.map((col) => col.fieldId)).toEqual(['fName', 'fStatus', 'fDue']);
    const nameColumn = projection.columns.find((col) => col.fieldId === 'fName')!;
    expect(nameColumn.width).toBe(320);
    for (const col of projection.columns) {
      expect(col.width).toBeGreaterThanOrEqual(CANVAS_DATABASE_MIN_COLUMN_WIDTH);
      expect(col.width).toBeLessThanOrEqual(CANVAS_DATABASE_MAX_COLUMN_WIDTH);
    }
  });

  it('groups table rows by a field in a deterministic option order', () => {
    let db = projectionDatabase();
    db = withViewAdded(db, { id: 'vT', name: 'T', kind: 'table', groupByFieldId: 'fStatus' }, NOW);
    const projection = projectDatabaseView(db, 'vT');
    if (projection.kind !== 'table') throw new Error('expected table projection');
    expect(projection.groups.map((g) => g.key)).toEqual(['stTodo', 'stDone']);
    expect(projection.groups[0].recordIds).toEqual(['r1', 'r3']);
    expect(projection.groups[1].recordIds).toEqual(['r2', 'r4']);
    expect(projection.rows.map((r) => r.id)).toEqual(['r1', 'r3', 'r2', 'r4']);
  });

  it('projects cards and list views as ordered records', () => {
    let db = projectionDatabase();
    db = withViewAdded(
      db,
      { id: 'vC', name: 'C', kind: 'cards', sortRules: [{ fieldId: 'fName', direction: 'asc' }] },
      NOW,
    );
    db = withViewAdded(db, { id: 'vL', name: 'L', kind: 'list' }, NOW);
    const cards = projectDatabaseView(db, 'vC');
    if (cards.kind !== 'cards') throw new Error('expected cards projection');
    expect(cards.cards.map((r) => r.id)).toEqual(['r1', 'r2', 'r4', 'r3']);
    const list = projectDatabaseView(db, 'vL');
    if (list.kind !== 'list') throw new Error('expected list projection');
    expect(list.items.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('projects a kanban view into deterministic option columns', () => {
    let db = projectionDatabase();
    db = withViewAdded(db, { id: 'vK', name: 'K', kind: 'kanban', kanbanFieldId: 'fStatus' }, NOW);
    const projection = projectDatabaseView(db, 'vK');
    if (projection.kind !== 'kanban') throw new Error('expected kanban projection');
    expect(projection.columns.map((col) => col.optionId)).toEqual(['stTodo', 'stDone', null]);
    const todo = projection.columns.find((col) => col.optionId === 'stTodo')!;
    expect(todo.records.map((r) => r.id)).toEqual(['r1', 'r3']);
    const done = projection.columns.find((col) => col.optionId === 'stDone')!;
    expect(done.records.map((r) => r.id)).toEqual(['r2', 'r4']);
  });

  it('projects a calendar view grouped by date with unscheduled last', () => {
    let db = projectionDatabase();
    db = withViewAdded(
      db,
      { id: 'vCal', name: 'Cal', kind: 'calendar', calendarDateFieldId: 'fDue' },
      NOW,
    );
    const projection = projectDatabaseView(db, 'vCal');
    if (projection.kind !== 'calendar') throw new Error('expected calendar projection');
    expect(projection.entries.map((e) => e.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      null,
    ]);
    expect(projection.entries[0].records.map((r) => r.id)).toEqual(['r1']);
    expect(projection.entries[3].records.map((r) => r.id)).toEqual(['r4']);
  });

  it('rejects projecting an unknown view', () => {
    expect(() => projectDatabaseView(projectionDatabase(), 'vMissing')).toThrow(
      CanvasValidationError,
    );
  });
});

describe('CANVAS-524..526: filter evaluation is bounded and deterministic', () => {
  function fieldAndCell() {
    const db = allTypesDatabase();
    return {
      text: databaseFieldById(db, 'fText')!,
      num: databaseFieldById(db, 'fNum')!,
      check: databaseFieldById(db, 'fCheck')!,
      select: databaseFieldById(db, 'fSelect')!,
      multi: databaseFieldById(db, 'fMulti')!,
      date: databaseFieldById(db, 'fDate')!,
      url: databaseFieldById(db, 'fUrl')!,
      file: databaseFieldById(db, 'fFile')!,
      rel: databaseFieldById(db, 'fRel')!,
      status: databaseFieldById(db, 'fStatus')!,
    };
  }

  it('evaluates text, number, checkbox, select, multi-select, date, url, file and relation filters', () => {
    const f = fieldAndCell();
    expect(
      evaluateDatabaseFilter(f.text, textCell('Hello World'), {
        fieldId: 'fText',
        operator: 'contains',
        value: 'World',
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.text, textCell('Hello'), {
        fieldId: 'fText',
        operator: 'contains',
        value: 'xyz',
      }),
    ).toBe(false);
    expect(
      evaluateDatabaseFilter(f.num, numberCell(10), {
        fieldId: 'fNum',
        operator: 'greaterThan',
        value: 5,
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.num, numberCell(3), {
        fieldId: 'fNum',
        operator: 'greaterThan',
        value: 5,
      }),
    ).toBe(false);
    expect(
      evaluateDatabaseFilter(f.check, checkboxCell(true), {
        fieldId: 'fCheck',
        operator: 'is',
        value: true,
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.select, selectCell('optLow'), {
        fieldId: 'fSelect',
        operator: 'is',
        value: 'optLow',
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.select, selectCell('optHigh'), {
        fieldId: 'fSelect',
        operator: 'isNot',
        value: 'optLow',
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.multi, multiSelectCell(['optLow']), {
        fieldId: 'fMulti',
        operator: 'contains',
        value: 'optLow',
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.date, dateCell('2026-07-28'), {
        fieldId: 'fDate',
        operator: 'before',
        value: '2027-01-01',
      }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.date, dateCell('2026-07-28'), {
        fieldId: 'fDate',
        operator: 'after',
        value: '2027-01-01',
      }),
    ).toBe(false);
    expect(
      evaluateDatabaseFilter(f.url, urlCell(null), { fieldId: 'fUrl', operator: 'isEmpty' }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.file, fileCell(null), { fieldId: 'fFile', operator: 'isEmpty' }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.rel, relationCell([]), { fieldId: 'fRel', operator: 'isEmpty' }),
    ).toBe(true);
    expect(
      evaluateDatabaseFilter(f.rel, relationCell(['recA']), {
        fieldId: 'fRel',
        operator: 'isNotEmpty',
      }),
    ).toBe(true);
  });

  it('rejects operators that do not apply to a field type and mismatched field ids', () => {
    const f = fieldAndCell();
    expect(() =>
      evaluateDatabaseFilter(f.text, textCell('x'), {
        fieldId: 'fText',
        operator: 'greaterThan',
        value: 1,
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      evaluateDatabaseFilter(f.num, numberCell(1), {
        fieldId: 'fWrong',
        operator: 'greaterThan',
        value: 1,
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      evaluateDatabaseFilter(f.check, checkboxCell(true), {
        fieldId: 'fCheck',
        operator: 'contains',
        value: 'x',
      }),
    ).toThrow(CanvasValidationError);
  });

  it('rejects malformed filter operands instead of coercing them', () => {
    const f = fieldAndCell();
    expect(() =>
      evaluateDatabaseFilter(f.num, numberCell(1), {
        fieldId: 'fNum',
        operator: 'greaterThan',
        value: 'not-a-number',
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      evaluateDatabaseFilter(f.check, checkboxCell(true), {
        fieldId: 'fCheck',
        operator: 'is',
        value: 'true',
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      evaluateDatabaseFilter(f.date, dateCell('2026-07-28'), {
        fieldId: 'fDate',
        operator: 'before',
        value: '2026-02-30',
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      evaluateDatabaseFilter(f.select, selectCell('optLow'), {
        fieldId: 'fSelect',
        operator: 'is',
        value: 'optMissing',
      }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      evaluateDatabaseFilter(f.text, textCell('x'), {
        fieldId: 'fText',
        operator: 'isEmpty',
        value: 'unexpected',
      }),
    ).toThrow(CanvasValidationError);
  });
});
describe('CANVAS-531: record templates', () => {
  it('adds a validated template with defaults filled and creates records from it', () => {
    let db = seededDatabase();
    db = withTemplateAdded(db, { id: 'tpl1', name: 'T1', cells: { fName: textCell('New') } }, NOW);
    const template = db.templates.find((t) => t.id === 'tpl1')!;
    expect(template.cells.fName).toEqual(textCell('New'));
    expect(template.cells.fScore).toEqual(numberCell(0));
    db = withRecordFromTemplate(db, 'tpl1', 'rNew', LATER);
    const record = databaseRecordById(db, 'rNew')!;
    expect(record.cells.fName).toEqual(textCell('New'));
    expect(record.cells.fScore).toEqual(numberCell(0));
  });

  it('rejects duplicate template ids and names and malformed template cells', () => {
    let db = withTemplateAdded(
      seededDatabase(),
      { id: 'tpl1', name: 'T1', cells: { fName: textCell('A') } },
      NOW,
    );
    expect(() => withTemplateAdded(db, { id: 'tpl1', name: 'Other', cells: {} }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() => withTemplateAdded(db, { id: 'tpl2', name: 'T1', cells: {} }, NOW)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      withTemplateAdded(db, { id: 'tpl3', name: 'T3', cells: { fNope: textCell('x') } }, NOW),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withTemplateAdded(db, { id: 'tpl4', name: 'T4', cells: { fScore: textCell('x') } }, NOW),
    ).toThrow(CanvasValidationError);
  });

  it('enforces the template bound and removes templates', () => {
    let db = seededDatabase();
    for (let i = 0; i < CANVAS_DATABASE_MAX_TEMPLATES; i += 1) {
      db = withTemplateAdded(db, { id: 'tpl' + i, name: 'T' + i, cells: {} }, NOW);
    }
    expect(() => withTemplateAdded(db, { id: 'tplOver', name: 'Over', cells: {} }, NOW)).toThrow(
      CanvasValidationError,
    );
    db = withTemplateRemoved(db, 'tpl0', LATER);
    expect(db.templates.find((t) => t.id === 'tpl0')).toBeUndefined();
    expect(() => withTemplateRemoved(db, 'tplMissing', LATER)).toThrow(CanvasValidationError);
  });

  it('rejects creating a record from an unknown template or with a duplicate id', () => {
    let db = withTemplateAdded(seededDatabase(), { id: 'tpl1', name: 'T1', cells: {} }, NOW);
    expect(() => withRecordFromTemplate(db, 'tplMissing', 'rNew', LATER)).toThrow(
      CanvasValidationError,
    );
    expect(() => withRecordFromTemplate(db, 'tpl1', 'r1', LATER)).toThrow(CanvasValidationError);
  });

  it('cleans template cells when a field is removed', () => {
    let db = seededDatabase();
    db = withTemplateAdded(db, { id: 'tpl1', name: 'T1', cells: { fScore: numberCell(5) } }, NOW);
    db = withFieldRemoved(db, 'fScore', LATER);
    expect(db.templates.find((t) => t.id === 'tpl1')!.cells.fScore).toBeUndefined();
  });
});

describe('CANVAS-532: links from records to Canvas objects, scope fail-closed', () => {
  it('links and unlinks Canvas objects within the same account and project', () => {
    let db = seededDatabase();
    db = withRecordLinked(
      db,
      'r1',
      { kind: 'block', id: 'blockA', ownerId: OWNER, projectId: PROJECT },
      LATER,
    );
    db = withRecordLinked(
      db,
      'r1',
      { kind: 'document', id: 'docA', ownerId: OWNER, projectId: PROJECT },
      LATER,
    );
    const record = databaseRecordById(db, 'r1')!;
    expect(record.links).toHaveLength(2);
    expect(record.links[0]).toMatchObject({ kind: 'block', id: 'blockA' });
    db = withRecordUnlinked(db, 'r1', 'blockA', LATER);
    expect(databaseRecordById(db, 'r1')!.links.map((l) => l.id)).toEqual(['docA']);
  });

  it('rejects links whose account or project scope does not match', () => {
    const db = seededDatabase();
    expect(() =>
      withRecordLinked(
        db,
        'r1',
        { kind: 'block', id: 'blockA', ownerId: OTHER_OWNER, projectId: PROJECT },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordLinked(
        db,
        'r1',
        { kind: 'block', id: 'blockA', ownerId: OWNER, projectId: OTHER_PROJECT },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
  });

  it('rejects invalid link ids, unknown kinds, duplicates and unknown records', () => {
    const db = seededDatabase();
    expect(() =>
      withRecordLinked(
        db,
        'r1',
        { kind: 'block', id: 'bad id!', ownerId: OWNER, projectId: PROJECT },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordLinked(
        db,
        'r1',
        { kind: 'frame' as never, id: 'blockA', ownerId: OWNER, projectId: PROJECT } as never,
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    const linked = withRecordLinked(
      db,
      'r1',
      { kind: 'block', id: 'blockA', ownerId: OWNER, projectId: PROJECT },
      LATER,
    );
    expect(() =>
      withRecordLinked(
        linked,
        'r1',
        { kind: 'block', id: 'blockA', ownerId: OWNER, projectId: PROJECT },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordLinked(
        linked,
        'r1',
        { kind: 'document', id: 'blockA', ownerId: OWNER, projectId: PROJECT },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    expect(() =>
      withRecordLinked(
        db,
        'rMissing',
        { kind: 'block', id: 'blockA', ownerId: OWNER, projectId: PROJECT },
        LATER,
      ),
    ).toThrow(CanvasValidationError);
    expect(() => withRecordUnlinked(db, 'r1', 'blockMissing', LATER)).toThrow(
      CanvasValidationError,
    );
  });

  it('enforces the per-record link bound', () => {
    let db = seededDatabase();
    for (let i = 0; i < CANVAS_DATABASE_MAX_LINKS; i += 1) {
      db = withRecordLinked(
        db,
        'r1',
        { kind: 'block', id: 'b' + i, ownerId: OWNER, projectId: PROJECT },
        NOW,
      );
    }
    expect(() =>
      withRecordLinked(
        db,
        'r1',
        { kind: 'block', id: 'bOver', ownerId: OWNER, projectId: PROJECT },
        NOW,
      ),
    ).toThrow(CanvasValidationError);
  });
});

describe('CANVAS-514 + 533: relation references and account/project scope validate fail-closed', () => {
  function targetDatabase(ownerId: CanvasOwnerId, projectId: CanvasProjectId): CanvasDatabase {
    let db = createCanvasDatabase({
      id: 'dbTarget',
      ownerId,
      projectId,
      name: 'Target',
      now: NOW,
    });
    db = withFieldAdded(db, fieldInput({ id: 'fT', name: 'T', type: 'text' }), NOW);
    db = withRecordAdded(db, { id: 'recA', cells: { fT: textCell('a') } }, NOW);
    return db;
  }

  function sourceDatabase(referencedRecordId: string): CanvasDatabase {
    let db = emptyDatabase();
    db = withFieldAdded(
      db,
      fieldInput({ id: 'fRel', name: 'Rel', type: 'relation', relatedDatabaseId: 'dbTarget' }),
      NOW,
    );
    db = withRecordAdded(
      db,
      { id: 'r1', cells: { fRel: relationCell([referencedRecordId]) } },
      NOW,
    );
    return db;
  }

  it('accepts valid in-scope relation references', () => {
    const target = targetDatabase(OWNER, PROJECT);
    const source = sourceDatabase('recA');
    const result = validateDatabaseReferences(source, (id) =>
      id === 'dbTarget' ? target : undefined,
    );
    expect(result).toBe(source);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects a relation whose target database is missing', () => {
    const source = sourceDatabase('recA');
    expect(() => validateDatabaseReferences(source, () => undefined)).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects a relation whose target database is out of scope', () => {
    const outOfScope = targetDatabase(OTHER_OWNER, PROJECT);
    const source = sourceDatabase('recA');
    expect(() =>
      validateDatabaseReferences(source, (id) => (id === 'dbTarget' ? outOfScope : undefined)),
    ).toThrow(CanvasValidationError);
    const otherProject = targetDatabase(OWNER, OTHER_PROJECT);
    expect(() =>
      validateDatabaseReferences(source, (id) => (id === 'dbTarget' ? otherProject : undefined)),
    ).toThrow(CanvasValidationError);
  });

  it('rejects a relation referencing a record that does not exist in the target', () => {
    const target = targetDatabase(OWNER, PROJECT);
    const source = sourceDatabase('recMissing');
    expect(() =>
      validateDatabaseReferences(source, (id) => (id === 'dbTarget' ? target : undefined)),
    ).toThrow(CanvasValidationError);
  });

  it('asserts account and project scope explicitly', () => {
    const db = emptyDatabase();
    expect(assertDatabaseScope(db, OWNER, PROJECT)).toBe(db);
    expect(() => assertDatabaseScope(db, OTHER_OWNER, PROJECT)).toThrow(CanvasValidationError);
    expect(() => assertDatabaseScope(db, OWNER, OTHER_PROJECT)).toThrow(CanvasValidationError);
  });
});

describe('identity parsers and structural guards', () => {
  it('parses valid ids and rejects malformed ids for every database identifier', () => {
    expect(parseCanvasDatabaseId('db1')).toBe('db1');
    expect(parseCanvasDatabaseFieldId('fA')).toBe('fA');
    expect(parseCanvasDatabaseRecordId('r1')).toBe('r1');
    expect(parseCanvasDatabaseViewId('v1')).toBe('v1');
    expect(parseCanvasDatabaseTemplateId('tpl1')).toBe('tpl1');
    for (const parser of [
      parseCanvasDatabaseId,
      parseCanvasDatabaseFieldId,
      parseCanvasDatabaseRecordId,
      parseCanvasDatabaseViewId,
      parseCanvasDatabaseTemplateId,
    ]) {
      expect(() => parser('bad id!')).toThrow(CanvasValidationError);
      expect(() => parser(123 as unknown as string)).toThrow(CanvasValidationError);
    }
  });

  it('isCanvasDatabase rejects non-database values', () => {
    expect(isCanvasDatabase(null)).toBe(false);
    expect(isCanvasDatabase({})).toBe(false);
    expect(isCanvasDatabase('db')).toBe(false);
    expect(isCanvasDatabase([])).toBe(false);
    expect(isCanvasDatabase(emptyDatabase())).toBe(true);
    expect(isCanvasDatabase({ ...emptyDatabase(), fieldOrder: ['missing'] })).toBe(false);
    expect(
      isCanvasDatabase({
        ...emptyDatabase(),
        fields: [{ id: 'bad id!', name: 'Bad', type: 'text', options: [] }],
        fieldOrder: ['bad id!'],
      }),
    ).toBe(false);
    expect(
      isCanvasDatabase({
        ...emptyDatabase(),
        records: [{ id: 'r1', cells: {}, links: [], createdAt: NOW, updatedAt: NOW }],
        recordOrder: [],
      }),
    ).toBe(false);
  });

  it('deep-freezes nested records, fields, views and projections', () => {
    let db = seededDatabase();
    db = withViewAdded(db, { id: 'vT', name: 'T', kind: 'table' }, NOW);
    expect(Object.isFrozen(db.fields[0])).toBe(true);
    expect(Object.isFrozen(db.records[0])).toBe(true);
    expect(Object.isFrozen(db.records[0].cells)).toBe(true);
    expect(Object.isFrozen(db.views[0])).toBe(true);
    const projection = projectDatabaseView(db, 'vT');
    expect(Object.isFrozen(projection)).toBe(true);
    expect(() => {
      (db.records[0] as { id: string }).id = 'hacked';
    }).toThrow();
  });
});
