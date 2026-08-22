import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Composer selected speech engine contract', () => {
  it('routes only to the saved engine and has no silent system, Groq, or OS-dictation fallback', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/features/chat/Composer.tsx'), 'utf8');

    expect(source).toContain("if (provider === 'faster-whisper') {");
    expect(source).toContain("if (provider === 'deepgram') {");
    expect(source).toContain('void startSystemStt();');
    expect(source).not.toContain('trySystemSttFallbacks');
    expect(source).not.toContain('triggerWindowsNativeDictation');
    expect(source).not.toContain('startGroqStt');
    expect(source).not.toContain('transcribeGroq');
  });
});
