import { formatJarvisVerifiedNarration } from '@/lib/jarvis/response/templates';

export type ComposerVoiceFailureKind =
  | 'system_startup'
  | 'local_capture'
  | 'local_transcription'
  | 'groq_capture'
  | 'groq_transcription';

const COMPOSER_VOICE_FAILURE_DETAILS: Readonly<
  Record<ComposerVoiceFailureKind, Readonly<{ actionLabel: string; reason: string }>>
> = Object.freeze({
  system_startup: Object.freeze({
    actionLabel: 'System speech recognition startup',
    reason:
      'The system speech-recognition path could not start. Check microphone access, then try again',
  }),
  local_capture: Object.freeze({
    actionLabel: 'Local dictation microphone',
    reason:
      'The local dictation recorder could not access a working microphone. Falling back to system dictation',
  }),
  local_transcription: Object.freeze({
    actionLabel: 'Local speech transcription',
    reason:
      'The local model could not transcribe the captured audio. Falling back to system dictation',
  }),
  groq_capture: Object.freeze({
    actionLabel: 'Groq dictation microphone',
    reason:
      'The Groq dictation recorder could not access a working microphone. Check microphone permission and the selected input device',
  }),
  groq_transcription: Object.freeze({
    actionLabel: 'Groq speech transcription',
    reason:
      'Groq could not transcribe the captured audio. Check the connection and provider configuration, then try again',
  }),
});

export function formatComposerVoiceFailure(kind: ComposerVoiceFailureKind): string {
  const details = COMPOSER_VOICE_FAILURE_DETAILS[kind];
  return formatJarvisVerifiedNarration({
    kind: 'failure',
    actionLabel: details.actionLabel,
    reason: details.reason,
  }).text;
}
