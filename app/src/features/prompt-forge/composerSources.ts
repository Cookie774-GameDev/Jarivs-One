import type { Message } from '@/types';
import type { TerminalRef } from '@/features/terminals/terminalRefs';
import type { SessionTranscript } from '@/features/terminals/transcriptStore';
import { readTextFileSample, type FsReadResult, type FsAccessOptions } from '@/lib/fs';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import type { PromptForgeAttachmentSnapshot } from './contracts';
import type { PromptForgeSourceCandidate } from './sourcePack';

const FILE_SAMPLE_CHARS = 12_000;
const SOURCE_CONTENT_CHARS = 12_000;
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
  projectId: string | null;
  projectRoot: string;
  chatId: string;
  files: readonly string[];
  terminals: readonly TerminalRef[];
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
    Partial<Pick<PromptForgeSourceCandidate, 'projectScoped' | 'observedAt' | 'whySelected'>>,
): PromptForgeSourceCandidate {
  return Object.freeze({
    ...values,
    label: safeText(values.label, 500, 'Composer source'),
    reference: safeText(values.reference, 2_048, `source://${hashText(values.id)}`),
    content: values.content.slice(0, SOURCE_CONTENT_CHARS),
    projectScoped: values.projectScoped ?? input.projectId !== null,
    lexicalScore: 0,
    semanticScore: null,
    observedAt: Math.min(input.now, Math.max(0, values.observedAt ?? input.now)),
    whySelected: values.whySelected ?? 'Explicitly attached to this Composer draft.',
  });
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
  const sources: PromptForgeSourceCandidate[] = [];
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
    const projectMatches =
      (ref.projectId === undefined ||
        ref.projectId === null ||
        ref.projectId === input.projectId) &&
      (session?.projectId === undefined ||
        session.projectId === null ||
        session.projectId === input.projectId);
    sources.push(
      baseCandidate(input, {
        id: stableId('terminal', key),
        kind: 'terminal',
        label: ref.label ?? ref.command ?? session?.command ?? key,
        reference: `terminal://${key}`,
        content:
          session?.text.slice(-SOURCE_CONTENT_CHARS) ??
          'The attached terminal transcript is unavailable.',
        verified: Boolean(session?.text.trim()) && projectMatches,
        explicit: true,
        trust: 'project',
        observedAt: session?.lastWriteAt,
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
