import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/chat/Composer.tsx'), 'utf8');

describe('Composer Prompt Forge integration', () => {
  it('uses the same typed-or-dictated draft and existing attachment state without auto-sending', () => {
    expect(source).toContain('draft: text');
    expect(source).toContain('contextAttachments: attachedContexts');
    expect(source).toContain('files: attachedFiles');
    expect(source).toContain('terminals: attachedTerminals');
    expect(source).toContain('PromptForgeControl');
    expect(source).toContain('PromptForgeReview');
    expect(source).not.toMatch(/onStart=\{[^}]*handleSend/u);
    expect(source).not.toMatch(/onReplace=\{[^}]*handleSend/u);
  });

  it('places the secondary Forge control between model/mode selection and dictation/Send', () => {
    const mode = source.indexOf('<ModeIndicator');
    const forge = source.indexOf('<PromptForgeControl');
    const dictation = source.indexOf('{composerSttEnabled && (', forge);
    const send = source.indexOf('<Hint label="Send"', forge);
    expect(mode).toBeGreaterThan(0);
    expect(forge).toBeGreaterThan(mode);
    expect(dictation).toBeGreaterThan(forge);
    expect(send).toBeGreaterThan(dictation);
  });

  it('scopes the documented shortcut to the focused Composer textarea', () => {
    expect(source).toContain('document.activeElement !== textareaRef.current');
    expect(source).toContain('matchesHotkey(event, HOTKEYS.PROMPT_FORGE)');
    expect(source).toContain('event.preventDefault()');
  });

  it('wires recovered-job model and changed-context gates into the recovery surface', () => {
    expect(source).toContain('resumeDisabledReason={promptForge.recoveryDisabledReason}');
    expect(source).toContain(
      'needsContextConfirmation={promptForge.recoveryNeedsContextConfirmation}',
    );
    expect(source).toContain('onConfirmContextChange={promptForge.confirmRecoveryContextChange}');
  });
});
