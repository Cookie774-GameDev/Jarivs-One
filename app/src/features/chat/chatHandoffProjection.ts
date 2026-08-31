import type { Chat, Message, Part } from '@/types/chat';

const HANDOFF_POLICY_VERSION = 1 as const;
const SECTION_CHUNK_SIZE = 8_000;
const OLDER_DIGEST_LIMIT = 12_000;
const SECRET_ASSIGNMENT =
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export type SafeVisibleMessageSection = Readonly<{
  messageId: string;
  role: Message['role'];
  createdAt: number;
  visibleText: string;
  chunks: readonly string[];
}>;

export type ChatHandoffProjectionV1 = Readonly<{
  version: 1;
  policyVersion: 1;
  source: Readonly<{
    chatId: string;
    title: string;
    workspaceId: string;
    projectId: string | null;
  }>;
  snapshotAt: number;
  boundaryAt: number;
  boundaryMessageId: string | null;
  goal: string | null;
  status: string;
  lastMeaningfulActivity: string | null;
  recentSections: readonly SafeVisibleMessageSection[];
  olderDigest: string;
  summaries: Readonly<{
    files: readonly string[];
    tools: readonly string[];
    actions: readonly string[];
    decisions: readonly string[];
    blockers: readonly string[];
    results: readonly string[];
  }>;
}>;

export type ChatHandoffMessagePartV1 = Readonly<{
  version: 1;
  sourceChatId: string;
  sourceTitle: string;
  snapshotAt: number;
  boundaryMessageId: string | null;
  instruction: string;
  projection: ChatHandoffProjectionV1;
  dispatchKey?: string;
}>;

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeText(value: string): string {
  return value.replace(SECRET_ASSIGNMENT, '[REDACTED]').replace(BEARER_TOKEN, '[REDACTED]');
}

function splitComplete(value: string): readonly string[] {
  if (!value) return [];
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += SECTION_CHUNK_SIZE) {
    chunks.push(value.slice(offset, offset + SECTION_CHUNK_SIZE));
  }
  return chunks;
}

function safeVisibleParts(parts: readonly Part[]): {
  text: string;
  files: string[];
  tools: string[];
  actions: string[];
} {
  const text: string[] = [];
  const files: string[] = [];
  const tools: string[] = [];
  const actions: string[] = [];
  const seenText = new Set<string>();
  const completedCalls = new Set(
    parts.flatMap((part) => (part.kind === 'tool_result' ? [part.call_id] : [])),
  );

  for (const part of parts) {
    if (part.kind === 'text') {
      const safe = sanitizeText(part.text).trim();
      if (safe && !seenText.has(safe)) {
        seenText.add(safe);
        text.push(safe);
      }
    } else if (part.kind === 'stack_step') {
      const safe = sanitizeText(part.text).trim();
      if (safe && !seenText.has(safe)) {
        seenText.add(safe);
        text.push(`${part.label} — ${part.status}: ${safe}`);
      }
    } else if (part.kind === 'tool_call') {
      tools.push(`${part.tool} — ${completedCalls.has(part.call_id) ? 'completed' : 'called'}`);
    } else if (part.kind === 'action_proposal') {
      const rationale = part.rationale ? ` — ${sanitizeText(part.rationale)}` : '';
      actions.push(`${part.action_id} — ${part.status}${rationale}`);
    } else if (part.kind === 'file_ref') {
      files.push(part.ref.id);
    } else if (part.kind === 'jarvis_source_ref' && part.source.sensitivity === 'public') {
      if (part.source.uri) files.push(part.source.uri);
    } else if (part.kind === 'jarvis_artifact_ref' && part.artifact.safeSummary) {
      const safe = sanitizeText(part.artifact.safeSummary).trim();
      if (safe && !seenText.has(safe)) text.push(safe);
    }
  }

  return { text: text.join('\n\n'), files, tools, actions };
}

function threeCalendarDayBoundary(now: number): number {
  const value = new Date(now);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() - 2).getTime();
}

function summariesFromText(texts: readonly string[], pattern: RegExp): readonly string[] {
  return unique(
    texts.flatMap((text) =>
      text
        .split(/\r?\n|(?<=[.!?])\s+/)
        .map((line) => line.trim())
        .filter((line) => pattern.test(line))
        .map((line) => line.slice(0, 500)),
    ),
  );
}

