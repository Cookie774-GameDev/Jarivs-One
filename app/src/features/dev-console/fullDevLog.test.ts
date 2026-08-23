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

  it('humanizes the real model, RLM, SiYuan, and completion sequence from recorded evidence', () => {
    const timeline = [
      entry({
        message: 'AI request → @jarvis (opencode-go/deepseek-v4-flash-vision-exp)',
        detail: {
          connectionId: 'opencode-cli',
          provider: 'opencode-go',
          model: 'deepseek-v4-flash-vision-exp',
          prompt: 'private user request',
        },
      }),
      entry({
        id: 2,
        message: 'VibeSpace Context route → federated',
        detail: { route: 'federated', evidenceCount: 8, childCalls: 2, rlmEnabled: true },
      }),
      entry({
        id: 3,
        message: 'SiYuan block lookup completed',
        detail: { siyuanEvidenceCount: 3 },
      }),
      entry({
        id: 4,
        message: 'AI done ← @jarvis (120+40 tok, $0.0000)',
        detail: { provider: 'opencode-go', model: 'deepseek-v4-flash-vision-exp' },
      }),
    ].map(humanizeEntry);

    expect(timeline.map((event) => event.title)).toEqual([
      'OpenCode received the request · deepseek-v4-flash-vision-exp is running',
      'RLM gathered 8 evidence items · federated',
      'SiYuan gathered 3 evidence items',
      'deepseek-v4-flash-vision-exp completed the request',
    ]);
    expect(JSON.stringify(timeline)).not.toContain('private user request');
  });

  it('shows safe OpenCode rate-limit and auth failures without provider content', () => {
    const rateLimit = humanizeEntry(
      entry({
        level: 'error',
        message: 'AI error @jarvis: upstream rate limit exceeded apiKey=do-not-export',
        detail: {
          connectionId: 'opencode-cli',
          provider: 'openai',
          model: 'gpt-5.6-luna-fast',
          errorCode: 'upstream_rate_limit',
          reason: 'Provider rate limit reached apiKey=do-not-export',
          body: 'private upstream response body',
          prompt: 'private prompt',
        },
      }),
    );
    const auth = humanizeEntry(
      entry({
        level: 'error',
        message: 'AI error @jarvis: Unauthorized',
        detail: {
          connectionId: 'opencode-cli',
          provider: 'openai',
          model: 'gpt-5.6-luna-fast',
          statusCode: 401,
        },
      }),
    );
    const runtimeShape = humanizeEntry(
      entry({
        level: 'error',
        message: 'AI error @jarvis: Unauthorized',
        detail: {
          agent: 'jarvis',
          error: { name: 'Error', message: '[content omitted]' },
        },
      }),
    );

    expect(rateLimit.title).toBe(
      'OpenCode / gpt-5.6-luna-fast request failed — Rate limit reached',
    );
    expect(auth.title).toBe(
      'OpenCode / gpt-5.6-luna-fast request failed — Authentication required',
    );
    expect(runtimeShape.title).toBe('Provider/model request failed — Authentication required');
    expect(JSON.stringify([rateLimit, auth, runtimeShape])).not.toMatch(
      /do-not-export|private upstream|private prompt/,
    );
  });

  it('does not mislabel unrelated AI-channel errors as provider failures', () => {
    expect(
      humanizeEntry(
        entry({
          level: 'error',
          message: 'AI error-stamp write failed',
          detail: { agent: 'jarvis' },
        }),
      ),
    ).toMatchObject({ eyebrow: 'AI run', title: 'AI error-stamp write failed' });
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
