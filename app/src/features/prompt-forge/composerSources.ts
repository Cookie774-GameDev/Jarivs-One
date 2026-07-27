import type { Message } from '@/types';
import type { TerminalRef } from '@/features/terminals/terminalRefs';
import type { SessionTranscript } from '@/features/terminals/transcriptStore';
import { readTextFileSample, type FsReadResult, type FsAccessOptions } from '@/lib/fs';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import type { PromptForgeAttachmentSnapshot } from './contracts';
import type { PromptForgeSourceCandidate } from './sourcePack';

const FILE_SAMPLE_CHARS = 12_000;
const SOURCE_CONTENT_CHARS = 12_000;
const PROFILE_EXCERPT_CHARS = 4_000;
const PROFILE_SECTION_LIMIT = 4;
const CONTROL_AND_BIDI =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

type NamedReference = Readonly<{
  id: string;
  label: string;
  reference?: string;
}>;

export type PromptForgeComposerDescriptor = NamedReference &
  Readonly<{
    description: string;
    verified: boolean;
    observedAt?: number;
  }>;

export type PromptForgeChatContext = Readonly<{
  title: string;
  mode: string;
  interactionMode?: string;
  observedAt?: number;
}>;

export type PromptForgeProjectContext = Readonly<{
  id: string;
  name: string;
  root: string;
  systemPromptContext?: string;
  noContextMode?: boolean;
  observedAt?: number;
}>;

export type PromptForgeProfileContext = Readonly<{
  accountId: string;
  markdown: string;
  source: string;
  observedAt?: number;
}>;

export type PromptForgeActivityDescriptor = Readonly<{
  id: string;
  kind: string;
  status: string;
  title: string;
  subtitle?: string;
  ts: number;
  agentSlug?: string;
  filePath?: string;
  url?: string;
  addedLines?: number;
  removedLines?: number;
  detail?: string;
  diff?: string;
}>;

export type PromptForgeTerminalState = Readonly<{
  sessionId?: string;
  paneId?: string;
  projectId?: string | null;
  status: 'running' | 'detached' | 'exited';
  exitCode?: number;
  observedAt?: number;
}>;

export interface PromptForgeAttachmentSnapshotInput {
  files: readonly string[];
  images: readonly NamedReference[];
  terminals: readonly TerminalRef[];
  plugins: readonly NamedReference[];
  contexts: readonly NamedReference[];
  skills: readonly NamedReference[];
  agents: readonly NamedReference[];
}

