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

  entries.push(
    Object.freeze({
      key: `cao:${CAO_NATIVE_IDENTITY.id}`,
      kind: 'cao',
      entityId: CAO_NATIVE_IDENTITY.id,
      mention: CAO_NATIVE_IDENTITY.mention,
      aliases: CAO_NATIVE_IDENTITY.aliases,
      label: CAO_NATIVE_IDENTITY.name,
      description: 'First-party learning and improvement authority',
      metadata: 'Native · Codex learner',
    }),
  );

  for (const agent of input.agents) {
    if (!agent.id || !agent.slug || !agent.name) continue;
    entries.push(
      Object.freeze({
        key: `agent:${agent.id}`,
        kind: 'agent',
        entityId: agent.id,
        mention: `@${agent.slug}`,
        label: agent.name,
        ...(agent.description ? { description: agent.description } : {}),
      }),
    );
  }

  for (const plugin of input.plugins) {
    if (!plugin.id || !plugin.name) continue;
    entries.push(
      Object.freeze({
        key: `plugin:${plugin.id}`,
        kind: 'plugin',
        entityId: plugin.id,
        mention: `@${plugin.id}`,
        label: plugin.name,
        ...(plugin.description ? { description: plugin.description } : {}),
        ...(plugin.category ? { metadata: plugin.category } : {}),
      }),
    );
  }

  if (input.accountId && input.artifactScope.accountId === input.accountId) {
    for (const artifact of input.artifactScope.artifacts) {
      const projected = projectJarvisArtifactReference(artifact);
      if (!projected) continue;
      entries.push(
        Object.freeze({
          key: `artifact:${projected.artifactId}`,
          kind: 'artifact',
          entityId: projected.artifactId,
          mention: `@artifact:${projected.artifactId}`,
          label: projected.title,
          description: artifactDescription(projected.kind, projected.state),
        }),
      );
    }
  }

  return Object.freeze(entries);
}

export function filterReferenceCatalog(
  entries: readonly ReferenceCatalogEntry[],
  query: string,
): readonly ReferenceCatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) =>
    [
      entry.mention.slice(1),
      ...(entry.aliases?.map((alias) => alias.slice(1)) ?? []),
      entry.label,
      entry.description,
      entry.metadata,
    ].some((value) => value?.toLocaleLowerCase().includes(normalized)),
  );
}
