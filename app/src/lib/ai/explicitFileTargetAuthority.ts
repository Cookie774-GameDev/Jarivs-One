import type { Part } from '@/types';

const WINDOWS_FILE_PATH_RE =
  /[A-Za-z]:\\[^\r\n<>:"|?*]+?\.(?:json|cs|ts|tsx|js|jsx|md|txt|html|css|scss|py|rs|go|java|cpp|c|h|hpp|xml|yaml|yml|toml|ini|sql)\b/gi;

function requestedActionMatches(text: string, actionId: string): boolean {
  if (actionId === 'files.read') return /\b(?:read|inspect|summari[sz]e|audit|review)\b/i.test(text);
  if (actionId === 'files.edit') {
    return /\b(?:edit|refine|rewrite|revise|update|upgrade|modify|write)\b/i.test(text);
  }
  return false;
}

/**
 * A single explicit absolute target in the current user request outranks a
 * model-invented relative/default-root substitute for the same requested file
 * action. Ambiguous requests and unrelated action types are left untouched.
 */
export function bindExplicitFileTargetAuthority(
  userText: string,
  parts: readonly Part[],
): Part[] {
  const paths = Array.from(new Set(userText.match(WINDOWS_FILE_PATH_RE) ?? []));
  if (paths.length !== 1) return parts.map((part) => structuredClone(part));
  const target = paths[0]!;
  return parts.map((part) => {
    if (
      part.kind !== 'action_proposal' ||
      !requestedActionMatches(userText, part.action_id) ||
      (part.action_id !== 'files.read' && part.action_id !== 'files.edit')
    ) {
      return structuredClone(part);
    }
    const params = structuredClone(part.params);
    if (params.path === target && !('root' in params)) return structuredClone(part);
    params.path = target;
    delete params.root;
    return { ...structuredClone(part), params };
  });
}
