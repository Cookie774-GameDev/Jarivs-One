import { deterministicHash } from './hash';
import type {
  ActivationBoundary,
  JarvisProfileDocument,
  SoulChangeStage,
  SoulRevision,
  SourceReference,
} from './types';
import { validateSoulDocument } from './validation';

interface ProfileRecord {
  document: JarvisProfileDocument;
  revisions: SoulRevision[];
  pending?: SoulChangeStage;
  operatingMemory: string[];
  profileUserDocument: string;
}

export interface CreateProfileInput {
  ownerId: string;
  profileId: string;
  name: string;
  soul: string;
  source: SourceReference;
  credentialRefs?: string[];
  conversationHistoryRefs?: string[];
}

export interface StageSoulUpdateInput {
  ownerId: string;
  profileId: string;
  content: string;
  reason: string;
  source: SourceReference;
  affectedBehavior: string[];
  activation: ActivationBoundary;
}

export type StageResult =
  | { ok: true; stage: SoulChangeStage }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'protected_profile'
        | 'pending_stage'
        | 'invalid_source'
        | 'invalid_change';
      validation?: ReturnType<typeof validateSoulDocument>;
    };

function key(ownerId: string, profileId: string): string {
  return `${ownerId}\u0000${profileId}`;
}

function validId(value: string): boolean {
  return value.trim().length > 0 && value.length <= 128 && !value.includes('\u0000');
}

function validSource(source: SourceReference): boolean {
  return (
    validId(source.kind) &&
    validId(source.id) &&
    Array.isArray(source.refs) &&
    source.refs.every(validId)
  );
}

function cloneSource(source: SourceReference): SourceReference {
  return { ...source, refs: [...source.refs] };
}

function cloneRevision(revision: SoulRevision): SoulRevision {
  return {
    ...revision,
    source: cloneSource(revision.source),
    refs: [...revision.refs],
    activation: { ...revision.activation },
  };
}

function cloneStage(stage: SoulChangeStage): SoulChangeStage {
  return {
    ...stage,
    source: cloneSource(stage.source),
    affectedBehavior: [...stage.affectedBehavior],
    validation: { ...stage.validation, issues: [...stage.validation.issues] },
    undo: { ...stage.undo },
    revision: cloneRevision(stage.revision),
  };
}

function cloneDocument(document: JarvisProfileDocument): JarvisProfileDocument {
  return {
    ...document,
    credentialRefs: [...document.credentialRefs],
    conversationHistoryRefs: [...document.conversationHistoryRefs],
  };
}

export class InMemoryProfileDocumentRepository {
  private readonly profiles = new Map<string, ProfileRecord>();
  private readonly sharedUserDocuments = new Map<string, string>();

  createProfile(input: CreateProfileInput): JarvisProfileDocument {
    return this.create(input, false);
  }

  createProtectedDefault(input: CreateProfileInput): JarvisProfileDocument {
    return this.create(input, true);
  }

  private create(input: CreateProfileInput, isProtected: boolean): JarvisProfileDocument {
    if (
      !validId(input.ownerId) ||
      !validId(input.profileId) ||
      !input.name.trim() ||
      !validSource(input.source)
    ) {
      throw new Error('Invalid profile document identity or source');
    }
    const recordKey = key(input.ownerId, input.profileId);
    if (this.profiles.has(recordKey)) throw new Error('Profile document already exists');
    const validation = validateSoulDocument(input.soul);
    if (!validation.valid) throw new Error(`Invalid SOUL document: ${validation.issues.join(',')}`);

    const document: JarvisProfileDocument = {
      ownerId: input.ownerId,
      profileId: input.profileId,
      name: input.name,
      protected: isProtected,
      voiceAuthority: 'canonical',
      credentialRefs: [...(input.credentialRefs ?? [])],
      conversationHistoryRefs: [...(input.conversationHistoryRefs ?? [])],
    };
    const revision: SoulRevision = {
      version: 1,
      content: input.soul,
      hash: deterministicHash(input.soul),
      source: cloneSource(input.source),
      refs: [...input.source.refs],
      activation: { mode: 'initial', state: 'active' },
    };
    this.profiles.set(recordKey, {
      document,
      revisions: [revision],
      operatingMemory: [],
      profileUserDocument: '',
    });
    return cloneDocument(document);
  }

  getProfile(ownerId: string, profileId: string): JarvisProfileDocument | undefined {
    const record = this.profiles.get(key(ownerId, profileId));
    return record ? cloneDocument(record.document) : undefined;
  }

  getActiveSoul(ownerId: string, profileId: string): SoulRevision | undefined {
    const record = this.profiles.get(key(ownerId, profileId));
    const active = record?.revisions.at(-1);
    return active ? cloneRevision(active) : undefined;
  }

  getSoulHistory(ownerId: string, profileId: string): SoulRevision[] {
    return this.profiles.get(key(ownerId, profileId))?.revisions.map(cloneRevision) ?? [];
  }

  getPendingSoulStage(ownerId: string, profileId: string): SoulChangeStage | undefined {
    const pending = this.profiles.get(key(ownerId, profileId))?.pending;
    return pending ? cloneStage(pending) : undefined;
  }

