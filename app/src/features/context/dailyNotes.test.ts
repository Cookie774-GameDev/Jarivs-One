import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_CONTEXT_ACTIVITY_KINDS,
  DAILY_CONTEXT_SLASH_OPTIONS,
  buildDailyContextNotePlan,
  dailyContextActivityKindForEventType,
  dailyContextLocalDate,
  dailyContextSlashOperation,
  parseDailyContextTerminalCommand,
  planJarvisDailyContextChanges,
  shouldAutoOpenDailyContext,
  type DailyContextActivityRepositories,
  type DailyContextChangeReference,
  type DailyContextSettings,
} from './dailyNotes';

const NOW = Date.parse('2026-07-25T19:00:00.000Z');
const settings: DailyContextSettings = {
  accountId: 'account-1',
  mapId: 'map-1',
  folder: 'Context/Daily',
  dateFormat: 'YYYY-MM-DD',
  templateId: 'daily-default',
  autoOpen: 'project_open',
  projectScope: { kind: 'project', projectId: 'project-1' },
};
const request = { timestampMs: NOW, utcOffsetMinutes: 0, projectId: 'project-1' };
const references: DailyContextChangeReference[] = [
  { runId: 'run-1', eventSeq: 1 },
  { runId: 'run-2', eventSeq: 2 },
  { runId: 'run-3', eventSeq: 3 },
];

function repositories(
  overrides: {
    accountId?: string;
    projectId?: string;
    runStatus?: string;
    eventType?: string;
    eventCreatedAt?: number;
    eventSummary?: string;
    eventTitle?: unknown;
    omitEventTitle?: boolean;
  } = {},
): DailyContextActivityRepositories {
  return {
    run: {
      getById: vi.fn(async (accountId, runId) => ({
        id: runId,
        accountId: overrides.accountId ?? accountId,
        projectId: overrides.projectId ?? 'project-1',
        status: overrides.runStatus ?? 'completed',
        completedAt: Date.parse('2026-07-25T18:30:00.000Z'),
      })),
    },
    event: {
      getBySeq: vi.fn(async (_accountId, runId, seq) => {
        const event = {
          runId,
          seq,
          idempotencyKey: `${runId}-${seq}`,
          type: (overrides.eventType ?? 'artifact') as 'artifact',
          title: overrides.eventTitle ?? `Authoritative change ${seq}`,
          safeSummary: overrides.eventSummary ?? `Completed change ${seq}.`,
          createdAt: overrides.eventCreatedAt ?? Date.parse(`2026-07-25T1${seq + 4}:00:00.000Z`),
        };
        if (overrides.omitEventTitle) delete (event as Partial<typeof event>).title;
        return event as never;
      }),
    },
  };
}

