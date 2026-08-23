import { describe, expect, it } from 'vitest';
import type { DevLogEntry } from './store';
import {
  buildEvidenceLanes,
  calculateVirtualWindow,
  exportDevLog,
  formatDevLogTimestamp,
  humanizeEntry,
} from './fullDevLog';

function entry(overrides: Partial<DevLogEntry> = {}): DevLogEntry {
  return {
    id: 1,
    ts: new Date('2026-08-23T12:34:56.789Z').getTime(),
    channel: 'ai',
    level: 'info',
    message: 'Provider request completed',
    durationMs: 18.25,
    ...overrides,
  };
}

describe('Full Dev Log presentation', () => {
  it('builds request, model, RLM, SiYuan, and tool lanes only from actual evidence', () => {
    const lanes = buildEvidenceLanes([
      entry({
        detail: {
          requestId: 'req-1',
          providerId: 'openai',
          modelId: 'gpt-5.6-luna-fast',
          effort: 'max',
          rlmEnabled: true,
          tool: 'read',
        },
      }),
      entry({
        id: 2,
        channel: 'invoke',
        message: 'SiYuan block lookup completed',
        detail: { siyuanBlockId: 'block-1' },
      }),
      entry({ id: 3, message: 'model request words without structured identity' }),
    ]);

    expect(lanes.map((lane) => lane.kind)).toEqual(['request', 'model', 'rlm', 'tool', 'siyuan']);
    expect(lanes.find((lane) => lane.kind === 'model')?.label).toContain(
      'openai / gpt-5.6-luna-fast',
    );
    expect(lanes.find((lane) => lane.kind === 'request')?.label).toContain('req-1');
    expect(lanes.some((lane) => lane.label.includes('without structured'))).toBe(false);
  });

  it('creates stable human timeline copy without changing the evidence', () => {
    const value = humanizeEntry(
      entry({ channel: 'invoke', message: 'invoke terminal_spawn', durationMs: 7.75 }),
    );
    expect(value.eyebrow).toBe('Native command');
    expect(value.title).toBe('invoke terminal_spawn');
    expect(value.duration).toBe('7.75 ms');
    expect(formatDevLogTimestamp(entry().ts)).toMatch(/12:34:56\.789|07:34:56\.789/);
  });

  it('calculates a bounded overscanned window for 10,000 entries', () => {
    expect(
      calculateVirtualWindow({
        count: 10_000,
        scrollTop: 6_000,
        viewportHeight: 600,
        rowHeight: 60,
        overscan: 4,
      }),
    ).toEqual({ start: 96, end: 114, offsetTop: 5_760, totalHeight: 600_000 });

    expect(
      calculateVirtualWindow({
        count: 3,
        scrollTop: 600_000,
        viewportHeight: 600,
        rowHeight: 60,
      }),
    ).toEqual({ start: 0, end: 3, offsetTop: 0, totalHeight: 180 });
  });

  it('exports re-redacted JSON and inert escaped HTML', () => {
    const unsafe = entry({
      message: '<script>alert(1)</script> apiKey=raw-secret',
      detail: { prompt: 'private prompt', requestId: 'req-safe' },
    });
    const json = exportDevLog([unsafe], 'json', 123);
    const html = exportDevLog([unsafe], 'html', 123);

    expect(json.mimeType).toBe('application/json;charset=utf-8');
    expect(json.content).toContain('req-safe');
    expect(json.content).not.toContain('raw-secret');
    expect(json.content).not.toContain('private prompt');
    expect(html.mimeType).toBe('text/html;charset=utf-8');
    expect(html.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.content).not.toContain('<script>alert(1)</script>');
    expect(html.content).toContain("default-src 'none'");
    expect(html.filename).toBe('vibespace-full-dev-log-1970-01-01T00-00-00-123Z.html');
  });
});
