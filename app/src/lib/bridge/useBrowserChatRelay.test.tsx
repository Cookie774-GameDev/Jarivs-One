import { describe, expect, it } from 'vitest';

import { resolveBrowserChatRelayUrl } from './useBrowserChatRelay';

describe('Browser Chat relay lifecycle', () => {
  it('uses a dedicated encrypted endpoint rather than the Phone/Voice bridge', () => {
    expect(resolveBrowserChatRelayUrl('https://cloud.vibespace.test/')).toBe(
      'wss://cloud.vibespace.test/browser-chat/bridge',
    );
    expect(resolveBrowserChatRelayUrl('http://127.0.0.1:8787')).toBe(
      'ws://127.0.0.1:8787/browser-chat/bridge',
    );
  });

  it('fails closed for absent and unsupported cloud URLs', () => {
    expect(resolveBrowserChatRelayUrl(undefined)).toBeNull();
    expect(resolveBrowserChatRelayUrl('ftp://cloud.vibespace.test')).toBeNull();
  });
});
