import type { JarvisDexie } from '@/lib/db';
import { applySecretPolicy } from '@/lib/security/secretDetector';
import type { ContextGraphSnapshotV2 } from '@/features/context/contracts';
import { createContextGraphRepository } from '@/features/context/repository';

const MAX_ACTIVE_MAPS = 5;
const MAX_PATH_CHARS = 4_096;
const CONTROL_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;

export type TerminalCliContextSourceErrorCode =
  | 'invalid_request'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'internal_error';

export class TerminalCliContextSourceError extends Error {
  constructor(
    readonly code: TerminalCliContextSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TerminalCliContextSourceError';
  }
}

export type TerminalCliContextSourceServiceDependencies = Readonly<{
  database: JarvisDexie;
  now(): number;
  digestSha256(value: string): Promise<string>;
  readLocalFile(path: string): Promise<Readonly<{ content: string }>>;
}>;

export type TerminalCliLocalFileContextMap = Readonly<{
  mapId: string;
  name: string;
  path: string;
}>;

type LocalFileScope = Readonly<{
  accountId: string;
  projectId: string | null;
}>;

function stableId(value: string, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new TerminalCliContextSourceError('invalid_request', `The ${label} is invalid.`);
  }
  return value;
}

function localPath(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PATH_CHARS ||
    value.trim() !== value ||
    CONTROL_CHARACTERS.test(value) ||
    (!/^[A-Za-z]:[\\/]/u.test(value) && !value.startsWith('/') && !value.startsWith('\\\\'))
  ) {
    throw new TerminalCliContextSourceError(
      'invalid_request',
      'The local Context file path is invalid.',
    );
  }
  return value;
}

function fileName(path: string): string {
  const name = path
    .replace(/[\\/]+$/gu, '')
    .split(/[\\/]/gu)
    .filter(Boolean)
    .at(-1);
  if (!name || name.length > 255 || CONTROL_CHARACTERS.test(name)) {
    throw new TerminalCliContextSourceError(
      'invalid_request',
      'The local Context file name is invalid.',
    );
  }
  return name;
}

function pathIdentity(path: string): string {
  return /^[A-Za-z]:[\\/]/u.test(path) || path.startsWith('\\\\')
    ? path.replaceAll('/', '\\').toLocaleLowerCase('en-US')
    : path;
}

function summary(content: string, name: string): string {
  const value = content.replace(/\s+/gu, ' ').trim().slice(0, 2_000);
  return value || `Indexed local file ${name}.`;
}

async function digest(
  operation: (value: string) => Promise<string>,
  value: string,
): Promise<string> {
  const result = await operation(value);
  if (!/^[a-f0-9]{64}$/u.test(result)) {
    throw new TerminalCliContextSourceError(
      'internal_error',
      'Context source integrity metadata could not be created.',
    );
  }
  return result;
}