export function projectChatHandoff(
  input: Readonly<{
    sourceChat: Chat;
    messages: readonly Message[];
    now?: number;
  }>,
): ChatHandoffProjectionV1 {
  const now = input.now ?? Date.now();
  const boundaryAt = threeCalendarDayBoundary(now);
  const ordered = [...input.messages].sort(
    (left, right) =>
      left.created_at - right.created_at || String(left.id).localeCompare(String(right.id)),
  );
  const files: string[] = [];
  const tools: string[] = [];
  const actions: string[] = [];
  const recentSections: SafeVisibleMessageSection[] = [];
  const olderLines: string[] = [];
  const allVisibleTexts: string[] = [];

  for (const message of ordered) {
    const safe = safeVisibleParts(message.parts);
    files.push(...safe.files);
    tools.push(...safe.tools);
    actions.push(...safe.actions);
    if (!safe.text) continue;
    allVisibleTexts.push(safe.text);
    if (message.created_at >= boundaryAt) {
      recentSections.push(
        Object.freeze({
          messageId: String(message.id),
          role: message.role,
          createdAt: message.created_at,
          visibleText: safe.text,
          chunks: Object.freeze(splitComplete(safe.text)),
        }),
      );
    } else {
      olderLines.push(`[${message.role}] ${safe.text}`);
    }
  }

  const goalMatch = [...allVisibleTexts]
    .reverse()
    .map((text) => text.match(/(?:^|\n)Goal:\s*([^\n]+)/i)?.[1]?.trim())
    .find(Boolean);
  const lastSection = recentSections.at(-1);
  const lastMeaningfulActivity = lastSection
    ? lastSection.visibleText.slice(Math.max(0, lastSection.visibleText.length - 500))
    : (olderLines.at(-1)?.slice(-500) ?? null);
  const olderJoined = olderLines.join('\n');
  const olderDigest = olderJoined
    ? `Older visible history:\n${olderJoined.slice(-OLDER_DIGEST_LIMIT)}`
    : 'No older visible history.';

  return Object.freeze({
    version: 1,
    policyVersion: HANDOFF_POLICY_VERSION,
    source: Object.freeze({
      chatId: String(input.sourceChat.id),
      title: input.sourceChat.title,
      workspaceId: String(input.sourceChat.workspace_id),
      projectId: input.sourceChat.project_id ? String(input.sourceChat.project_id) : null,
    }),
    snapshotAt: now,
    boundaryAt,
    boundaryMessageId: recentSections[0]?.messageId ?? null,
    goal: goalMatch ?? null,
    status: lastSection
      ? `Last visible ${lastSection.role} activity`
      : 'No recent visible activity',
    lastMeaningfulActivity,
    recentSections: Object.freeze(recentSections),
    olderDigest,
    summaries: Object.freeze({
      files: Object.freeze(unique(files)),
      tools: Object.freeze(unique(tools)),
      actions: Object.freeze(unique(actions)),
      decisions: Object.freeze(
        summariesFromText(allVisibleTexts, /\b(decid|decision|chosen|choose)\b/i),
      ),
      blockers: Object.freeze(
        summariesFromText(allVisibleTexts, /\b(blocked|blocker|cannot|failed)\b/i),
      ),
      results: Object.freeze(
        summariesFromText(allVisibleTexts, /\b(result|completed|passed|done|success)\b/i),
      ),
    }),
  });
}

export function renderChatHandoffPrompt(
  projection: ChatHandoffProjectionV1,
  instruction: string,
): string {
  const recent = projection.recentSections
    .map((section) =>
      section.chunks
        .map(
          (chunk, index) =>
            `[${section.role} · ${section.messageId} · section ${index + 1}/${section.chunks.length}]\n${chunk}`,
        )
        .join('\n\n'),
    )
    .join('\n\n');
  const summaryGroups = Object.entries(projection.summaries)
    .filter(([, values]) => values.length > 0)
    .map(([label, values]) => `${label}:\n${values.map((value) => `- ${value}`).join('\n')}`)
    .join('\n\n');
  return [
    instruction.trim(),
    `Chat handoff from “${projection.source.title}” (${projection.source.chatId})`,
    projection.goal ? `Current goal: ${projection.goal}` : '',
    `Status: ${projection.status}`,
    summaryGroups,
    'Complete visible transcript from the most recent three calendar days:',
    recent || '(No visible recent messages.)',
    projection.olderDigest,
  ]
    .filter(Boolean)
    .join('\n\n');
}
