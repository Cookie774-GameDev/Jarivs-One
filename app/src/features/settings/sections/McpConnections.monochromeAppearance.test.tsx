import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RemoteMcpSetupConnection, RemoteMcpSetupRuntime } from '@/lib/mcp/remoteSetupRuntime';
import { McpConnections } from './McpConnections';

function runtimeHarness(initial: readonly RemoteMcpSetupConnection[] = []) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const runtime: RemoteMcpSetupRuntime = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect: vi.fn(async () => undefined),
    setToolExposure: vi.fn(),
    disconnect: vi.fn(async () => undefined),
  };
  return { runtime };
}

const connected = Object.freeze({
  id: 'reviewed-server',
  endpoint: 'https://mcp.example.test/rpc',
  state: 'connected' as const,
  tools: Object.freeze([]),
  exposedTools: Object.freeze([]),
});

describe('McpConnections MonoChrome appearance', () => {
  afterEach(cleanup);

  it('gates radius, image, shadow, and card translucency under exact monochrome', () => {
    const harness = runtimeHarness([connected]);
    const { container } = render(<McpConnections runtime={harness.runtime} />);

    const root = container.querySelector('section');
    expect(root).not.toBeNull();
    const rootClassName = root?.className ?? '';
    expect(rootClassName).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(rootClassName).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(rootClassName).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    const card = container.querySelector('article');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('bg-panel/60');
    expect(card?.className).toContain('[html[data-theme=monochrome]_&]:bg-panel');

    expect(screen.getByText('MCP Connections')).toBeTruthy();
    expect(screen.getByText(/credentialless Streamable HTTP/i)).toBeTruthy();
  });
});
