const GREETING_RE = /^\s*(?:hi|hey|hello|howdy|yo|good (?:morning|afternoon|evening))[!.?\s]*$/i;
const DAY_RE = /^\s*(?:how(?:'s| is) (?:your )?day(?: going)?|how are you(?: doing)?)[!.?\s]*$/i;
const CAPABILITIES_RE = /^\s*(?:what can you do|how can you help|what do you do)[!.?\s]*$/i;
const TERMINAL_EXPLANATION_RE =
  /^\s*(?:explain\s+)?what(?:'s| is) (?:a )?terminal(?: in one sentence)?[!.?\s]*$/i;
const JOKE_RE = /^\s*(?:tell me |say )?(?:a )?(?:quick )?(?:developer )?joke[!.?\s]*$/i;

const REFUSAL_RE =
  /\b(?:i (?:can(?:not|'t)|won't)|unable to (?:help|assist)|cannot comply|policy|not able to assist)\b/i;
const RESTRICTED_TOPIC_RE =
  /\b(?:explicit|sexual|nude|weapon|bomb|malware|credential|password|token|self[- ]?harm|illegal|dangerous|violent)\b/i;

export { processJarvisResponse } from './response';
export type {
  JarvisRepairPort,
  JarvisRepairRequest,
  JarvisVerifiedFacts,
  RawProviderResponse,
} from './response';

export function localConversationReply(
  userText: string,
  options: { emojisEnabled?: boolean } = {},
): string | null {
  const emoji = options.emojisEnabled === false ? '' : ' 👋';
  if (GREETING_RE.test(userText)) return `Hey!${emoji} What are we building today?`;
  if (DAY_RE.test(userText)) {
    return options.emojisEnabled === false
      ? 'Going great — ready to help with VibeSpace.'
      : 'Going great — ready to help with VibeSpace. 😄';
  }
  if (CAPABILITIES_RE.test(userText)) {
    return 'I can run VibeSpace actions, manage terminals and agents, work with files, research, code, and automate workflows.';
  }
  if (TERMINAL_EXPLANATION_RE.test(userText)) {
    return 'A terminal is a text interface for running commands and interacting directly with your computer or development tools.';
  }
  if (JOKE_RE.test(userText))
    return 'Why did the developer go broke? They used up all their cache. 😄';
  return null;
}

export function shouldRetryBenignRefusal(userText: string, providerText: string): boolean {
  if (!localConversationReply(userText, { emojisEnabled: false })) return false;
  if (!REFUSAL_RE.test(providerText)) return false;
  if (!RESTRICTED_TOPIC_RE.test(providerText)) return false;
  return !RESTRICTED_TOPIC_RE.test(userText);
}

export function benignRetrySystemPrompt(): string {
  return [
    'You are Jarvis inside VibeSpace.',
    'The current user message is benign casual conversation.',
    'Answer warmly and directly in one short sentence. Do not mention safety policy.',
  ].join('\n');
}