export interface PromptForgeComposerSourceInput {
  accountId?: string;
  projectId: string | null;
  projectRoot: string;
  chatId: string;
  draft?: string;
  chat?: PromptForgeChatContext;
  project?: PromptForgeProjectContext;
  profile?: PromptForgeProfileContext;
  activity?: readonly PromptForgeActivityDescriptor[];
  files: readonly string[];
  terminals: readonly TerminalRef[];
  terminalStates?: readonly PromptForgeTerminalState[];
  terminalSessions: Readonly<Record<string, SessionTranscript>>;
  messages: readonly Message[];
  plugins: readonly PromptForgeComposerDescriptor[];
  skills: readonly PromptForgeComposerDescriptor[];
  agents: readonly PromptForgeComposerDescriptor[];
  now: number;
  readFile?: (path: string, maxBytes?: number, options?: FsAccessOptions) => Promise<FsReadResult>;
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Prompt Forge was cancelled.', 'AbortError');
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableId(namespace: string, value: string): string {
  const slug = value.replace(/[^A-Za-z0-9._:/@-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return `${namespace}:${(slug || 'item').slice(0, 150)}:${hashText(value)}`;
}

function safeText(value: string, maximum: number, fallback: string): string {
  const cleaned = value.replace(CONTROL_AND_BIDI, ' ').trim().slice(0, maximum);
  return cleaned || fallback;
}

function basename(path: string): string {
  return safeText(path.split(/[/\\]/u).pop() ?? path, 500, 'Attached file');
}

function terminalKey(ref: TerminalRef): string {
  return ref.sessionId ?? ref.paneId ?? ref.label ?? 'terminal';
}

function snapshot(
  kind: PromptForgeAttachmentSnapshot['kind'],
  idValue: string,
  label: string,
  reference: string,
): PromptForgeAttachmentSnapshot {
  return Object.freeze({
    id: stableId(kind, idValue),
    kind,
    label: safeText(label, 500, kind.replaceAll('_', ' ')),
    reference: safeText(reference, 2_048, `${kind}://${hashText(idValue)}`),
  });
}

export function buildPromptForgeAttachmentSnapshots(
  input: PromptForgeAttachmentSnapshotInput,
): readonly PromptForgeAttachmentSnapshot[] {
  const snapshots: PromptForgeAttachmentSnapshot[] = [];
  for (const path of input.files) snapshots.push(snapshot('file', path, basename(path), path));
  for (const image of input.images) {
    snapshots.push(
      snapshot('image', image.id, image.label, image.reference ?? `image://${image.id}`),
    );
  }
  for (const terminal of input.terminals) {
    const key = terminalKey(terminal);
    snapshots.push(
      snapshot('terminal', key, terminal.label ?? terminal.command ?? key, `terminal://${key}`),
    );
  }
  for (const plugin of input.plugins) {
    snapshots.push(
      snapshot('plugin', plugin.id, plugin.label, plugin.reference ?? `plugin://${plugin.id}`),
    );
  }
  for (const context of input.contexts) {
    snapshots.push(
      snapshot(
        'context_map',
        context.id,
        context.label,
        context.reference ?? `context://${context.id}`,
      ),
    );
  }
  for (const skill of input.skills) {
    snapshots.push(
      snapshot('skill', skill.id, skill.label, skill.reference ?? `skill://${skill.id}`),
    );
  }
  for (const agent of input.agents) {
    snapshots.push(
      snapshot('agent', agent.id, agent.label, agent.reference ?? `agent://${agent.id}`),
    );
  }
  const unique = snapshots.filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
  );
  return deepFreezeJarvisCopy(unique.slice(0, 64)) as readonly PromptForgeAttachmentSnapshot[];
}

function baseCandidate(
  input: PromptForgeComposerSourceInput,
  values: Pick<
    PromptForgeSourceCandidate,
    'id' | 'kind' | 'label' | 'reference' | 'content' | 'verified' | 'explicit' | 'trust'
  > &
    Partial<
      Pick<
        PromptForgeSourceCandidate,
        'projectScoped' | 'lexicalScore' | 'observedAt' | 'whySelected'
      >
    >,
): PromptForgeSourceCandidate {
  return Object.freeze({
    ...values,
    label: safeText(values.label, 500, 'Composer source'),
    reference: safeText(values.reference, 2_048, `source://${hashText(values.id)}`),
    content: values.content.slice(0, SOURCE_CONTENT_CHARS),
    projectScoped: values.projectScoped ?? input.projectId !== null,
    lexicalScore: values.lexicalScore ?? 0,
    semanticScore: null,
    observedAt: Math.min(input.now, Math.max(0, values.observedAt ?? input.now)),
    whySelected: values.whySelected ?? 'Explicitly attached to this Composer draft.',
  });
}

const RELEVANCE_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'current',
  'from',
  'have',
  'into',
  'latest',
  'make',
  'more',
  'please',
  'that',
  'the',
  'this',
  'use',
  'with',
  'your',
]);
const PROFILE_INTENT =
  /\b(?:all about me|about[- ]me profile|personal(?:ize|ized|ization)|my (?:[\p{L}\p{N}_-]+\s+){0,3}(?:preferences?|profile|style|tone|voice)|write (?:it |this )?(?:like|as) me)\b/iu;
