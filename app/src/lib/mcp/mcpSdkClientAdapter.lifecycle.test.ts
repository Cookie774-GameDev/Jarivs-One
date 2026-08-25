import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP SDK client adapter lifecycle', () => {
  afterEach(() => {
    vi.doUnmock('@modelcontextprotocol/sdk/client/index.js');
    vi.doUnmock('@modelcontextprotocol/sdk/client/streamableHttp.js');
    vi.resetModules();
  });

  it('does not load the SDK or transport until the first connection starts', async () => {
    let clientModuleLoads = 0;
    let transportModuleLoads = 0;
    let connects = 0;

    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
      clientModuleLoads += 1;
      return {
        Client: class {
          async connect() {
            connects += 1;
          }

          async close() {}
        },
      };
    });
    vi.doMock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
      transportModuleLoads += 1;
      return { StreamableHTTPClientTransport: class {} };
    });

    const { createMcpSdkClientAdapter } = await import('./mcpSdkClientAdapter');
    expect(clientModuleLoads).toBe(0);
    expect(transportModuleLoads).toBe(0);

    const adapter = createMcpSdkClientAdapter({
      id: 'lazy-sdk',
      endpoint: 'https://mcp.example.test/mcp',
    });
    expect(connects).toBe(0);

    const server = await adapter.start();
    expect(clientModuleLoads).toBe(1);
    expect(transportModuleLoads).toBe(1);
    expect(connects).toBe(1);
    await server.stop();
  });
});
