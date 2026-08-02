import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'preview.css'), 'utf8');
const normalizedCss = css.replace(/\r\n/g, '\n');

describe('Preview route MonoChrome appearance', () => {
  it('retains ordinary studio atmosphere while replacing MonoChrome painted backgrounds', () => {
    expect(css).toContain(
      'linear-gradient(90deg, hsl(var(--paper-soft) / 0.98), hsl(var(--paper) / 0.96))',
    );
    expect(normalizedCss).toContain(
      "html[data-theme='monochrome'] .preview-toolbar {\n  background: hsl(var(--panel));",
    );
    expect(normalizedCss).toContain(
      "html[data-theme='monochrome'] .preview-stage-wrap {\n  background: hsl(var(--background));",
    );
  });

  it('removes the MonoChrome grid mask and large local elevation', () => {
    expect(normalizedCss).toContain(
      "html[data-theme='monochrome'] .preview-stage-wrap::before {\n  background-image: none;\n  -webkit-mask-image: none;\n  mask-image: none;",
    );
    expect(normalizedCss).toContain(
      "html[data-theme='monochrome'] .preview-device-frame,\nhtml[data-theme='monochrome'] .preview-error-card,\nhtml[data-theme='monochrome'] .preview-empty-card {\n  box-shadow: none;",
    );
  });
});
