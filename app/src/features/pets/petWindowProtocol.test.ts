import { describe, expect, it } from 'vitest';
import {
  createPetProtocolMessage,
  validatePetProtocolMessage,
} from './petWindowProtocol';

describe('pet window protocol', () => {
  it('accepts a valid pet:click envelope', () => {
    const msg = createPetProtocolMessage({
      sessionId: 'sess_abc123',
      action: 'pet:click',
      source: 'pet-overlay',
      dest: 'main',
      payload: { sleeping: true },
    });
    const v = validatePetProtocolMessage(msg, 'sess_abc123');
    expect(v.ok).toBe(true);
  });

  it('rejects bad action and unauthorized routes', () => {
    const badAction = validatePetProtocolMessage({
      v: 1,
      id: 'msg_1',
      sessionId: 'sess_1',
      action: 'shell:exec',
      source: 'pet-overlay',
      dest: 'main',
      ts: Date.now(),
      payload: {},
    });
    expect(badAction.ok).toBe(false);

    const badRoute = validatePetProtocolMessage({
      v: 1,
      id: 'msg_2',
      sessionId: 'sess_1',
      action: 'panel:open',
      source: 'pet-mini-panel',
      dest: 'pet-overlay',
      ts: Date.now(),
      payload: {},
    });
    expect(badRoute.ok).toBe(false);
    if (!badRoute.ok) expect(badRoute.error).toBe('unauthorized_route');
  });

  it('rejects session mismatch', () => {
    const msg = createPetProtocolMessage({
      sessionId: 'sess_a',
      action: 'session:heartbeat',
      source: 'main',
      dest: 'broadcast',
      payload: {},
    });
    const v = validatePetProtocolMessage(msg, 'sess_b');
    expect(v.ok).toBe(false);
  });
});
