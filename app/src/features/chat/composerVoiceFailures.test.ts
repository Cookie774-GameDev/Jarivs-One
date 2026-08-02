import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatComposerVoiceFailure } from './composerVoiceFailures';

describe('Composer voice failure narration', () => {
  it.each([
    {
      kind: 'system_startup' as const,
      expected:
        'The action failed, sir. Action: System speech recognition startup. Cause: The system speech-recognition path could not start. Check microphone access, then try again.',
    },
    {
      kind: 'local_capture' as const,
      expected:
        'The action failed, sir. Action: Local dictation microphone. Cause: The local dictation recorder could not access a working microphone. Falling back to system dictation.',
    },
    {
      kind: 'local_transcription' as const,
      expected:
        'The action failed, sir. Action: Local speech transcription. Cause: The local model could not transcribe the captured audio. Falling back to system dictation.',
    },
    {
      kind: 'groq_capture' as const,
      expected:
        'The action failed, sir. Action: Groq dictation microphone. Cause: The Groq dictation recorder could not access a working microphone. Check microphone permission and the selected input device.',
    },
    {
      kind: 'groq_transcription' as const,
      expected:
        'The action failed, sir. Action: Groq speech transcription. Cause: Groq could not transcribe the captured audio. Check the connection and provider configuration, then try again.',
    },
  ])('formats $kind with exact actionable shared narration', ({ kind, expected }) => {
    expect(formatComposerVoiceFailure(kind)).toBe(expected);
  });

  it('wires every Composer STT exception boundary without forwarding raw errors', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src', 'features', 'chat', 'Composer.tsx'),
      'utf8',
    );
    const start = source.indexOf('// ---------- V2 speech-to-text wiring ----------');
    const end = source.indexOf('const stopStt = () =>', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const sttSource = source.slice(start, end);

    expect(sttSource).not.toMatch(/err instanceof Error\s*\?\s*err\.message/u);
    expect(sttSource).not.toMatch(/catch\s*\([^)]*\)/u);
    expect(sttSource).not.toMatch(/\b(?:err|error)\.message\b/u);
    expect(sttSource).not.toMatch(/\bString\(\s*(?:err|error)\s*\)/u);
    expect(sttSource).toContain("toast.error('Microphone blocked', message)");
    expect(sttSource).toContain("formatComposerVoiceFailure('system_startup')");
    expect(sttSource.match(/formatComposerVoiceFailure\('local_capture'\)/gu)).toHaveLength(2);
    expect(sttSource).toContain("formatComposerVoiceFailure('local_transcription')");
    expect(sttSource).toContain("formatComposerVoiceFailure('groq_capture')");
    expect(sttSource).toContain("formatComposerVoiceFailure('groq_transcription')");
  });
});
