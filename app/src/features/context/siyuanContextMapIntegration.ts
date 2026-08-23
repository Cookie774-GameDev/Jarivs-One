import { devConsole } from '@/features/dev-console';
import {
  getProductionSiyuanRlmPort,
  type ProductionSiyuanRlmPort,
  type SiyuanManagedDocument,
} from './siyuanRlmProduction';
import type { ContextMapRecord, ContextTreeNode } from './tree';
import type { ProjectContextTree } from './tree';

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

function encodeTree(tree: ProjectContextTree): string {
  const bytes = new TextEncoder().encode(JSON.stringify(tree));
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function decodeTree(value: string): ProjectContextTree {
  const padded = `${value.replace(/-/gu, '+').replace(/_/gu, '/')}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ProjectContextTree;
  if (
    !parsed ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.nodes) ||
    typeof parsed.rootDir !== 'string' ||
    typeof parsed.fileCount !== 'number'
  ) {
    throw new Error('siyuan_context_map_payload_invalid');
  }
  return parsed;
}

function inlineText(value: string, max = 500): string {
  return safeText(value, max).replace(/[*`]/gu, '');
}

function nodeId(value: string, recordId: string, index: number): string {
  try {
    const decoded = decodeURIComponent(value).trim();
    if (decoded) return decoded.slice(0, 500);
  } catch {
    // A manually damaged identity marker receives a deterministic local fallback.
  }
  return `${recordId}-siyuan-${index}`;
}

