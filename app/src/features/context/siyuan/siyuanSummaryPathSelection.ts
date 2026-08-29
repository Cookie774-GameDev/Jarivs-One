function normalizedPathKey(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/u, '');
  const slashNormalized = /^[A-Za-z]:[\\/]/u.test(trimmed)
    ? trimmed.replace(/\//gu, '\\')
    : trimmed.replace(/\\/gu, '/');
  return slashNormalized.toLocaleLowerCase('en-US');
}

function safePath(path: string): string | null {
  const trimmed = path.trim();
  if (
    !trimmed ||
    trimmed.length > 32_767 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function mergeSiyuanSummaryPaths(
  current: readonly string[],
  incoming: readonly string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [...current, ...incoming]) {
    const path = safePath(candidate);
    if (!path) continue;
    const key = normalizedPathKey(path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

export function parseSiyuanSummaryPathDraft(draft: string): string[] {
  return mergeSiyuanSummaryPaths([], draft.split(/\r?\n/gu));
}