export function createTerminalCliContextSourceService(
  dependencies: TerminalCliContextSourceServiceDependencies,
) {
  const repository = createContextGraphRepository(dependencies.database);

  const persistLocalFile = async (
    scope: LocalFileScope,
    path: string,
    fixedMapId?: string,
  ): Promise<TerminalCliLocalFileContextMap> => {
    let content: string;
    try {
      ({ content } = await dependencies.readLocalFile(path));
    } catch {
      throw new TerminalCliContextSourceError(
        'not_found',
        'The local Context file could not be read.',
      );
    }
    if (typeof content !== 'string') {
      throw new TerminalCliContextSourceError(
        'not_found',
        'The local Context file could not be read.',
      );
    }
    const fingerprint = await digest(
      dependencies.digestSha256,
      `${scope.accountId}\0${scope.projectId ?? '<default>'}\0${pathIdentity(path)}`,
    );
    const mapId = fixedMapId ?? `ctxmap-file-${fingerprint.slice(0, 32)}`;
    const existing = await repository.getSnapshot(scope.accountId, mapId);
    if (
      existing &&
      (existing.map.projectId !== scope.projectId ||
        existing.sources.length !== 1 ||
        existing.sources[0]?.kind !== 'local_file' ||
        pathIdentity(existing.sources[0]?.localFile ?? '') !== pathIdentity(path) ||
        existing.map.status !== 'active')
    ) {
      throw new TerminalCliContextSourceError(
        'conflict',
        'The local Context file conflicts with an existing Context Map.',
      );
    }
    if (!existing) {
      const active = (await repository.listMaps(scope.accountId, scope.projectId)).filter(
        ({ status }) => status === 'active',
      );
      if (active.length >= MAX_ACTIVE_MAPS) {
        throw new TerminalCliContextSourceError(
          'conflict',
          'The active Context Map limit has been reached.',
        );
      }
    }

    const name = fileName(path);
    const contentDigest = await digest(dependencies.digestSha256, content);
    const timestamp = Math.max(dependencies.now(), (existing?.map.updatedAt ?? 0) + 1);
    const createdAt = existing?.map.createdAt ?? timestamp;
    const sourceId = `ctxsrc-file-${fingerprint.slice(0, 32)}`;
    const entityId = `ctxent-file-${fingerprint.slice(0, 32)}`;
    const provenanceId = `ctxprov-file-${fingerprint.slice(0, 32)}`;
    const sourceRevision = `sha256:${contentDigest}`;
    const protectedContent = applySecretPolicy(content, 'redact').text ?? '';
    const sourceSummary = summary(protectedContent, name);
    const snapshot: ContextGraphSnapshotV2 = {
      version: 2,
      map: {
        version: 2,
        id: mapId,
        accountId: scope.accountId,
        projectId: scope.projectId,
        name: `${name} Context Map`,
        status: 'active',
        sourceIds: [sourceId],
        summary: sourceSummary,
        recommendedEntryPoints: [
          {
            entityId,
            kind: 'file',
            label: name,
            sourceId,
            path: name,
          },
        ],
        statistics: {
          sourceCount: 1,
          entityCount: 1,
          edgeCount: 0,
          noteCount: 0,
          attachmentCount: 0,
          staleSourceCount: 0,
        },
        createdAt,
        updatedAt: timestamp,
        lastIndexedAt: timestamp,
        knowledgeRevision: (existing?.map.knowledgeRevision ?? 0) + 1,
      },
      sources: [
        {
          version: 2,
          id: sourceId,
          accountId: scope.accountId,
          mapId,
          kind: 'local_file',
          label: name,
          status: 'ready',
          localFile: path,
          createdAt,
          updatedAt: timestamp,
          lastIndexedAt: timestamp,
          lastVerifiedAt: timestamp,
          sourceRevision,
          parserVersion: 1,
        },
      ],
      entities: [
        {
          version: 2,
          id: entityId,
          accountId: scope.accountId,
          mapId,
          sourceId,
          kind: 'file',
          label: name,
          path: name,
          summary: sourceSummary,
          sourceRevision,
          provenanceIds: [provenanceId],
          createdAt,
          updatedAt: timestamp,
        },
      ],
      edges: [],
      provenance: [
        {
          version: 2,
          id: provenanceId,
          accountId: scope.accountId,
          mapId,
          targetKind: 'entity',
          targetId: entityId,
          sourceId,
          sourceKind: 'local_file',
          path: name,
          extractedAt: timestamp,
          parser: 'vibespace-terminal-cli',
          confidence: 1,
          sourceRevision,
        },
      ],
    };
    try {
      await repository.putSnapshot(scope.accountId, snapshot, {
        expectedKnowledgeRevision: existing?.map.knowledgeRevision ?? 0,
      });
    } catch {
      throw new TerminalCliContextSourceError(
        'conflict',
        'The Context source changed concurrently; retry the command.',
      );
    }
    return Object.freeze({ mapId, name: snapshot.map.name, path });
  };

  const createLocalFile = async (
    raw: LocalFileScope & Readonly<{ path: string }>,
  ): Promise<TerminalCliLocalFileContextMap> => {
    const scope: LocalFileScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
    };
    return persistLocalFile(scope, localPath(raw.path));
  };

  const refreshLocalFile = async (
    raw: LocalFileScope & Readonly<{ mapId: string }>,
  ): Promise<TerminalCliLocalFileContextMap> => {
    const scope: LocalFileScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
    };
    const mapId = stableId(raw.mapId, 'Context Map');
    const snapshot = await repository.getSnapshot(scope.accountId, mapId);
    if (
      !snapshot ||
      snapshot.map.projectId !== scope.projectId ||
      snapshot.map.status !== 'active'
    ) {
      throw new TerminalCliContextSourceError(
        'permission_denied',
        'The selected Context Map is not available in this project.',
      );
    }
    const source = snapshot.sources[0];
    if (snapshot.sources.length !== 1 || source?.kind !== 'local_file' || !source.localFile) {
      throw new TerminalCliContextSourceError(
        'conflict',
        'The selected Context Map is not a local-file source.',
      );
    }
    return persistLocalFile(scope, source.localFile, mapId);
  };

  return Object.freeze({ createLocalFile, refreshLocalFile });
}
