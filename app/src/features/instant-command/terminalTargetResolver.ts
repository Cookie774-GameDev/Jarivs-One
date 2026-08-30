import { canonicalProviderAlias } from './parse';
import type { LiveTerminalTarget, TargetResolution, TerminalSelector } from './types';

function exactText(value: string | undefined, query: string): boolean {
  return value?.trim().toLowerCase() === query.trim().toLowerCase();
}

function targetText(target: LiveTerminalTarget): string[] {
  return [target.label, target.agentSlug, target.provider, target.command].filter(
    (value): value is string => Boolean(value),
  );
}

function finish(matches: LiveTerminalTarget[], scope: 'one' | 'all'): TargetResolution {
  if (matches.length === 0) return { kind: 'missing' };
  if (scope === 'all') return { kind: 'many', targets: matches };
  if (matches.length > 1) return { kind: 'ambiguous' };
  return { kind: 'one', target: matches[0]! };
}

export function resolveTerminalTarget(
  selector: TerminalSelector,
  targets: readonly LiveTerminalTarget[],
): TargetResolution {
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
  return scope === 'all' ? finish([...targets], 'all') : { kind: 'missing' };
}