const GENERIC_ACTIVITY_INTENT =
  /\b(?:(?:recent|latest|last|current)\s+(?:(?:jarvis\s+)?(?:activity|agent work|tool runs?|run history)|jarvis changes made)|what (?:did|has) jarvis (?:do|done|change))\b/iu;
const PROFILE_HEADING = /^#{2,4}\s+(.+?)\s*$/gmu;
const PROFILE_STYLE_HEADING =
  /\b(?:communication|tone|writing|response|sound|pattern|voice|preference|directness|humor|proof|preferred name|nickname)\b|how[\p{L}\p{N}\s_-]{0,80}\baddress (?:me|you)\b/iu;
const PROFILE_STYLE_TEXT =
  /\b(?:communication|tone|write|writing|response|answer|concise|brief|short|detailed|direct|formal|casual|professional|humor|voice|style|preference|bullets?|explain|evidence)\b/iu;

type ProfileSection = Readonly<{
  heading: string | null;
  content: string;
  order: number;
  structured: boolean;
}>;

function relevanceTokens(value: string): ReadonlySet<string> {
  const tokens = value.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [];
  return new Set(tokens.filter((token) => !RELEVANCE_STOP_WORDS.has(token)));
}

function lexicalOverlap(query: ReadonlySet<string>, evidence: string): number {
  if (query.size === 0) return 0;
  const candidate = relevanceTokens(evidence);
  let overlap = 0;
  for (const token of query) if (candidate.has(token)) overlap += 1;
  return overlap;
}

function profileSections(markdown: string): readonly ProfileSection[] {
  const normalized = markdown.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return [];
  const headings = [...normalized.matchAll(PROFILE_HEADING)];
  if (headings.length === 0) {
    return normalized
      .split(/\n{2,}/gu)
      .map((content, order) => ({
        heading: null,
        content: content.trim(),
        order,
        structured: false,
      }))
      .filter((section) => section.content.length > 0);
  }
  return headings.map((match, order) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[order + 1]?.index ?? normalized.length;
    return {
      heading: match[1]?.trim() || 'Profile preferences',
      content: normalized.slice(start, end).trim(),
      order,
      structured: true,
    };
  });
}

function relevantProfileExcerpt(
  draft: string,
  markdown: string,
): Readonly<{ content: string; lexicalScore: number }> | null {
  const query = relevanceTokens(draft);
  const profileIntent = PROFILE_INTENT.test(draft);
  const ranked = profileSections(markdown)
    .map((section) => {
      const evidence = `${section.heading ?? ''}\n${section.content}`;
      const overlap = lexicalOverlap(query, evidence);
      const styleRelevant = section.structured
        ? PROFILE_STYLE_HEADING.test(section.heading ?? '')
        : PROFILE_STYLE_TEXT.test(section.content);
      return { section, overlap, styleRelevant };
    })
    .filter((candidate) => candidate.overlap > 0 || (profileIntent && candidate.styleRelevant))
    .sort(
      (left, right) =>
        right.overlap - left.overlap ||
        Number(right.styleRelevant) - Number(left.styleRelevant) ||
        left.section.order - right.section.order,
    )
    .slice(0, PROFILE_SECTION_LIMIT);
  if (ranked.length === 0) return null;

  const selected: string[] = [];
  let remaining = PROFILE_EXCERPT_CHARS;
  for (const candidate of ranked) {
    const section = candidate.section.heading
      ? `## ${safeText(candidate.section.heading, 500, 'Profile preferences')}\n\n${candidate.section.content}`
      : candidate.section.content;
    if (remaining <= 0) break;
    selected.push(section.slice(0, remaining));
    remaining -= section.length + 2;
  }
  const content = selected.join('\n\n').slice(0, PROFILE_EXCERPT_CHARS).trim();
  if (!content) return null;
  const strongestOverlap = Math.max(...ranked.map((candidate) => candidate.overlap));
  return Object.freeze({
    content,
    lexicalScore: Math.min(1, (profileIntent ? 0.5 : 0.25) + strongestOverlap / 3),
  });
}

