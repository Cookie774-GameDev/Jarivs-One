import { InMemorySessionRecallRepository, type StoredSession } from './repository';
import {
  SESSION_SURFACES,
  type BrowseFilters,
  type BrowserChatProvider,
  type IndexVerification,
  type IndexedSessionTurn,
  type RecallCommandResult,
  type RecallDiscoveryResult,
  type RecallQuery,
  type RecallScope,
  type RetentionPolicy,
  type SessionBrowseResult,
  type SessionIndexInput,
  type SessionRecord,
  type SessionScrollResult,
  type SessionSurface,
} from './types';

const DAY = 86_400_000;
const MAX_EXCERPT_LENGTH = 240;
const MAX_SCROLL_DISTANCE = 20;
const SURFACES = new Set<string>(SESSION_SURFACES);
const SOURCE_KINDS = new Set([
  'vibespace_owned',
  'imported_user_authorized',
  'browser_chat_metadata',
]);
const TURN_ROLES = new Set(['user', 'assistant', 'agent', 'tool', 'system']);
const BROWSER_PROVIDERS = new Set<BrowserChatProvider>(['chatgpt', 'claude', 'gemini']);
const BROWSER_PROVIDER_HOSTS: Record<BrowserChatProvider, string> = {
  chatgpt: 'chatgpt.com',
  claude: 'claude.ai',
  gemini: 'gemini.google.com',
};