function contextMapMarkdown(record: ContextMapRecord): string {
  const payload = encodeTree(record.tree);
  const lines = [
    `<!-- ${marker(record.id)} payload=${payload} -->`,
    `# ${safeText(record.name)}`,
    '',
    '> Live VibeSpace Context Map projected into the local SiYuan project vault.',
    '',
    safeText(record.tree.summary, 2_000),
    '',
    `> Files: ${record.tree.fileCount} · Bytes: ${record.tree.totalBytes} · Generated: ${record.tree.generatedAt}`,
    '',
    '## Context nodes',
    '',
  ];
  if (new TextEncoder().encode(lines.join('\n')).byteLength >= MAX_MARKDOWN_BYTES - 2_000) {
    throw new Error('siyuan_context_map_requires_sharding');
  }
  let count = 0;
  const walk = (nodes: readonly ContextTreeNode[], depth: number) => {
    for (const node of nodes) {
      if (count >= MAX_NODES) return;
      count += 1;
      const location = node.path ? ` — \`${inlineText(node.path, 1_000)}\`` : '';
      const summary = node.summary ? `: ${inlineText(node.summary, 1_500)}` : '';
      const nodeIdentity = encodeURIComponent(node.id).slice(0, 500);
      lines.push(
        `${'  '.repeat(Math.min(depth, 24))}- **${inlineText(node.title)}** (${node.kind})${location}${summary} <!-- vibespace-node:${nodeIdentity} -->`,
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

export interface SiyuanContextMapSnapshot {
  document: SiyuanManagedDocument;
  tree: ProjectContextTree;
}

function parseContextMapMarkdown(
  document: SiyuanManagedDocument,
  record: ContextMapRecord,
): SiyuanContextMapSnapshot {
  if (!document.markdown.includes(marker(record.id))) {
    throw new Error('siyuan_context_map_marker_invalid');
  }
  const payloadMatch = /\bpayload=([A-Za-z0-9_-]+)\s*-->/u.exec(document.markdown);
  if (payloadMatch?.[1]) {
    return {
      document,
      tree: {
        ...decodeTree(payloadMatch[1]),
        model: 'siyuan-managed-v1',
      },
    };
  }
  const nodes: ContextTreeNode[] = [];
  const stack: Array<{ depth: number; node: ContextTreeNode }> = [];
  const linePattern =
    /^(\s*)- \*\*(.+?)\*\* \((root|area|file|symbol|note)\)(?: — `([^`]*)`)?(?:: (.*?))?\s*<!-- vibespace-node:([^ ]+) -->$/u;
  for (const line of document.markdown.split(/\r?\n/u)) {
    const match = linePattern.exec(line);
    if (!match) continue;
    const depth = Math.min(24, Math.floor((match[1]?.length ?? 0) / 2));
    const node: ContextTreeNode = {
      id: nodeId(match[6] ?? '', record.id, nodes.length + stack.length),
      title: inlineText(match[2] ?? 'Untitled', 500),
      kind: (match[3] ?? 'note') as ContextTreeNode['kind'],
      summary: match[5]
        ? inlineText(match[5], 1_500)
        : `${inlineText(match[2] ?? 'Untitled', 500)} in the SiYuan Context Map.`,
      ...(match[4] ? { path: inlineText(match[4], 1_000) } : {}),
    };
    while (stack.length && stack.at(-1)!.depth >= depth) stack.pop();
    const parent = stack.at(-1)?.node;
    if (parent) {
      parent.children = [...(parent.children ?? []), node];
    } else {
      nodes.push(node);
    }
    stack.push({ depth, node });
  }
  if (record.tree.nodes.length > 0 && nodes.length === 0) {
    throw new Error('siyuan_context_map_graph_invalid');
  }
  return {
    document,
    tree: {
      ...record.tree,
      model: 'siyuan-managed-v1',
      nodes,
    },
  };
}

function isManagedDocumentAmbiguity(error: unknown): boolean {
  return error instanceof Error && error.message === 'siyuan_managed_document_ambiguous';
}

async function readManagedDocumentWithDuplicateRecovery(
  port: ProductionSiyuanRlmPort,
  projectId: string,
  record: ContextMapRecord,
): Promise<SiyuanManagedDocument | null> {
  const lookup = { query: record.id, marker: marker(record.id) };
  try {
    return await port.readManagedDocument(projectId, lookup);
  } catch (error) {
    if (!isManagedDocumentAmbiguity(error)) throw error;
  }

  const summaries = await port.searchBlocks(projectId, record.id, 50);
  const candidates: SiyuanManagedDocument[] = [];
  for (const id of [...new Set(summaries.map((summary) => summary.id))]) {
    const block = await port.getBlock(projectId, id);
    if (block.markdown.includes(lookup.marker)) candidates.push(block);
  }
  const byNotebook = new Map<string, SiyuanManagedDocument[]>();
  for (const candidate of candidates) {
    const grouped = byNotebook.get(candidate.notebookId) ?? [];
    grouped.push(candidate);
    byNotebook.set(candidate.notebookId, grouped);
  }
  const duplicateGroups = [...byNotebook.values()].filter((group) => group.length > 1);
  if (duplicateGroups.length !== 1) throw new Error('siyuan_managed_document_ambiguous');
  const [canonical, ...duplicates] = duplicateGroups[0]!.sort((left, right) =>
    left.id.localeCompare(right.id, 'en-US'),
  );
  if (!canonical) throw new Error('siyuan_managed_document_ambiguous');
  for (const duplicate of duplicates) {
    await port.deleteManagedDocument(projectId, duplicate.id, duplicate.markdown);
  }
  devConsole.log({
    channel: 'ai',
    level: 'warn',
    message: 'SiYuan Context map duplicates repaired',
    detail: { mapId: record.id, removed: duplicates.length },
  });
  return canonical;
}

export function createSiyuanContextMapIntegration(port: ProductionSiyuanRlmPort) {
  const warming = new Map<string, Promise<void>>();
  const managedDocumentIds = new Map<string, string>();
  const documentKey = (projectId: string, mapId: string) => `${projectId}\u0000${mapId}`;

  const readKnownDocument = async (
    projectId: string,
    record: ContextMapRecord,
  ): Promise<SiyuanManagedDocument | null> => {
    const key = documentKey(projectId, record.id);
    const knownId = managedDocumentIds.get(key);
    if (!knownId) return null;
    try {
      const document = await port.getBlock(projectId, knownId);
      if (document.markdown.includes(marker(record.id))) return document;
    } catch {
      // The document may have been removed or replaced in SiYuan. Fall back
      // to marker lookup so user/Jarvis edits remain authoritative.
    }
    managedDocumentIds.delete(key);
    return null;
  };

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

    async read(
      projectId: string,
      record: ContextMapRecord,
    ): Promise<SiyuanContextMapSnapshot | null> {
      const exactProjectId = projectId.trim();
      if (!exactProjectId || record.status !== 'active') return null;
      const document =
        (await readKnownDocument(exactProjectId, record)) ??
        (await readManagedDocumentWithDuplicateRecovery(port, exactProjectId, record));
      if (!document) return null;
      managedDocumentIds.set(documentKey(exactProjectId, record.id), document.id);
      try {
        return parseContextMapMarkdown(document, record);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'message' in error &&
          error.message === 'siyuan_context_map_graph_invalid'
        ) {
          return null;
        }
        throw error;
      }
    },

    async sync(projectId: string, record: ContextMapRecord): Promise<SiyuanContextMapSnapshot> {
      const startedAt = Date.now();
      const exactProjectId = projectId.trim();
      if (!exactProjectId || record.status !== 'active')
        throw new Error('siyuan_context_map_scope_invalid');
      const markdown = contextMapMarkdown(record);
      const existing =
        (await readKnownDocument(exactProjectId, record)) ??
        (await readManagedDocumentWithDuplicateRecovery(port, exactProjectId, record));
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
      managedDocumentIds.set(documentKey(exactProjectId, record.id), document.id);
      const snapshot = parseContextMapMarkdown(document, record);
      devConsole.log({
        channel: 'ai',
        level: 'info',
        message: 'SiYuan Context map synchronized',
        durationMs: Date.now() - startedAt,
        detail: { fileCount: record.tree.fileCount, updated: Boolean(existing) },
      });
      return snapshot;
    },
  });
}

export const productionSiyuanContextMaps = createSiyuanContextMapIntegration(
  getProductionSiyuanRlmPort(),
);
