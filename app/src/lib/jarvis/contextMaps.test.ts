import { describe, expect, it } from 'vitest';

import { JarvisContextMapIndex } from './contextMaps';

describe('incremental Jarvis context maps', () => {
  it('indexes every required map kind and answers scoped queries', () => {
    const index = new JarvisContextMapIndex();
    index.updateSource('core', 'sha-a', [
      { kind: 'service', id: 'terminal-session-service', label: 'Terminal session service', keywords: ['terminal', 'create'], detail: 'Creates terminal panes.' },
      { kind: 'route', id: 'terminals', label: 'Terminal route', keywords: ['terminal'], detail: 'Opens terminal workspace.' },
      { kind: 'provider', id: 'anthropic', label: 'Anthropic', keywords: ['claude'], detail: 'Native API provider.' },
    ]);

    expect(index.kinds()).toEqual(expect.arrayContaining([
      'architecture', 'feature', 'action', 'route', 'service', 'provider',
      'plugin', 'mcp', 'project-file', 'agent', 'permission', 'dependency',
    ]));
    expect(index.search('which service creates terminals', { kinds: ['service'] })[0]?.id)
      .toBe('terminal-session-service');
  });

  it('skips unchanged sources and updates only the changed contribution', () => {
    const index = new JarvisContextMapIndex();
    const initial = [{ kind: 'plugin' as const, id: 'shopify', label: 'Shopify', keywords: ['store'], detail: 'Disconnected.' }];
    expect(index.updateSource('plugins', 'sha-a', initial)).toMatchObject({ changed: true, revision: 1 });
    expect(index.updateSource('plugins', 'sha-a', initial)).toMatchObject({ changed: false, revision: 1 });
    expect(index.updateSource('plugins', 'sha-b', [{ ...initial[0]!, detail: 'Connected.' }]))
      .toMatchObject({ changed: true, revision: 2 });
    expect(index.search('shopify connected')[0]?.detail).toBe('Connected.');
  });

  it('removes stale entries when a source disappears', () => {
    const index = new JarvisContextMapIndex();
    index.updateSource('agents', 'one', [
      { kind: 'agent', id: 'researcher', label: 'Researcher', keywords: ['active'], detail: 'Working.' },
    ]);
    expect(index.removeSource('agents')).toBe(true);
    expect(index.search('researcher')).toEqual([]);
  });
});
