export function canonicalSiyuanAuthorityRoot(value: string): string {
  const slashNormalized = value.replace(/\\/gu, '/');
  const windowsRoot = /^[A-Za-z]:\//u.test(slashNormalized) || slashNormalized.startsWith('//');
  const normalized = slashNormalized.replace(/\/{2,}/gu, '/').replace(/\/$/u, '');
  return windowsRoot ? normalized.toLocaleLowerCase('en-US') : normalized;
}
