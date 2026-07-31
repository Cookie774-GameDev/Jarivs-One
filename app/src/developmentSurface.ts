export type DevelopmentSurface = 'monochrome' | 'sakura';

export function resolveDevelopmentSurface(search: string): DevelopmentSurface | null {
  const params = new URLSearchParams(search);

  if (params.get('monochrome-workbench') === '1') return 'monochrome';
  if (params.get('sakura-style-board') === '1') return 'sakura';
  return null;
}
