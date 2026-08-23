import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../src/index';

function object(range?: { offset: number; length: number }) {
  return {
    size: 1000,
    httpEtag: '"music-etag"',
    httpMetadata: { contentType: 'audio/mpeg' },
    range,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }),
    writeHttpMetadata(headers: Headers) {
      headers.set('content-type', 'audio/mpeg');
    },
  };
}

function env(value = object()): Env {
  return {
    ALLOWED_ORIGINS: 'http://tauri.localhost',
    MUSIC: { head: vi.fn().mockResolvedValue(value), get: vi.fn().mockResolvedValue(value) },
  };
}

const path = '/v1/tracks/music-001-abcdefabcdef-example-track.mp3';

describe('music delivery worker', () => {
  it('rejects traversal and methods before R2 access', async () => {
    const target = env();
    expect(
      (await handleRequest(new Request(`https://music.test${path}`, { method: 'POST' }), target))
        .status,
    ).toBe(405);
    expect(
      (await handleRequest(new Request('https://music.test/v1/tracks/../private.mp3'), target))
        .status,
    ).toBe(404);
    expect(target.MUSIC.get).not.toHaveBeenCalled();
  });

  it('streams allowlisted immutable audio with CORS and range support', async () => {
    const target = env(object({ offset: 100, length: 200 }));
    const request = new Request(`https://music.test${path}`, {
      headers: { Origin: 'http://tauri.localhost', Range: 'bytes=100-299' },
    });
    const result = await handleRequest(request, target);
    expect(result.status).toBe(206);
    expect(result.headers.get('content-range')).toBe('bytes 100-299/1000');
    expect(result.headers.get('cache-control')).toContain('immutable');
    expect(result.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost');
    expect(target.MUSIC.get).toHaveBeenCalledWith(
      'tracks/music-001-abcdefabcdef-example-track.mp3',
      { range: request.headers },
    );
  });

  it('supports bodyless HEAD', async () => {
    const target = env();
    const result = await handleRequest(
      new Request(`https://music.test${path}`, { method: 'HEAD' }),
      target,
    );
    expect(result.status).toBe(200);
    expect(await result.text()).toBe('');
    expect(target.MUSIC.head).toHaveBeenCalledOnce();
  });
});
