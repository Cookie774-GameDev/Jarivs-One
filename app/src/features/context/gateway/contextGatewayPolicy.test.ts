import { describe, expect, it } from 'vitest';
import { decideContextPolicy } from './contextGatewayPolicy';

const scope = {
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  worktreeId: 'worktree-1',
  revision: 'scope-v1',
} as const;

describe('shared Context Gateway policy', () => {
  it('keeps ordinary known current-file work optional and direct', () => {
    expect(decideContextPolicy({
      scope,
      taskKind: 'answer',
      access: 'read',
      workingSet: 'complete',
      gatewayAvailable: true,
      optionalEnrichmentEnabled: true,
    })).toMatchObject({ decision: 'optional-direct', route: 'direct', required: false });
  });

  it('uses an exact read for a declared exact identifier without broad ranking', () => {
    expect(decideContextPolicy({
      scope,
      taskKind: 'answer',
      access: 'read',
      workingSet: 'incomplete',
      exactIdentifiers: ['src/runtime.ts:120'],
      gatewayAvailable: true,
      optionalEnrichmentEnabled: true,
    })).toMatchObject({ decision: 'required-focused', route: 'exact', required: true });
  });

  it('requires focused evidence for broad write-capable work', () => {
    const result = decideContextPolicy({
      scope,
      taskKind: 'write',
      access: 'write',
      workingSet: 'incomplete',
      broadChange: true,
      gatewayAvailable: true,
      optionalEnrichmentEnabled: true,
    });
    expect(result).toMatchObject({ decision: 'required-focused', route: 'focused', required: true });
    expect(result.reasons).toContain('broad-change');
    expect(result.reasons).toContain('write-capable');
  });

  it.each(['authentication', 'credentials', 'billing', 'migration', 'release', 'destructive', 'security'] as const)(
    'requires deep evidence for %s risk',
    (riskDomain) => {
      expect(decideContextPolicy({
        scope,
        taskKind: 'action',
        access: 'full',
        workingSet: 'complete',
        riskDomains: [riskDomain],
        gatewayAvailable: true,
        optionalEnrichmentEnabled: true,
      })).toMatchObject({ decision: 'required-deep', route: 'deep', required: true });
    },
  );

  it('does not let optional enrichment off downgrade required evidence', () => {
    expect(decideContextPolicy({
      scope,
      taskKind: 'write',
      access: 'write',
      workingSet: 'incomplete',
      userIntent: { audit: true },
      gatewayAvailable: true,
      optionalEnrichmentEnabled: false,
    })).toMatchObject({ decision: 'required-focused', route: 'focused', required: true });
  });

  it('blocks a required decision when the Gateway is unavailable', () => {
    expect(decideContextPolicy({
      scope,
      taskKind: 'action',
      access: 'full',
      workingSet: 'complete',
      riskDomains: ['security'],
      gatewayAvailable: false,
      optionalEnrichmentEnabled: true,
    })).toMatchObject({
      decision: 'blocked-context-unavailable',
      route: 'deep',
      required: true,
      safeFailure: 'gateway-unavailable',
    });
  });
});
