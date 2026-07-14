/**
 * Runtime listener that bridges the chat composer (subagent A3) to the
 * provider router. The composer dispatches a `jarvis:send` CustomEvent on
 * window; we catch it, append a user message + an empty assistant placeholder,
 * stream the agent's response into the placeholder, and update token/cost
 * counters when the run completes.
 *
 * Cancellation: any consumer can dispatch `jarvis:cancel` with
 * `{ messageId }` to abort the in-flight stream for a specific assistant
 * message, or with no detail to abort everything in flight.
 *
 * Why dependency injection: this module needs DB access (messageRepo and
 * agent lookups) but those repositories are owned by a sibling subagent.
 * Threading them in via `bindings` keeps this file independently buildable
 * and lets the consumer wire up the real repo at app boot time.
 */
import type { Agent, AgentId, Message, MessageId, Part } from '@/types';
import type { ChatId, ProjectId } from '@/types/common';
import { useAuthStore } from '@/stores/auth';
import { useAgentStore } from '@/stores/agents';
import { runAgent } from './router';
import type { LLMContentPart, LLMMessage } from './types';
import { llmContentToText } from './types';
import { applyPersona } from '@/features/agents/personas';
import { applyAvailableActions, parseActionBlocks, autoApprovePendingActions } from '@/lib/actions';
import { inferFallbackActionProposals } from '@/lib/actions/fallbackActions';
import { buildAgentTerminalContext } from '@/features/terminals/agentContext';
import { getPluginContextBlock, getPluginStatusContextBlock } from '@/features/plugins';
import { devConsole } from '@/features/dev-console';
import { toast } from '@/components/ui/toast';
import { chatRepo } from '@/lib/db';
import { getAiCompletionInstruction, notifyDone } from '@/lib/notifications';
import { createStreamingVoiceSession, type StreamingVoiceSession } from '@/features/voice/streamingVoice';
import { canVoiceModuleSpeak } from '@/features/voice/voiceRouter';
import { STREAMING_VOICE_END_EVENT } from '@/features/voice/speechSynthesis';
import { registerActiveStreamingVoiceSession } from '@/features/voice/voiceRouter';
import { deriveChatTitle, maybeRenameChat } from '@/features/chat/chatLifecycle';
import { getStoredProjectRoot } from '@/features/files/projectFiles';
import { composeSkillAddenda, resolveSkills } from '@/lib/agents/skills';
import { createChatActivityId, useChatActivityStore } from '@/features/chat/activity';
import {
  classifyStackTask,
  parseStackSlashCommand,
} from './stacks/classifier';
import { stepsForPreset } from './stacks/presets';
import { runStack } from './stacks/runner';
import type { StackStepResult } from './stacks/types';
import {
  applyChatModelSelectionToAgent,
  modelSelectionContextFromAuth,
  resolveActiveStackPreset,
  validateSendModelAccess,
  type ChatModelSelection,
} from './modelSelection';

import {
  getProjectContextBlock,
  getProjectContextTreeBlock,
  getConnectedFilesBlock,
  getExplicitContextBlock,
  getExplicitFilesBlock,
  getExplicitTerminalBlock,
  getJarvisCoordinationContextBlock,
  formatResolvedJarvisContext,
  rememberConversationDestination,
  resolveJarvisContext,
} from './context';
import { classifyJarvisIntent, formatJarvisIntentPolicy } from './intent';
import type { TerminalRef } from '@/features/terminals/terminalRefs';
import type { ContextAttachment } from '@/features/context/tree';
import { modelSupportsVision, type ChatImageAttachment } from './vision';
import { ALL_ABOUT_ME_FILE_LOCATION, buildAllAboutMeContextBlock } from '@/features/all-about-me/profile';
import { reviseAllAboutMeMarkdown } from '@/features/all-about-me/ai';
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import { buildUserIdentityContextBlock } from './userIdentity';
import {
  browserFallbackWriteDir,
  getCachedDefaultWriteDir,
  resolveDefaultWriteDir,
} from '@/lib/actions/defaultWriteDir';
import {
  buildAllAboutMeLearningDiff,
  summarizeAllAboutMeLearningChange,
} from '@/features/all-about-me/activity';
import {
  createClarificationQuestionBlock,
  parseJarvisQuestionBlocks,
} from '@/features/jarvis-interaction/questionParser';
import type { JarvisInteractionMode, JarvisStructuredContext } from '@/features/jarvis-interaction/types';
import { useJarvisInteractionStore } from '@/features/jarvis-interaction/sessionStore';
import { parseJarvisPlanBlocks } from '@/features/jarvis-interaction/planParser';
import { parseJarvisPermissionBlocks } from '@/features/jarvis-interaction/permissionParser';

/**
 * Bindings the runtime needs from the host app. Implementations are typically
 * thin wrappers around `messageRepo` / `agentRepo` (subagent A2's territory).
 */
export interface RuntimeBindings {
  /** Resolve an agent by id. */
  getAgentById: (id: AgentId) => Agent | null | undefined;
  /** Resolve an agent by slug (for @mentions in user text). */
  getAgentBySlug: (slug: string) => Agent | null | undefined;
  /** Pick the active agent for a chat (first id in `chat.active_agent_ids`). */
  getAgentForChat: (
    chatId: ChatId | string,
  ) => Agent | null | undefined | Promise<Agent | null | undefined>;
  /** Read message history for a chat in chronological order. */
  getMessages: (chatId: ChatId | string) => Promise<Message[]> | Message[];
  /** Append a new message; returns the saved message (with id + timestamps). */
  appendMessage: (msg: Omit<Message, 'id' | 'created_at' | 'updated_at'>) => Promise<Message>;
  /** Apply a partial update to an existing message. */
  updateMessage: (id: MessageId, patch: Partial<Omit<Message, 'id'>>) => Promise<void>;
}

/** The shape of the `jarvis:send` event detail. */
export interface SendDetail {
  /** Chat the message belongs to. */
  chatId: string;
  /** Raw user text. */
  text: string;
  /** Optional agent override (otherwise routed by @mention or chat default). */
  agentId?: AgentId;
  /** Agent ids resolved by the composer mention/typeahead path. */
  mentionedAgentIds?: AgentId[];
  /** Absolute paths attached to this specific message. */
  filePaths?: string[];
  /** Base64 image attachments already approved by Composer/model gating. */
  imageAttachments?: ChatImageAttachment[];
  /** PTY session ids dragged into this specific message. Legacy field. */
  terminalSessionIds?: string[];
  /** Stable terminal references dragged into this specific message. */
  terminalRefs?: TerminalRef[];
  /** Context tree nodes dragged into this specific message. */
  contextNodes?: ContextAttachment[];
  /** Speak the final assistant reply when this send came from voice input. */
  speakReply?: boolean;
  /** Run Jarvis action proposals immediately without approval cards. */
  autoApproveActions?: boolean;
  /** Plugin ids attached via /plug or detected in message text. */
  pluginIds?: string[];
  /** Skill ids selected via /skills for this turn. */
  skillIds?: string[];
  /** Force an AllAboutMe.md learning revision after this Jarvis turn. */
  forceAllAboutMeUpdate?: boolean;
  /** Current Jarvis interaction mode for this turn. */
  interactionMode?: JarvisInteractionMode;
  /** Durable structured UI context, such as answered question cards. */
  structuredContext?: JarvisStructuredContext;
  /**
   * Per-send model selection override. Used by scheduled Jarvis Actions so a
   * saved schedule runs on its stored model instead of whatever the composer
   * currently has selected. Omit for normal composer sends.
   */
  modelSelectionOverride?: ChatModelSelection;
}

