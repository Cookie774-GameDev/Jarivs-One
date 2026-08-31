import type { JarvisArtifactV1 } from '@/lib/jarvis/contracts/execution';
import { projectJarvisArtifactReference } from '@/features/jarvis-command-center/artifactAccess';
import { CAO_NATIVE_IDENTITY } from '@/features/cao/bootstrap';

export type ReferenceCatalogKind = 'cao' | 'agent' | 'plugin' | 'artifact';

export type ReferenceCatalogEntry = Readonly<{
  key: `${ReferenceCatalogKind}:${string}`;
  kind: ReferenceCatalogKind;
  entityId: string;
  mention: string;
  aliases?: readonly string[];
  label: string;
  description?: string;
  metadata?: string;
}>;

type ReferenceAgent = Readonly<{
  id: string;
  slug: string;
  name: string;
  description?: string;
}>;

type ReferencePlugin = Readonly<{
  id: string;
  name: string;
  description?: string;
  category?: string;
}>;

const REFERENCE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

function stableDisplayText(value: string | undefined, maximum = 512): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function normalizedMention(value: string): string {
  return value.toLowerCase();
}

export type AccountReferenceCatalogInput = Readonly<{
  accountId: string;
  artifactScope: Readonly<{
    accountId: string;
    artifacts: readonly JarvisArtifactV1[];
  }>;
  agents: readonly ReferenceAgent[];
  plugins: readonly ReferencePlugin[];
}>;

function artifactDescription(
  kind: JarvisArtifactV1['kind'],
  state: JarvisArtifactV1['state'],
): string {
  const kindLabel = kind.replace(/_/gu, ' ').replace(/^./u, (character) => character.toUpperCase());
  const stateLabel = state.replace(/^./u, (character) => character.toUpperCase());
  return `${kindLabel} artifact · ${stateLabel}`;
}

export function buildAccountReferenceCatalog(
  input: AccountReferenceCatalogInput,
): readonly ReferenceCatalogEntry[] {
  const entries: ReferenceCatalogEntry[] = [];
  const keys = new Set<string>();
  const mentions = new Set<string>();
  const append = (entry: ReferenceCatalogEntry): void => {
    const ownedMentions = [entry.mention, ...(entry.aliases ?? [])].map(normalizedMention);
    if (keys.has(entry.key) || ownedMentions.some((mention) => mentions.has(mention))) return;
    keys.add(entry.key);
    for (const mention of ownedMentions) mentions.add(mention);
    entries.push(Object.freeze(entry));
  };

  append({
    key: `cao:${CAO_NATIVE_IDENTITY.id}`,
    kind: 'cao',
    entityId: CAO_NATIVE_IDENTITY.id,
    mention: CAO_NATIVE_IDENTITY.mention,
    aliases: CAO_NATIVE_IDENTITY.aliases,
    label: CAO_NATIVE_IDENTITY.name,
    description: 'First-party learning and improvement authority',
    metadata: 'Native · Codex learner',
  });

  for (const agent of input.agents) {
    if (
      !REFERENCE_TOKEN.test(agent.id) ||
      !REFERENCE_TOKEN.test(agent.slug) ||
      !stableDisplayText(agent.name) ||
      (agent.description !== undefined && !stableDisplayText(agent.description, 2_048))
    ) {
      continue;
    }
    append({
      key: `agent:${agent.id}`,
      kind: 'agent',
      entityId: agent.id,
      mention: `@${agent.slug}`,
      label: agent.name,
      ...(agent.description ? { description: agent.description } : {}),
    });
  }

  for (const plugin of input.plugins) {
    if (
      !REFERENCE_TOKEN.test(plugin.id) ||
      !stableDisplayText(plugin.name) ||
      (plugin.description !== undefined && !stableDisplayText(plugin.description, 2_048)) ||
      (plugin.category !== undefined && !stableDisplayText(plugin.category))
    ) {
      continue;
    }
    append({
      key: `plugin:${plugin.id}`,
      kind: 'plugin',
      entityId: plugin.id,
      mention: `@${plugin.id}`,
      label: plugin.name,
      ...(plugin.description ? { description: plugin.description } : {}),
      ...(plugin.category ? { metadata: plugin.category } : {}),
    });
  }

  if (input.accountId && input.artifactScope.accountId === input.accountId) {
    for (const artifact of input.artifactScope.artifacts) {
      const projected = projectJarvisArtifactReference(artifact);
      if (!projected) continue;
      append({
        key: `artifact:${projected.artifactId}`,
        kind: 'artifact',
        entityId: projected.artifactId,
        mention: `@artifact:${projected.artifactId}`,
        label: projected.title,
        description: artifactDescription(projected.kind, projected.state),
      });
    }
  }

  return Object.freeze(entries);
}

export function filterReferenceCatalog(
  entries: readonly ReferenceCatalogEntry[],
  query: string,
): readonly ReferenceCatalogEntry[] {
  const normalized = query.trim().replace(/^@/u, '').toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) =>
    [
      entry.mention.slice(1),
      ...(entry.aliases?.map((alias) => alias.slice(1)) ?? []),
      entry.label,
      entry.description,
      entry.metadata,
    ].some((value) => value?.toLowerCase().includes(normalized)),
  );
}
