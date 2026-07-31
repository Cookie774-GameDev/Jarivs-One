import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'VoiceModal.tsx'), 'utf8');

describe('VoiceModal MonoChrome appearance', () => {
  it('neutralizes the nested ambient orb without changing ordinary voice presentation', () => {
    expect(source).toContain(
      '[[data-theme=monochrome]_&]:[&_.jarvis-voice-orb-button_*]:![background-image:none]',
    );
    expect(source).toContain(
      '[[data-theme=monochrome]_&]:[&_.jarvis-voice-orb-button_*]:![filter:none]',
    );
    expect(source).toContain(
      '[[data-theme=monochrome]_&]:[&_.jarvis-voice-orb-button_*]:!shadow-none',
    );
    expect(source).toContain(
      '[[data-theme=monochrome]_&]:[&_.jarvis-voice-orb-button_*]:![transform:none]',
    );
  });

  it('uses opaque MonoChrome disclosure borders and hover paint', () => {
    expect(source).toContain(
      '[html[data-theme=monochrome]_&]:border-border [html[data-theme=monochrome]_&]:hover:bg-muted',
    );
  });
});
