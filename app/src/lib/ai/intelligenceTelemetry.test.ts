import { describe, expect, it } from 'vitest';
import {
  createLocalIntelligenceTelemetry,
  type IntelligenceTelemetryEvent,
} from './intelligenceTelemetry';

const event = (
  overrides: Partial<IntelligenceTelemetryEvent> = {},
): IntelligenceTelemetryEvent => ({
  schemaVersion: 1,
  eventId: 'evt-1',
  requestId: 'request-1',
  attemptNumber: 1,
  accountScopeHash: 'sha256:account',
  projectScopeHash: 'sha256:project',
  kind: 'token_optimization',
  observedAt: 100,
  providerId: 'openai',
  modelId: 'gpt-test',
  metrics: {
    estimatedInputTokensBefore: 2_000,
    estimatedInputTokensAfter: 800,
    estimatedTokensSaved: 1_200,
    selectedSourceCount: 4,
    excludedSourceCount: 9,
    durationMs: 12,
  },
  attributes: {
    mode: 'saver',
    tokenizerSource: 'exact_local',
    cacheOutcome: 'miss',
  },
  ...overrides,
});

describe('local intelligence telemetry', () => {
  it('records bounded metadata locally without an exporter', () => {
    const telemetry = createLocalIntelligenceTelemetry();
    telemetry.record(event());

    expect(telemetry.snapshot()).toEqual([event()]);
    expect(telemetry.exporterState()).toEqual({ enabled: false, exporter: null });
  });

  it('rejects raw prompts, responses, source contents, paths, credentials, and unknown fields', () => {
    const telemetry = createLocalIntelligenceTelemetry();
    for (const forbidden of [
      { prompt: 'secret prompt' },
      { response: 'raw response' },
      { fileContent: 'source' },
      { filePath: 'C:\\private\\file.ts' },
      { credential: 'sk-secret' },
      { arbitrary: 'value' },
    ]) {
      expect(() =>
        telemetry.record(
          event({
            attributes: forbidden as IntelligenceTelemetryEvent['attributes'],
          }),
        ),
      ).toThrow(/attribute/i);
    }
    expect(telemetry.snapshot()).toEqual([]);
  });

  it('bounds retention and returns detached immutable snapshots', () => {
    const telemetry = createLocalIntelligenceTelemetry({ maxEvents: 2 });
    telemetry.record(event({ eventId: 'evt-1', observedAt: 1 }));
    telemetry.record(event({ eventId: 'evt-2', observedAt: 2 }));
    telemetry.record(event({ eventId: 'evt-3', observedAt: 3 }));

    const snapshot = telemetry.snapshot();
    expect(snapshot.map(({ eventId }) => eventId)).toEqual(['evt-2', 'evt-3']);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
  });

  it('preserves chronological order across repeated wraps and releases cleared entries', () => {
    const telemetry = createLocalIntelligenceTelemetry({ maxEvents: 3 });
    for (let index = 1; index <= 10; index += 1) {
      telemetry.record(event({ eventId: `evt-${index}`, observedAt: index }));
    }

    expect(telemetry.snapshot().map(({ eventId }) => eventId)).toEqual([
      'evt-8',
      'evt-9',
      'evt-10',
    ]);

    telemetry.clear();
    expect(telemetry.snapshot()).toEqual([]);
    telemetry.record(event({ eventId: 'evt-after-clear', observedAt: 11 }));
    expect(telemetry.snapshot().map(({ eventId }) => eventId)).toEqual(['evt-after-clear']);
  });
});
