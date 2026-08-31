import { canonicalProviderAlias } from './parse';
import type { LiveTerminalTarget, TargetResolution, TerminalSelector } from './types';

const MAX_TARGETS = 1_024;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function boundedText(value: unknown, maximum = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim() &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function validSelector(selector: unknown): selector is TerminalSelector {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) return false;
  const candidate = selector as TerminalSelector;
  const allowedKeys = new Set([
    'ordinal',
    'sessionId',
    'paneId',
    'label',
    'agentSlug',
    'provider',
    'scope',
  ]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return false;
  if (candidate.scope !== undefined && candidate.scope !== 'one' && candidate.scope !== 'all') {
    return false;
  }
  const selectors = [
    candidate.sessionId,
    candidate.paneId,
    candidate.ordinal,
    candidate.provider,
    candidate.agentSlug,
    candidate.label,
  ].filter((value) => value !== undefined);
  if (selectors.length === 0) return candidate.scope === 'all';
  if (selectors.length !== 1) return false;
  if (candidate.ordinal !== undefined) {
    return (
      Number.isSafeInteger(candidate.ordinal) &&
      candidate.ordinal > 0 &&
      candidate.ordinal <= MAX_TARGETS
    );
  }
  return [
    candidate.sessionId,
    candidate.paneId,
    candidate.label,
    candidate.agentSlug,
    candidate.provider,
  ].every((value) => value === undefined || boundedText(value));
}

function validTarget(target: unknown): target is LiveTerminalTarget {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as LiveTerminalTarget;
  const identity = candidate.processIdentity;
  return (
    boundedText(candidate.sessionId) &&
    boundedText(candidate.paneId) &&
    (candidate.projectId === null || boundedText(candidate.projectId)) &&
    Number.isSafeInteger(candidate.ordinal) &&
    candidate.ordinal > 0 &&
    candidate.ordinal <= MAX_TARGETS &&
    [candidate.label, candidate.agentSlug, candidate.provider, candidate.command].every(
      (value) => value === undefined || boundedText(value, 512),
    ) &&
    Boolean(identity) &&
    identity.projectId === candidate.projectId &&
    boundedText(identity.processInstanceId) &&
    Number.isSafeInteger(identity.pid) &&
    identity.pid > 0 &&
    Number.isSafeInteger(identity.processStartedAt) &&
    identity.processStartedAt > 0 &&
    boundedText(identity.runtimeGeneration)
  );
}

function validTargets(targets: unknown): targets is readonly LiveTerminalTarget[] {
  if (!Array.isArray(targets) || targets.length > MAX_TARGETS || !targets.every(validTarget)) {
    return false;
  }
  return (
    new Set(targets.map((target) => target.sessionId)).size === targets.length &&
    new Set(targets.map((target) => target.paneId)).size === targets.length &&
    new Set(targets.map((target) => target.ordinal)).size === targets.length
  );
}

function snapshotTarget(target: LiveTerminalTarget): LiveTerminalTarget {
  return Object.freeze({
    ...target,
    processIdentity: Object.freeze({ ...target.processIdentity }),
  });
}

function exactText(value: string | undefined, query: string): boolean {
  return value?.trim().toLowerCase() === query.trim().toLowerCase();
}

function targetText(target: LiveTerminalTarget): string[] {
  return [target.label, target.agentSlug, target.provider, target.command].filter(
    (value): value is string => Boolean(value),
  );
}

function finish(matches: LiveTerminalTarget[], scope: 'one' | 'all'): TargetResolution {
  if (matches.length === 0) return Object.freeze({ kind: 'missing' });
  if (scope === 'all') {
    const targets = Object.freeze(matches.map(snapshotTarget)) as unknown as LiveTerminalTarget[];
    return Object.freeze({ kind: 'many', targets });
  }
  if (matches.length > 1) return Object.freeze({ kind: 'ambiguous' });
  return Object.freeze({ kind: 'one', target: snapshotTarget(matches[0]!) });
}

export function resolveTerminalTarget(
  selector: TerminalSelector,
  targets: readonly LiveTerminalTarget[],
): TargetResolution {
  if (!validSelector(selector) || !validTargets(targets)) {
    return Object.freeze({ kind: 'missing' });
  }
  const scope = selector.scope ?? 'one';
  if (selector.sessionId) {
    return finish(
      targets.filter((target) => target.sessionId === selector.sessionId),
      scope,
    );
  }
  if (selector.paneId) {
    return finish(
      targets.filter((target) => target.paneId === selector.paneId),
      scope,
    );
  }
  if (selector.ordinal !== undefined) {
    return finish(
      targets.filter((target) => target.ordinal === selector.ordinal),
      scope,
    );
  }
  if (selector.provider) {
    const provider = canonicalProviderAlias(selector.provider) ?? selector.provider.toLowerCase();
    return finish(
      targets.filter((target) =>
        target.provider
          ? (canonicalProviderAlias(target.provider) ?? target.provider.toLowerCase()) === provider
          : targetText(target).some((value) => canonicalProviderAlias(value) === provider),
      ),
      scope,
    );
  }
  const exactQuery = selector.agentSlug ?? selector.label;
  if (exactQuery) {
    const exact = targets.filter((target) =>
      targetText(target).some((value) => exactText(value, exactQuery)),
    );
    if (exact.length > 0) return finish(exact, scope);
    const query = exactQuery.trim().toLowerCase();
    return finish(
      targets.filter((target) =>
        targetText(target).some((value) => value.toLowerCase().includes(query)),
      ),
      scope,
    );
  }
  return scope === 'all' ? finish([...targets], 'all') : Object.freeze({ kind: 'missing' });
}
