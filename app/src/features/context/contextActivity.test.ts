import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_ACTIVITY_KINDS,
  ContextActivityError,
  createContextActivityEvent,
  createContextActivityRecorder,
  isContextCloudTelemetryExportable,
  type ContextActivityRecorderDependencies,
} from './contextActivity';

let hmacKey: CryptoKey;

beforeAll(async () => {
  hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('persistent-test-installation-secret-32b'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
});

const input = {
  idempotencyKey: 'operation-1',
  occurredAt: 1_700_000_000_000,
  mapId: 'map-1',
  sourceId: 'source-1',
  path: 'C:\\Users\\person\\private\\source.ts',
  itemCount: 3,
  reasonCode: 'revision_changed',
} as const;

function event(kind: (typeof CONTEXT_ACTIVITY_KINDS)[number], eventId = 'event-1') {
  return createContextActivityEvent({
    eventId,
    accountId: 'account-1',
    kind,
    occurredAt: input.occurredAt,
    mapId: input.mapId,
    sourceId: input.sourceId,
    path: input.path,
    itemCount: input.itemCount,
    reasonCode: input.reasonCode,
  });
}

function dependencies(
  overrides: Partial<ContextActivityRecorderDependencies> = {},
): ContextActivityRecorderDependencies {
  return {
    accountId: 'account-1',
    eventIdHmacKey: hmacKey,
    preferences: () => ({ cloudTelemetryEnabled: true, includeLocalPaths: false }),
    upsertLocalByEventId: () => 'stored',
    upsertLocalCloudDispositionByEventId: () => 'stored',
    ...overrides,
  };
}

describe('Context activity observability', () => {
  it('supports every approved privacy-safe event kind', () => {
    expect(CONTEXT_ACTIVITY_KINDS.map((kind, index) => event(kind, `event-${index}`).kind)).toEqual(
      CONTEXT_ACTIVITY_KINDS,
    );
  });

  it('cloud outbox projection contains only minimized operational fields', async () => {
    const cloud: unknown[] = [];
    await createContextActivityRecorder(
      dependencies({
        upsertLocalCloudDispositionByEventId: (value) => {
          cloud.push(value);
          return 'stored';
        },
      }),
    ).record({ ...input, kind: 'source_changed' });
    expect(cloud).toEqual([
      {
        version: 1,
        eventId: expect.stringMatching(/^[a-f0-9]{64}$/),
        accountId: 'account-1',
        kind: 'source_changed',
        occurredAt: input.occurredAt,
        disposition: 'queued',
        itemCount: 3,
      },
    ]);
    expect(JSON.stringify(cloud)).not.toContain('private');
  });

  it('shows local paths only when the current preference allows them', async () => {
    let includeLocalPaths = false;
    const local: unknown[] = [];
    const recorder = createContextActivityRecorder(
      dependencies({
        preferences: () => ({ cloudTelemetryEnabled: false, includeLocalPaths }),
        upsertLocalByEventId: (value) => {
          local.push(value);
          return 'stored';
        },
      }),
    );
    await recorder.record({ ...input, kind: 'note_created' });
    includeLocalPaths = true;
    await recorder.record({ ...input, idempotencyKey: 'operation-2', kind: 'link_created' });
    expect(local).toEqual([
      expect.not.objectContaining({ path: expect.anything() }),
      expect.objectContaining({ path: input.path }),
    ]);
  });

  it('persists a suppressed disposition while cloud telemetry is disabled', async () => {
    let suppressed:
      | Parameters<ContextActivityRecorderDependencies['upsertLocalCloudDispositionByEventId']>[0]
      | undefined;
    const cloud = vi.fn((value: NonNullable<typeof suppressed>) => {
      suppressed = value;
      return 'stored' as const;
    });
    await createContextActivityRecorder(
      dependencies({
        preferences: () => ({ cloudTelemetryEnabled: false, includeLocalPaths: false }),
        upsertLocalCloudDispositionByEventId: cloud,
      }),
    ).record({ ...input, kind: 'index_repaired' });
    expect(cloud).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'suppressed' }));
    expect(isContextCloudTelemetryExportable(suppressed!)).toBe(false);
    expect(
      isContextCloudTelemetryExportable({
        ...suppressed!,
        disposition: 'queued',
        path: 'C:\\private\\source.ts',
      } as never),
    ).toBe(false);
    const dispositionGetter = vi.fn(() => 'queued');
    expect(
      isContextCloudTelemetryExportable(
        Object.defineProperties(
          {},
          {
            version: { enumerable: true, value: 1 },
            eventId: { enumerable: true, value: 'event-1' },
            accountId: { enumerable: true, value: 'account-1' },
            kind: { enumerable: true, value: 'map_created' },
            occurredAt: { enumerable: true, value: 1 },
            disposition: { enumerable: true, get: dispositionGetter },
          },
        ) as never,
      ),
    ).toBe(false);
    expect(dispositionGetter).not.toHaveBeenCalled();
  });

  it('rejects undeclared/accessor content and path-shaped reason smuggling', async () => {
    const recorder = createContextActivityRecorder(dependencies());
    await expect(
      recorder.record({ ...input, kind: 'source_indexed', sourceContent: 'private' } as never),
    ).rejects.toBeInstanceOf(ContextActivityError);
    await expect(
      recorder.record({
        ...input,
        kind: 'source_changed',
        reasonCode: 'C:/Users/person/private/source.ts',
      } as never),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const getter = vi.fn(() => 'operation-1');
    const unsafe = Object.defineProperties(
      {},
      {
        idempotencyKey: { enumerable: true, get: getter },
        kind: { enumerable: true, value: 'map_created' },
        occurredAt: { enumerable: true, value: 1 },
      },
    );
    await expect(recorder.record(unsafe as never)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('derives stable non-echoing event IDs across recorder recreation', async () => {
    const firstCloud: Array<{ eventId: string }> = [];
    const secondCloud: Array<{ eventId: string }> = [];
    const privateKey = 'PRIVATE_SOURCE_CODE_base64url';
    await createContextActivityRecorder(
      dependencies({
        accountId: 'account-authority',
        upsertLocalCloudDispositionByEventId: (value) => {
          firstCloud.push(value);
          return 'stored';
        },
      }),
    ).record({ ...input, idempotencyKey: privateKey, kind: 'map_created' });
    await createContextActivityRecorder(
      dependencies({
        accountId: 'account-authority',
        upsertLocalCloudDispositionByEventId: (value) => {
          secondCloud.push(value);
          return 'unchanged';
        },
      }),
    ).record({ ...input, idempotencyKey: privateKey, kind: 'map_created' });
    expect(firstCloud[0]?.eventId).toBe(secondCloud[0]?.eventId);
    expect(firstCloud[0]?.eventId).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(firstCloud)).not.toContain(privateKey);
    const publicDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`context_activity\u0000account-authority\u0000${privateKey}`),
    );
    expect(firstCloud[0]?.eventId).not.toBe(
      Array.from(new Uint8Array(publicDigest), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      ),
    );
  });

  it('rejects weak HMAC event-identity keys', async () => {
    const weakKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array([7]),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    expect(() => createContextActivityRecorder(dependencies({ eventIdHmacKey: weakKey }))).toThrow(
      /invalid_input/,
    );
  });

  it('captures dependency methods and snapshots accessor-free preferences', async () => {
    const local = vi.fn(() => 'stored' as const);
    const deps = dependencies({ upsertLocalByEventId: local });
    const recorder = createContextActivityRecorder(deps);
    deps.upsertLocalByEventId = vi.fn(() => 'conflict' as const);
    await recorder.record({ ...input, kind: 'map_created' });
    expect(local).toHaveBeenCalledOnce();

    const preferenceGetter = vi.fn(() => true);
    await expect(
      createContextActivityRecorder(
        dependencies({
          preferences: () =>
            Object.defineProperties(
              {},
              {
                cloudTelemetryEnabled: { enumerable: true, get: preferenceGetter },
                includeLocalPaths: { enumerable: true, value: false },
              },
            ) as never,
        }),
      ).record({ ...input, kind: 'map_created' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(preferenceGetter).not.toHaveBeenCalled();
  });

  it('requires idempotent sinks and resumes commit-then-throw without duplicates', async () => {
    const localStore = new Map<string, string>();
    let loseCloudAck = true;
    const cloudStore = new Map<string, string>();
    const recorder = createContextActivityRecorder(
      dependencies({
        upsertLocalByEventId: (value) => {
          const serialized = JSON.stringify(value);
          const prior = localStore.get(value.eventId);
          if (prior !== undefined) return prior === serialized ? 'unchanged' : 'conflict';
          localStore.set(value.eventId, serialized);
          return 'stored';
        },
        upsertLocalCloudDispositionByEventId: (value) => {
          const serialized = JSON.stringify(value);
          const prior = cloudStore.get(value.eventId);
          if (prior === undefined) cloudStore.set(value.eventId, serialized);
          if (loseCloudAck) {
            loseCloudAck = false;
            throw new Error('lost acknowledgement');
          }
          return prior === undefined || prior === serialized ? 'unchanged' : 'conflict';
        },
      }),
    );
    await expect(recorder.record({ ...input, kind: 'source_indexed' })).rejects.toMatchObject({
      code: 'sink_failed',
    });
    await expect(recorder.record({ ...input, kind: 'source_indexed' })).resolves.toBeDefined();
    expect(localStore.size).toBe(1);
    expect(cloudStore.size).toBe(1);
  });

  it('keeps opt-out suppression stable across recorder recreation and later opt-in', async () => {
    const outbox = new Map<string, string>();
    const upsert: ContextActivityRecorderDependencies['upsertLocalCloudDispositionByEventId'] = (
      value,
    ) => {
      const serialized = JSON.stringify(value);
      const prior = outbox.get(value.eventId);
      if (prior !== undefined) return prior === serialized ? 'unchanged' : 'conflict';
      outbox.set(value.eventId, serialized);
      return 'stored';
    };
    await createContextActivityRecorder(
      dependencies({
        preferences: () => ({ cloudTelemetryEnabled: false, includeLocalPaths: false }),
        upsertLocalCloudDispositionByEventId: upsert,
      }),
    ).record({ ...input, kind: 'source_changed' });
    await expect(
      createContextActivityRecorder(
        dependencies({
          preferences: () => ({ cloudTelemetryEnabled: true, includeLocalPaths: false }),
          upsertLocalCloudDispositionByEventId: upsert,
        }),
      ).record({ ...input, kind: 'source_changed' }),
    ).rejects.toMatchObject({ code: 'invalid_input', detail: 'event_id_reuse' });
    expect([...outbox.values()][0]).toContain('"disposition":"suppressed"');
  });
});
