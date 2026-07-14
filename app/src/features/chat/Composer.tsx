import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, ChevronDown, Sparkles, Mic, MicOff, FileText, X, Network, Terminal } from 'lucide-react';
import { HiveModelIcon } from '@/components/brand';
import { PLUGIN_CATALOG } from '@/features/plugins/catalog';
import { extractPluginMentions } from '@/features/plugins/mentions';
import { PluginLogo } from '@/features/plugins/PluginLogo';
import { usePluginStore } from '@/features/plugins/store';
import {
  Button,
  Hint,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui';
import { chatRepo, messageRepo } from '@/lib/db';
import { cn, isTauri, renderHotkey } from '@/lib/utils';
import { HOTKEYS } from '@/lib/hotkeys';
import { buildUsageSummary } from '@/lib/usage/usageSummary';
import { useAgentStore } from '@/stores/agents';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { parseThemeCommandArgument, SELECTABLE_THEMES } from '@/features/appearance/themes';
import { VoiceService } from '@/features/voice/VoiceService';
import { MicWaveform } from './MicWaveform';
import {
  cleanupAudioRecorder,
  encodeWav,
  COMPOSER_STT_STOP_EVENT,
  COMPOSER_STT_TOGGLE_EVENT,
  FasterWhisperManager,
  getAudioContextCtor,
  getComposerSttProvider,
  getFasterWhisperModel,
  isSystemSttAvailable,
  startBatchAudioRecorder,
  STT_INACTIVITY_MS,
  STT_ACTIVITY_RMS,
  sttVolumeRef,
  setSttVolumeLevel,
  resetSttVolume,
  startSttVolumeMeter,
  stopSttVolumeMeter,
  transcribeFasterWhisper,
  transcribeGroq as transcribeGroqApi,
  triggerWindowsNativeDictation,
  resolveComposerSttTextarea,
  type FasterWhisperRecorder,
} from '@/features/composer-stt';
import {
  buildSttCommittedValue,
  buildSttPreviewValue,
  captureSttTextSnapshot,
  type SttFieldSnapshot,
} from '@/features/composer-stt/sttInterimEditor';
import { JARVIS_COMMAND_CATALOG } from '@/features/assistant/commands';
import { toast } from '@/components/ui/toast';
import type { Agent, AgentId, ChatId, ProviderId } from '@/types';
import {
  parseTerminalRef,
  terminalRefKey,
  terminalRefLabel,
  type TerminalRef,
} from '@/features/terminals/terminalRefs';
import {
  parseTerminalScheduleRequest,
  scheduleTerminalCommandFromChat,
} from '@/features/terminals/terminalScheduler';
import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import {
  CONTEXT_MIME,
  parseContextAttachment,
  serializeContextAttachment,
  loadStoredContextMaps,
  contextMapSlashOptions,
  resolveContextMapRecord,
  type ContextAttachment,
  type ContextMapRecord,
} from '@/features/context/tree';
import { MentionTypeahead } from './MentionTypeahead';
import {
  SlashCommandTypeahead,
  SLASH_COMMANDS,
  orderSlashCommandsForDisplay,
  findSlashCommandDef,
  isChatAttachSlashCmd,
  normalizeSlashCmd,
  slashCmdMatchScore,
  type SlashCommandDef,
  type SlashCommandTypeaheadRef,
} from './SlashCommandTypeahead';
import { SlashCommandOptionPicker, type SlashCommandOption, type SlashCommandOptionPickerRef } from './SlashCommandOptionPicker';
import {
  ModelPickerTypeahead,
  HIVE_OPTION_ID,
  type ModelPickerTypeaheadRef,
} from './ModelPickerTypeahead';
import { InputToken, TokenList } from './InputToken';
import {
  extractInlineUtilitySlashCommands,
  getInlineSlashContext,
  listProjectFileOptions,
} from './slashProjectFiles';
import {
  clearRedoStack,
  NOTHING_TO_REDO_TEXT,
  NOTHING_TO_UNDO_TEXT,
  popRedoTurn,
  pushRedoTurn,
  REDO_STATUS_TEXT,
  selectLastUndoableTurn,
  summarizeUndoTurn,
  REDO_BLOCKED_RUNNING_TEXT,
  UNDO_BLOCKED_RUNNING_TEXT,
  UNDO_STATUS_TEXT,
} from './chatUndoRedo';
import { getChatDragKind, getChatDropPayload } from './dropPayload';
import { getStoredProjectRoot } from '@/features/files/projectFiles';
import {
  imageAttachmentFromBrowserFile,
  imageAttachmentFromPath,
  splitImageFiles,
} from './imageAttachments';
import { getSkillPickerOptions, getAllCatalogSkills } from '@/features/skills/skillCatalog';
import { isSupportedImagePath, type ChatImageAttachment } from '@/lib/ai/vision';
import {
  REAL_CHAT_PROVIDERS,
  selectLocalModelForChat,
  defaultModelForProvider,
  getAccessibleModelOptions,
  getAccessibleProviders,
  useOllamaModelOptions,
} from '@/lib/ai/models';
import { useAccessibleChatModels } from '@/lib/ai/useAccessibleChatModels';
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import {
  ALL_ABOUT_ME_SLASH_OPTIONS,
  allAboutMeChatUpdateStatus,
  buildAllAboutMeSlashText,
  type AllAboutMeSlashOptionId,
} from '@/features/all-about-me/slash';
import {
  formatChatModelSelectionLabel,
  modelSelectionContextFromAuth,
  selectionFromHive,
  selectionFromOption,
  selectionOptionId,
  validateSendModelAccess,
  type ChatModelSelection,
  type ModelSelectionContext,
} from '@/lib/ai/modelSelection';
import { ModeIndicator } from '@/features/jarvis-interaction/ModeIndicator';
import {
  cycleInteractionMode,
  parsePermissionModeArg,
  PERMISSION_MODE_OPTIONS,
} from '@/features/jarvis-interaction/modes';
import { useJarvisInteractionStore } from '@/features/jarvis-interaction/sessionStore';
import { launchJarvisChatAgent } from '@/features/jarvis-interaction/agentRunner';
import {
  buildQueuedMultitaskCommand,
  QueuedMessagesBar,
  shouldAutoSendQueuedOnRunStatus,
  takeNextQueuedMessage,
  type QueuedChatMessage,
} from './QueuedMessagesBar';

export interface ComposerProps {
  chatId: ChatId | string;
  /** Optional placeholder override */
  placeholder?: string;
  /** Compact right-sidebar rendering. */
  compact?: boolean;
  /** Disable slash commands that navigate the main canvas. */
  disableRouteSlashCommands?: boolean;
}

const LINE_HEIGHT = 20; // px - matches body type scale
const PADDING_Y = 16; // px - 8px top + 8px bottom
const MIN_LINES = 1;
const MAX_LINES = 8;
const MIN_HEIGHT = MIN_LINES * LINE_HEIGHT + PADDING_Y;
const MAX_HEIGHT = MAX_LINES * LINE_HEIGHT + PADDING_Y;
const COMPOSER_IDLE_PLUGIN_CONNECTIONS = {} as ReturnType<
  typeof usePluginStore.getState
>['connections'];

const COMPOSER_IDLE_TERMINAL_SESSIONS = {} as ReturnType<
  typeof useTerminalTranscriptStore.getState
>['sessions'];

const PROVIDERS: ProviderId[] = [...REAL_CHAT_PROVIDERS];
const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  together: 'Together',
  ollama: 'Ollama (local)',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  fireworks: 'Fireworks',
  replicate: 'Replicate',
  hyperbolic: 'Hyperbolic',
  novita: 'Novita',
  lambda: 'Lambda',
  azure: 'Azure OpenAI',
  cerebras: 'Cerebras',
  huggingface: 'Hugging Face',
  bedrock: 'AWS Bedrock',
  mock: 'Mock',
  local: 'Local',
};

type MentionContext = { start: number; query: string };
type SlashContext = { start: number; query: string };
type OptionPickerContext = { cmd: SlashCommandDef; query: string };

export interface ConfirmedCommand {
  cmd: string;
  value?: string;
  label: string;
}

export interface ConfirmedAgentMention {
  id: AgentId;
  slug: string;
  label: string;
}

const SLASH_REFERENCE_LABELS: Record<string, string> = {
  agents: 'Agents page/editor',
  terminals: 'Terminal surface',
  hive: 'Hive Balanced',
  kanban: 'Kanban page',
  history: 'History page',
  tools: 'Tools page',
  schedule: 'Schedule page',
  chat: 'Chat page',
};

export function buildConfirmedAgentMention(agent: Agent): ConfirmedAgentMention {
  return {
    id: agent.id,
    slug: agent.slug,
    label: `@${agent.slug}`,
  };
}

export function buildSlashReferenceCommand(cmd: SlashCommandDef): ConfirmedCommand {
  const canonical = normalizeSlashCmd(cmd.cmd);
  const label = SLASH_REFERENCE_LABELS[canonical] ?? cmd.description.replace(/^Open\s+/i, '');
  return {
    cmd: canonical,
    value: `reference:${canonical}`,
    label: `/${canonical}: ${label}`,
  };
}