describe('Daily Context Notes', () => {
  it('supports every frozen daily activity category', () => {
    expect(DAILY_CONTEXT_ACTIVITY_KINDS).toEqual([
      'development_log',
      'decision',
      'bug',
      'terminal_finding',
      'completed_work',
      'meeting_note',
      'research',
      'release_progress',
    ]);
    expect(
      [
        'tool',
        'approval',
        'warning',
        'terminal',
        'run_state',
        'message',
        'retrieval',
        'artifact',
      ].map((type) =>
        dailyContextActivityKindForEventType(
          type as Parameters<typeof dailyContextActivityKindForEventType>[0],
        ),
      ),
    ).toEqual(DAILY_CONTEXT_ACTIVITY_KINDS);
    expect(dailyContextActivityKindForEventType('model')).toBeNull();
  });

  it('derives local dates independently of host timezone and rejects offset overflow', () => {
    const timestampMs = Date.parse('2026-07-26T00:30:00.000Z');
    expect(dailyContextLocalDate(timestampMs, -5 * 60)).toBe('2026-07-25');
    expect(dailyContextLocalDate(timestampMs, 9 * 60)).toBe('2026-07-26');
    expect(() => dailyContextLocalDate(8_640_000_000_000_000, 1)).toThrow(/timestamp/i);
    expect(() => dailyContextLocalDate(-8_640_000_000_000_000, -1)).toThrow(/timestamp/i);
  });

  it('creates a deterministic, scoped, configurable open plan', () => {
    expect(
      buildDailyContextNotePlan(
        { ...settings, dateFormat: 'MM-DD-YYYY' },
        {
          timestampMs: Date.parse('2026-07-26T00:30:00.000Z'),
          utcOffsetMinutes: -5 * 60,
          projectId: 'project-1',
        },
      ),
    ).toEqual({
      operation: 'open',
      accountId: 'account-1',
      mapId: 'map-1',
      projectId: 'project-1',
      dailyDate: '2026-07-25',
      title: 'Daily Context — 2026-07-25',
      relativePath: 'Context/Daily/07-25-2026.md',
      templateId: 'daily-default',
      autoOpen: 'project_open',
      writeAuthorized: false,
      executable: false,
    });
    expect(
      buildDailyContextNotePlan(
        { ...settings, projectScope: { kind: 'account' } },
        { timestampMs: 0, utcOffsetMinutes: 0, projectId: 'project-2' },
      ).projectId,
    ).toBe('project-2');
    expect(() =>
      buildDailyContextNotePlan(settings, { ...request, projectId: 'project-2' }),
    ).toThrow(/project scope/i);
    expect(() => buildDailyContextNotePlan({ ...settings, folder: '../private' }, request)).toThrow(
      /folder/i,
    );
  });

  it('applies auto-open only for its configured event and scope', () => {
    expect(shouldAutoOpenDailyContext(settings, 'project_open', 'project-1')).toBe(true);
    expect(shouldAutoOpenDailyContext(settings, 'app_start', 'project-1')).toBe(false);
    expect(shouldAutoOpenDailyContext(settings, 'project_open', 'project-2')).toBe(false);
    expect(
      shouldAutoOpenDailyContext(
        { ...settings, autoOpen: 'never', projectScope: { kind: 'account' } },
        'project_open',
        'project-2',
      ),
    ).toBe(false);
  });

  it('parses only bounded, exact terminal commands into non-executable data', () => {
    expect(parseDailyContextTerminalCommand('vibespace daily')).toEqual({
      operation: 'open',
      source: 'terminal',
      executable: false,
    });
    expect(parseDailyContextTerminalCommand('vibespace daily add "Build passed"')).toEqual({
      operation: 'add',
      source: 'terminal',
      content: 'Build passed',
      authorization: 'direct_user_action',
      executable: false,
    });
    expect(
      parseDailyContextTerminalCommand('vibespace daily add "safe" && Remove-Item private'),
    ).toBeNull();
    expect(
      parseDailyContextTerminalCommand(`vibespace daily add "${'\\u0061'.repeat(4_001)}"`),
    ).toBeNull();
    expect(
      parseDailyContextTerminalCommand(`vibespace daily add "${'a'.repeat(24_100)}"`),
    ).toBeNull();
    expect(parseDailyContextTerminalCommand(' vibespace daily ')).toBeNull();
    expect(parseDailyContextTerminalCommand('vibespace daily add  "Build passed"')).toBeNull();
    expect(parseDailyContextTerminalCommand('vibespace daily add \t"Build passed"')).toBeNull();
  });

  it('offers equivalent slash operations without executable authority', () => {
    expect(DAILY_CONTEXT_SLASH_OPTIONS.map(({ operation }) => operation)).toEqual(['open', 'add']);
    expect(dailyContextSlashOperation('open')).toEqual({
      operation: 'open',
      source: 'slash',
      executable: false,
    });
    expect(dailyContextSlashOperation('add', 'Record the release result')).toEqual({
      operation: 'add',
      source: 'slash',
      content: 'Record the release result',
      authorization: 'direct_user_action',
      executable: false,
    });
    expect(() => dailyContextSlashOperation('remove' as never, 'unsafe')).toThrow(
      /slash operation/i,
    );
  });

  it('offers three authoritative same-day changes and never grants write authority', async () => {
    const ports = repositories();
    const plan = await planJarvisDailyContextChanges(settings, references, request, ports);
    expect(plan).toMatchObject({
      action: 'offer',
      accountId: 'account-1',
      mapId: 'map-1',
      projectId: 'project-1',
      dailyDate: '2026-07-25',
      writeAuthorized: false,
      requiresApproval: true,
      message:
        'Three meaningful changes were completed today, sir. Shall I add them to today’s Context Note?',
      executable: false,
    });
    expect(plan?.changes.map(({ id }) => id)).toEqual(['run-1:1', 'run-2:2', 'run-3:3']);
    expect(plan?.changes.map(({ kind }) => kind)).toEqual([
      'release_progress',
      'release_progress',
      'release_progress',
    ]);
    expect(ports.run.getById).toHaveBeenCalledWith('account-1', 'run-1');
    expect(
      await planJarvisDailyContextChanges(settings, references.slice(0, 2), request, ports),
    ).toBeNull();
  });

  it('fails closed for foreign, incomplete, stale, future, or malformed repository evidence', async () => {
    await expect(
      planJarvisDailyContextChanges(
        { ...settings, projectScope: { kind: 'account' } },
        references,
        request,
        repositories({ projectId: 'project-2' }),
      ),
    ).rejects.toThrow(/project scope/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ accountId: 'account-2' }),
      ),
    ).rejects.toThrow(/project scope/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ runStatus: 'running' }),
      ),
    ).rejects.toThrow(/project scope/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventCreatedAt: Date.parse('2026-07-24T12:00:00.000Z') }),
      ),
    ).rejects.toThrow(/local date/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventCreatedAt: NOW + 1 }),
      ),
    ).rejects.toThrow(/authoritative|future/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventType: 'shell_code' }),
      ),
    ).rejects.toThrow(/event type/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventType: 'model' }),
      ),
    ).rejects.toThrow(/ineligible/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventSummary: 'Repeated result.' }),
      ),
    ).rejects.toThrow(/duplicate.*summary/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ omitEventTitle: true }),
      ),
    ).rejects.toThrow(/activity event|change title/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventTitle: 42 }),
      ),
    ).rejects.toThrow(/change title/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventTitle: 'bad\u0000title' }),
      ),
    ).rejects.toThrow(/change title/i);
    await expect(
      planJarvisDailyContextChanges(
        settings,
        references,
        request,
        repositories({ eventTitle: 'x'.repeat(4_001) }),
      ),
    ).rejects.toThrow(/change title/i);
  });

  it('rejects duplicate sources and non-dense or decorated reference arrays', async () => {
    await expect(
      planJarvisDailyContextChanges(
        settings,
        [references[0], references[0], references[2]],
        request,
        repositories(),
      ),
    ).rejects.toThrow(/duplicate change source/i);

    const sparse = new Array(3) as DailyContextChangeReference[];
    sparse[0] = references[0];
    const accessor = [...references];
    Object.defineProperty(accessor, 1, { get: () => references[1], enumerable: true });
    const extra = [...references] as DailyContextChangeReference[] & { extra?: string };
    extra.extra = 'not evidence';
    for (const invalid of [sparse, accessor, extra]) {
      await expect(
        planJarvisDailyContextChanges(settings, invalid, request, repositories()),
      ).rejects.toThrow(/change references/i);
    }
  });

  it('rejects accessor-bearing, symbolic, non-enumerable, and proxy boundaries', () => {
    let getterCalls = 0;
    const accessorSettings = {
      ...settings,
      get accountId() {
        getterCalls += 1;
        return 'account-1';
      },
    };
    expect(() => buildDailyContextNotePlan(accessorSettings, request)).toThrow(/settings/i);
    expect(getterCalls).toBe(0);

    const symbolSettings = { ...settings } as DailyContextSettings & Record<symbol, string>;
    symbolSettings[Symbol('hidden')] = 'opaque';
    expect(() => buildDailyContextNotePlan(symbolSettings, request)).toThrow(/settings/i);

    const nonEnumerableSettings = { ...settings };
    Object.defineProperty(nonEnumerableSettings, 'hidden', {
      value: 'opaque',
      enumerable: false,
    });
    expect(() => buildDailyContextNotePlan(nonEnumerableSettings, request)).toThrow(/settings/i);
    expect(() => buildDailyContextNotePlan(new Proxy(settings, {}), request)).toThrow(/settings/i);
  });

  it('returns deeply immutable offer evidence', async () => {
    const plan = await planJarvisDailyContextChanges(settings, references, request, repositories());
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan?.changes)).toBe(true);
    expect(Object.isFrozen(plan?.changes[0])).toBe(true);
    expect(Object.isFrozen(plan?.changes[0].source)).toBe(true);
  });

  it('rejects more than 100 references before repository work', async () => {
    const ports = repositories();
    const oversized = Array.from({ length: 101 }, (_, index) => ({
      runId: `run-${index + 1}`,
      eventSeq: 1,
    }));
    await expect(
      planJarvisDailyContextChanges(settings, oversized, request, ports),
    ).rejects.toThrow(/references/i);
    expect(ports.run.getById).not.toHaveBeenCalled();
    expect(ports.event.getBySeq).not.toHaveBeenCalled();
  });
});
