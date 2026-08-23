import { devConsole } from '@/features/dev-console';
import {
  getProductionSiyuanRlmPort,
  type ProductionSiyuanRlmPort,
  type SiyuanManagedDocument,
} from './siyuanRlmProduction';
import type { ContextMapRecord, ContextTreeNode } from './tree';

const MAX_NODES = 10_000;
const MAX_MARKDOWN_BYTES = 900_000;

function safeText(value: string, max = 500): string {
  return value
    .replace(/[\r\n\u0000-\u001f\u007f]+/gu, ' ')
    .trim()
    .slice(0, max);
}

function slug(value: string): string {
  return (
    value
      .replace(/[^A-Za-z0-9_-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 80) || 'map'
  );
}

function marker(mapId: string): string {
  return `vibespace-context-map:v1 map=${safeText(mapId, 200)}`;
}

function contextMapMarkdown(record: ContextMapRecord): string {
  const lines = [
    `<!-- ${marker(record.id)} -->`,
    `# ${safeText(record.name)}`,
    '',
    '> Live VibeSpace Context Map projected into the local SiYuan project vault.',
    '',
    safeText(record.tree.summary, 2_000),
    '',
    '## Context nodes',
    '',
  ];
  let count = 0;
  const walk = (nodes: readonly ContextTreeNode[], depth: number) => {
    for (const node of nodes) {
      if (count >= MAX_NODES) return;
      count += 1;
      const location = node.path ? ` — \`${safeText(node.path, 1_000).replace(/`/gu, '')}\`` : '';
      const summary = node.summary ? `: ${safeText(node.summary, 1_500)}` : '';
      lines.push(
        `${'  '.repeat(Math.min(depth, 24))}- **${safeText(node.title)}** (${node.kind})${location}${summary}`,
      );
      if (new TextEncoder().encode(lines.join('\n')).byteLength >= MAX_MARKDOWN_BYTES - 2_000) {
        lines.push(
          '',
          '_Additional nodes omitted from this view; VibeSpace keeps the complete Context Map._',
        );
        count = MAX_NODES;
        return;
      }
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(record.tree.nodes, 0);
  return `${lines.join('\n')}\n`;
}

export function createSiyuanContextMapIntegration(port: ProductionSiyuanRlmPort) {
  const warming = new Map<string, Promise<void>>();

  return Object.freeze({
    prewarm(projectId: string): Promise<void> {
      const exact = projectId.trim();
      if (!exact) return Promise.resolve();
      const existing = warming.get(exact);
      if (existing) return existing;
      const startedAt = Date.now();
      const task = port
        .searchBlocks(exact, 'vibespace-context-map:v1', 1)
        .then(() => {
          devConsole.log({
            channel: 'ai',
            level: 'info',
            message: 'SiYuan Context vault ready',
            durationMs: Date.now() - startedAt,
          });
        })
        .catch((error) => {
          warming.delete(exact);
          devConsole.log({
            channel: 'ai',
            level: 'warn',
            message: 'SiYuan Context vault prewarm failed safely',
            durationMs: Date.now() - startedAt,
            detail: { error: error instanceof Error ? error.message : String(error) },
          });
        });
      warming.set(exact, task);
      return task;
    },

    async sync(projectId: string, record: ContextMapRecord): Promise<SiyuanManagedDocument> {
      const startedAt = Date.now();
      const exactProjectId = projectId.trim();
      if (!exactProjectId || record.status !== 'active')
        throw new Error('siyuan_context_map_scope_invalid');
      const documentMarker = marker(record.id);
      const markdown = contextMapMarkdown(record);
      const existing = await port.readManagedDocument(exactProjectId, {
        query: record.id,
        marker: documentMarker,
      });
      const document = existing
        ? existing.markdown === markdown
          ? existing
          : await port.updateManagedDocument(
              exactProjectId,
              existing.id,
              existing.markdown,
              markdown,
            )
        : await port.createManagedDocument(
            exactProjectId,
            `/VibeSpace Context Maps/${slug(record.name)}-${slug(record.id)}`,
            markdown,
          );
      devConsole.log({
        channel: 'ai',
        level: 'info',
        message: 'SiYuan Context map synchronized',
        durationMs: Date.now() - startedAt,
        detail: { fileCount: record.tree.fileCount, updated: Boolean(existing) },
      });
      return document;
    },
  });
}

export const productionSiyuanContextMaps = createSiyuanContextMapIntegration(
  getProductionSiyuanRlmPort(),
);
