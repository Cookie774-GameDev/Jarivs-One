import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'Composer.tsx'), 'utf8');

describe('Composer smoke controls', () => {
  it('exposes the genuine composer, submit, and model-picker controls only through constants', () => {
    expect(source).toContain('SIK_CONTROL.chatComposer');
    expect(source).toContain('SIK_CONTROL.chatSubmit');
    expect(source).toContain('SIK_CONTROL.modelPicker');
    expect(source).not.toContain('data-sik-evidence="chat.composer"');
    expect(source).not.toContain('data-sik-evidence="chat.submit"');
  });
});
