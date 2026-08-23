import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleTwilioMessageWebhook, type TwilioMessageWebhookDeps } from './index.ts';

function request(params: Record<string, string>, signature = 'valid') {
  return new Request('https://example.test/functions/v1/twilio-message-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(params),
  });
}

function makeDeps(overrides: Partial<TwilioMessageWebhookDeps> = {}) {
  const seen: unknown[] = [];
  const deps: TwilioMessageWebhookDeps = {
    publicWebhookUrl: 'https://example.test/functions/v1/twilio-message-webhook',
    verifySignature: async (_signature, _url, _params) => true,
    redeemPairing: async () => false,
    revokeIdentity: async () => undefined,
    processMessage: async (message, deliver) => {
      seen.push(message);
      await deliver('Hello <owner> & welcome.');
      return { kind: 'replied', eventId: 'event-1' };
    },
    ...overrides,
  };
  return { deps, seen };
}

describe('Twilio SMS and WhatsApp remote Jarvis webhook', () => {
  it('rejects invalid signatures before pairing, inference, or reply', async () => {
    let processed = 0;
    const { deps } = makeDeps({
      verifySignature: async () => false,
      processMessage: async () => {
        processed += 1;
        return { kind: 'ignored' };
      },
    });
    const response = await handleTwilioMessageWebhook(
      deps,
      request({ From: '+15551230000', To: '+15559870000', Body: 'hello', MessageSid: 'SM1' }),
    );
    assert.equal(response.status, 403);
    assert.equal(processed, 0);
  });

  it('normalizes SMS and returns one XML-escaped Jarvis reply', async () => {
    const { deps, seen } = makeDeps();
    const response = await handleTwilioMessageWebhook(
      deps,
      request({ From: '+15551230000', To: '+15559870000', Body: 'hello', MessageSid: 'SM1' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(seen, [
      {
        platform: 'sms',
        providerEventId: 'SM1',
        workspaceId: '+15559870000',
        platformUserId: '+15551230000',
        replyAddress: '+15551230000',
        text: 'hello',
      },
    ]);
    assert.match(await response.text(), /Hello &lt;owner&gt; &amp; welcome\./);
  });

  it('uses the WhatsApp identity namespace without treating it as SMS', async () => {
    const { deps, seen } = makeDeps();
    await handleTwilioMessageWebhook(
      deps,
      request({
        From: 'whatsapp:+15551230000',
        To: 'whatsapp:+15559870000',
        Body: 'hello',
        MessageSid: 'SM2',
      }),
    );
    assert.equal((seen[0] as { platform: string }).platform, 'whatsapp');
  });

  it('redeems a one-time pairing code without invoking Jarvis', async () => {
    let processed = 0;
    const { deps } = makeDeps({
      redeemPairing: async (_message, code) => code === 'A1B2C3D4E5F60708',
      processMessage: async () => {
        processed += 1;
        return { kind: 'ignored' };
      },
    });
    const response = await handleTwilioMessageWebhook(
      deps,
      request({
        From: '+15551230000',
        To: '+15559870000',
        Body: 'PAIR A1B2C3D4E5F60708',
        MessageSid: 'SM3',
      }),
    );
    assert.match(await response.text(), /linked to VibeSpace/i);
    assert.equal(processed, 0);
  });

  it('preserves STOP and HELP without inference', async () => {
    let revoked = 0;
    let processed = 0;
    const { deps } = makeDeps({
      revokeIdentity: async () => {
        revoked += 1;
      },
      processMessage: async () => {
        processed += 1;
        return { kind: 'ignored' };
      },
    });
    const stop = await handleTwilioMessageWebhook(
      deps,
      request({ From: '+15551230000', To: '+15559870000', Body: 'STOP', MessageSid: 'SM4' }),
    );
    assert.match(await stop.text(), /unsubscribed/i);
    assert.equal(revoked, 1);
    assert.equal(processed, 0);

    const help = await handleTwilioMessageWebhook(
      deps,
      request({ From: '+15551230000', To: '+15559870000', Body: 'HELP', MessageSid: 'SM5' }),
    );
    assert.match(await help.text(), /Reply STOP/i);
    assert.equal(processed, 0);
  });
});
