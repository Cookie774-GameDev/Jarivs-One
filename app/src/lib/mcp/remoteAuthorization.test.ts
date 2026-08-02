import { describe, expect, it, vi } from 'vitest';
import {
  authorizeRemoteMcpConnection,
  claimRemoteMcpAuthorization,
  type RemoteMcpAuthorizationReceipt,
} from './remoteAuthorization';

describe('remote MCP connection authorization', () => {
  it('mints an immutable opaque receipt for an exact confirmed HTTPS endpoint', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const receipt = authorizeRemoteMcpConnection({
      endpoint: 'https://mcp.example.com/tools',
      confirmedByUser: true,
      intent: 'connect_external_mcp',
    });

    expect(Object.isFrozen(receipt)).toBe(true);
    expect(receipt).toEqual({
      endpoint: 'https://mcp.example.com/tools',
      intent: 'connect_external_mcp',
      expiresAt: 301_000,
    });
    now.mockReturnValue(2_000);
    expect(claimRemoteMcpAuthorization(receipt, 'https://mcp.example.com/tools')).toEqual({
      endpoint: 'https://mcp.example.com/tools',
      intent: 'connect_external_mcp',
    });
    now.mockRestore();
  });

  it.each([
    'ftp://mcp.example.com/tools',
    'file:///tmp/mcp',
    'http://mcp.example.com/tools',
    'http://192.168.1.8:3000/mcp',
    'https://user:secret@mcp.example.com/tools',
    'https://mcp.example.com/tools?token=secret',
    'https://mcp.example.com/tools#fragment',
  ])('rejects an unsafe endpoint: %s', (endpoint) => {
    expect(() =>
      authorizeRemoteMcpConnection({
        endpoint,
        confirmedByUser: true,
        intent: 'connect_external_mcp',
      }),
    ).toThrow(/endpoint/i);
  });

  it.each(['http://localhost:3100/mcp', 'http://127.0.0.1:3100/mcp', 'http://[::1]:3100/mcp'])(
    'allows explicit loopback HTTP for local development: %s',
    (endpoint) => {
      const receipt = authorizeRemoteMcpConnection({
        endpoint,
        confirmedByUser: true,
        intent: 'connect_external_mcp',
      });

      expect(receipt.endpoint).toBe(endpoint);
    },
  );

  it('requires an explicit user confirmation and the fixed connection intent', () => {
    expect(() =>
      authorizeRemoteMcpConnection({
        endpoint: 'https://mcp.example.com/mcp',
        confirmedByUser: false,
        intent: 'connect_external_mcp',
      }),
    ).toThrow(/explicit user authorization/i);
    expect(() =>
      authorizeRemoteMcpConnection({
        endpoint: 'https://mcp.example.com/mcp',
        confirmedByUser: true,
        intent: 'anything_else' as 'connect_external_mcp',
      }),
    ).toThrow(/intent/i);
    expect(() =>
      authorizeRemoteMcpConnection({
        endpoint: 'https://mcp.example.com/mcp',
        confirmedByUser: true,
        intent: 'connect_external_mcp',
        now: Number.MAX_SAFE_INTEGER,
      } as never),
    ).toThrow(/authorization request/i);
  });

  it('does not expose or accept remote credential material', () => {
    expect(() =>
      authorizeRemoteMcpConnection({
        endpoint: 'https://mcp.example.com/mcp',
        confirmedByUser: true,
        intent: 'connect_external_mcp',
        credentials: 'Bearer secret',
      } as never),
    ).toThrow(/credential/i);
  });

  it('rejects forged, expired, cross-endpoint, and reused receipts', () => {
    expect(() =>
      claimRemoteMcpAuthorization(
        {
          endpoint: 'https://mcp.example.com/mcp',
          intent: 'connect_external_mcp',
          expiresAt: Number.MAX_SAFE_INTEGER,
        } as RemoteMcpAuthorizationReceipt,
        'https://mcp.example.com/mcp',
      ),
    ).toThrow(/authorization/i);

    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const expired = authorizeRemoteMcpConnection({
      endpoint: 'https://mcp.example.com/mcp',
      confirmedByUser: true,
      intent: 'connect_external_mcp',
    });
    now.mockReturnValue(301_001);
    expect(() => claimRemoteMcpAuthorization(expired, 'https://mcp.example.com/mcp')).toThrow(
      /expired/i,
    );
    now.mockRestore();

    const crossEndpoint = authorizeRemoteMcpConnection({
      endpoint: 'https://mcp.example.com/mcp',
      confirmedByUser: true,
      intent: 'connect_external_mcp',
    });
    expect(() =>
      claimRemoteMcpAuthorization(crossEndpoint, 'https://other.example.com/mcp'),
    ).toThrow(/endpoint/i);

    const once = authorizeRemoteMcpConnection({
      endpoint: 'https://mcp.example.com/mcp',
      confirmedByUser: true,
      intent: 'connect_external_mcp',
    });
    claimRemoteMcpAuthorization(once, 'https://mcp.example.com/mcp');
    expect(() => claimRemoteMcpAuthorization(once, 'https://mcp.example.com/mcp')).toThrow(
      /authorization/i,
    );
  });
});