  stageSoulUpdate(input: StageSoulUpdateInput): StageResult {
    const record = this.profiles.get(key(input.ownerId, input.profileId));
    if (!record) return { ok: false, reason: 'not_found' };
    if (record.document.protected) return { ok: false, reason: 'protected_profile' };
    if (record.pending) return { ok: false, reason: 'pending_stage' };
    if (!validSource(input.source)) return { ok: false, reason: 'invalid_source' };

    const validation = validateSoulDocument(input.content);
    if (
      !validation.valid ||
      !input.reason.trim() ||
      input.affectedBehavior.length === 0 ||
      input.affectedBehavior.some((behavior) => !behavior.trim())
    ) {
      return { ok: false, reason: 'invalid_change', validation };
    }

    const active = record.revisions.at(-1)!;
    const version = active.version + 1;
    const revision: SoulRevision = {
      version,
      content: input.content,
      hash: deterministicHash(input.content),
      source: cloneSource(input.source),
      refs: [...input.source.refs],
      activation: { mode: input.activation, state: 'pending' },
      supersedesVersion: active.version,
    };
    const stage: SoulChangeStage = {
      id: `${input.profileId}:soul-stage:${version}`,
      oldContent: active.content,
      newContent: input.content,
      reason: input.reason,
      source: cloneSource(input.source),
      affectedBehavior: [...input.affectedBehavior],
      validation,
      undo: { restoreVersion: active.version },
      revision,
    };
    record.pending = stage;
    return { ok: true, stage: cloneStage(stage) };
  }

  stageRestore(input: {
    ownerId: string;
    profileId: string;
    targetVersion: number;
    reason: string;
    source: SourceReference;
    activation: ActivationBoundary;
  }): StageResult {
    const record = this.profiles.get(key(input.ownerId, input.profileId));
    if (!record) return { ok: false, reason: 'not_found' };
    const target = record.revisions.find((revision) => revision.version === input.targetVersion);
    if (!target) return { ok: false, reason: 'invalid_change' };
    return this.stageSoulUpdate({
      ownerId: input.ownerId,
      profileId: input.profileId,
      content: target.content,
      reason: input.reason,
      source: input.source,
      affectedBehavior: ['restore'],
      activation: input.activation,
    });
  }

  advanceBoundary(
    ownerId: string,
    profileId: string,
    boundary: ActivationBoundary,
  ):
    | { activated: true; revision: SoulRevision }
    | { activated: false; reason: 'not_found' | 'no_pending_stage' | 'boundary_mismatch' } {
    const record = this.profiles.get(key(ownerId, profileId));
    if (!record) return { activated: false, reason: 'not_found' };
    if (!record.pending) return { activated: false, reason: 'no_pending_stage' };
    if (record.pending.revision.activation.mode !== boundary) {
      return { activated: false, reason: 'boundary_mismatch' };
    }

    const previous = record.revisions.at(-1)!;
    const activated = cloneRevision(record.pending.revision);
    activated.activation.state = 'active';
    previous.supersededByVersion = activated.version;
    record.revisions.push(activated);
    record.pending = undefined;
    return { activated: true, revision: cloneRevision(activated) };
  }

  setUserDocument(
    ownerId: string,
    input:
      | { scope: 'shared'; content: string }
      | { scope: 'profile'; profileId: string; content: string },
  ): boolean {
    if (input.scope === 'shared') {
      if (!validId(ownerId)) return false;
      this.sharedUserDocuments.set(ownerId, input.content);
      return true;
    }
    const record = this.profiles.get(key(ownerId, input.profileId));
    if (!record || record.document.protected) return false;
    record.profileUserDocument = input.content;
    return true;
  }

  getUserDocuments(ownerId: string, profileId: string): { shared: string; profile: string } {
    const record = this.profiles.get(key(ownerId, profileId));
    if (!record) return { shared: '', profile: '' };
    return {
      shared: this.sharedUserDocuments.get(ownerId) ?? '',
      profile: record.profileUserDocument,
    };
  }

  replaceOperatingMemory(ownerId: string, profileId: string, entries: readonly string[]): boolean {
    const record = this.profiles.get(key(ownerId, profileId));
    if (!record || record.document.protected) return false;
    record.operatingMemory = [...entries];
    return true;
  }

  getOperatingMemory(ownerId: string, profileId: string): string[] {
    return [...(this.profiles.get(key(ownerId, profileId))?.operatingMemory ?? [])];
  }

  cloneProfile(input: {
    ownerId: string;
    sourceProfileId: string;
    targetProfileId: string;
    targetName: string;
    source: SourceReference;
  }):
    | { ok: true; profile: JarvisProfileDocument }
    | { ok: false; reason: 'not_found' | 'target_exists' | 'invalid_source' } {
    const sourceRecord = this.profiles.get(key(input.ownerId, input.sourceProfileId));
    if (!sourceRecord) return { ok: false, reason: 'not_found' };
    if (this.profiles.has(key(input.ownerId, input.targetProfileId))) {
      return { ok: false, reason: 'target_exists' };
    }
    if (!validSource(input.source)) return { ok: false, reason: 'invalid_source' };
    const active = sourceRecord.revisions.at(-1)!;
    const profile = this.createProfile({
      ownerId: input.ownerId,
      profileId: input.targetProfileId,
      name: input.targetName,
      soul: active.content,
      source: input.source,
      credentialRefs: [],
      conversationHistoryRefs: [],
    });
    return { ok: true, profile };
  }
}
