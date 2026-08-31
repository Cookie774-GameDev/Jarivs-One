import type { EventId } from '@/types/common';

import type { CaoSupervisionScheduleMetadataV1 } from './jarvisSchedules';

export const CAO_SCHEDULE_TARGET_ID = 'learning-md';
export const CAO_SCHEDULE_POLICY_ID = 'quarter-hour-v1';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type CaoScheduleCapability = Readonly<{
  run: unknown;
  recover: unknown;
}>;

export type CaoScheduleBootstrapMissing =
  | 'account'
  | 'workspace'
  | 'project'
  | 'learning_account'
  | 'learning_disabled'
  | 'capability'
  | 'event_identity';

export type CaoScheduleBootstrapResult =
  | Readonly<{
      status: 'ready';
      eventId: EventId;
      projectId: string;
      caoSupervision: CaoSupervisionScheduleMetadataV1;
    }>
  | Readonly<{ status: 'unavailable'; missing: readonly CaoScheduleBootstrapMissing[] }>;

function safe(value: string | null | undefined): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function unavailable(missing: readonly CaoScheduleBootstrapMissing[]): CaoScheduleBootstrapResult {
  return Object.freeze({ status: 'unavailable', missing: Object.freeze([...missing]) });
}

export function createCaoScheduleBootstrap(input: {
  accountId: string | null | undefined;
  workspaceId: string | null | undefined;
  projectId: string | null | undefined;
  learningAccountId: string | null | undefined;
  learningEnabled: boolean;
  capability: Partial<CaoScheduleCapability> | null | undefined;
  newEventId: () => string;
}): CaoScheduleBootstrapResult {
  const missing: CaoScheduleBootstrapMissing[] = [];
  if (!safe(input.accountId)) missing.push('account');
  if (!safe(input.workspaceId)) missing.push('workspace');
  if (!safe(input.projectId)) missing.push('project');
  if (!safe(input.learningAccountId) || input.learningAccountId !== input.accountId) {
    missing.push('learning_account');
  }
  if (!input.learningEnabled) missing.push('learning_disabled');
  if (
    typeof input.capability?.run !== 'function' ||
    typeof input.capability?.recover !== 'function'
  ) {
    missing.push('capability');
  }
  if (missing.length > 0) return unavailable(missing);

  const eventId = input.newEventId();
  if (!safe(eventId)) {
    return unavailable(['event_identity']);
  }
  const projectId = input.projectId!;
  return Object.freeze({
    status: 'ready',
    eventId: eventId as EventId,
    projectId,
    caoSupervision: Object.freeze({
      schemaVersion: 1,
      mode: 'cao_supervision',
      scheduleId: eventId,
      policyId: CAO_SCHEDULE_POLICY_ID,
      targetId: CAO_SCHEDULE_TARGET_ID,
      projectId,
    }),
  });
}
