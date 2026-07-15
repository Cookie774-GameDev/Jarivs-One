import type { JarvisActionDefinition } from './catalog';

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function searchActionCatalog(
  catalog: readonly JarvisActionDefinition[],
  query: string,
  limit = 50,
): JarvisActionDefinition[] {
  const words = query.toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [];
  return catalog
    .map((action, index) => {
      const primary = `${action.id} ${action.title} ${action.category}`.toLowerCase();
      const secondary = `${action.description} ${action.requiredCapabilities.join(' ')}`.toLowerCase();
      const score = words.reduce((sum, word) =>
        sum + (primary.includes(word) ? 3 : 0) + (secondary.includes(word) ? 1 : 0), 0);
      return { action, index, score };
    })
    .filter(({ score }) => score > 0 || words.length === 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ action }) => action);
}

export function actionCatalogMarkdown(catalog: readonly JarvisActionDefinition[]): string {
  const rows = catalog
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((action) => [
      `| \`${action.id}\``,
      action.title.replace(/\|/g, '\\|'),
      action.category,
      action.risk,
      action.approval,
      action.requiredCapabilities.join(', ') || 'none',
      '|',
    ].join(' | '));
  return [
    '# Jarvis Action Catalog',
    '',
    '> Generated from the typed runtime registry. Do not edit as a source of truth.',
    '',
    '| ID | Title | Category | Risk | Approval | Capabilities |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

export function actionCatalogCsv(catalog: readonly JarvisActionDefinition[]): string {
  const header = 'id,version,title,category,risk,approval,capabilities,permissions,platforms,available';
  const rows = catalog
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((action) => [
      action.id,
      action.version,
      action.title,
      action.category,
      action.risk,
      action.approval,
      action.requiredCapabilities.join(';'),
      action.requiredPermissions.join(';'),
      action.supportedPlatforms.join(';'),
      typeof action.handler === 'function' && action.preconditions.includes('handler-registered'),
    ].map(csvCell).join(','));
  return `${[header, ...rows].join('\n')}\n`;
}