/** The shape of the `jarvis:cancel` event detail. */
export interface CancelDetail {
  /** The assistant placeholder message id to cancel. Omit to cancel everything. */
  messageId?: MessageId;
}

export interface RuntimeOptions {
  /** Override the event name (default: `jarvis:send`). */
  eventName?: string;
  /** Override the cancel event name (default: `jarvis:cancel`). */
  cancelEventName?: string;
  /**
   * Throttle for streaming DB writes during chunk delivery. Default 120 ms keeps
   * visible streaming smooth without saturating the message store on long runs.
   */
  flushIntervalMs?: number;
}

/** Detect all `@slug` mentions in user text. */
function detectMentionSlugs(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /(?:^|\s)@([A-Za-z][A-Za-z0-9_-]*)(?=[\s.,!?;:)\]}]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const slug = m[1]?.toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/** Detect a leading `@slug ` mention in user text. Returns the slug or null. */
function detectMention(text: string): string | null {
  return detectMentionSlugs(text)[0] ?? null;
}

function getSelectedSkillsBlock(skillIds: string[] | undefined): string {
  const unique = Array.from(new Set((skillIds ?? []).map((id) => id.trim()).filter(Boolean))).slice(0, 6);
  if (unique.length === 0) return '';
  const skills = resolveSkills(unique);
  const addenda = composeSkillAddenda(unique);
  if (skills.length === 0 && !addenda.trim()) return '';
  const list = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n');
  return [
    '## Active Jarvis skills for this turn',
    'The user selected these skills intentionally. Treat them as the operating mode for this response, not as generic labels.',
    'Apply the matching instructions, tools, and response style while preserving Jarvis brevity.',
    list,
    addenda.trim() ? `\nSkill instructions:\n${addenda.trim()}` : '',
  ].filter(Boolean).join('\n');
}

const JARVIS_CHAT_ACTION_OVERLAY = [
  '## Jarvis chat interface',
  '',
  'You are Jarvis inside the VibeSpace chat UI, not a terminal CLI.',
  'Answer in 1-3 short sentences unless the user explicitly asks for more.',
  'Name the relevant file, agent, terminal, context map, or page when it matters.',
  '',
  'Rules:',
  '- If the user asks you to change the app, navigate, open terminals, run commands, create schedules, or spawn subagents, say the result briefly and emit a fenced `action` block when an action exists.',
  '- Never answer app-control requests with JavaScript, shell snippets, pseudocode, or instructions for the user to run manually.',
  '- Never emit raw `{action}` macros. Use fenced JSON action blocks only.',
  '- Mutating app actions do not run until the user clicks Approve, so never claim they already happened.',
  '- For "open N terminals", use `terminal.bulkOpen` with `{"count":N}`. If they say "with opencode", add `"command":"opencode"`.',
  '- Never ask for passwords, API keys, tokens, recovery codes, credit cards, or credentials. Direct users to the trusted settings or provider connection UI instead.',
  '- Use any provided terminal coordination summary as read-only awareness of active agents, locks, and recent work.',
  '- /agents references the Agents page/editor. /terminals references the terminal surface. /hive references Hive Balanced.',
].join('\n');

const CHAT_RESPONSE_STYLE_OVERLAY = [
  '## VibeSpace chat response style',
  'Answer directly, with Jarvis-like brevity and no generic filler.',
  'Prefer 1-3 short sentences. Use bullets only when they make the answer easier to scan.',
  'Reference the relevant file, @agent, terminal, context map, plugin, or page when that context is present.',
  'If multiple @agents are mentioned, answer as/for the first mentioned agent and use the others as context.',
].join('\n');

function getInteractionModeOverlay(mode: JarvisInteractionMode, needsVisiblePlan: boolean): string {
  if (mode === 'ask') {
    return [
      '## Jarvis interaction mode: Ask',
      'Answer the user directly. Do not emit action blocks, permission cards, plan cards, file writes, command proposals, or multi-agent launches.',
      'If the user asks for work that requires changes, explain what would be needed but do not perform or propose the action.',
    ].join('\n');
  }
  if (mode === 'plan') {
    if (!needsVisiblePlan) {
      return [
        '## Jarvis interaction mode: Plan',
        'The request is informational or otherwise does not benefit from an implementation plan.',
        'Answer directly without a plan card, implementation approval, action block, or mutation.',
      ].join('\n');
    }
    return [
      '## Jarvis interaction mode: Plan',
      'This is read-only planning mode. You may inspect available context and explain a plan.',
      'Do not emit executable action blocks, file writes, delete operations, command proposals, or direct project mutations.',
      'End the response with a fenced jarvis_plan JSON block containing title, summary, steps, and risks.',
    ].join('\n');
  }
  return [
    '## Jarvis interaction mode: Agent',
    'You may help do the work, but risky writes, deletes, commands, project-structure changes, or agent launches must be gated by permission cards or existing approval actions.',
  ].join('\n');
}

function structuredContextBlock(context: JarvisStructuredContext | undefined): string {
  if (!context) return '';
  return [
    '## Structured Jarvis UI context',
    `Kind: ${context.kind}`,
    'Payload:',
    JSON.stringify(context.payload, null, 2),
  ].join('\n');
}

function applyChatResponseStyleOverlay(agent: Agent): Agent {
  return {
    ...agent,
    system_prompt: (agent.system_prompt ?? '') + '\n\n' + CHAT_RESPONSE_STYLE_OVERLAY,
  };
}

function applyJarvisChatActionOverlay(agent: Agent): Agent {
  return {
    ...agent,
    system_prompt: (agent.system_prompt ?? '') + '\n\n' + JARVIS_CHAT_ACTION_OVERLAY,
  };
}

function dispatchRunState(chatId: ChatId | string, status: 'running' | 'done' | 'error' | 'cancelled'): void {
  window.dispatchEvent(new CustomEvent('jarvis:run-state', {
    detail: { chatId: String(chatId), status },
  }));
}

export function sanitizeCredentialRequests(text: string): string {
  const asksForSecret = /\b(enter|type|provide|send|share|give)\b[\s\S]{0,80}\b(password|api key|token|secret|credential|recovery code|credit card)\b/i.test(text);
  if (!asksForSecret) return text;
  return [
    "I can't ask for passwords, tokens, API keys, recovery codes, credit cards, or other secrets.",
    'Open the trusted settings or provider connection UI and enter credentials there only.',
  ].join('\n');
}