function findTerminalState(
  states: readonly PromptForgeTerminalState[],
  ref: TerminalRef,
): PromptForgeTerminalState | undefined {
  if (ref.sessionId) return states.find((state) => state.sessionId === ref.sessionId);
  if (ref.paneId) return states.find((state) => state.paneId === ref.paneId);
  return undefined;
}

function terminalExecutionStatus(
  state: PromptForgeTerminalState | undefined,
  projectMatches: boolean,
): string {
  if (!projectMatches) return 'cross-project and excluded';
  if (!state) return 'unavailable';
  if (state.status === 'exited' && Number.isSafeInteger(state.exitCode) && state.exitCode !== 0) {
    return `failed (exit code ${state.exitCode})`;
  }
  if (state.status === 'exited' && Number.isSafeInteger(state.exitCode)) {
    return `exited (exit code ${state.exitCode})`;
  }
  return state.status;
}

function terminalContent(
  input: PromptForgeComposerSourceInput,
  ref: TerminalRef,
  session: SessionTranscript | undefined,
  state: PromptForgeTerminalState | undefined,
  projectMatches: boolean,
): string {
  const transcriptAvailability = !projectMatches
    ? 'cross-project and excluded'
    : session?.text.trim()
      ? 'captured'
      : 'unavailable';
  const lines = [
    `Execution status: ${terminalExecutionStatus(state, projectMatches)}`,
    `Transcript availability: ${transcriptAvailability}`,
    `Reference: ${safeText(terminalKey(ref), 500, 'terminal')}`,
  ];
  const command = ref.command ?? session?.command;
  const agent = ref.agentSlug ?? session?.agentSlug;
  if (command) lines.push(`Command: ${safeText(command, 1_000, 'unavailable')}`);
  if (agent) lines.push(`Agent: ${safeText(agent, 500, 'unavailable')}`);
  if (session?.lastWriteAt !== undefined && projectMatches) {
    lines.push(`Last output observed at: ${Math.min(input.now, Math.max(0, session.lastWriteAt))}`);
  }
  const metadata = lines.join('\n');
  if (session?.text.trim() && projectMatches) {
    const heading = '\n\nMeaningful recent output:\n';
    const available = Math.max(0, SOURCE_CONTENT_CHARS - metadata.length - heading.length);
    return `${metadata}${heading}${session.text.slice(-available)}`;
  }
  return metadata;
}