export interface SessionRecallServiceOptions {
  now?: () => number;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includes(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function finiteTimestamp(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative timestamp.`);
  }
}

function validateScope(scope: RecallScope): void {
  nonEmpty(scope.ownerId, 'ownerId');
  nonEmpty(scope.profileId, 'profileId');
  if (scope.projectId !== undefined) nonEmpty(scope.projectId, 'projectId');
}

function validateSession(record: SessionRecord): void {
  nonEmpty(record.id, 'session id');
  nonEmpty(record.ownerId, 'ownerId');
  nonEmpty(record.profileId, 'profileId');
  if (record.projectId !== undefined) nonEmpty(record.projectId, 'projectId');
  if (!SURFACES.has(record.surface))
    throw new Error(`Unsupported session surface: ${record.surface}`);
  nonEmpty(record.title, 'session title');
  nonEmpty(record.retentionPolicyId, 'retentionPolicyId');
  finiteTimestamp(record.startedAt, 'startedAt');
  finiteTimestamp(record.updatedAt, 'updatedAt');
  if (record.updatedAt < record.startedAt) throw new Error('updatedAt cannot precede startedAt.');
  if (!Number.isInteger(record.contentRevision) || record.contentRevision < 1) {
    throw new Error('contentRevision must be a positive integer.');
  }
  if (!Array.isArray(record.participantRefs) || record.participantRefs.some((ref) => !ref.trim())) {
    throw new Error('participantRefs must contain only non-empty references.');
  }
}

function validateTurn(turn: IndexedSessionTurn, record: SessionRecord): void {
  nonEmpty(turn.id, 'turn id');
  if (turn.sessionId !== record.id) throw new Error('Indexed turn belongs to a different session.');
  if (!Number.isInteger(turn.sequence) || turn.sequence < 0) {
    throw new Error('Turn sequence must be a non-negative integer.');
  }
  finiteTimestamp(turn.occurredAt, 'turn occurredAt');
  nonEmpty(turn.participantRef, 'turn participantRef');
  if (!TURN_ROLES.has(turn.role)) throw new Error(`Unsupported indexed turn role: ${turn.role}`);
  nonEmpty(turn.text, 'turn text');
}

function policyDurationMs(policy: RetentionPolicy): number | null {
  if (policy.retention === 'indefinite') return null;
  return (policy.retention === '7d' ? 7 : 30) * DAY;
}

function metadataText(record: StoredSession): string {
  return [
    record.session.title,
    ...record.session.participantRefs,
    ...record.tags,
    record.session.projectId ?? '',
    record.session.profileId,
    record.session.surface,
  ].join('\n');
}

function turnText(turn: IndexedSessionTurn): string {
  return [
    turn.text,
    turn.participantRef,
    turn.command ?? '',
    ...(turn.filePaths ?? []),
    turn.agentRef ?? '',
    turn.model ?? '',
    turn.resultType ?? '',
  ].join('\n');
}

function fullText(record: StoredSession): string {
  return `${metadataText(record)}\n${record.turns.map(turnText).join('\n')}`;
}

function inDateRange(timestamp: number, range: BrowseFilters['date']): boolean {
  if (!range) return true;
  return (
    (range.since === undefined || timestamp >= range.since) &&
    (range.until === undefined || timestamp <= range.until)
  );
}

function terms(query: RecallQuery): string[] {
  return [
    query.exactPhrase ?? '',
    ...(query.keywords ?? []),
    ...(query.boolean?.all ?? []),
    ...(query.boolean?.any ?? []),
  ].filter((term) => term.trim() !== '');
}

function matchesBoolean(text: string, query: RecallQuery): boolean {
  const all = query.boolean?.all ?? [];
  const any = query.boolean?.any ?? [];
  const not = query.boolean?.not ?? [];
  return (
    all.every((term) => includes(text, term)) &&
    (any.length === 0 || any.some((term) => includes(text, term))) &&
    not.every((term) => !includes(text, term))
  );
}

function matchingTurns(record: StoredSession, query: RecallQuery): IndexedSessionTurn[] {
  const searchTerms = terms(query);
  if (searchTerms.length === 0) return [];
  return record.turns.filter((turn) => searchTerms.some((term) => includes(turnText(turn), term)));
}

function matchesStructuredFilters(record: StoredSession, query: RecallQuery): boolean {
  const { session, turns } = record;
  if (!inDateRange(session.updatedAt, query.date)) return false;
  if (query.projectId !== undefined && session.projectId !== query.projectId) return false;
  if (query.profileId !== undefined && session.profileId !== query.profileId) return false;
  if (query.platform !== undefined && session.surface !== query.platform) return false;
  if (
    query.participant !== undefined &&
    !session.participantRefs.includes(query.participant) &&
    !turns.some((turn) => turn.participantRef === query.participant)
  ) {
    return false;
  }
  if (
    query.filePath !== undefined &&
    !turns.some((turn) => turn.filePaths?.some((path) => includes(path, query.filePath!)))
  ) {
    return false;
  }
  if (
    query.command !== undefined &&
    !turns.some((turn) => turn.command !== undefined && includes(turn.command, query.command!))
  ) {
    return false;
  }
  if (query.agent !== undefined && !turns.some((turn) => turn.agentRef === query.agent))
    return false;
  if (query.model !== undefined && !turns.some((turn) => turn.model === query.model)) return false;
  if (
    query.resultType !== undefined &&
    !turns.some((turn) => turn.resultType === query.resultType)
  ) {
    return false;
  }
  return true;
}

function score(record: StoredSession, query: RecallQuery): number {
  const title = record.session.title;
  const content = record.turns.map(turnText).join('\n');
  let result = 0;
  if (query.exactPhrase && includes(title, query.exactPhrase)) result += 100;
  if (query.exactPhrase && includes(content, query.exactPhrase)) result += 40;
  for (const keyword of query.keywords ?? []) {
    if (includes(title, keyword)) result += 20;
    if (record.tags.some((tag) => includes(tag, keyword))) result += 12;
    if (includes(content, keyword)) result += 6;
  }
  for (const keyword of [...(query.boolean?.all ?? []), ...(query.boolean?.any ?? [])]) {
    if (includes(title, keyword)) result += 8;
    if (includes(content, keyword)) result += 3;
  }
  return result;
}

function matchedBy(record: StoredSession, query: RecallQuery): RecallDiscoveryResult['matchedBy'] {
  const searchTerms = terms(query);
  const matches: RecallDiscoveryResult['matchedBy'] = [];
  if (searchTerms.some((term) => includes(record.session.title, term))) matches.push('title');
  if (searchTerms.some((term) => record.tags.some((tag) => includes(tag, term)))) {
    matches.push('tag');
  }
  if (
    searchTerms.some((term) =>
      record.session.participantRefs.some((participant) => includes(participant, term)),
    )
  ) {
    matches.push('participant');
  }
  if (searchTerms.some((term) => record.turns.some((turn) => includes(turnText(turn), term)))) {
    matches.push('content');
  }
  return matches;
}

function excerpt(turns: IndexedSessionTurn[]): string {
  const text = turns[0]?.text ?? '';
  if (text.length <= MAX_EXCERPT_LENGTH) return text;
  return `${text.slice(0, MAX_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

function surfacePolicyKey(scope: RecallScope, surface: SessionSurface): string {
  return `${scope.ownerId}\u0000${scope.profileId}\u0000${surface}`;
}

function tokenizeCommand(input: string): string[] {
  return (
    input.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) => token.replace(/^(['"])|(['"])$/g, '')) ?? []
  );
}

function validateBrowserChatUrl(provider: BrowserChatProvider, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Browser Chat provider URL is invalid.');
  }
  const expectedHost = BROWSER_PROVIDER_HOSTS[provider];
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hostname !== expectedHost
  ) {
    throw new Error(`Browser Chat provider URL must use https://${expectedHost}.`);
  }
}

export class SessionRecallService {
  readonly #repository: InMemorySessionRecallRepository;
  readonly #now: () => number;
  readonly #policies = new Map<string, RetentionPolicy>();
  readonly #surfacePolicies = new Map<string, string>();

  constructor(options: SessionRecallServiceOptions = {}) {
    this.#repository = new InMemorySessionRecallRepository();
    this.#now = options.now ?? Date.now;
  }

  defineRetentionPolicy(policy: RetentionPolicy): void {
    nonEmpty(policy.id, 'retention policy id');
    if (!['enabled', 'disabled'].includes(policy.indexing)) {
      throw new Error('Retention indexing mode is invalid.');
    }
    if (!['7d', '30d', 'indefinite'].includes(policy.retention)) {
      throw new Error('Retention duration is invalid.');
    }
    if (!['local', 'encrypted_sync'].includes(policy.storage)) {
      throw new Error('Retention storage mode is invalid.');
    }
    this.#policies.set(policy.id, structuredClone(policy));
  }

  setSurfaceRetentionPolicy(scope: RecallScope, surface: SessionSurface, policyId: string): void {
    validateScope(scope);
    if (!SURFACES.has(surface)) throw new Error(`Unsupported session surface: ${surface}`);
    if (!this.#policies.has(policyId)) throw new Error(`Unknown retention policy: ${policyId}`);
    this.#surfacePolicies.set(surfacePolicyKey(scope, surface), policyId);
  }

  indexSession(input: SessionIndexInput): boolean {
    validateSession(input.session);
    if (input.status !== undefined && !['active', 'archived'].includes(input.status)) {
      throw new Error(`Unsupported session status: ${input.status}`);
    }
    if (!SOURCE_KINDS.has(input.source.kind)) {
      throw new Error(`Unsupported session source: ${(input.source as { kind?: unknown }).kind}`);
    }
    if (input.source.kind === 'browser_chat_metadata') {
      if (!BROWSER_PROVIDERS.has(input.source.provider)) {
        throw new Error(`Unsupported Browser Chat provider: ${input.source.provider}`);
      }
      validateBrowserChatUrl(input.source.provider, input.source.url);
      if (input.turns.length > 0) {
        throw new Error(
          'Browser Chat sources are metadata-only; provider turns cannot be indexed.',
        );
      }
    } else if (input.turns.length === 0) {
      throw new Error('VibeSpace-owned and imported sessions require at least one indexed turn.');
    }
    const seenTurnIds = new Set<string>();
    for (const turn of input.turns) {
      validateTurn(turn, input.session);
      if (seenTurnIds.has(turn.id)) throw new Error(`Duplicate indexed turn id: ${turn.id}`);
      seenTurnIds.add(turn.id);
    }
    const policyId =
      this.#surfacePolicies.get(surfacePolicyKey(input.session, input.session.surface)) ??
      input.session.retentionPolicyId;
    const policy = this.#policies.get(policyId);
    if (!policy) throw new Error(`Unknown retention policy: ${policyId}`);
    if (policy.indexing === 'disabled') {
      this.#repository.delete(input.session, input.session.id);
      return false;
    }
    if (this.#isExpired(input.session, policy)) {
      this.#repository.delete(input.session, input.session.id);
      return false;
    }
    this.#repository.put(input);
    return true;
  }

  discover(scope: RecallScope, query: RecallQuery): RecallDiscoveryResult[] {
    validateScope(scope);
    this.purgeExpired(scope);
    const searchTerms = terms(query);
    if (searchTerms.length === 0) throw new Error('Recall query must include search text.');

    return this.#repository
      .list(scope)
      .filter((record) => {
        const text = fullText(record);
        return (
          matchesStructuredFilters(record, query) &&
          (!query.exactPhrase || includes(text, query.exactPhrase)) &&
          (query.keywords ?? []).every((keyword) => includes(text, keyword)) &&
          matchesBoolean(text, query)
        );
      })
      .map((record): RecallDiscoveryResult => {
        const turns = matchingTurns(record, query);
        const first = turns[0];
        const last = turns.at(-1);
        const browserSource =
          record.source.kind === 'browser_chat_metadata' ? record.source : undefined;
        return {
          session: record.session,
          score: score(record, query),
          matchedBy: matchedBy(record, query),
          excerpt: excerpt(turns),
          citation: {
            title: record.session.title,
            date: record.session.startedAt,
            platform: browserSource?.provider ?? record.session.surface,
            messageRange: first && last ? { start: first.sequence, end: last.sequence } : null,
            ...(record.session.projectId === undefined
              ? {}
              : { projectId: record.session.projectId }),
            openAction: browserSource
              ? { kind: 'open_url', url: browserSource.url }
              : {
                  kind: 'open_session',
                  sessionId: record.session.id,
                  turnId: first?.id ?? record.turns[0]?.id ?? '',
                },
          },
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.session.updatedAt - left.session.updatedAt ||
          left.session.id.localeCompare(right.session.id),
      );
  }

  browse(scope: RecallScope, filters: BrowseFilters = {}): SessionBrowseResult[] {
    validateScope(scope);
    this.purgeExpired(scope);
    return this.#repository
      .list(scope)
      .filter((record) => {
        const session = record.session;
        return (
          inDateRange(session.updatedAt, filters.date) &&
          (filters.projectId === undefined || session.projectId === filters.projectId) &&
          (filters.profileId === undefined || session.profileId === filters.profileId) &&
          (filters.platform === undefined || session.surface === filters.platform) &&
          (filters.agent === undefined ||
            record.turns.some((turn) => turn.agentRef === filters.agent)) &&
          (filters.title === undefined || includes(session.title, filters.title)) &&
          (filters.tag === undefined || record.tags.some((tag) => includes(tag, filters.tag!))) &&
          (filters.status === undefined || record.status === filters.status)
        );
      })
      .sort(
        (left, right) =>
          right.session.updatedAt - left.session.updatedAt ||
          left.session.id.localeCompare(right.session.id),
      )
      .map((record) => ({
        ...record.session,
        tags: record.tags,
        status: record.status,
      }));
  }

  scroll(
    scope: RecallScope,
    request: {
      sessionId: string;
      anchorTurnId: string;
      before?: number;
      after?: number;
    },
  ): SessionScrollResult | null {
    validateScope(scope);
    this.purgeExpired(scope);
    const record = this.#repository.get(scope, request.sessionId);
    if (!record) return null;
    const anchorIndex = record.turns.findIndex((turn) => turn.id === request.anchorTurnId);
    if (anchorIndex < 0) return null;
    const before = Math.min(MAX_SCROLL_DISTANCE, Math.max(0, Math.floor(request.before ?? 2)));
    const after = Math.min(MAX_SCROLL_DISTANCE, Math.max(0, Math.floor(request.after ?? 2)));
    return {
      session: record.session,
      anchorIndex,
      turns: record.turns.slice(
        Math.max(0, anchorIndex - before),
        Math.min(record.turns.length, anchorIndex + after + 1),
      ),
    };
  }

  deleteConversation(scope: RecallScope, sessionId: string): boolean {
    validateScope(scope);
    const record = this.#repository.get(scope, sessionId);
    if (!record) return false;
    const policy = this.#policyFor(record);
    if (!policy.deleteOnConversationDeletion) return false;
    return this.#repository.delete(scope, sessionId);
  }

  deletePermanently(scope: RecallScope, sessionId: string): boolean {
    validateScope(scope);
    return this.#repository.delete(scope, sessionId);
  }

  purgeExpired(scope: RecallScope): number {
    validateScope(scope);
    return this.#repository.deleteWhere(scope, (record) =>
      this.#isExpired(record.session, this.#policyFor(record)),
    );
  }

  verifyIndex(scope: RecallScope): IndexVerification {
    validateScope(scope);
    this.purgeExpired(scope);
    const records = this.#repository.list(scope);
    const errors: string[] = [];
    const turnIds = new Set<string>();
    for (const record of records) {
      for (const turn of record.turns) {
        if (turn.sessionId !== record.session.id) {
          errors.push(`Turn ${turn.id} points to ${turn.sessionId}.`);
        }
        if (turnIds.has(turn.id)) errors.push(`Duplicate turn id ${turn.id}.`);
        turnIds.add(turn.id);
      }
    }
    return {
      sessions: records.length,
      turns: records.reduce((sum, record) => sum + record.turns.length, 0),
      errors,
    };
  }

  executeCommand(scope: RecallScope, input: string): RecallCommandResult {
    validateScope(scope);
    const tokens = tokenizeCommand(input.trim());
    const command = tokens.shift();
    if (command === '/history') {
      if (tokens.length > 0) throw new Error('/history does not accept a search query.');
      return { kind: 'history', sessions: this.browse(scope) };
    }
    if (command !== '/recall') throw new Error('Unsupported Session Recall command.');

    const query: RecallQuery = {};
    const keywords: string[] = [];
    while (tokens.length > 0) {
      const token = tokens.shift()!;
      if (token === '--project') {
        const projectId = tokens.shift();
        if (!projectId) throw new Error('--project requires a value.');
        query.projectId = projectId;
      } else if (token === '--since') {
        const value = tokens.shift();
        const match = value?.match(/^(\d+)d$/);
        if (!match) throw new Error('--since requires a day duration such as 30d.');
        query.date = { since: this.#now() - Number(match[1]) * DAY };
      } else {
        keywords.push(token);
      }
    }
    if (keywords.length === 0) throw new Error('/recall requires a query.');
    query.keywords = keywords;
    return { kind: 'recall', query, results: this.discover(scope, query) };
  }

  #policyFor(record: StoredSession): RetentionPolicy {
    const policyId =
      this.#surfacePolicies.get(surfacePolicyKey(record.session, record.session.surface)) ??
      record.session.retentionPolicyId;
    const policy = this.#policies.get(policyId);
    if (!policy) throw new Error(`Unknown retention policy: ${policyId}`);
    return policy;
  }

  #isExpired(session: SessionRecord, policy: RetentionPolicy): boolean {
    const duration = policyDurationMs(policy);
    return duration !== null && session.updatedAt < this.#now() - duration;
  }
}

export function createSessionRecallService(
  options: SessionRecallServiceOptions = {},
): SessionRecallService {
  return new SessionRecallService(options);
}