export function sanitizePromptLeaks(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const leakSignals = [
    /"(?:tools|tool_calls?|scenario)"\s*:/i,
    /\bbenchmark[_\s-]?scenario\b/i,
    /\bavailable tools\b/i,
    /\bexpected assistant response\b/i,
    /\bevaluation rubric\b/i,
    /\buse the above\b[\s\S]{0,80}\bscenario\b/i,
  ].filter((pattern) => pattern.test(trimmed)).length;
  const looksLikeToolJsonDump = /^[{\[]/.test(trimmed) && /"(?:tools|tool_calls?|scenario)"\s*:/i.test(trimmed);
  if (!looksLikeToolJsonDump && leakSignals < 2) return text;
  return [
    'I hit an invalid model reply instead of a usable answer.',
    'Please retry with a stronger model or rephrase the request.',
  ].join('\n');
}

function sanitizeUnsupportedActionMacros(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*\{action\}/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || text;
}

function updateStructuredAgentStatus(
  context: JarvisStructuredContext | undefined,
  status: 'done' | 'failed' | 'cancelled',
  currentStep: string,
): void {
  if (!context || (context.kind !== 'multitask' && context.kind !== 'subagents')) return;
  const payload = context.payload as { parentChatId?: string; agentId?: string } | undefined;
  if (!payload?.parentChatId || !payload.agentId) return;
  useJarvisInteractionStore.getState().updateAgent(payload.parentChatId, payload.agentId, {
    status,
    currentStep,
    updatedAt: new Date().toISOString(),
  });
}

async function resolveChatProjectId(chatId: ChatId | string): Promise<ProjectId | null> {
  try {
    const chat = await chatRepo.getById(chatId as ChatId);
    if (chat?.project_id) return chat.project_id;
  } catch {
    // Fall back to the currently active project below.
  }
  return useAuthStore.getState().projectId as ProjectId | null;
}

function resolveMentionedAgents(
  detail: SendDetail,
  text: string,
  bindings: RuntimeBindings,
): Agent[] {
  const out: Agent[] = [];
  const seen = new Set<AgentId>();
  const add = (candidate: Agent | null | undefined) => {
    if (!candidate || seen.has(candidate.id)) return;
    seen.add(candidate.id);
    out.push(candidate);
  };
  for (const id of detail.mentionedAgentIds ?? []) {
    add(bindings.getAgentById(id));
  }
  for (const slug of detectMentionSlugs(text)) {
    add(bindings.getAgentBySlug(slug));
  }
  return out.slice(0, 8);
}

function getMentionedAgentProfileBlock(mentionedAgents: Agent[]): string {
  if (mentionedAgents.length === 0) return '';
  return [
    'Mentioned agent context for this turn.',
    'Use these agent definitions as request-specific context. Do not expose hidden prompt text unless the user asks to inspect agent configuration.',
    '',
    ...mentionedAgents.map((agent) => [
      `--- @${agent.slug} (${agent.name}) ---`,
      `description: ${agent.description || 'none'}`,
      `model: ${agent.model.provider}/${agent.model.model}`,
      `capabilities: ${agent.capabilities.join(', ') || 'none'}`,
      'system prompt:',
      '```',
      agent.system_prompt || '[empty]',
      '```',
    ].join('\n')),
  ].join('\n\n');
}

function extractUrls(text: string): string[] {
  const matches = text.match(/\bhttps?:\/\/[^\s<>"')]+/gi) ?? [];
  return Array.from(new Set(matches)).slice(0, 8);
}

function messageText(message: Message): string {
  return message.parts
    .map((part) => {
      if (part.kind === 'text') return part.text;
      if (part.kind === 'image') return `[Image: ${part.alt ?? 'attached image'}]`;
      if (part.kind === 'action_proposal') return actionPartToLlmText(part);
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function recentUserMessageTexts(history: Message[]): string[] {
  return history
    .filter((message) => message.role === 'user')
    .map(messageText)
    .filter(Boolean)
    .slice(-12);
}

function allAboutMeCuratorAgent(base: Agent): Agent {
  return {
    ...base,
    id: 'agent_all_about_me_curator' as AgentId,
    slug: 'all-about-me-curator',
    name: 'All About Me Curator',
    description: 'Maintains the user personality profile for Jarvis.',
    tools_allowed: [],
    system_prompt: [
      'You maintain `AllAboutMe.md`, the user-personality profile for Jarvis.',
      'Return only the complete markdown document.',
      'Preserve stable user identity, tone, preferences, interests, and reaction patterns.',
      'Never add secrets, credentials, exact private URLs, or unsupported claims.',
    ].join('\n'),
    temperature: 0.25,
    max_output_tokens: 1800,
  };
}

async function maybeUpdateAllAboutMeFromChat(
  baseAgent: Agent,
  history: Message[],
  force = false,
  chatId?: ChatId | string,
): Promise<void> {
  const store = useAllAboutMeStore.getState();
  if (!force && !store.needsLearningUpdate()) return;
  const existingMarkdown = store.markdown.trim();
  if (!existingMarkdown) return;
  const recentUserMessages = recentUserMessageTexts(history);
  if (recentUserMessages.length === 0) return;
  const activityId = chatId ? createChatActivityId('tool') : null;
  if (activityId && chatId) {
    useChatActivityStore.getState().record({
      id: activityId,
      chatId,
      kind: 'tool',
      status: 'running',
      title: 'Jarvis is learning from this chat',
      subtitle: 'AllAboutMe.md update in progress',
      detail: 'Jarvis found 10 qualifying user messages and is updating the private AllAboutMe.md profile.',
      agentSlug: 'jarvis',
      ts: Date.now(),
    });
  }
  try {
    const revised = await reviseAllAboutMeMarkdown(
      { existingMarkdown, recentUserMessages },
      async (prompt) => {
        const response = await runAgent({
          agent: allAboutMeCuratorAgent(baseAgent),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.25,
          max_output_tokens: 1800,
        });
        return response.text;
      },
    );
    useAllAboutMeStore.getState().applyLearningRevision(revised);
    if (activityId && chatId) {
      const summary = summarizeAllAboutMeLearningChange(existingMarkdown, revised);
      useChatActivityStore.getState().update(chatId, activityId, {
        kind: 'diff',
        status: 'done',
        title: 'AllAboutMe.md file written',
        subtitle: ALL_ABOUT_ME_FILE_LOCATION,
        filePath: ALL_ABOUT_ME_FILE_LOCATION,
        diff: buildAllAboutMeLearningDiff(existingMarkdown, revised),
        addedLines: summary.addedLines,
        removedLines: summary.removedLines,
      });
    }
    devConsole.log({
      channel: 'ai',
      level: 'info',
      message: 'AllAboutMe.md learning update complete',
      detail: {
        userMessages: useAllAboutMeStore.getState().totalUserMessages,
        markdownChars: revised.length,
      },
    });
  } catch (err) {
    if (activityId && chatId) {
      useChatActivityStore.getState().update(chatId, activityId, {
        status: 'error',
        title: 'AllAboutMe.md learning skipped',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    devConsole.log({
      channel: 'ai',
      level: 'warn',
      message: 'AllAboutMe.md learning update skipped',
      detail: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

function actionPartToLlmText(part: Extract<Part, { kind: 'action_proposal' }>): string {
  const label = part.action_id;
  switch (part.status) {
    case 'pending':
      return `[Action proposed: ${label}. Awaiting user approval. Rationale: ${part.rationale ?? 'none'}]`;
    case 'running':
      return `[Action ${label}: running…]`;
    case 'success': {
      const summary =
        part.result && typeof part.result === 'object' && part.result !== null && 'summary' in part.result
          ? String((part.result as { summary?: string }).summary ?? '')
          : '';
      return `[Action ${label}: completed.${summary ? ` ${summary}` : ''}]`;
    }
    case 'error':
      return `[Action ${label}: failed — ${part.error ?? 'unknown error'}]`;
    case 'cancelled':
      return `[Action ${label}: cancelled by user.]`;
    default:
      return `[Action ${label}: ${part.status}]`;
  }
}

/** Flatten Message[] -> LLMMessage[] for the provider call. */
function imagePartToLlm(part: Extract<Part, { kind: 'image' }>): LLMContentPart | null {
  const match = part.url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    type: 'image',
    mimeType: match[1],
    data: match[2],
    name: part.alt,
  };
}

function toLLMMessages(history: Message[], excludeId?: MessageId, includeImages = true): LLMMessage[] {
  const out: LLMMessage[] = [];
  const lastUserIndex = history.reduce((last, message, index) => (
    (!excludeId || message.id !== excludeId) && message.role === 'user' ? index : last
  ), -1);
  for (let index = 0; index < history.length; index += 1) {
    const m = history[index]!;
    if (excludeId && m.id === excludeId) continue;
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'agent') continue;
    const contentParts: LLMContentPart[] = [];
    for (const p of m.parts) {
      if (p.kind === 'text' && p.text.trim()) {
        contentParts.push({ type: 'text', text: p.text });
      } else if (p.kind === 'action_proposal') {
        contentParts.push({ type: 'text', text: actionPartToLlmText(p) });
      } else if (p.kind === 'image') {
        const image = imagePartToLlm(p);
        if (image && includeImages && index === lastUserIndex) {
          contentParts.push(image);
        } else {
          contentParts.push({ type: 'text', text: `[Image attached: ${p.alt ?? 'image'}]` });
        }
      }
    }
    if (contentParts.length === 0) continue;
    const content =
      contentParts.length === 1 && contentParts[0]?.type === 'text'
        ? contentParts[0].text.trim()
        : contentParts;
    out.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content,
    });
  }
  return out;
}

/**
 * Split the assistant's final text into a `Part[]` ready to write back
 * onto the placeholder message.
 *
 * Most replies are plain prose, in which case this returns a single
 * text part — the same shape the throttled flush has been writing all
 * along, so streaming + final write stay visually identical.
 *
 * When the AI emitted one or more action blocks the result alternates:
 *   text (prose before block 1)
 *   action_proposal (block 1, status:'pending')
 *   text (prose between block 1 and 2)
 *   action_proposal (block 2, status:'pending')
 *   ...
 *
 * Malformed action blocks become inline `[Action error] …` text parts
 * with the raw block preserved verbatim — the user sees what the AI
 * wrote, and the AI sees the same context on the next turn so it can
 * self-correct rather than silently retrying broken JSON.
 */
function textToParts(text: string, userText?: string, interactionMode: JarvisInteractionMode = 'agent'): Part[] {
  const requestIntent = classifyJarvisIntent({ text: userText ?? '' });
  const questionResult = parseJarvisQuestionBlocks(text);
  if (questionResult.hasQuestionBlocks) return questionResult.parts;
  if (requestIntent.needsQuestions) {
    return [{ kind: 'question_block', block: createClarificationQuestionBlock(userText ?? '') }];
  }
  const planResult = parseJarvisPlanBlocks(text, {
    force: interactionMode === 'plan' && requestIntent.needsVisiblePlan,
  });
  if (planResult.hasPlanBlocks) return planResult.parts;
  const permissionResult = parseJarvisPermissionBlocks(text);
  if (permissionResult.hasPermissionBlocks) return permissionResult.parts;
  const result = parseActionBlocks(text);
  if (interactionMode === 'ask') {
    const prose = result.hasActionBlocks
      ? result.segments
          .flatMap((seg) => (seg.kind === 'prose' ? [seg.text.trim()] : []))
          .filter(Boolean)
          .join('\n\n')
      : text;
    return [{ kind: 'text', text: prose || 'Ask Mode blocked an action proposal from this reply.' }];
  }
  if (!result.hasActionBlocks) {
    const fallbackProposals = userText
      && interactionMode === 'agent'
      ? inferFallbackActionProposals(userText, text)
      : [];
    if (fallbackProposals.length === 0) return [{ kind: 'text', text }];
    return [
      {
        kind: 'text',
        text: 'I can do that in VibeSpace. Approve the action card below and I will run it.',
      },
      ...fallbackProposals.map<Part>((proposal) => ({
        kind: 'action_proposal',
        call_id: proposal.call_id,
        action_id: proposal.action_id,
        params: proposal.params,
        rationale: proposal.rationale,
        status: 'pending',
      })),
    ];
  }
  const parts: Part[] = [];
  for (const seg of result.segments) {
    if (seg.kind === 'prose') {
      if (seg.text.trim().length > 0) {
        parts.push({ kind: 'text', text: seg.text });
      }
      continue;
    }
    if (seg.ok) {
      parts.push({
        kind: 'action_proposal',
        call_id: seg.proposal.call_id,
        action_id: seg.proposal.action_id,
        params: seg.proposal.params,
        rationale: seg.proposal.rationale,
        status: 'pending',
      });
      continue;
    }
    parts.push({
      kind: 'text',
      text: `[Action error] ${seg.error}\n\n${seg.raw}`,
    });
  }
  // Defensive: never emit an empty parts array even if every segment
  // was filtered (shouldn't happen, but a parser change could regress).
  if (parts.length === 0) return [{ kind: 'text', text }];
  return parts;
}

function stackStepToPart(step: StackStepResult): Part {
  return {
    kind: 'stack_step',
    step_id: step.id,
    label: step.label,
    provider: step.provider,
    model: step.model,
    text: step.text,
    status: step.status,
    input_tokens: step.input_tokens,
    output_tokens: step.output_tokens,
    cost_usd: step.cost_usd,
    duration_ms: step.duration_ms,
  };
}

function textToSpeechOutput(text: string): string {
  const result = parseActionBlocks(text);
  const prose = result.segments
    .flatMap((seg) => (seg.kind === 'prose' ? [seg.text.trim()] : []))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!prose) return '';
  return prose.length <= 900 ? prose : `${prose.slice(0, 897).trimEnd()}…`;
}

/**
 * Subscribe to the chat composer events. Returns an unsubscribe function that
 * removes listeners and aborts any in-flight runs.
 */
export function startRuntimeListener(
  bindings: RuntimeBindings,
  options: RuntimeOptions = {},
): () => void {
  const sendEventName = options.eventName ?? 'jarvis:send';
  const cancelEventName = options.cancelEventName ?? 'jarvis:cancel';
  const flushIntervalMs = options.flushIntervalMs ?? 120;

  const inFlight = new Map<MessageId, AbortController>();

  const releaseVoiceTurnWithoutReply = (detail: SendDetail, chatId: ChatId | string): void => {
    if (detail.speakReply !== true) return;
    window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
    dispatchRunState(chatId, 'error');
  };

  const handleSend = async (e: Event) => {
    const detail = (e as CustomEvent<SendDetail>).detail;
    if (!detail || !detail.chatId || typeof detail.text !== 'string') return;
    const { chatId, text } = detail;

    if (detail.speakReply === true && inFlight.size > 0) {
      const count = inFlight.size;
      for (const c of inFlight.values()) c.abort();
      inFlight.clear();
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: `Voice send replaced ${count} in-flight run(s)`,
        detail: { count },
      });
    }

    const authState = useAuthStore.getState();
    const interactionMode = detail.interactionMode ?? useJarvisInteractionStore.getState().modeForChat(chatId);
    const modelCtx = modelSelectionContextFromAuth(authState);
    const chatModelSelection = detail.modelSelectionOverride ?? authState.chatModelSelection;
    const sendValidation = validateSendModelAccess(
      text,
      chatModelSelection,
      modelCtx,
      authState.stackCustomSteps,
      {
        voice: detail.speakReply === true,
        attachments: { hasImages: (detail.imageAttachments?.length ?? 0) > 0 },
      },
    );
    if (!sendValidation.ok) {
      toast.error('Cannot send', sendValidation.message);
      releaseVoiceTurnWithoutReply(detail, chatId);
      return;
    }
    useAllAboutMeStore.getState().recordUserMessage();

    const stackSlash = parseStackSlashCommand(text);
    // Hive multi-model stacks are chat-only by design (Settings → Hive says
    // "Chat only"): voice turns always take the single-model path so spoken
    // replies stay fast and are never billed through a multi-step pipeline.
    const stackPreset = detail.speakReply === true
      ? 'off'
      : resolveActiveStackPreset(chatModelSelection, stackSlash);
    const stackText = stackSlash.matched ? stackSlash.text : text;
    const stackTaskType = stackSlash.taskType ?? classifyStackTask(stackText);

    const mentionedAgents = resolveMentionedAgents(detail, text, bindings);

    // Resolve agent: explicit agentId > composer-resolved mention >
    // textual @mention fallback > chat's active agent.
    let agent: Agent | null | undefined;
    if (detail.agentId) agent = bindings.getAgentById(detail.agentId);
    if (!agent) agent = mentionedAgents[0];
    if (!agent) {
      const slug = detectMention(text);
      if (slug) agent = bindings.getAgentBySlug(slug);
    }
    if (!agent) agent = await bindings.getAgentForChat(chatId);
    if (!agent) {
      // Loud-but-not-crashy: surface the misconfiguration so it's visible in
      // dev console; the UI will likely show no response.
      console.warn('[jarvis runtime] no agent resolvable for chat', chatId);
      toast.error('Jarvis unavailable', 'No Jarvis agent is available for this chat.');
      releaseVoiceTurnWithoutReply(detail, chatId);
      return;
    }

    const projectId = await resolveChatProjectId(chatId);
    rememberConversationDestination(chatId, text);
    const resolvedRequestContext = await resolveJarvisContext({
      projectId,
      chatId,
      currentText: text,
      enabledCapabilities: [
        ...agent.capabilities,
        ...agent.tools_allowed,
        ...(agent.skills ?? []),
      ],
    });
    const requestIntent = classifyJarvisIntent({
      text,
      destination: resolvedRequestContext.preferredDestination,
      hasResolvedDestination: Boolean(resolvedRequestContext.preferredDestination),
    });
    const activity = useChatActivityStore.getState();
    const agentActivityId = createChatActivityId('agent');
    activity.record({
      id: agentActivityId,
      chatId,
      kind: mentionedAgents.length > 1 ? 'subagent' : 'agent',
      status: 'running',
      title: `@${agent.slug} is working`,
      subtitle: mentionedAgents.length > 1
        ? `${mentionedAgents.length} mentioned agents in context`
        : `${agent.model.provider}/${agent.model.model}`,
      agentId: agent.id,
      agentSlug: agent.slug,
      ts: Date.now(),
      detail: mentionedAgents.length > 0
        ? mentionedAgents.map((mentioned) => `@${mentioned.slug} — ${mentioned.description || mentioned.name}`).join('\n')
        : undefined,
    });
    for (const path of detail.filePaths ?? []) {
      activity.record({
        id: createChatActivityId('file'),
        chatId,
        kind: 'file',
        status: 'done',
        title: 'Reading file context',
        subtitle: path,
        filePath: path,
        ts: Date.now(),
      });
    }
    for (const image of detail.imageAttachments ?? []) {
      activity.record({
        id: createChatActivityId('image'),
        chatId,
        kind: 'file',
        status: 'done',
        title: 'Attached image',
        subtitle: image.name,
        filePath: image.sourcePath ?? image.name,
        ts: Date.now(),
        detail: `${image.mimeType}${image.size ? ` · ${Math.ceil(image.size / 1024)} KB` : ''}`,
      });
    }
    for (const url of extractUrls(text)) {
      activity.record({
        id: createChatActivityId('url'),
        chatId,
        kind: 'url',
        status: 'done',
        title: 'Referenced URL',
        subtitle: url,
        url,
        ts: Date.now(),
      });
    }
    void maybeRenameChat(chatId as ChatId, text);

    // Apply the active persona preset to Jarvis only. Other agents pass through.
    // Same gate is reused for the action-catalogue addendum so we don't
    // inflate prompts for sub-agents (Builder/Scout/Reviewer) that don't
    // need to propose user-approved actions.
    let runnable = applyChatResponseStyleOverlay(agent);
    if (agent.slug === 'jarvis') {
      const preset = useAuthStore.getState().personaPreset;
      runnable = applyPersona(runnable, preset);
      runnable = applyAvailableActions(runnable);
      runnable = applyJarvisChatActionOverlay(runnable);
    }
    const stackStepsEarly = stepsForPreset(
      stackPreset,
      stackTaskType,
      authState.stackCustomSteps,
    );
    if (stackStepsEarly.length === 0) {
      runnable = applyChatModelSelectionToAgent(runnable, chatModelSelection);
    }

    // V3 — Splice in any terminal-pane transcript bound to this
    // agent's slug. The Builder pane running `claude` produces the
    // output the Builder agent will be asked about ("did the tests
    // pass?", "what did Claude propose?"). We prepend the context to
    // the agent's system_prompt rather than splicing it as a
    // mid-history `system` message — every provider strips
    // mid-history system turns (openai/anthropic/google/groq/ollama
    // adapters all filter them) so a spliced message would be
    // silently discarded. The context block is fenced + framed as
    // data so an attacker writing "ignore previous instructions"
    // into a CLI can't hijack the chat. Empty string when there's
    // nothing worth surfacing — skip the prepend in that case to
    // keep the prompt lean.
    const terminalContext = buildAgentTerminalContext(agent.slug);

    // Project + connected-files context (Projects revamp).
    //
    // Order matters here: the project blob is the most "static" /
    // long-lived knowledge ("we use Postgres, prefer pnpm, …") so it
    // sits first. The connected-files block is "you should look at
    // these specific files for this turn" — closer to the user's
    // question, so it lives after the project blob. Live terminal
    // transcripts are the freshest, so they sit last and closest to
    // the agent's own system prompt.
    //
    // Each helper returns '' when its source is empty / disabled,
    // and we skip empty bits when assembling. Failures inside either
    // helper degrade silently — neither block is on the critical
    // path, and a missing file shouldn't kill a chat turn.
    let projectContext = '';
    let projectContextTree = '';
    let connectedFilesContext = '';
    let mentionedAgentContext = '';
    let explicitContext = '';
    let explicitFilesContext = '';
    let explicitTerminalContext = '';
    let jarvisCoordinationContext = '';
    let allAboutMeContext = '';
    let pluginContext = '';
    let pluginStatusContext = '';
    let selectedSkillsContext = '';
    const resolvedContextBlock = formatResolvedJarvisContext(resolvedRequestContext);
    const requestIntentBlock = formatJarvisIntentPolicy(requestIntent);
    try {
      projectContext = await getProjectContextBlock(projectId);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'project context fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      projectContextTree = getProjectContextTreeBlock(projectId);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'project Context tree fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      explicitContext = getExplicitContextBlock(detail.contextNodes ?? []);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'attached Context fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      connectedFilesContext = await getConnectedFilesBlock(agent.slug, projectId);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'connected-files context fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      const mentionedBlocks = [getMentionedAgentProfileBlock(mentionedAgents)];
      for (const mentioned of mentionedAgents) {
        const connected = await getConnectedFilesBlock(mentioned.slug, projectId);
        if (connected) mentionedBlocks.push(connected);
        const terminal = buildAgentTerminalContext(mentioned.slug);
        if (terminal) mentionedBlocks.push(terminal);
      }
      mentionedAgentContext = mentionedBlocks.filter(Boolean).join('\n\n');
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'mentioned-agent context build failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      explicitFilesContext = await getExplicitFilesBlock(detail.filePaths ?? [], getStoredProjectRoot(projectId));
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'attached-files context fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      explicitTerminalContext = getExplicitTerminalBlock(
        detail.terminalRefs ?? detail.terminalSessionIds ?? [],
      );
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'attached-terminal context fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    let userIdentityContext = '';
    let defaultWriteFolderContext = '';
    if (agent.slug === 'jarvis') {
      try {
        allAboutMeContext = buildAllAboutMeContextBlock(useAllAboutMeStore.getState().markdown);
      } catch (err) {
        devConsole.log({
          channel: 'ai',
          level: 'warn',
          message: 'AllAboutMe.md context build failed',
          detail: { error: err instanceof Error ? err.message : String(err) },
        });
      }
      try {
        userIdentityContext = buildUserIdentityContextBlock(useAuthStore.getState().displayName);
      } catch (err) {
        devConsole.log({
          channel: 'ai',
          level: 'warn',
          message: 'user identity context build failed',
          detail: { error: err instanceof Error ? err.message : String(err) },
        });
      }
      try {
        const writeDir =
          getCachedDefaultWriteDir() ??
          (await resolveDefaultWriteDir().catch(() => browserFallbackWriteDir()));
        defaultWriteFolderContext = [
          '## Default write folder',
          `When creating files without an explicit path, write under: \`${writeDir}\`.`,
          'Prefer this folder over refusing for "unknown location".',
        ].join('\n');
      } catch (err) {
        devConsole.log({
          channel: 'ai',
          level: 'warn',
          message: 'default write folder context build failed',
          detail: { error: err instanceof Error ? err.message : String(err) },
        });
      }
      try {
        jarvisCoordinationContext = await getJarvisCoordinationContextBlock(projectId);
      } catch (err) {
        devConsole.log({
          channel: 'ai',
          level: 'warn',
          message: 'Jarvis coordination context fetch failed',
          detail: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    try {
      pluginContext = getPluginContextBlock(projectId, detail.pluginIds);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'plugin context fetch failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      pluginStatusContext = getPluginStatusContextBlock(projectId, text);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'plugin status context build failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    try {
      selectedSkillsContext = getSelectedSkillsBlock(detail.skillIds);
    } catch (err) {
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'selected-skills context build failed',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }

    const contextBlocks = [
      projectContext,
      projectContextTree,
      userIdentityContext,
      defaultWriteFolderContext,
      allAboutMeContext,
      pluginContext,
      pluginStatusContext,
      selectedSkillsContext,
      resolvedContextBlock,
      requestIntentBlock,
      getInteractionModeOverlay(interactionMode, requestIntent.needsVisiblePlan),
      structuredContextBlock(detail.structuredContext),
      mentionedAgentContext,
      explicitContext,
      explicitFilesContext,
      explicitTerminalContext,
      jarvisCoordinationContext,
      connectedFilesContext,
      terminalContext,
      getAiCompletionInstruction(),
    ].filter((s) => s && s.length > 0);
    if (contextBlocks.length > 0) {
      runnable = {
        ...runnable,
        system_prompt: contextBlocks.join('\n\n') + '\n\n' + (runnable.system_prompt ?? ''),
      };
    }

    let placeholderId: MessageId | null = null;
    const controller = new AbortController();
    // Hoisted so the catch / finally blocks can include it in their
    // DevConsole entries — defining it inside the try would put it
    // out of scope when the run errors before the first log call.
    const aiStart = Date.now();

    // Throttled-flush state. Lifted out of the try block so the catch path can
    // cancel a pending timer before stamping the error suffix - otherwise a
    // late flush would overwrite "[cancelled]" with the partial accumulator.
    let acc = '';
    let lastFlush = 0;
    let pending = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const voiceSettings = useAuthStore.getState();
    let streamingVoice: StreamingVoiceSession | null = null;
    let lastSpeechDeltaAt = 0;
    let speechDeltaTimer: ReturnType<typeof setTimeout> | null = null;
    let speechDeltaStarted = false;
    const SPEECH_DELTA_MS = 280;

    const flushSpeechDelta = () => {
      speechDeltaTimer = null;
      if (!streamingVoice || !acc || !canVoiceModuleSpeak()) return;
      lastSpeechDeltaAt = Date.now();
      streamingVoice.onDelta(acc);
    };

    const scheduleSpeechDelta = () => {
      if (!streamingVoice) return;
      if (!speechDeltaStarted) {
        speechDeltaStarted = true;
        flushSpeechDelta();
        return;
      }
      const now = Date.now();
      const elapsed = now - lastSpeechDeltaAt;
      if (elapsed >= SPEECH_DELTA_MS) {
        if (speechDeltaTimer) {
          clearTimeout(speechDeltaTimer);
          speechDeltaTimer = null;
        }
        flushSpeechDelta();
        return;
      }
      if (!speechDeltaTimer) {
        speechDeltaTimer = setTimeout(flushSpeechDelta, SPEECH_DELTA_MS - elapsed);
      }
    };

    const cancelSpeechDelta = () => {
      if (speechDeltaTimer) {
        clearTimeout(speechDeltaTimer);
        speechDeltaTimer = null;
      }
    };
    const shouldSpeakReply = detail.speakReply === true;
    if (shouldSpeakReply) {
      streamingVoice = createStreamingVoiceSession({
        voiceEngine: voiceSettings.voiceEngine,
        voicePreset: voiceSettings.voicePreset,
      });
    }
    const stackSteps = stepsForPreset(
      stackPreset,
      stackTaskType,
      authState.stackCustomSteps,
    );

    const flushNow = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending = false;
      lastFlush = Date.now();
      if (placeholderId) {
        // Fire-and-forget: ordering of writes is preserved by the underlying
        // store; the final awaited write below stamps the canonical version.
        void bindings.updateMessage(placeholderId, {
          parts: [{ kind: 'text', text: acc }],
        });
      }
    };

    const scheduleFlush = () => {
      const now = Date.now();
      const since = now - lastFlush;
      if (since >= flushIntervalMs) {
        flushNow();
        return;
      }
      if (!pending) {
        pending = true;
        flushTimer = setTimeout(flushNow, flushIntervalMs - since);
      }
    };

    const cancelPendingFlush = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending = false;
    };

    try {
      // The composer (`features/chat/Composer.tsx`) has already
      // persisted the user message before dispatching `jarvis:send`,
      // so we DO NOT call `bindings.appendMessage` for the user turn
      // here — doing so would produce two identical user bubbles in
      // the thread (the bug the AI-router audit flagged). We just
      // create the empty assistant placeholder and read history.
      const placeholder = await bindings.appendMessage({
        chat_id: chatId as ChatId,
        role: 'assistant',
        agent_id: agent.id,
        parts: [{ kind: 'text', text: '' }],
      });
      placeholderId = placeholder.id;
      inFlight.set(placeholder.id, controller);
      dispatchRunState(chatId, 'running');

      // Read the now-current history; pass it (sans placeholder) to the model.
      const history = await bindings.getMessages(chatId);
      const includeImages = stackStepsEarly.length > 0
        ? stackStepsEarly.every((step) => modelSupportsVision(step.provider, step.model))
        : modelSupportsVision(runnable.model.provider, runnable.model.model);
      const llmMessages = toLLMMessages(history, placeholder.id, includeImages);

      useAgentStore.getState().setRunState(agent.id, 'streaming');
      useAgentStore.getState().setVerb(agent.id, 'thinking');

      // DevConsole breadcrumb — the most useful "where did the chat
      // go wrong" entry. Logged AFTER the placeholder + history are
      // ready so the detail object captures the exact prompt size
      // we're sending. Chunks themselves are not logged (would flood
      // the feed) — start/done/error/cancel are enough to bound
      // each request in the timeline.
      devConsole.log({
        channel: 'ai',
        level: 'info',
        message: `AI request → @${agent.slug} (${runnable.model.provider}/${runnable.model.model})`,
        detail: {
          chatId,
          agent: agent.slug,
          provider: runnable.model.provider,
          model: runnable.model.model,
          messageCount: llmMessages.length,
          systemPromptChars: runnable.system_prompt?.length ?? 0,
          placeholderId: placeholder.id,
        },
      });

      const stackRan = stackSteps.length > 0;
      const response = stackRan
        ? await runStack({
            agent: runnable,
            userText: stackText,
            history: llmMessages.filter((message, index, all) => {
              const isTrailingSameUser =
                index === all.length - 1 &&
                message.role === 'user' &&
                llmContentToText(message.content).trim() === text.trim();
              return !isTrailingSameUser;
            }),
            steps: stackSteps,
            signal: controller.signal,
            onStep: (step) => {
              acc = step.text;
              if (placeholderId) {
                void bindings.updateMessage(placeholderId, {
                  parts: [
                    ...stackSteps
                      .slice(0, stackSteps.findIndex((item) => item.id === step.id))
                      .map((spec) => ({
                        kind: 'stack_step' as const,
                        step_id: spec.id,
                        label: spec.label,
                        provider: spec.provider,
                        model: spec.model,
                        text: '',
                        status: 'running' as const,
                      })),
                    stackStepToPart(step),
                    { kind: 'text' as const, text: step.text },
                  ],
                });
              }
            },
          }).then((result) => ({
            text: result.finalText,
            usage: result.usage,
            provider: result.steps.at(-1)?.provider ?? runnable.model.provider,
            model: result.steps.at(-1)?.model ?? runnable.model.model,
            stackResult: result,
          }))
        : await runAgent({
            agent: runnable,
            messages: llmMessages,
            signal: controller.signal,
            onChunk: (chunk) => {
              if (chunk.delta && chunk.delta.length > 0) {
                acc += chunk.delta;
                scheduleFlush();
                scheduleSpeechDelta();
              }
              if (chunk.done) flushNow();
            },
          }).then((result) => ({ ...result, stackResult: null }));

      // Make sure no scheduled flush fires after the canonical write below.
      cancelPendingFlush();

      // Force a final write with whatever the provider says is canonical.
      // textToParts() splits the text on action-proposal fences so the
      // chat thread renders inline Approve/Cancel cards alongside prose.
      const finalText = sanitizePromptLeaks(sanitizeUnsupportedActionMacros(sanitizeCredentialRequests(response.text || acc)));
      const finalParts = response.stackResult
        ? [
            ...response.stackResult.steps.map(stackStepToPart),
            ...textToParts(finalText, stackText, interactionMode),
          ]
        : textToParts(finalText, text, interactionMode);
      await bindings.updateMessage(placeholder.id, {
        parts: finalParts,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cost_usd: response.usage.cost_usd,
          provider: response.provider,
          model: response.model,
        },
      });

      if (detail.autoApproveActions && agent.slug === 'jarvis') {
        try {
          await autoApprovePendingActions(placeholder.id, chatId);
        } catch (approveErr) {
          devConsole.log({
            channel: 'ai',
            level: 'warn',
            message: `Auto-approve actions failed: ${approveErr instanceof Error ? approveErr.message : String(approveErr)}`,
            detail: { agent: agent.slug, messageId: placeholder.id },
          });
        }
      }

      useAgentStore.getState().setRunState(agent.id, 'done');
      useAgentStore.getState().setVerb(agent.id, undefined);
      useChatActivityStore.getState().update(chatId, agentActivityId, {
        status: 'done',
        title: `@${agent.slug} finished`,
        subtitle: `${response.provider}/${response.model} · ${response.usage.input_tokens}+${response.usage.output_tokens} tokens`,
        ts: Date.now(),
      });
      dispatchRunState(chatId, 'done');
      updateStructuredAgentStatus(detail.structuredContext, 'done', 'Finished');

      // Auto-name the chat from its first assistant reply.
      //
      // The user wanted chat tabs to take their name from "the AI
      // first response," replacing the boilerplate "New chat 3"
      // placeholder. We only rename when:
      //   1. We have a chat row to update (not all hosts use chatRepo).
      //   2. The current title looks like the placeholder ("New chat",
      //      "New chat N", or empty) — never overwrite a user-edited
      //      title even if the chat is one turn old.
      //   3. We have a non-trivial reply to derive a title from.
      //
      // The summarizer is intentionally lightweight (no extra LLM
      // call): take the first sentence of the prose, strip markdown,
      // clamp to 48 chars. That's good enough to make tabs scannable;
      // the user can rename manually any time.
      try {
        await maybeRenameChat(chatId as ChatId, finalText);
      } catch {
        // Auto-naming is best-effort; never let it break the run.
      }
      if (agent.slug === 'jarvis') {
        void maybeUpdateAllAboutMeFromChat(
          runnable,
          history,
          detail.forceAllAboutMeUpdate === true,
          detail.chatId,
        );
      }

      devConsole.log({
        channel: 'ai',
        level: 'info',
        message: `AI done ← @${agent.slug} (${response.usage.input_tokens}+${response.usage.output_tokens} tok, $${response.usage.cost_usd.toFixed(4)})`,
        durationMs: Date.now() - aiStart,
        detail: {
          agent: agent.slug,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
          textChars: finalText.length,
          partCount: finalParts.length,
        },
      });
      void notifyDone(
        'jarvis',
        `${agent.name} done`,
        deriveChatTitle(finalText) || 'The AI response is complete.',
      );
      if (streamingVoice) {
        try {
          cancelSpeechDelta();
          flushSpeechDelta();
          if (canVoiceModuleSpeak()) {
            await streamingVoice.onComplete(finalText);
          } else {
            streamingVoice.haltPlayback();
          }
        } catch (speechErr) {
          devConsole.log({
            channel: 'ai',
            level: 'warn',
            message: `Streaming voice reply failed: ${speechErr instanceof Error ? speechErr.message : String(speechErr)}`,
            detail: { agent: agent.slug, textChars: finalText.length },
          });
        } finally {
          registerActiveStreamingVoiceSession(null);
          streamingVoice = null;
        }
      }
    } catch (err) {
      cancelSpeechDelta();
      streamingVoice?.stop();
      registerActiveStreamingVoiceSession(null);
      streamingVoice = null;
      if (shouldSpeakReply) {
        window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
      }
      // Cancel any pending flush before stamping the suffix or it'll overwrite us.
      cancelPendingFlush();

      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err as Error)?.name === 'AbortError';

      if (placeholderId) {
        const suffix = aborted
          ? '_[cancelled]_'
          : `_Error: ${(err as Error)?.message ?? 'unknown'}_`;
        const sep = acc.length > 0 ? '\n\n' : '';
        try {
          await bindings.updateMessage(placeholderId, {
            parts: [{ kind: 'text', text: acc + sep + suffix }],
          });
        } catch (writeErr) {
          // The audit's medium finding: a DB failure inside the catch
          // path would propagate out of handleSend as an unhandled
          // rejection, leaving the agent stuck in 'streaming'. Keep
          // the agent-state reset below the try so a stuck cursor
          // unwinds even when the canonical error stamp couldn't be
          // written.
          devConsole.log({
            channel: 'ai',
            level: 'error',
            message: 'AI error-stamp write failed',
            detail: {
              agent: agent.slug,
              error: writeErr instanceof Error ? writeErr.message : String(writeErr),
            },
          });
        }
      }
      useAgentStore.getState().setRunState(agent.id, aborted ? 'idle' : 'error');
      useAgentStore.getState().setVerb(agent.id, undefined);
      useChatActivityStore.getState().update(chatId, agentActivityId, {
        status: aborted ? 'cancelled' : 'error',
        title: aborted ? `@${agent.slug} cancelled` : `@${agent.slug} failed`,
        subtitle: aborted ? 'Cancelled by user' : ((err as Error)?.message ?? 'Unknown error'),
        ts: Date.now(),
      });
      dispatchRunState(chatId, aborted ? 'cancelled' : 'error');
      updateStructuredAgentStatus(detail.structuredContext, aborted ? 'cancelled' : 'failed', aborted ? 'Cancelled' : 'Failed');

      devConsole.log({
        channel: 'ai',
        level: aborted ? 'warn' : 'error',
        message: aborted
          ? `AI cancelled @${agent.slug}`
          : `AI error @${agent.slug}: ${(err as Error)?.message ?? 'unknown'}`,
        durationMs: Date.now() - aiStart,
        detail: {
          agent: agent.slug,
          aborted,
          partialChars: acc.length,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : String(err),
        },
      });
    } finally {
      if (placeholderId) inFlight.delete(placeholderId);
    }
  };

  const handleCancel = (e: Event) => {
    const detail = (e as CustomEvent<CancelDetail>).detail;
    if (!detail || !detail.messageId) {
      const count = inFlight.size;
      for (const c of inFlight.values()) c.abort();
      inFlight.clear();
      if (count > 0) {
        devConsole.log({
          channel: 'ai',
          level: 'warn',
          message: `AI cancel-all (${count} in flight)`,
          detail: { count },
        });
      }
      return;
    }
    const c = inFlight.get(detail.messageId);
    if (c) {
      c.abort();
      inFlight.delete(detail.messageId);
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: 'AI cancel',
        detail: { messageId: detail.messageId },
      });
    }
  };

  window.addEventListener(sendEventName, handleSend as EventListener);
  window.addEventListener(cancelEventName, handleCancel as EventListener);

  return () => {
    window.removeEventListener(sendEventName, handleSend as EventListener);
    window.removeEventListener(cancelEventName, handleCancel as EventListener);
    for (const c of inFlight.values()) c.abort();
    inFlight.clear();
  };
}