function contextualCandidates(
  input: PromptForgeComposerSourceInput,
): readonly PromptForgeSourceCandidate[] {
  const sources: PromptForgeSourceCandidate[] = [];
  const draft = input.draft?.trim() ?? '';
  const draftTokens = relevanceTokens(draft);

  if (input.chat) {
    sources.push(
      baseCandidate(input, {
        id: stableId('chat-context', input.chatId),
        kind: 'chat',
        label: 'Current chat',
        reference: `chat://${input.chatId}`,
        content: [
          `Title: ${safeText(input.chat.title, 500, 'Untitled chat')}`,
          `Chat mode: ${safeText(input.chat.mode, 100, 'unknown')}`,
          input.chat.interactionMode
            ? `JARVIS interaction mode: ${safeText(input.chat.interactionMode, 100, 'unknown')}`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
        verified: true,
        explicit: false,
        trust: 'user',
        lexicalScore: 0.25,
        observedAt: input.chat.observedAt,
        whySelected: 'Current title and mode for the Composer chat.',
      }),
    );
  }

  if (input.project && input.projectId !== null && input.project.id === input.projectId) {
    const contextEnabled = input.project.noContextMode !== true;
    const context = input.project.systemPromptContext?.trim() ?? '';
    sources.push(
      baseCandidate(input, {
        id: stableId('project', input.project.id),
        kind: 'project',
        label: 'Current project',
        reference: `project://${input.project.id}`,
        content: [
          `Name: ${safeText(input.project.name, 500, 'Unnamed project')}`,
          `Root: ${safeText(input.project.root || input.projectRoot, 2_048, 'not configured')}`,
          `Context instructions: ${contextEnabled ? (context ? 'enabled' : 'not configured') : 'disabled'}`,
          contextEnabled && context
            ? safeText(context, SOURCE_CONTENT_CHARS, 'not configured')
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
        verified: true,
        explicit: false,
        trust: 'project',
        lexicalScore: 0.25,
        observedAt: input.project.observedAt,
        whySelected: 'Metadata and enabled instructions from the active project.',
      }),
    );
  }

  if (
    input.profile &&
    input.accountId?.trim() &&
    input.profile.accountId === input.accountId.trim() &&
    input.profile.markdown.trim()
  ) {
    const excerpt = relevantProfileExcerpt(draft, input.profile.markdown);
    if (excerpt) {
      sources.push(
        baseCandidate(input, {
          id: stableId('profile', input.profile.accountId),
          kind: 'profile',
          label: 'Relevant All About Me preferences',
          reference: `profile://all-about-me/${hashText(input.profile.accountId)}`,
          content: excerpt.content,
          verified: true,
          explicit: false,
          projectScoped: false,
          trust: 'user',
          lexicalScore: excerpt.lexicalScore,
          observedAt: input.profile.observedAt,
          whySelected: `Bounded profile sections matched the draft (${safeText(input.profile.source, 100, 'profile')}).`,
        }),
      );
    }
  }

  const genericActivityRequest = GENERIC_ACTIVITY_INTENT.test(draft);
  const activity = [...(input.activity ?? [])]
    .filter((event) => Number.isSafeInteger(event.ts) && event.ts >= 0 && event.ts <= input.now)
    .sort((left, right) => right.ts - left.ts)
    .slice(0, 12);
  for (const event of activity) {
    const evidence = [
      event.title,
      event.subtitle,
      event.kind,
      event.status,
      event.agentSlug,
      event.filePath,
      event.detail,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const overlap = lexicalOverlap(draftTokens, evidence);
    if (!genericActivityRequest && overlap === 0) continue;
    const lines = [
      `Kind: ${safeText(event.kind, 100, 'activity')}`,
      `Status: ${safeText(event.status, 100, 'unknown')}`,
      event.subtitle ? `Summary: ${safeText(event.subtitle, 1_000, 'unavailable')}` : null,
      event.agentSlug ? `Agent: ${safeText(event.agentSlug, 500, 'unavailable')}` : null,
      event.filePath ? `File: ${safeText(event.filePath, 2_048, 'unavailable')}` : null,
      Number.isFinite(event.addedLines) ? `Added lines: ${event.addedLines}` : null,
      Number.isFinite(event.removedLines) ? `Removed lines: ${event.removedLines}` : null,
      event.detail ? `Detail: ${safeText(event.detail, 1_500, 'unavailable')}` : null,
    ].filter((line): line is string => line !== null);
    sources.push(
      baseCandidate(input, {
        id: stableId('activity', event.id),
        kind: 'activity',
        label: event.title,
        reference: `activity://${input.chatId}/${event.id}`,
        content: lines.join('\n'),
        verified: true,
        explicit: false,
        trust: 'project',
        lexicalScore: genericActivityRequest ? 0.75 : Math.min(1, overlap / 3),
        observedAt: event.ts,
        whySelected: genericActivityRequest
          ? 'The draft requested recent activity.'
          : 'Recent activity matched the draft.',
      }),
    );
  }
  return sources;
}

function findTerminalSession(
  sessions: Readonly<Record<string, SessionTranscript>>,
  ref: TerminalRef,
): SessionTranscript | undefined {
  if (ref.sessionId && sessions[ref.sessionId]) return sessions[ref.sessionId];
  if (ref.paneId) return Object.values(sessions).find((session) => session.paneId === ref.paneId);
  return undefined;
}

function descriptorCandidate(
  input: PromptForgeComposerSourceInput,
  kind: 'plugin' | 'skill' | 'agent',
  descriptor: PromptForgeComposerDescriptor,
): PromptForgeSourceCandidate {
  return baseCandidate(input, {
    id: stableId(kind, descriptor.id),
    kind,
    label: descriptor.label,
    reference: descriptor.reference ?? `${kind}://${descriptor.id}`,
    content: descriptor.description,
    verified: descriptor.verified,
    explicit: true,
    trust: 'user',
    observedAt: descriptor.observedAt,
  });
}

export async function collectPromptForgeComposerSources(
  input: PromptForgeComposerSourceInput,
  signal: AbortSignal,
): Promise<readonly PromptForgeSourceCandidate[]> {
  abortIfRequested(signal);
  const readFile = input.readFile ?? readTextFileSample;
  const sources: PromptForgeSourceCandidate[] = [...contextualCandidates(input)];
  for (const path of input.files.slice(0, 16)) {
    abortIfRequested(signal);
    const result = await readFile(path, FILE_SAMPLE_CHARS, {
      root: input.projectRoot || null,
      strictProjectBoundary: true,
    });
    abortIfRequested(signal);
    sources.push(
      baseCandidate(input, {
        id: stableId('file', path),
        kind: 'project_file',
        label: basename(path),
        reference: path,
        content: result.ok
          ? result.content
          : `Attached file could not be read (${result.error.code}).`,
        verified: result.ok,
        explicit: true,
        trust: 'project',
      }),
    );
  }

  for (const ref of input.terminals.slice(0, 8)) {
    const key = terminalKey(ref);
    const session = findTerminalSession(input.terminalSessions, ref);
    const state = findTerminalState(input.terminalStates ?? [], ref);
    const projectMatches =
      (ref.projectId === undefined ||
        ref.projectId === null ||
        ref.projectId === input.projectId) &&
      (session?.projectId === undefined ||
        session.projectId === null ||
        session.projectId === input.projectId) &&
      (state?.projectId === undefined ||
        state.projectId === null ||
        state.projectId === input.projectId);
    sources.push(
      baseCandidate(input, {
        id: stableId('terminal', key),
        kind: 'terminal',
        label: ref.label ?? ref.command ?? session?.command ?? key,
        reference: `terminal://${key}`,
        content: terminalContent(input, ref, session, state, projectMatches),
        verified: Boolean(session?.text.trim()) && projectMatches,
        explicit: true,
        trust: 'project',
        observedAt: Math.max(session?.lastWriteAt ?? 0, state?.observedAt ?? 0),
      }),
    );
  }

  const recentMessages = [...input.messages]
    .filter((message) => message.chat_id === input.chatId)
    .sort((left, right) => left.created_at - right.created_at)
    .slice(-12);
  for (const message of recentMessages) {
    const content = message.parts
      .filter(
        (part): part is Extract<Message['parts'][number], { kind: 'text' }> => part.kind === 'text',
      )
      .map((part) => part.text)
      .join('\n')
      .trim();
    if (!content) continue;
    sources.push(
      baseCandidate(input, {
        id: stableId('chat', String(message.id)),
        kind: 'chat',
        label: `${message.role === 'user' ? 'User' : 'Assistant'} message`,
        reference: `chat://${input.chatId}/${String(message.id)}`,
        content,
        verified: true,
        explicit: false,
        trust: 'user',
        observedAt: message.updated_at,
        whySelected: 'Recent message from this chat.',
      }),
    );
  }

  sources.push(
    ...input.plugins.map((item) => descriptorCandidate(input, 'plugin', item)),
    ...input.skills.map((item) => descriptorCandidate(input, 'skill', item)),
    ...input.agents.map((item) => descriptorCandidate(input, 'agent', item)),
  );
  abortIfRequested(signal);
  return deepFreezeJarvisCopy(sources) as readonly PromptForgeSourceCandidate[];
}
