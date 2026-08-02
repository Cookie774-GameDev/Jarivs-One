import { formatJarvisVerifiedNarration } from '@/lib/jarvis/response/templates';

export function formatComposerSendFailure(): string {
  return formatJarvisVerifiedNarration({
    kind: 'failure',
    actionLabel: 'Chat message send',
    reason:
      'The message could not be sent. Your draft was preserved; review the connection, then try again',
  }).text;
}
