import { describe, expect, it } from 'vitest';

import type { JarvisApprovalV1 } from '@/lib/jarvis/contracts';
import * as approvalBridge from './approvalBridge';

function approval(overrides: Partial<JarvisApprovalV1> = {}): JarvisApprovalV1 {
  return {
    id: 'jappr_alpha',
    schemaVersion: 1,
    runId: 'jrun_alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    actionId: 'notes.create',
    actionVersion: 1,
    params: {
      apiKey: 'sk-test-private-value',
      title: 'Hello',
      structured: { private: 'not-rendered' },
    },
    secretHandleRefs: [{ field: 'token', handleId: 'jsecret_private' }],
    paramsHash: 'params-hash',
    targetSnapshot: { kind: 'app_resource', namespace: 'notes', resourceId: 'hello' },
    risk: 'confirm',
    status: 'pending',
    capabilityId: 'notes.write',
    capabilitySnapshotHash: 'capability-hash',
    expectedEffect: 'Create the approved note.',
    expiresAt: 20_000,
    createdAt: 10_000,
    ...overrides,
  };
}

describe('canonical action approval presentation bridge', () => {
  it('round-trips only canonical approval ids and exposes no lifecycle authority', () => {
    const callId = approvalBridge.createTaskApprovalCallId('jappr_alpha');
    expect(callId).toBe('jarvisapproval:jappr_alpha');
    expect(approvalBridge.parseTaskApprovalCallId(callId)).toEqual({ approvalId: 'jappr_alpha' });
    expect(approvalBridge.parseTaskApprovalCallId('jarvisapproval:')).toBeNull();
    expect(approvalBridge.parseTaskApprovalCallId('jarvisapproval:%E0%A4%A')).toBeNull();
    expect(approvalBridge.parseTaskApprovalCallId('jarvisrun:legacy:step')).toBeNull();
    expect(Object.keys(approvalBridge).sort()).toEqual([
      'createTaskApprovalCallId',
      'parseTaskApprovalCallId',
      'presentJarvisApproval',
    ]);
  });

  it('redacts secret handles and structured values from the bounded presentation', () => {
    const presentation = approvalBridge.presentJarvisApproval(
      approval({ params: { apiKey: 'private', opaque: 'jsecret_private', structured: {} } }),
    );

    expect(presentation).toEqual({
      actionId: 'notes.create',
      expectedEffect: 'Create the approved note.',
      risk: 'confirm',
      parameters: [
        { field: 'apiKey', safeValue: '[redacted]' },
        { field: 'opaque', safeValue: '[redacted]' },
        { field: 'structured', safeValue: '[structured value]' },
      ],
    });
    expect(JSON.stringify(presentation)).not.toContain('jsecret_private');
  });

  it('bounds identifiers, effect copy, field names, values, and parameter count', () => {
    const presentation = approvalBridge.presentJarvisApproval(
      approval({
        actionId: 'a'.repeat(300),
        expectedEffect: 'e'.repeat(900),
        params: Object.fromEntries([
          ['f'.repeat(300), 'v'.repeat(400)],
          ...Array.from({ length: 40 }, (_, index) => [`field-${index}`, `value-${index}`]),
        ]),
      }),
    );

    expect(presentation.actionId).toHaveLength(128);
    expect(presentation.expectedEffect).toHaveLength(512);
    expect(presentation.parameters).toHaveLength(32);
    expect(
      Math.max(...presentation.parameters.map(({ field }) => field.length)),
    ).toBeLessThanOrEqual(128);
    expect(
      Math.max(...presentation.parameters.map(({ safeValue }) => safeValue.length)),
    ).toBeLessThanOrEqual(160);
  });
});