export function resolveMentionedAgentIdsForSend(
  text: string,
  agents: Record<string, Agent>,
  confirmedMentions: ConfirmedAgentMention[] = [],
): AgentId[] {
  const seen = new Set<AgentId>();
  const out: AgentId[] = [];
  for (const mention of confirmedMentions) {
    if (seen.has(mention.id)) continue;
    seen.add(mention.id);
    out.push(mention.id);
  }
  for (const id of extractMentionedAgentIds(text, agents)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function confirmedCommandReferenceText(commands: ConfirmedCommand[]): string {
  const references = commands
    .filter((command) => command.value?.startsWith('reference:'))
    .map((command) => {
      const label = command.label.replace(/^\/[^:]+:\s*/, '').trim();
      return `/${command.cmd} references ${label}`;
    });
  if (references.length === 0) return '';
  return `Context references: ${references.join('; ')}.`;
}

const WINDOWS_FILE_PATH_RE =
  /[A-Za-z]:\\[^\r\n<>:"|?*]+?\.(?:json|cs|ts|tsx|js|jsx|md|txt|html|css|scss|py|rs|go|java|cpp|c|h|hpp|xml|yaml|yml|toml|ini|sql)\b/gi;

export function extractAbsoluteFilePaths(text: string): string[] {
  return Array.from(new Set(text.match(WINDOWS_FILE_PATH_RE) ?? [])).slice(0, 8);
}

/**
 * Find an active "@xxx" mention being typed at the caret.
 * Triggers when '@' is at position 0 or directly after whitespace.
 */
function getMentionContext(value: string, caret: number): MentionContext | null {
  let i = caret - 1;
  while (i >= 0) {
    const c = value[i];
    if (c === '@') {
      if (i === 0 || /\s/.test(value[i - 1] ?? '')) {
        return { start: i, query: value.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(c)) return null;
    i--;
  }
  return null;
}

/**
 * Find an active "/xxx" slash command being typed at the caret.
 * Works at the start, middle (after space/punctuation), or end of a message.
 */
function getSlashContext(value: string, caret: number): SlashContext | null {
  return getInlineSlashContext(value, caret);
}

/**
 * Fuzzy-match a query against a string. Returns a score (higher = better match).
 * Simple scoring: prefix match > starts-with > includes > no match.
 */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 50;
  // Character-by-character fuzzy: all query chars must appear in order
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 20 : 0;
}

/**
 * Pull all `@slug` tokens from a string and resolve them to known AgentIds.
 *
 * Defensive against a sparse or partially-corrupt agent map: any entry
 * without a slug is skipped rather than crashing the loop. The
 * Composer's `handleSend` calls this synchronously inside a try/catch,
 * but a defensive guard here keeps the dispatch path simple even when
 * an agent gets registered without all of its expected fields.
 */
function extractMentionedAgentIds(text: string, agents: Record<string, Agent>): AgentId[] {
  const slugToId: Record<string, AgentId> = {};
  for (const a of Object.values(agents)) {
    if (!a?.slug || !a.id) continue;
    slugToId[a.slug] = a.id;
  }

  const seen = new Set<AgentId>();
  const out: AgentId[] = [];
  const re = /(?:^|\s)@([a-z0-9_-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = slugToId[(m[1] ?? '').toLowerCase()];
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function pluginConnectionLabel(
  connection: { accountLabel?: string; configuredFields: string[] } | undefined,
): string | undefined {
  if (!connection) return undefined;
  return connection.accountLabel ?? `${connection.configuredFields.length} credential(s)`;
}

export function Composer({ chatId, placeholder, compact = false, disableRouteSlashCommands = false }: ComposerProps) {
  const [text, setText] = useState('');
  const [mentionCtx, setMentionCtx] = useState<MentionContext | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [slashCtx, setSlashCtx] = useState<SlashContext | null>(null);
  const [selectedSlashCmd, setSelectedSlashCmd] = useState<string>('');
  const [optionPickerCtx, setOptionPickerCtx] = useState<OptionPickerContext | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const interactionMode = useJarvisInteractionStore((s) => s.modeForChat(chatId));
  const setInteractionMode = useJarvisInteractionStore((s) => s.setChatMode);
  const [confirmedCommands, setConfirmedCommands] = useState<ConfirmedCommand[]>([]);
  const [confirmedAgentMentions, setConfirmedAgentMentions] = useState<ConfirmedAgentMention[]>([]);
  const [sending, setSending] = useState(false);
  const [jarvisRunning, setJarvisRunning] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<ChatImageAttachment[]>([]);
  const [attachedTerminals, setAttachedTerminals] = useState<TerminalRef[]>([]);
  const [attachedPlugins, setAttachedPlugins] = useState<string[]>([]);
  const [attachedContexts, setAttachedContexts] = useState<ContextAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // V2 — speech-to-text in the composer.
  const [sttListening, setSttListening] = useState(false);
  const [sttAwaitingFinal, setSttAwaitingFinal] = useState(false);
  const [sttTranscribing, setSttTranscribing] = useState(false);
  const [sttInterim, setSttInterim] = useState('');
  const composerSttEnabled = useUIStore((s) => s.composerStt);
  const setComposerSttListening = useUIStore((s) => s.setComposerSttListening);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashTypeaheadRef = useRef<SlashCommandTypeaheadRef>(null);
  const optionPickerRef = useRef<SlashCommandOptionPickerRef>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const wavChunksRef = useRef<Float32Array[]>([]);
  const audioSilenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAudioActivityRef = useRef(0);

  const clearSttFinalizeTimer = useCallback(() => {
    if (sttFinalizeTimerRef.current) {
      clearTimeout(sttFinalizeTimerRef.current);
      sttFinalizeTimerRef.current = null;
    }
  }, []);

  const captureComposerSttSnapshot = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    sttSnapshotRef.current = captureSttTextSnapshot(
      text,
      el.selectionStart ?? text.length,
      el.selectionEnd ?? text.length,
    );
  }, [text]);

  const revertComposerSttPreview = useCallback(() => {
    const snap = sttSnapshotRef.current;
    if (!snap) return;
    setText(snap.before + snap.after);
    sttSnapshotRef.current = null;
  }, []);

  const volumeRef = sttVolumeRef;
  const voiceReplyRequestedRef = useRef(false);
  const batchRecorderRef = useRef<FasterWhisperRecorder | null>(null);
  const sttSnapshotRef = useRef<SttFieldSnapshot | null>(null);
  const transcribeGenRef = useRef(0);
  const sttFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queuedMessagesRef = useRef(queuedMessages);
  queuedMessagesRef.current = queuedMessages;
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  /** Latest auto-flush implementation (set after handleSend exists). */
  const flushNextQueuedRef = useRef<() => void>(() => {});

  useEffect(() => {
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const onRunState = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: string; status?: string }>).detail;
      if (String(detail?.chatId) !== String(chatId)) return;
      const status = detail?.status;
      if (status === 'running') {
        setJarvisRunning(true);
        return;
      }
      setJarvisRunning(false);
      // When the previous full reply finishes (or fails/cancels), send the next
      // queued message automatically — FIFO order.
      if (!shouldAutoSendQueuedOnRunStatus(status)) return;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushNextQueuedRef.current();
      }, 60);
    };
    window.addEventListener('jarvis:run-state', onRunState as EventListener);
    return () => {
      window.removeEventListener('jarvis:run-state', onRunState as EventListener);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [chatId]);

  const enqueueCurrentMessage = (draft: string) => {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) return;
    setQueuedMessages((current) => [
      ...current,
      { id: `queued_${Date.now().toString(36)}_${current.length}`, text: trimmedDraft, createdAt: Date.now() },
    ]);
    setText('');
    toast.info(
      'Message queued',
      'It will send automatically when Jarvis finishes the current reply (or use Send / Multitask).',
    );
  };

  const editQueuedMessage = (id: string) => {
    setQueuedMessages((current) => {
      const queued = current.find((message) => message.id === id);
      if (queued) setText(queued.text);
      return current.filter((message) => message.id !== id);
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const deleteQueuedMessage = (id: string) => {
    setQueuedMessages((current) => current.filter((message) => message.id !== id));
  };

  const agents = useAgentStore((s) => s.agents);
  const provider = useAuthStore((s) => s.defaultProvider);
  const selectedModels = useAuthStore((s) => s.selectedModels);
  const chatModelSelection = useAuthStore((s) => s.chatModelSelection);
  const setChatModelSelection = useAuthStore((s) => s.setChatModelSelection);
  const stackCustomSteps = useAuthStore((s) => s.stackCustomSteps);
  const setDefaultProvider = useAuthStore((s) => s.setDefaultProvider);
  const setSelectedModel = useAuthStore((s) => s.setSelectedModel);
  const defaultLocalModel = useAuthStore((s) => s.defaultLocalModel);
  const apiKeys = useAuthStore((s) => s.apiKeys);
  const offlineMode = useAuthStore((s) => s.offlineMode);
  const plan = useAuthStore((s) => s.plan);
  const projectId = useAuthStore((s) => s.projectId);
  const terminalPickerActive = normalizeSlashCmd(optionPickerCtx?.cmd.cmd ?? '') === 'terminals';
  const pluginPickerActive = optionPickerCtx?.cmd.cmd === 'plug';
  const pluginConnections = usePluginStore((s) =>
    pluginPickerActive ? s.connections : COMPOSER_IDLE_PLUGIN_CONNECTIONS,
  );
  const terminalSessions = useTerminalTranscriptStore((s) =>
    terminalPickerActive ? s.sessions : COMPOSER_IDLE_TERMINAL_SESSIONS,
  );
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<ModelPickerTypeaheadRef>(null);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const ollamaOptions = useOllamaModelOptions();
  const [projectFileOptions, setProjectFileOptions] = useState<SlashCommandOption[]>([]);
  const [projectFilesLoading, setProjectFilesLoading] = useState(false);
  const [projectFilesError, setProjectFilesError] = useState<string | undefined>(undefined);

  const accessibleProviders = useMemo(
    () => getAccessibleProviders(apiKeys, offlineMode, plan),
    [apiKeys, offlineMode, plan, ollamaOptions],
  );

  const modelCtx = useMemo(
    () => modelSelectionContextFromAuth({ apiKeys, offlineMode, plan, defaultLocalModel }),
    [apiKeys, offlineMode, plan, defaultLocalModel],
  );

  // Generate options for option picker based on current command
  const optionPickerOptions = useMemo<SlashCommandOption[]>(() => {
    if (!optionPickerCtx) return [];
    const cmd = optionPickerCtx.cmd.cmd;

    if (normalizeSlashCmd(cmd) === 'terminals') {
      const sessions = Object.values(terminalSessions)
        .filter((s) => !projectId || s.projectId === projectId)
        .sort((a, b) => b.lastWriteAt - a.lastWriteAt);
      return sessions.map((s) => ({
        id: s.sessionId,
        label: s.command || s.agentSlug || s.paneId || 'Terminal',
        description: s.agentSlug ? `Agent: ${s.agentSlug}` : undefined,
        metadata: s.paneId ? `pane:${s.paneId.slice(0, 6)}` : undefined,
      }));
    }

    if (normalizeSlashCmd(cmd) === 'context') {
      const maps = projectId ? loadStoredContextMaps(projectId) : [];
      return contextMapSlashOptions(maps);
    }

    if (cmd === 'plug') {
      return PLUGIN_CATALOG.filter((plugin) => {
        const connection = pluginConnections[plugin.id];
        if (!connection || connection.state !== 'connected' || !connection.enabled) return false;
        return (
          connection.enabledProjectIds.includes('*') ||
          Boolean(projectId && connection.enabledProjectIds.includes(projectId))
        );
      }).map((plugin) => ({
        id: plugin.id,
        label: plugin.name,
        description: pluginConnectionLabel(pluginConnections[plugin.id]),
        metadata: plugin.category,
        leading: <PluginLogo plugin={plugin} size="sm" />,
      }));
    }

    if (cmd === 'skills') {
      return getSkillPickerOptions().map((skill) => ({
        id: skill.id,
        label: skill.emoji ? `${skill.emoji} ${skill.label}` : skill.label,
        description: skill.description,
        metadata: skill.metadata,
      }));
    }

    if (cmd === 'allaboutme') {
      return ALL_ABOUT_ME_SLASH_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        icon: FileText,
      }));
    }

    if (normalizeSlashCmd(cmd) === 'file') {
      return projectFileOptions;
    }

    if (normalizeSlashCmd(cmd) === 'permissions') {
      return PERMISSION_MODE_OPTIONS.map((option) => ({
        id: option.id,
        label: option.title,
        description: option.description,
        metadata: option.id === interactionMode ? 'active' : undefined,
      }));
    }

    return [];
  }, [optionPickerCtx, terminalSessions, projectId, pluginConnections, projectFileOptions, interactionMode]);

  // Load project files when /file picker opens
  useEffect(() => {
    if (normalizeSlashCmd(optionPickerCtx?.cmd.cmd ?? '') !== 'file') {
      return;
    }
    let cancelled = false;
    setProjectFilesLoading(true);
    setProjectFilesError(undefined);
    void listProjectFileOptions({ projectId }).then((result) => {
      if (cancelled) return;
      setProjectFileOptions(result.options);
      setProjectFilesError(result.error);
      setProjectFilesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [optionPickerCtx, projectId]);

  // Keep keyboard highlight on a valid option without clobbering hover/arrow nav.
  const optionPickerSignature = useMemo(
    () => optionPickerOptions.map((option) => option.id).join('\0'),
    [optionPickerOptions],
  );

  useEffect(() => {
    if (optionPickerOptions.length === 0) {
      setSelectedOptionId((current) => (current === '' ? current : ''));
      return;
    }
    setSelectedOptionId((current) =>
      optionPickerOptions.some((o) => o.id === current) ? current : optionPickerOptions[0]!.id,
    );
  }, [optionPickerSignature]);

  const clearAudioSilenceTimer = () => {
    if (audioSilenceTimerRef.current) clearInterval(audioSilenceTimerRef.current);
    audioSilenceTimerRef.current = null;
  };

  const stopGroqSttWithoutTranscribing = (message = 'Speech-to-text stopped after 30 seconds without voice activity.') => {
    clearAudioSilenceTimer();
    stopSttVolumeMeter();
    batchRecorderRef.current?.stop();
    batchRecorderRef.current = null;
    const context = audioContextRef.current;
    const chunks = wavChunksRef.current;
    cleanupAudioRecorder(audioProcessorRef.current, audioSourceRef.current, audioContextRef.current, mediaStreamRef.current);
    audioProcessorRef.current = null;
    audioSourceRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    wavChunksRef.current = [];
    setSttListening(false);
    setSttInterim('');
    if (chunks.length > 0 && context) {
      void transcribeGroq(encodeWav(chunks, context.sampleRate), useAuthStore.getState().apiKeys.groq ?? '');
      return;
    }
    toast.info('Speech-to-text stopped', message);
  };

  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ path?: string; prompt?: string; code?: string }>).detail;
      if (!detail?.path || !detail.code) return;
      setText([
        detail.prompt?.trim() || 'Review this code.',
        '',
        `File: ${detail.path}`,
        '```',
        detail.code,
        '```',
      ].join('\n'));
      setAttachedFiles((cur) => (cur.includes(detail.path!) ? cur : [...cur, detail.path!]).slice(0, 8));
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener('jarvis:files:ask', onAsk as EventListener);
    return () => window.removeEventListener('jarvis:files:ask', onAsk as EventListener);
  }, []);

  // Free-tier nudge: the seeded Jarvis agent runs on Google's Gemini 2.5
  // Flash Lite by default. Until the user pastes an AI Studio key
  // (`AIza...`), the router silently falls back to mock and replies look
  // fake. Surface a one-line CTA on the composer so they know it's a
  // 30-second fix at aistudio.google.com/apikey (no card needed).
  const googleKey = useAuthStore((s) => s.apiKeys.google);
  const jarvisAgent = useMemo(
    () => Object.values(agents).find((a) => a.slug === 'jarvis'),
    [agents],
  );
  const showFreeKeyNudge =
    !compact &&
    !!jarvisAgent &&
    jarvisAgent.model.provider === 'google' &&
    !googleKey;

  // Filtered agent list for the mention typeahead (case-insensitive prefix match,
  // falling back to substring match for forgiving search).
  const filteredAgents = useMemo<Agent[]>(() => {
    const all = Object.values(agents);
    const q = (mentionCtx?.query ?? '').toLowerCase();
    if (!mentionCtx) return [];
    if (!q) return all;
    return all
      .filter((a) => a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefer slug-prefix matches first
        const aPrefix = a.slug.toLowerCase().startsWith(q) ? 0 : 1;
        const bPrefix = b.slug.toLowerCase().startsWith(q) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return a.slug.localeCompare(b.slug);
      });
  }, [agents, mentionCtx]);

  const filteredAgentsSignature = useMemo(
    () => filteredAgents.map((agent) => agent.slug).join('\0'),
    [filteredAgents],
  );

  // Keep selectedSlug in sync when filtered list changes
  useEffect(() => {
    if (filteredAgents.length === 0) {
      setSelectedSlug((current) => (current === '' ? current : ''));
      return;
    }
    setSelectedSlug((current) =>
      filteredAgents.some((agent) => agent.slug === current) ? current : filteredAgents[0]!.slug,
    );
  }, [filteredAgentsSignature]);

  // Filtered slash command list for the typeahead (fuzzy match on cmd + description).
  const filteredSlashCommands = useMemo<SlashCommandDef[]>(() => {
    const q = (slashCtx?.query ?? '').toLowerCase();
    if (!slashCtx) return [];
    const scored = SLASH_COMMANDS.map((c) => ({
      cmd: c,
      score: slashCmdMatchScore(q, c),
    }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.cmd.cmd.localeCompare(b.cmd.cmd))
      .map((s) => s.cmd);
    return scored;
  }, [slashCtx]);

  const filteredSlashCommandsSignature = useMemo(
    () => filteredSlashCommands.map((command) => command.cmd).join('\0'),
    [filteredSlashCommands],
  );

  // Keep selectedSlashCmd in sync when filtered list changes
  useEffect(() => {
    if (filteredSlashCommands.length === 0) {
      setSelectedSlashCmd((current) => (current === '' ? current : ''));
      return;
    }
    const displayCommands = orderSlashCommandsForDisplay(filteredSlashCommands);
    setSelectedSlashCmd((current) =>
      displayCommands.some((command) => command.cmd === current)
        ? current
        : displayCommands[0]!.cmd,
    );
  }, [filteredSlashCommandsSignature]);

  // Auto-grow the textarea up to MAX_HEIGHT, then enable internal scroll
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.max(MIN_HEIGHT, Math.min(ta.scrollHeight, MAX_HEIGHT));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [text]);

  const recomputeMention = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setMentionCtx(getMentionContext(ta.value, ta.selectionStart));
  };

  const recomputeSlash = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setSlashCtx(getSlashContext(ta.value, ta.selectionStart));
  };

  const insertSlashCommand = (cmd: SlashCommandDef) => {
    if (!slashCtx || !textareaRef.current) return;
    const ta = textareaRef.current;
    const before = text.slice(0, slashCtx.start);
    const after = text.slice(ta.selectionStart);

    const canonicalCmd = normalizeSlashCmd(cmd.cmd);

    // `/hive` is no longer a reference token — it switches the chat model to the
    // Hive ensemble (no attachment), then clears the typed command.
    if (canonicalCmd === 'hive') {
      setText(before + after);
      setChatModelSelection(selectionFromHive('balanced'));
      setConfirmedCommands((cur) => {
        const entry = buildSlashReferenceCommand(cmd);
        return [...cur.filter((c) => c.value !== entry.value), entry];
      });
      setSlashCtx(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    const isReferenceCommand =
      canonicalCmd === 'terminals' ||
      cmd.category === 'navigation';

    if (isReferenceCommand) {
      setText(before + after);
      setConfirmedCommands((cur) => {
        const entry = buildSlashReferenceCommand(cmd);
        return [...cur.filter((c) => c.value !== entry.value), entry];
      });
      setSlashCtx(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // /clearfiles (and aliases) — clear attachments immediately + confirmed chip
    if (canonicalCmd === 'clearfiles') {
      setText(before + after);
      setAttachedFiles([]);
      setAttachedImages([]);
      const flashId = `clear:${Date.now()}`;
      setConfirmedCommands((cur) => [
        ...cur.filter((c) => c.cmd !== 'clearfiles'),
        { cmd: 'clearfiles', value: flashId, label: '/clearfiles · cleared' },
      ]);
      window.setTimeout(() => {
        setConfirmedCommands((cur) => cur.filter((c) => !(c.cmd === 'clearfiles' && c.value === flashId)));
      }, 2200);
      toast.info('Attachments cleared', 'All files and images removed from this message.');
      setSlashCtx(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // If command has options (context, plug, skills, file, permissions…), show option picker.
    if (
      cmd.hasOptions &&
      (isChatAttachSlashCmd(cmd.cmd) || normalizeSlashCmd(cmd.cmd) === 'permissions')
    ) {
      setText(before + after);
      setSlashCtx(null);
      setSelectedOptionId('');
      setOptionPickerCtx({ cmd, query: '' });
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // Model picker
    if (canonicalCmd === 'model' && cmd.hasOptions) {
      setText(before + after);
      setSlashCtx(null);
      setModelPickerOpen(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // Utility / no-arg commands become confirmed chips (cool effect) when possible
    if (!cmd.takesArg) {
      setText(before + after);
      setConfirmedCommands((cur) => [
        ...cur.filter((c) => c.cmd !== canonicalCmd),
        {
          cmd: canonicalCmd,
          value: `confirmed:${canonicalCmd}`,
          label: `/${canonicalCmd}`,
        },
      ]);
      setSlashCtx(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // Commands that take free-text args: keep slash in the draft at the caret
    // so the user can finish typing (e.g. /multitask fix the bug).
    const insert = `/${cmd.cmd} `;
    const next = before + insert + after;
    setText(next);
    setSlashCtx(null);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      const pos = before.length + insert.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  };

  const selectOption = (option: SlashCommandOption) => {
    if (!optionPickerCtx) return;
    const cmd = optionPickerCtx.cmd;
    const canonical = normalizeSlashCmd(cmd.cmd);

    if (cmd.cmd === 'allaboutme' && option.id === 'retake') {
      setOptionPickerCtx(null);
      setSelectedOptionId('');
      setSettingsOpen(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('jarvis:settings:tab', { detail: { tab: 'allaboutme' } }));
        window.dispatchEvent(new CustomEvent('jarvis:allaboutme:retake'));
      }, 0);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // /permissions picker: set Agent / Plan / Ask mode only — never attach a chip.
    if (canonical === 'permissions') {
      const nextMode = parsePermissionModeArg(option.id) ?? (option.id as 'ask' | 'plan' | 'agent');
      if (nextMode === 'ask' || nextMode === 'plan' || nextMode === 'agent') {
        setInteractionMode(chatId, nextMode);
        // Drop any stale permissions chip from older builds.
        setConfirmedCommands((cur) => cur.filter((c) => c.cmd !== 'permissions'));
        // Quiet: mode chip already shows the active mode — no toast spam.
      }
      setOptionPickerCtx(null);
      setSelectedOptionId('');
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // /file picker: attach project file path + show confirmed chip
    if (canonical === 'file') {
      const path = option.id;
      if (isSupportedImagePath(path)) {
        void imageAttachmentFromPath(path)
          .then((image) => {
            setAttachedImages((cur) =>
              cur.some((item) => item.sourcePath === path) ? cur : [...cur, image].slice(0, 6),
            );
          })
          .catch((err) => {
            toast.error('Image attach failed', err instanceof Error ? err.message : 'Could not attach image.');
          });
      } else {
        setAttachedFiles((cur) => (cur.includes(path) ? cur : [...cur, path]).slice(0, 8));
      }
      setConfirmedCommands((cur) => [
        ...cur.filter((c) => !(c.cmd === 'file' && c.value === path)),
        { cmd: 'file', value: path, label: `/file: ${option.label}` },
      ]);
      setOptionPickerCtx(null);
      setSelectedOptionId('');
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    const entry: ConfirmedCommand = {
      cmd: cmd.cmd,
      value: option.id,
      label: `/${cmd.cmd}: ${option.label}`,
    };

    setConfirmedCommands((cur) => {
      if (cmd.cmd === 'skills') {
        if (cur.some((c) => c.cmd === 'skills' && c.value === option.id)) return cur;
        if (cur.filter((c) => c.cmd === 'skills').length >= 6) return cur;
        return [...cur, entry];
      }
      return [...cur.filter((c) => c.cmd !== cmd.cmd), entry];
    });
    setOptionPickerCtx(null);
    setSelectedOptionId('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const removeConfirmedCommand = (cmd: string, value?: string) => {
    setConfirmedCommands((cur) =>
      value != null
        ? cur.filter((c) => !(c.cmd === cmd && c.value === value))
        : cur.filter((c) => c.cmd !== cmd),
    );
  };

  const insertMention = (agent: Agent) => {
    if (!mentionCtx || !textareaRef.current) return;
    const ta = textareaRef.current;
    const before = text.slice(0, mentionCtx.start);
    const after = text.slice(ta.selectionStart);
    const next = before + after;
    setText(next);
    setConfirmedAgentMentions((cur) => {
      if (cur.some((mention) => mention.id === agent.id)) return cur;
      return [...cur, buildConfirmedAgentMention(agent)].slice(0, 8);
    });
    setMentionCtx(null);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      const pos = before.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  };

  const handleSlashCommand = async (trimmed: string): Promise<boolean | string> => {
    if (!trimmed.startsWith('/')) return false;
    const [cmdRaw, ...restParts] = trimmed.slice(1).split(/\s+/);
    const cmd = normalizeSlashCmd(cmdRaw ?? '');
    const rest = restParts.join(' ').trim();
    const addSystem = async (msg: string) => {
      await messageRepo.create({ chat_id: chatId as ChatId, role: 'system', parts: [{ kind: 'text', text: msg }] });
      setText('');
    };
    const openAttachPicker = (canonicalCmd: string) => {
      const def = findSlashCommandDef(canonicalCmd);
      if (!def) return false;
      setText('');
      setSlashCtx(null);
      setSelectedOptionId('');
      setOptionPickerCtx({ cmd: def, query: '' });
      requestAnimationFrame(() => textareaRef.current?.focus());
      return true;
    };
    if (cmd === 'permissions' || cmd === 'permission' || cmd === 'perms' || cmd === 'access') {
      const parsed = rest ? parsePermissionModeArg(rest) : null;
      if (parsed) {
        setInteractionMode(chatId, parsed);
        // Mode change only — do not attach /permissions as a confirmed chip.
        setConfirmedCommands((cur) => cur.filter((c) => c.cmd !== 'permissions'));
        setText('');
        return true;
      }
      // Open the permissions option picker (still not an attachment).
      openAttachPicker('permissions');
      return true;
    }
    if (cmd === 'ask') {
      setInteractionMode(chatId, 'ask');
      if (rest) return rest;
      setText('');
      return true;
    }
    if (cmd === 'plan') {
      setInteractionMode(chatId, 'plan');
      if (rest) return rest;
      setText('');
      return true;
    }
    if (cmd === 'schedule' && rest) {
      return `/${cmd} ${rest}`;
    }
    if (cmd === 'multitask' || cmd === 'subagents') {
      setInteractionMode(chatId, 'agent');
      if (!rest) {
        await addSystem(`Use /${cmd} <task> to launch chat-native Jarvis ${cmd === 'subagents' ? 'subagents' : 'agent'}.`);
        return true;
      }
      const jarvisAgent = Object.values(agents).find((agent) => agent.slug === 'jarvis') ?? Object.values(agents)[0];
      await launchJarvisChatAgent({
        parentChatId: chatId,
        task: rest,
        modelLabel: formatChatModelSelectionLabel(chatModelSelection, modelCtx),
        modelSelection: chatModelSelection,
        jarvisAgentId: jarvisAgent?.id,
        commandName: cmd,
        repos: { chatRepo, messageRepo },
      });
      setText('');
      return true;
    }
    if (cmd === 'usage') {
      const apiKey = useAuthStore.getState().apiKeys[provider];
      await addSystem(
        await buildUsageSummary({
          provider,
          apiKey,
          providerLabel: PROVIDER_LABELS[provider],
        }),
      );
      return true;
    }
    if (cmd === 'theme') {
      const nextTheme = parseThemeCommandArgument(rest);
      if (!nextTheme) {
        await addSystem(
          `Available themes: ${SELECTABLE_THEMES.map((theme) => theme.label).join(', ')}. Use /theme <name>.`,
        );
        return true;
      }
      useUIStore.getState().setTheme(nextTheme);
      const label = SELECTABLE_THEMES.find((theme) => theme.id === nextTheme)?.label ?? nextTheme;
      await addSystem(`Theme changed to ${label}.`);
      return true;
    }
    if (cmd === 'model') {
      if (!rest) {
        setText('');
        setModelPickerOpen(true);
        return true;
      }
      const [providerRaw, ...modelParts] = rest.split(/\s+/);
      const wanted = providerRaw?.toLowerCase() as ProviderId;
      if (!PROVIDERS.includes(wanted)) {
        await addSystem(`Available AI providers: ${PROVIDERS.join(', ')}.`);
        return true;
      }
      const wantedModel =
        modelParts.join(' ').trim() ||
        selectedModels[wanted] ||
        defaultModelForProvider(wanted, defaultLocalModel);
      setDefaultProvider(wanted);
      setSelectedModel(wanted, wantedModel);
      await addSystem(`AI model changed to ${PROVIDER_LABELS[wanted]} / ${wantedModel}.`);
      return true;
    }
    if (cmd === 'hive') {
      setChatModelSelection(selectionFromHive('balanced'));
      setText('');
      if (rest) return rest;
      await addSystem('Switched chat model to Hive — the 5-model balanced ensemble.');
      return true;
    }
    const routes: Record<string, string> = {
      kanban: 'kanban',
      history: 'history',
      tools: 'tools',
      agents: 'agents',
      schedule: 'schedule',
      chat: 'chat',
    };
    if (cmd in routes) {
      const def = findSlashCommandDef(cmd);
      const reference = def ? confirmedCommandReferenceText([buildSlashReferenceCommand(def)]) : `Context references: /${cmd} references ${routes[cmd]}.`;
      const scopedReference = disableRouteSlashCommands
        ? `${reference} This sidebar stays attached to the current project.`
        : reference;
      return rest ? `${scopedReference} ${rest}` : scopedReference;
    }
    if (cmd === 'terminals') {
      const def = findSlashCommandDef('terminals');
      const reference = def ? confirmedCommandReferenceText([buildSlashReferenceCommand(def)]) : 'Context references: /terminals references Terminal surface.';
      return rest ? `${reference} ${rest}` : reference;
    }
    if (cmd === 'context') {
      if (rest) {
        const projectId = useAuthStore.getState().projectId;
        const maps = projectId ? loadStoredContextMaps(projectId) : [];
        const target = rest.toLowerCase();
        const matched = maps.find((m: ContextMapRecord) => (m.name ?? '').toLowerCase().includes(target));
        if (!matched) {
          await addSystem(`No context map matching '${rest}'. Use /context to pick from the list.`);
          return true;
        }
        const root = matched.tree?.nodes?.[0];
        if (!root) {
          await addSystem(`Context map '${matched.name}' has no nodes.`);
          return true;
        }
        const attachment: ContextAttachment = {
          projectId: matched.projectId,
          rootDir: matched.rootDir,
          generatedAt: matched.tree?.generatedAt ?? Date.now(),
          nodeId: root.id ?? `map:${matched.name}`,
          title: matched.name ?? 'Context Map',
          summary: matched.tree?.summary ?? '',
          path: '',
          kind: 'root',
        };
        setAttachedContexts((cur) =>
          cur.some((item) => item.nodeId === attachment.nodeId)
            ? cur
            : [...cur, attachment].slice(0, 8),
        );
        setText('');
        await addSystem(`Attached context map '${matched.name}' to this chat.`);
        return true;
      }
      if (openAttachPicker('context')) return true;
      await addSystem('No context maps yet. Open Context and press "Make Context Map", then use /context here.');
      return true;
    }
    if (cmd === 'skills') {
      const available = getAllCatalogSkills()
        .map((skill) => `- ${skill.name} (${skill.id}) - ${skill.description}`)
        .join('\n');
      await addSystem(`Available skills:\n${available}\n\nType /skills and choose one from the dropdown to apply it to your next message.`);
      return true;
    }
    if (cmd === 'allaboutme') {
      if (rest) {
        const direct = ALL_ABOUT_ME_SLASH_OPTIONS.find((option) => (
          option.id === rest || option.label.toLowerCase().includes(rest.toLowerCase())
        ));
        if (direct?.id === 'retake') {
          setSettingsOpen(true);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('jarvis:settings:tab', { detail: { tab: 'allaboutme' } }));
            window.dispatchEvent(new CustomEvent('jarvis:allaboutme:retake'));
          }, 0);
          setText('');
          return true;
        }
      }
      if (openAttachPicker('allaboutme')) return true;
      return true;
    }
    if (cmd === 'attach' && rest) {
      setAttachedFiles((cur) => (cur.includes(rest) ? cur : [...cur, rest]).slice(0, 8));
      setText('');
      return true;
    }
    if (cmd === 'clearfiles') {
      setAttachedFiles([]);
      setAttachedImages([]);
      setText('');
      toast.info('Attachments cleared', 'All files and images removed from this message.');
      return true;
    }
    if (cmd === 'undo') {
      if (jarvisRunning) {
        await addSystem(UNDO_BLOCKED_RUNNING_TEXT);
        return true;
      }
      const history = await messageRepo.listByChat(chatId as ChatId);
      const turn = selectLastUndoableTurn(history);
      if (turn.length === 0) {
        await addSystem(NOTHING_TO_UNDO_TEXT);
        return true;
      }
      // Delete oldest-first so partial failure still leaves a consistent prefix.
      for (const message of turn) {
        await messageRepo.delete(message.id);
      }
      pushRedoTurn({
        chatId: String(chatId),
        messages: turn,
        undoneAt: Date.now(),
      });
      await messageRepo.create({
        chat_id: chatId as ChatId,
        role: 'system',
        parts: [{ kind: 'text', text: `${UNDO_STATUS_TEXT} ${summarizeUndoTurn(turn)}` }],
      });
      setText('');
      return true;
    }
    if (cmd === 'redo') {
      if (jarvisRunning) {
        await addSystem(REDO_BLOCKED_RUNNING_TEXT);
        return true;
      }
      const turn = popRedoTurn(String(chatId));
      if (!turn || turn.messages.length === 0) {
        await addSystem(NOTHING_TO_REDO_TEXT);
        return true;
      }
      // Restore chronological order with original ids/timestamps.
      for (const message of turn.messages) {
        await messageRepo.create({
          id: message.id,
          chat_id: message.chat_id,
          role: message.role,
          agent_id: message.agent_id,
          parts: message.parts,
          parent_id: message.parent_id,
          usage: message.usage,
          created_at: message.created_at,
          updated_at: message.updated_at,
        });
      }
      await messageRepo.create({
        chat_id: chatId as ChatId,
        role: 'system',
        parts: [{ kind: 'text', text: REDO_STATUS_TEXT }],
      });
      setText('');
      return true;
    }
    if (cmd === 'help') {
      await addSystem(
        'Chat slash commands work at the start, middle, or end of a message. '
          + '/agents, /terminals, /hive, /kanban, /history, /tools, /schedule become confirmed reference chips. '
          + '/context, /plug, /skills, /file open pickers. /file lists files in your open project. '
          + '/attach <path>, /clearfiles (or /clearfile) clears attachments. '
          + '/undo removes the last full turn; /redo restores it. '
          + '/usage, /model, /theme, /commands, /multitask, /ask, /plan.',
      );
      return true;
    }
    if (cmd === 'commands') {
      await addSystem(`Jarvis command catalog (${JARVIS_COMMAND_CATALOG.length}):\n${JARVIS_COMMAND_CATALOG.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);
      return true;
    }
    if (cmd === 'file') {
      if (rest) {
        // Resolve by absolute path or by name within project options
        let path = rest;
        if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(rest)) {
          const listed = await listProjectFileOptions({ projectId });
          const match =
            listed.options.find((o) => o.label.toLowerCase() === rest.toLowerCase()) ||
            listed.options.find((o) => o.label.toLowerCase().includes(rest.toLowerCase()));
          if (match) path = match.id;
        }
        if (isSupportedImagePath(path)) {
          try {
            const image = await imageAttachmentFromPath(path);
            setAttachedImages((cur) => (cur.some((item) => item.sourcePath === path) ? cur : [...cur, image]).slice(0, 6));
            setText('');
            return true;
          } catch (err) {
            toast.error('Image attach failed', err instanceof Error ? err.message : 'Could not attach image.');
            return true;
          }
        }
        setAttachedFiles((cur) => (cur.includes(path) ? cur : [...cur, path]).slice(0, 8));
        setText('');
        return true;
      }
      // Open project file picker (same as selecting /file from typeahead)
      const root = getStoredProjectRoot(projectId);
      if (!root) {
        toast.info('No project open', 'Open a project folder in Files, then use /file to attach.');
        setText('');
        return true;
      }
      openAttachPicker('file');
      return true;
    }
    await addSystem(`Unknown slash command: /${cmd}. Try /help.`);
    return true;
  };

  const handleSend = async (overrideText?: string, options: { bypassQueue?: boolean } = {}) => {
    const draftText = overrideText ?? text;
    const trimmed = draftText.trim();
    const hasConfirmedCommands = confirmedCommands.length > 0;
    const hasConfirmedAgentMentions = confirmedAgentMentions.length > 0;
    if ((!trimmed && attachedFiles.length === 0 && attachedImages.length === 0 && attachedTerminals.length === 0 && attachedPlugins.length === 0 && attachedContexts.length === 0 && !hasConfirmedCommands && !hasConfirmedAgentMentions) || sending) return;
    if (jarvisRunning && !options.bypassQueue && !overrideText) {
      enqueueCurrentMessage(trimmed);
      return;
    }

    // Pull utility slash tokens from anywhere in the message (start/middle/end)
    // so "/clearfiles" or "/file readme.md" works even mid-sentence.
    const inline = extractInlineUtilitySlashCommands(trimmed);
    let handledUtilityOnly = false;
    for (const util of inline.utilities) {
      const cmd = normalizeSlashCmd(util.cmd);
      // /file with no target needs the picker UI — don't open it during send.
      if (cmd === 'file' && !util.rest) continue;
      const payload = util.rest ? `/${cmd} ${util.rest}` : `/${cmd}`;
      const handled = await handleSlashCommand(payload);
      if (handled === true) handledUtilityOnly = true;
    }
    const afterInline = inline.utilities.length > 0 ? inline.cleaned : trimmed;

    // Leading full-message slash (multitask, ask, plan, etc.)
    const slashResult = afterInline.startsWith('/')
      ? await handleSlashCommand(afterInline)
      : false;
    if (slashResult === true) return;
    // When a route slash command has a remainder (e.g. "/terminals close 5 terminals"),
    // handleSlashCommand returns the remainder text so we send it as the message.
    const rawSendText = typeof slashResult === 'string' ? slashResult.trim() : afterInline;

    // Message was only utility slash tokens (e.g. just /clearfiles) — done.
    if (
      handledUtilityOnly &&
      !rawSendText &&
      confirmedCommands.length === 0 &&
      confirmedAgentMentions.length === 0 &&
      attachedFiles.length === 0 &&
      attachedImages.length === 0 &&
      attachedTerminals.length === 0 &&
      attachedPlugins.length === 0 &&
      attachedContexts.length === 0
    ) {
      return;
    }
    const interactionModeForSend = useJarvisInteractionStore.getState().modeForChat(chatId);
    const mentionPrefix = confirmedAgentMentions.map((mention) => mention.label).join(' ');
    const referenceText = confirmedCommandReferenceText(confirmedCommands);
    const allAboutMeCommand = confirmedCommands.find((command) => command.cmd === 'allaboutme' && command.value);
    let allAboutMeText = '';
    let forceAllAboutMeUpdate = false;
    if (allAboutMeCommand?.value) {
      const optionId = allAboutMeCommand.value as AllAboutMeSlashOptionId;
      const messageCount = await messageRepo.countByChat(chatId as ChatId);
      if (optionId === 'force-update') {
        const status = allAboutMeChatUpdateStatus(messageCount);
        if (!status.ok) {
          await messageRepo.create({
            chat_id: chatId as ChatId,
            role: 'system',
            parts: [{ kind: 'text', text: status.message }],
          });
          setConfirmedCommands((cur) => cur.filter((command) => command.cmd !== 'allaboutme'));
          return;
        }
        forceAllAboutMeUpdate = true;
      }
      allAboutMeText = buildAllAboutMeSlashText(
        optionId,
        useAllAboutMeStore.getState().markdown,
        messageCount,
      );
    }
    const sendText = [mentionPrefix, referenceText, allAboutMeText, rawSendText].filter(Boolean).join(' ').trim();

    const auth = useAuthStore.getState();
    const sendCheck = validateSendModelAccess(
      sendText,
      auth.chatModelSelection,
      modelSelectionContextFromAuth(auth),
      auth.stackCustomSteps,
      { attachments: { hasImages: attachedImages.length > 0 } },
    );
    if (!sendCheck.ok) {
      toast.error('Cannot send', sendCheck.message);
      return;
    }

    // Process confirmed commands before sending
    const skillIds = confirmedCommands
      .filter((confirmed) => confirmed.cmd === 'skills' && confirmed.value)
      .map((confirmed) => confirmed.value!)
      .slice(0, 6);
    let nextAttachedFiles = [...attachedFiles];
    let nextAttachedTerminals = attachedTerminals;
    let nextAttachedPlugins = attachedPlugins;
    let nextAttachedContexts = attachedContexts;
    for (const confirmed of confirmedCommands) {
      if (confirmed.value?.startsWith('reference:')) continue;
      if (confirmed.value?.startsWith('confirmed:')) continue;
      if (confirmed.cmd === 'clearfiles') continue;
      if (confirmed.cmd === 'permissions') continue;
      if (normalizeSlashCmd(confirmed.cmd) === 'file' && confirmed.value) {
        const path = confirmed.value;
        if (!isSupportedImagePath(path)) {
          nextAttachedFiles = nextAttachedFiles.includes(path)
            ? nextAttachedFiles
            : [...nextAttachedFiles, path].slice(0, 8);
        }
        continue;
      }
      if (normalizeSlashCmd(confirmed.cmd) === 'terminals' && confirmed.value) {
        const session = useTerminalTranscriptStore.getState().sessions[confirmed.value];
        if (session) {
          const ref: TerminalRef = {
            sessionId: session.sessionId,
            paneId: session.paneId ?? undefined,
            projectId: session.projectId,
            label: session.command || session.agentSlug || 'Terminal',
            command: session.command ?? undefined,
            agentSlug: session.agentSlug,
          };
          const key = terminalRefKey(ref);
          nextAttachedTerminals = nextAttachedTerminals.some((t) => terminalRefKey(t) === key)
            ? nextAttachedTerminals
            : [...nextAttachedTerminals, ref];
        }
      } else if (confirmed.cmd === 'plug' && confirmed.value) {
        nextAttachedPlugins = nextAttachedPlugins.includes(confirmed.value!)
          ? nextAttachedPlugins
          : [...nextAttachedPlugins, confirmed.value!].slice(0, 8);
      } else if (normalizeSlashCmd(confirmed.cmd) === 'context' && confirmed.value) {
        const maps = projectId ? loadStoredContextMaps(projectId) : [];
        const matched = resolveContextMapRecord(maps, confirmed.value);
        if (matched?.tree?.nodes?.[0]) {
          const root = matched.tree.nodes[0];
          const attachment: ContextAttachment = {
            projectId: matched.projectId,
            rootDir: matched.rootDir,
            generatedAt: matched.tree?.generatedAt ?? Date.now(),
            nodeId: root.id ?? `map:${matched.name}`,
            title: matched.name ?? 'Context Map',
            summary: matched.tree?.summary ?? '',
            path: '',
            kind: 'root',
          };
          nextAttachedContexts = nextAttachedContexts.some((c) => c.nodeId === attachment.nodeId)
            ? nextAttachedContexts
            : [...nextAttachedContexts, attachment];
        }
      }
    }
    const confirmedMentionsForSend = confirmedAgentMentions;
    setConfirmedCommands([]);
    setConfirmedAgentMentions([]);

    setSending(true);
    try {
      if (nextAttachedTerminals.length > 0) {
        const scheduled = parseTerminalScheduleRequest(sendText);
        if (scheduled) {
          scheduleTerminalCommandFromChat(nextAttachedTerminals, scheduled.command, scheduled.runAt);
          await messageRepo.create({
            chat_id: chatId as ChatId,
            role: 'system',
            parts: [{ kind: 'text', text: `Scheduled terminal message for ${new Date(scheduled.runAt).toLocaleString()}: ${scheduled.command}` }],
          });
          setText('');
          setAttachedTerminals([]);
          setMentionCtx(null);
          toast.success('Terminal message scheduled', new Date(scheduled.runAt).toLocaleString());
          return;
        }
      }
      // Repo stamps id + timestamps + bumps parent chat.updated_at.
      // The runtime listener (started in App.tsx) will read history
      // from the same store after we dispatch the event below — so it
      // sees the user turn we just wrote and skips creating its own
      // user message. (See runtime.ts: prior versions wrote a second
      // copy here, producing the duplicate-bubble bug surfaced in the
      // AI-router audit.)
      // New real user turns invalidate redo history for this chat.
      clearRedoStack(String(chatId));
      await messageRepo.create({
        chat_id: chatId as ChatId,
        role: 'user',
        parts: [
          { kind: 'text', text: sendText || 'Attached context.' },
          ...attachedImages.map((image) => ({
            kind: 'image' as const,
            url: `data:${image.mimeType};base64,${image.data}`,
            alt: image.name,
          })),
          ...nextAttachedFiles.map((path) => ({ kind: 'file_ref' as const, ref: { kind: 'file' as const, id: path } })),
          ...nextAttachedTerminals.map((ref) => ({ kind: 'file_ref' as const, ref: { kind: 'memory' as const, id: `terminal:${terminalRefKey(ref)}`, excerpt: `Terminal reference: ${terminalRefLabel(ref)}` } })),
          ...nextAttachedContexts.map((context) => ({ kind: 'file_ref' as const, ref: { kind: 'memory' as const, id: `context:${context.nodeId}`, excerpt: `Context: ${context.title}` } })),
        ],
      });

      const mentionedAgentIds = resolveMentionedAgentIdsForSend(sendText, agents, confirmedMentionsForSend);
      const mentionedPluginIds = extractPluginMentions(sendText, PLUGIN_CATALOG);
      const pluginIds = Array.from(new Set([...nextAttachedPlugins, ...mentionedPluginIds])).slice(0, 8);
      const messageFilePaths = Array.from(
        new Set([...nextAttachedFiles, ...extractAbsoluteFilePaths(sendText)]),
      ).slice(0, 8);
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: {
            chatId,
            text: sendText || 'Attached context.',
            mentionedAgentIds,
            filePaths: messageFilePaths,
            imageAttachments: attachedImages,
            terminalRefs: nextAttachedTerminals,
            contextNodes: nextAttachedContexts,
            pluginIds,
            skillIds,
            forceAllAboutMeUpdate,
            interactionMode: interactionModeForSend,
            speakReply: voiceReplyRequestedRef.current || useAuthStore.getState().speakReplies,
            autoApproveActions: useAuthStore.getState().jarvisAutoApprove,
          },
        }),
      );
      voiceReplyRequestedRef.current = false;
      if (!overrideText) setText('');
      setAttachedFiles([]);
      setAttachedImages([]);
      setAttachedTerminals([]);
      setAttachedPlugins([]);
      setAttachedContexts([]);
      setMentionCtx(null);
    } catch (err) {
      // Anything thrown here (DB error, mention extraction edge case,
      // even an exception from the dispatch listener) used to bubble
      // up as an unhandled rejection because the caller is
      // `void handleSend()`. React error boundaries don't catch
      // event-handler errors, so the previous behaviour was a blank
      // window with a console message no user would ever read.
      // Surface the failure as a toast and keep the composer usable;
      // the draft text is preserved so the user can retry.
      // eslint-disable-next-line no-console
      console.error('[Composer] send failed:', err);
      toast.error(
        "Couldn't send message",
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setSending(false);
    }
  };

  const sendQueuedMessageNow = (id: string) => {
    const queued = queuedMessages.find((message) => message.id === id);
    if (!queued) return;
    setQueuedMessages((current) => current.filter((message) => message.id !== id));
    void handleSend(queued.text, { bypassQueue: true });
  };

  /** Same as typing `/multitask <message>` for a queued row (parallel agent work). */
  const startQueuedMultitask = (id: string) => {
    const queued = queuedMessages.find((message) => message.id === id);
    if (!queued) return;
    setQueuedMessages((current) => current.filter((message) => message.id !== id));
    void handleSend(buildQueuedMultitaskCommand(queued.text), { bypassQueue: true });
  };

  // Keep auto-flush bound to latest handleSend + queue (after handleSend is defined).
  flushNextQueuedRef.current = () => {
    if (sendingRef.current) return;
    const { next, remaining } = takeNextQueuedMessage(queuedMessagesRef.current);
    if (!next) return;
    setQueuedMessages(remaining);
    void handleSend(next.text, { bypassQueue: true });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mod+Enter always sends, regardless of any popover state
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
      return;
    }

    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const nextMode = cycleInteractionMode(useJarvisInteractionStore.getState().modeForChat(chatId));
      setInteractionMode(chatId, nextMode);
      // Mode chip updates in place — no toast for routine mode cycles.
      return;
    }

    // Model picker navigation
    if (modelPickerOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setModelPickerOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        modelPickerRef.current?.moveDown();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        modelPickerRef.current?.moveUp();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        modelPickerRef.current?.selectCurrent();
        return;
      }
    }

    // Option picker navigation (highest priority when showing)
    if (optionPickerCtx) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOptionPickerCtx(null);
        setSelectedOptionId('');
        return;
      }
      if (optionPickerOptions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          optionPickerRef.current?.moveDown();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          optionPickerRef.current?.moveUp();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          optionPickerRef.current?.selectCurrent();
          return;
        }
      }
    }

    // Slash command navigation (higher priority than mention)
    if (slashCtx) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashCtx(null);
        return;
      }
      if (filteredSlashCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          slashTypeaheadRef.current?.moveDown();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          slashTypeaheadRef.current?.moveUp();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          slashTypeaheadRef.current?.selectCurrent();
          return;
        }
      }
    }

    // Mention navigation
    if (mentionCtx) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionCtx(null);
        return;
      }
      if (filteredAgents.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const i = filteredAgents.findIndex((a) => a.slug === selectedSlug);
          const next = filteredAgents[(i + 1 + filteredAgents.length) % filteredAgents.length]!;
          setSelectedSlug(next.slug);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const i = filteredAgents.findIndex((a) => a.slug === selectedSlug);
          const baseI = i === -1 ? 0 : i;
          const next =
            filteredAgents[(baseI - 1 + filteredAgents.length) % filteredAgents.length]!;
          setSelectedSlug(next.slug);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const agent =
            filteredAgents.find((a) => a.slug === selectedSlug) ?? filteredAgents[0];
          if (agent) insertMention(agent);
          return;
        }
      }
    }
  };

  const canSend = (text.trim().length > 0 || attachedFiles.length > 0 || attachedImages.length > 0 || attachedTerminals.length > 0 || attachedPlugins.length > 0 || attachedContexts.length > 0 || confirmedCommands.length > 0 || confirmedAgentMentions.length > 0) && !sending;

  const addDroppedPath = useCallback(async (path: string) => {
    const clean = path.trim();
    if (!clean) return;
    if (isSupportedImagePath(clean)) {
      try {
        const image = await imageAttachmentFromPath(clean);
        setAttachedImages((cur) => (cur.some((item) => item.sourcePath === clean) ? cur : [...cur, image]).slice(0, 6));
        return;
      } catch (err) {
        toast.error('Image attach failed', err instanceof Error ? err.message : 'Could not attach image.');
        return;
      }
    }
    setAttachedFiles((cur) => (cur.includes(clean) ? cur : [...cur, clean]).slice(0, 8));
    setText((cur) => {
      const separator = cur.length === 0 || /\s$/.test(cur) ? '' : ' ';
      return `${cur}${separator}${clean}`;
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    const onAttachFile = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; chatId?: string }>).detail;
      if (detail?.chatId && String(detail.chatId) !== String(chatId)) return;
      if (detail?.path) void addDroppedPath(detail.path);
    };
    window.addEventListener('jarvis:file:attach', onAttachFile as EventListener);
    return () => window.removeEventListener('jarvis:file:attach', onAttachFile as EventListener);
  }, [addDroppedPath, chatId]);

  const addBrowserImages = useCallback(async (files: File[] | FileList) => {
    const images = splitImageFiles(files);
    if (images.length === 0) return false;
    try {
      const next = await Promise.all(images.slice(0, 6).map(imageAttachmentFromBrowserFile));
      setAttachedImages((cur) => {
        const seen = new Set(cur.map((image) => `${image.name}:${image.size ?? 0}`));
        const merged = [...cur];
        for (const image of next) {
          const key = `${image.name}:${image.size ?? 0}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(image);
        }
        return merged.slice(0, 6);
      });
      return true;
    } catch (err) {
      toast.error('Image attach failed', err instanceof Error ? err.message : 'Could not attach image.');
      return true;
    }
  }, []);

  const addDroppedTerminal = useCallback((raw: string | TerminalRef) => {
    const ref = typeof raw === 'string' ? parseTerminalRef(raw) : raw;
    if (!ref) return;
    const key = terminalRefKey(ref);
    setAttachedTerminals((cur) => (cur.some((item) => terminalRefKey(item) === key) ? cur : [...cur, ref]).slice(0, 8));
    setText((cur) => cur || `Please inspect the attached terminal: ${terminalRefLabel(ref)}`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const addDroppedContext = useCallback((raw: string | ContextAttachment) => {
    const context = typeof raw === 'string' ? parseContextAttachment(raw) : raw;
    if (!context) return;
    setAttachedContexts((cur) => (
      cur.some((item) => item.nodeId === context.nodeId)
        ? cur
        : [...cur, context].slice(0, 8)
    ));
    setText((cur) => cur || `Please use the attached Context: ${context.title}`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    const onAttachTerminal = (event: Event) => {
      const detail = (event as CustomEvent<{ raw?: string; ref?: TerminalRef; chatId?: string }>).detail;
      if (detail?.chatId && String(detail.chatId) !== String(chatId)) return;
      if (detail?.ref) addDroppedTerminal(detail.ref);
      else if (detail?.raw) addDroppedTerminal(detail.raw);
    };
    window.addEventListener('jarvis:terminal:attach', onAttachTerminal as EventListener);
    return () => window.removeEventListener('jarvis:terminal:attach', onAttachTerminal as EventListener);
  }, [addDroppedTerminal, chatId]);

  useEffect(() => {
    const onAttachContext = (event: Event) => {
      const detail = (event as CustomEvent<{ raw?: string; context?: ContextAttachment; chatId?: string }>).detail;
      if (detail?.chatId && String(detail.chatId) !== String(chatId)) return;
      if (detail?.context) addDroppedContext(detail.context);
      else if (detail?.raw) addDroppedContext(detail.raw);
    };
    window.addEventListener('jarvis:context:attach', onAttachContext as EventListener);
    return () => window.removeEventListener('jarvis:context:attach', onAttachContext as EventListener);
  }, [addDroppedContext, chatId]);

  useEffect(() => {
    const onInsertText = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; chatId?: string }>).detail;
      if (detail?.chatId && String(detail.chatId) !== String(chatId)) return;
      if (detail?.text) {
        setText((cur) => {
          const separator = cur.length === 0 || /\s$/.test(cur) ? '' : ' ';
          return cur + separator + detail.text;
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    };
    window.addEventListener('jarvis:composer:insert-text', onInsertText as EventListener);
    return () => window.removeEventListener('jarvis:composer:insert-text', onInsertText as EventListener);
  }, [chatId]);

  // ---------- V2 speech-to-text wiring ----------
  useEffect(() => {
    if (!sttListening && !sttAwaitingFinal) return;

    const offStart = VoiceService.on('voice:start', () => {
      captureComposerSttSnapshot();
    });
    const offPartial = VoiceService.on('voice:partial', ({ text: partial }) => {
      const snap = sttSnapshotRef.current;
      if (snap) {
        setText(buildSttPreviewValue(snap, partial));
      } else {
        setSttInterim(partial);
      }
    });
    const offFinal = VoiceService.on('voice:final', ({ text: finalText }) => {
      clearSttFinalizeTimer();
      setSttAwaitingFinal(false);
      setSttInterim('');
      VoiceService.setInactivityTimeoutMs(15_000);
      const snap = sttSnapshotRef.current;
      sttSnapshotRef.current = null;
      voiceReplyRequestedRef.current = true;
      if (snap) {
        const committed = buildSttCommittedValue(snap, finalText);
        if (committed) setText(committed);
      } else {
        setText((cur) => {
          const sep = cur.length === 0 || /\s$/.test(cur) ? '' : ' ';
          return cur + sep + finalText;
        });
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
    const offError = VoiceService.on('voice:error', ({ kind, message }) => {
      clearSttFinalizeTimer();
      setSttAwaitingFinal(false);
      setSttListening(false);
      setSttInterim('');
      revertComposerSttPreview();
      stopSttVolumeMeter();
      if (kind === 'unsupported') {
        toast.warning('Voice unsupported', message);
      } else if (kind === 'service_not_allowed' || kind === 'permission_denied') {
        toast.error('Microphone blocked', 'Allow mic access in your browser/OS settings.');
      } else if (kind !== 'no_speech' && kind !== 'aborted') {
        toast.error('Voice error', message);
      }
    });
    const offEnd = VoiceService.on('voice:end', () => {
      if (!VoiceService.isListening() && !VoiceService.wantsListening() && !sttAwaitingFinal) {
        setSttListening(false);
        stopSttVolumeMeter();
      }
    });
    const offTimeout = VoiceService.on('voice:timeout', ({ reason }) => {
      clearSttFinalizeTimer();
      setSttAwaitingFinal(false);
      setSttListening(false);
      setSttInterim('');
      revertComposerSttPreview();
      stopSttVolumeMeter();
      toast.info('Speech-to-text stopped', reason);
    });

    return () => {
      offStart();
      offPartial();
      offFinal();
      offError();
      offEnd();
      offTimeout();
    };
  }, [
    captureComposerSttSnapshot,
    clearSttFinalizeTimer,
    revertComposerSttPreview,
    sttAwaitingFinal,
    sttListening,
  ]);

  const startStt = () => {
    transcribeGenRef.current += 1;
    setSttTranscribing(false);
    if (getComposerSttProvider() === 'faster-whisper') {
      void startFasterWhisperStt();
      return;
    }
    void startSystemStt();
  };

  const startSystemStt = async () => {
    if (isSystemSttAvailable()) {
      try {
        if (VoiceService.isListening() || VoiceService.wantsListening()) {
          VoiceService.interruptListening();
        }
        captureComposerSttSnapshot();
        VoiceService.setInactivityTimeoutMs(null);
        setSttInterim('');
        const started = VoiceService.startListening();
        if (!started) {
          setSttListening(false);
          setSttAwaitingFinal(false);
          sttSnapshotRef.current = null;
          VoiceService.setInactivityTimeoutMs(15_000);
          await trySystemSttFallbacks();
          return;
        }
        setSttListening(true);
        setSttAwaitingFinal(false);
        void startSttVolumeMeter();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Voice could not start.';
        toast.error('Voice error', msg);
        setSttListening(false);
        setSttAwaitingFinal(false);
        setSttInterim('');
        sttSnapshotRef.current = null;
        VoiceService.setInactivityTimeoutMs(15_000);
      }
      return;
    }
    await trySystemSttFallbacks();
  };

  const trySystemSttFallbacks = async () => {
    // VibeSpace engines first: Groq Whisper is part of the shared STT pipeline.
    const groqKey = useAuthStore.getState().apiKeys.groq;
    if (groqKey && typeof navigator.mediaDevices?.getUserMedia === 'function' && getAudioContextCtor()) {
      void startGroqStt(groqKey);
      return;
    }
    // Explicit last resort for the COMPOSER only (never global dictation):
    // OS voice typing, clearly labeled as an OS fallback.
    if (isTauri) {
      const triggered = await triggerWindowsNativeDictation();
      if (triggered) {
        toast.info(
          'OS voice typing (fallback)',
          'No VibeSpace speech engine is configured, so Windows voice typing will type into the composer. Add a Groq key or a local model in Settings → Speech to Text to use VibeSpace STT.',
        );
        return;
      }
    }
    toast.warning(
      'Voice unsupported',
      'Free built-in speech recognition is not available. Add a Groq key or download a local model in Settings → Speech to Text.',
    );
  };

  const startFasterWhisperStt = async () => {
    const modelId = getFasterWhisperModel();
    const installed = isTauri ? await FasterWhisperManager.checkInstalled(modelId) : false;
    if (!installed) {
      toast.warning(
        'Local model missing',
        `Download the ${modelId} model in Settings → Speech to Text, or switch to system dictation.`,
      );
      void startSystemStt();
      return;
    }
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function' || !getAudioContextCtor()) {
      toast.warning('Microphone unavailable', 'Could not access the microphone for local dictation.');
      void startSystemStt();
      return;
    }
    try {
      setSttInterim(`Listening with faster-whisper (${modelId})...`);
      batchRecorderRef.current = await startBatchAudioRecorder(
        (rms) => { setSttVolumeLevel(rms); },
        () => { void stopBatchStt(true); },
      );
      setSttListening(true);
    } catch (err) {
      setSttListening(false);
      setSttInterim('');
      toast.error('Voice error', err instanceof Error ? err.message : 'Could not start microphone.');
      void startSystemStt();
    }
  };

  const appendTranscript = (finalText: string) => {
    if (!finalText) return;
    voiceReplyRequestedRef.current = true;
    setText((cur) => {
      const sep = cur.length === 0 || /[ 	]$/.test(cur) ? '' : ' ';
      return cur + sep + finalText;
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const stopBatchStt = async (fromInactivity = false) => {
    clearAudioSilenceTimer();
    stopSttVolumeMeter();
    const recorder = batchRecorderRef.current;
    batchRecorderRef.current = null;
    const wav = recorder?.captureWav() ?? null;
    recorder?.stop();
    setSttListening(false);
    setSttAwaitingFinal(false);
    if (!wav || wav.size === 0) {
      setSttTranscribing(false);
      setSttInterim('');
      if (!fromInactivity) {
        toast.warning('No speech captured', 'Try again and speak for at least one second.');
      } else {
        toast.info('Speech-to-text stopped', 'Stopped after 30 seconds without voice activity.');
      }
      return;
    }
    const gen = transcribeGenRef.current;
    setSttTranscribing(true);
    setSttInterim('Transcribing…');
    try {
      const transcript = await transcribeFasterWhisper(wav, getFasterWhisperModel());
      if (gen !== transcribeGenRef.current) return;
      appendTranscript(transcript);
    } catch (err) {
      if (gen !== transcribeGenRef.current) return;
      toast.error(
        'Local transcription failed',
        err instanceof Error ? err.message : 'Falling back to system dictation.',
      );
      void startSystemStt();
    } finally {
      if (gen === transcribeGenRef.current) {
        setSttTranscribing(false);
        setSttInterim('');
      }
    }
  };

  const startGroqStt = async (apiKey: string) => {
    try {
      setSttInterim('Listening with Groq Whisper...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      wavChunksRef.current = [];
      const AudioCtor = getAudioContextCtor();
      if (!AudioCtor) throw new Error('Audio recording is not available in this runtime.');
      const context = new AudioCtor();
      const source = context.createMediaStreamSource(stream);
      // Use smaller buffer for lower latency — 2048 samples at 44.1kHz ≈ 46ms
      // instead of 4096 samples at ~92ms. Shorter buffers mean faster activity
      // detection and smoother waveform updates.
      const processor = context.createScriptProcessor(2048, 1, 1);
      audioContextRef.current = context;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;
      lastAudioActivityRef.current = Date.now();
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < channel.length; i += 1) {
          const sample = channel[i] ?? 0;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / Math.max(1, channel.length));
        if (rms > STT_ACTIVITY_RMS) {
          lastAudioActivityRef.current = Date.now();
        }
        setSttVolumeLevel(Math.min(1, rms * 8));
        wavChunksRef.current.push(new Float32Array(channel));
      };
      source.connect(processor);
      processor.connect(context.destination);
      clearAudioSilenceTimer();
      audioSilenceTimerRef.current = setInterval(() => {
        if (Date.now() - lastAudioActivityRef.current >= STT_INACTIVITY_MS) {
          stopGroqSttWithoutTranscribing();
        }
      }, 1000);
      setSttListening(true);
    } catch (err) {
      clearAudioSilenceTimer();
      cleanupAudioRecorder(audioProcessorRef.current, audioSourceRef.current, audioContextRef.current, mediaStreamRef.current);
      audioProcessorRef.current = null;
      audioSourceRef.current = null;
      audioContextRef.current = null;
      mediaStreamRef.current = null;
      setSttListening(false);
      setSttInterim('');
      toast.error('Voice error', err instanceof Error ? err.message : 'Could not start microphone.');
    }
  };

  const transcribeGroq = async (blob: Blob, apiKey: string) => {
    if (blob.size === 0 || !apiKey) return;
    const gen = transcribeGenRef.current;
    setSttTranscribing(true);
    setSttInterim('Transcribing…');
    try {
      const finalText = await transcribeGroqApi(blob, apiKey);
      if (gen !== transcribeGenRef.current) return;
      appendTranscript(finalText);
    } catch (err) {
      if (gen !== transcribeGenRef.current) return;
      toast.error('Groq transcription failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (gen === transcribeGenRef.current) {
        setSttTranscribing(false);
        setSttInterim('');
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  };

  const stopStt = () => {
    transcribeGenRef.current += 1;
    if (batchRecorderRef.current) {
      void stopBatchStt(false);
      return;
    }
    setSttListening(false);
    setSttInterim('');
    clearAudioSilenceTimer();
    stopSttVolumeMeter();
    if (audioContextRef.current || audioProcessorRef.current || audioSourceRef.current) {
      const context = audioContextRef.current;
      const chunks = wavChunksRef.current;
      cleanupAudioRecorder(audioProcessorRef.current, audioSourceRef.current, context, mediaStreamRef.current);
      audioProcessorRef.current = null;
      audioSourceRef.current = null;
      audioContextRef.current = null;
      mediaStreamRef.current = null;
      wavChunksRef.current = [];
      if (chunks.length > 0 && context) {
        void transcribeGroq(encodeWav(chunks, context.sampleRate), useAuthStore.getState().apiKeys.groq ?? '');
      } else {
        setSttTranscribing(false);
        toast.warning('No speech captured', 'Try again and speak for at least one second.');
      }
      return;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setSttAwaitingFinal(true);
    clearSttFinalizeTimer();
    sttFinalizeTimerRef.current = setTimeout(() => {
      setSttAwaitingFinal(false);
      revertComposerSttPreview();
      sttSnapshotRef.current = null;
      VoiceService.setInactivityTimeoutMs(15_000);
    }, 2_500);
    try {
      VoiceService.stopListening();
    } catch {
      // ignore — engine may already be torn down
    }
  };

  const toggleStt = () => {
    if (sttListening || sttTranscribing) stopStt();
    else startStt();
  };

  // Stop listening when the chat unmounts/changes.
  useEffect(() => {
    return () => {
      transcribeGenRef.current += 1;
      clearSttFinalizeTimer();
      if (sttListening || sttAwaitingFinal) VoiceService.stopListening();
      clearAudioSilenceTimer();
      stopSttVolumeMeter();
      cleanupAudioRecorder(audioProcessorRef.current, audioSourceRef.current, audioContextRef.current, mediaStreamRef.current);
    };
  }, [clearSttFinalizeTimer, sttAwaitingFinal, sttListening]);

  // Ctrl+CapsLock is dispatched globally; focused surfaces decide whether to consume it.
  useEffect(() => {
    const onToggle = (event: Event) => {
      if (!composerSttEnabled) return;
      const textarea = resolveComposerSttTextarea();
      if (!textarea || textarea !== textareaRef.current) return;
      event.preventDefault?.();
      toggleStt();
    };
    const onStop = () => {
      if (sttListening || sttTranscribing || sttAwaitingFinal) stopStt();
    };
    window.addEventListener(COMPOSER_STT_TOGGLE_EVENT, onToggle);
    window.addEventListener(COMPOSER_STT_STOP_EVENT, onStop);
    return () => {
      window.removeEventListener(COMPOSER_STT_TOGGLE_EVENT, onToggle);
      window.removeEventListener(COMPOSER_STT_STOP_EVENT, onStop);
    };
  }, [composerSttEnabled, sttAwaitingFinal, sttListening, sttTranscribing]);

  // Only the main (non-compact) composer drives the global mic indicator — the
  // Inspector sidebar mounts a second compact composer and must not fight it.
  useEffect(() => {
    if (compact) return;
    setComposerSttListening(sttListening);
    return () => setComposerSttListening(false);
  }, [compact, setComposerSttListening, sttListening]);

  return (
    <div
      className={cn('border-t border-border bg-panel', compact && 'text-[12px]')}
      data-tour="chat-composer"
    >
      {showFreeKeyNudge && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-1 pt-2.5',
            'text-secondary text-muted-foreground',
          )}
          role="status"
          aria-label="Free Gemini API key recommended for the Jarvis agent"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent-copper shrink-0" />
          <span>
            Add a free Gemini API key to give Jarvis a real Flash Lite
            brain (no card needed).
          </span>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-accent-copper underline-offset-4 hover:underline"
          >
            Get key →
          </a>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              // Wait one task so the SettingsModal commits open=true and
              // attaches its tab-switch listener before we dispatch.
              setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent('jarvis:settings:tab', {
                    detail: { tab: 'providers' },
                  }),
                );
              }, 0);
            }}
            className="ml-auto text-accent-copper underline-offset-4 hover:underline"
          >
            Open Providers
          </button>
        </div>
      )}
      <div className={cn('px-3 py-2.5', compact && 'px-3.5 py-3')}>
        <Popover
          open={mentionCtx !== null || slashCtx !== null || optionPickerCtx !== null}
          onOpenChange={(open) => {
            if (!open) {
              setMentionCtx(null);
              setSlashCtx(null);
              setOptionPickerCtx(null);
            }
          }}
        >
          <PopoverAnchor asChild>
            <div
              data-terminal-drop="chat"
              data-terminal-drop-chat-id={String(chatId)}
              data-hive-active={chatModelSelection.mode === 'hive' ? 'true' : undefined}
              className={cn(
                'rounded-lg border border-input bg-background',
                'transition-colors focus-within:border-accent-cyan/40 focus-within:ring-1 focus-within:ring-ring',
                chatModelSelection.mode === 'hive' && 'border-accent-copper/40',
                compact && 'p-1',
              )}
            >
              <textarea
                ref={textareaRef}
                value={text}
                rows={1}
                onChange={(e) => {
                  setText(e.target.value);
                  // Recompute on next tick so selectionStart reflects the new value
                  requestAnimationFrame(() => {
                    recomputeMention();
                    recomputeSlash();
                  });
                }}
                onKeyDown={onKeyDown}
                onKeyUp={() => {
                  recomputeMention();
                  recomputeSlash();
                }}
                onClick={() => {
                  recomputeMention();
                  recomputeSlash();
                }}
                onPaste={(e) => {
                  const files = e.clipboardData?.files;
                  if (files && files.length > 0) {
                    const images = splitImageFiles(files);
                    if (images.length > 0) {
                      e.preventDefault();
                      void addBrowserImages(images);
                    }
                  }
                }}
                onDragOver={(e) => {
                  if (getChatDragKind(e.dataTransfer.types)) {
                    e.preventDefault();
                    setDragOver(true);
                  }
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  const images = splitImageFiles(e.dataTransfer.files);
                  if (images.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(false);
                    void addBrowserImages(images);
                    return;
                  }
                  const payload = getChatDropPayload(e.dataTransfer);
                  if (!payload) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  if (payload.kind === 'context') addDroppedContext(payload.raw);
                  else if (payload.kind === 'terminal') addDroppedTerminal(payload.raw);
                  else void addDroppedPath(payload.path);
                }}
                placeholder={placeholder ?? 'Message Jarvis...   (use @ to mention an agent)'}
                aria-label="Message"
                style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
                className={cn(
                  'block w-full resize-none bg-transparent px-3 py-2 text-body text-foreground',
                  'placeholder:text-muted-foreground outline-none',
                  'scrollbar-hidden',
                  compact && 'py-2.5 text-secondary',
                  dragOver && 'bg-accent-copper/10 ring-1 ring-accent-copper/50',
                )}
              />
              {confirmedAgentMentions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  <TokenList>
                    {confirmedAgentMentions.map((mention) => (
                      <InputToken
                        key={mention.id}
                        type="agent"
                        label={mention.label}
                        onRemove={() =>
                          setConfirmedAgentMentions((cur) =>
                            cur.filter((item) => item.id !== mention.id),
                          )
                        }
                      />
                    ))}
                  </TokenList>
                </div>
              )}
              {/* Confirmed command tokens */}
              {confirmedCommands.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  <TokenList>
                    {confirmedCommands.map((cmd) => (
                      <InputToken
                        key={cmd.value ? `${cmd.cmd}:${cmd.value}` : cmd.cmd}
                        type="command"
                        label={cmd.label}
                        icon={cmd.cmd === 'hive' ? <HiveModelIcon size={18} /> : undefined}
                        onRemove={() => removeConfirmedCommand(cmd.cmd, cmd.value)}
                      />
                    ))}
                  </TokenList>
                </div>
              )}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {attachedFiles.map((path) => (
                    <InputToken
                      key={path}
                      type="file"
                      label={path.split(/[/\\]/).pop() ?? path}
                      sublabel={path.includes('/') || path.includes('\\') ? '...' : undefined}
                      onRemove={() => setAttachedFiles((cur) => cur.filter((p) => p !== path))}
                    />
                  ))}
                </div>
              )}
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {attachedImages.map((image) => (
                    <InputToken
                      key={image.id}
                      type="image"
                      label={image.name}
                      sublabel={image.size ? `${Math.ceil(image.size / 1024)} KB` : image.mimeType}
                      onRemove={() => setAttachedImages((cur) => cur.filter((item) => item.id !== image.id))}
                    />
                  ))}
                </div>
              )}
              {attachedTerminals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {attachedTerminals.map((ref) => (
                    <InputToken
                      key={terminalRefKey(ref)}
                      type="terminal"
                      label={terminalRefLabel(ref)}
                      onRemove={() => setAttachedTerminals((cur) => cur.filter((p) => terminalRefKey(p) !== terminalRefKey(ref)))}
                    />
                  ))}
                </div>
              )}
              {attachedPlugins.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {attachedPlugins.map((pluginId) => {
                    const plugin = PLUGIN_CATALOG.find((entry) => entry.id === pluginId);
                    return (
                      <InputToken
                        key={pluginId}
                        type="plugin"
                        label={plugin?.name ?? pluginId}
                        icon={plugin ? <PluginLogo plugin={plugin} size="sm" className="!h-5 !w-5" /> : undefined}
                        onRemove={() => setAttachedPlugins((cur) => cur.filter((id) => id !== pluginId))}
                      />
                    );
                  })}
                </div>
              )}
              {attachedContexts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {attachedContexts.map((context) => (
                    <InputToken
                      key={context.nodeId}
                      type="contextmap"
                      label={context.title}
                      onRemove={() => setAttachedContexts((cur) => cur.filter((item) => item.nodeId !== context.nodeId))}
                    />
                  ))}
                </div>
              )}
      <QueuedMessagesBar
        messages={queuedMessages}
        onEdit={editQueuedMessage}
        onSendNow={sendQueuedMessageNow}
        onStartMultitask={startQueuedMultitask}
        onDelete={deleteQueuedMessage}
      />
              <div
                className={cn(
                  'flex items-center gap-1 px-2 pb-2 pt-0.5',
                  compact && 'flex-wrap gap-x-1.5 gap-y-1.5 px-2.5 pb-2.5 pt-1',
                )}
              >
                <ModelPicker
                  selection={chatModelSelection}
                  modelCtx={modelCtx}
                  open={modelPickerOpen}
                  onOpenChange={setModelPickerOpen}
                  pickerRef={modelPickerRef}
                  compact={compact}
                  onSelect={(next) => {
                    setChatModelSelection(next);
                    if (next.mode === 'single' && (next.providerId === 'ollama' || next.providerId === 'local')) {
                      selectLocalModelForChat(next.modelId);
                    }
                  }}
                />
                <ModeIndicator
                  mode={interactionMode}
                  compact={compact}
                  onSelectMode={(nextMode) => {
                    setInteractionMode(chatId, nextMode);
                  }}
                  onCycle={() => {
                    const nextMode = cycleInteractionMode(useJarvisInteractionStore.getState().modeForChat(chatId));
                    setInteractionMode(chatId, nextMode);
                  }}
                />
                {composerSttEnabled && (
                  <Hint
                    label={sttListening ? 'Stop dictation' : 'Voice to text'}
                    hotkey={HOTKEYS.COMPOSER_STT}
                  >
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={sttListening ? 'accent' : 'ghost'}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={toggleStt}
                      aria-label={sttListening ? 'Stop dictation' : 'Start dictation'}
                      aria-pressed={sttListening}
                      className={cn(sttListening && 'animate-pulse')}
                    >
                      {sttListening ? <MicWaveform volumeRef={volumeRef} /> : <Mic />}
                    </Button>
                  </Hint>
                )}
                <span
                  className={cn(
                    'text-metadata text-muted-foreground ml-auto mr-1 hidden sm:inline',
                    compact && 'mr-0',
                  )}
                >
                  {sttTranscribing ? (
                    <p className="text-[11px] text-muted-foreground px-1" aria-live="polite">
                      Transcribing…
                    </p>
                  ) : null}
                  {sttListening && sttInterim && !sttTranscribing ? (
                    <span className="italic text-foreground/70" aria-live="polite">
                      {sttInterim}
                    </span>
                  ) : (
                    compact ? null : (
                      <>
                        <span className="kbd">{renderHotkey(HOTKEYS.SEND)}</span> to send
                      </>
                    )
                  )}
                </span>
                <Hint label="Send" hotkey={HOTKEYS.SEND}>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={canSend ? 'accent' : 'ghost'}
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    <Send />
                  </Button>
                </Hint>
              </div>
            </div>
          </PopoverAnchor>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-auto p-0 max-h-[280px] overflow-hidden bg-transparent border-none shadow-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Keep the popover open while the user is interacting with the textarea
              if (textareaRef.current && textareaRef.current.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
          >
            {optionPickerCtx !== null ? (
              <SlashCommandOptionPicker
                ref={optionPickerRef}
                commandLabel={optionPickerCtx.cmd.cmd}
                commandIcon={optionPickerCtx.cmd.icon}
                options={optionPickerOptions}
                selectedId={selectedOptionId}
                query={optionPickerCtx.query}
                loading={normalizeSlashCmd(optionPickerCtx.cmd.cmd) === 'file' ? projectFilesLoading : false}
                error={normalizeSlashCmd(optionPickerCtx.cmd.cmd) === 'file' ? projectFilesError : undefined}
                onHoverId={setSelectedOptionId}
                onSelect={selectOption}
              />
            ) : slashCtx !== null ? (
              <SlashCommandTypeahead
                ref={slashTypeaheadRef}
                commands={filteredSlashCommands}
                selectedCmd={selectedSlashCmd}
                query={slashCtx.query}
                onHoverCmd={setSelectedSlashCmd}
                onSelect={insertSlashCommand}
              />
            ) : (
              <MentionTypeahead
                agents={filteredAgents}
                selectedSlug={selectedSlug}
                query={mentionCtx?.query ?? ''}
                onHoverSlug={setSelectedSlug}
                onSelect={insertMention}
              />
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

interface ModelPickerProps {
  selection: ChatModelSelection;
  modelCtx: ModelSelectionContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: ChatModelSelection) => void;
  pickerRef: React.RefObject<ModelPickerTypeaheadRef | null>;
  compact?: boolean;
}

function ModelPicker({
  selection,
  modelCtx,
  open,
  onOpenChange,
  onSelect,
  pickerRef,
  compact = false,
}: ModelPickerProps) {
  const { groups, flatOptions } = useAccessibleChatModels();
  const [selectedId, setSelectedId] = useState('');
  const displayLabel = formatChatModelSelectionLabel(selection, modelCtx);
  const activeProvider = selection.mode === 'single' ? selection.providerId : undefined;
  const activeModel = selection.mode === 'single' ? selection.modelId : undefined;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void import('@/lib/ai/ollamaBootstrap').then(({ bootstrapOllamaConnection }) =>
      bootstrapOllamaConnection({ force: true }).then((result) => {
        if (cancelled || !result.ready) return;
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [open]);

  const flatOptionIds = useMemo(() => flatOptions.map((option) => option.id).join('\0'), [flatOptions]);
  const selectionHighlightId = useMemo(() => {
    if (selection.mode === 'hive') return HIVE_OPTION_ID;
    return selectionOptionId(selection) ?? HIVE_OPTION_ID;
  }, [selection]);

  useEffect(() => {
    if (!open) return;
    if (selection.mode === 'hive') {
      setSelectedId((current) => (current === HIVE_OPTION_ID ? current : HIVE_OPTION_ID));
      return;
    }
    const activeId = selectionOptionId(selection);
    if (activeId && flatOptions.some((option) => option.id === activeId)) {
      setSelectedId((current) => (current === activeId ? current : activeId));
      return;
    }
    setSelectedId((current) => (current === HIVE_OPTION_ID ? current : HIVE_OPTION_ID));
  }, [open, flatOptionIds, flatOptions, selectionHighlightId, selection]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        pickerRef.current?.moveDown();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        pickerRef.current?.moveUp();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        pickerRef.current?.selectCurrent();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange, pickerRef]);

  const handleSelect = (nextProvider: ProviderId, nextModel: string) => {
    onSelect(selectionFromOption(nextProvider, nextModel));
    onOpenChange(false);
  };

  const handleSelectHive = () => {
    onSelect(selectionFromHive('balanced'));
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            'gap-1 px-2 text-muted-foreground hover:text-foreground',
            compact && 'max-w-[11rem] shrink-0',
          )}
          aria-label="Choose model"
        >
          {selection.mode === 'hive' ? <HiveModelIcon size={21} /> : null}
          <span className={cn('text-metadata', compact && 'truncate')}>{displayLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-auto border-0 bg-transparent p-0 shadow-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ModelPickerTypeahead
          ref={pickerRef as React.Ref<ModelPickerTypeaheadRef>}
          groups={groups}
          selectedId={selectedId}
          activeProvider={activeProvider}
          activeModel={activeModel}
          hiveActive={selection.mode === 'hive'}
          onHoverId={setSelectedId}
          onSelect={handleSelect}
          onSelectHive={handleSelectHive}
        />
      </PopoverContent>
    </Popover>
  );
}

