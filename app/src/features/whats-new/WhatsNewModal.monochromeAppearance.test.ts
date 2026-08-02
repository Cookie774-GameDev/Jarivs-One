import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'WhatsNewModal.tsx'), 'utf8');

describe("What's New MonoChrome appearance", () => {
  it('retains ordinary release elevation while removing decorative MonoChrome effects', () => {
    expect(source).toContain(
      'shadow-soft transition-colors [html[data-theme=monochrome]_&]:shadow-none',
    );
    expect(source.match(/\[html\[data-theme=monochrome\]_&\]:ring-0/g)).toHaveLength(3);
  });

  it('uses solid MonoChrome release surfaces and readable summary copy', () => {
    expect(source).toContain('[html[data-theme=monochrome]_&]:bg-panel');
    expect(source).toContain('text-foreground/85 [html[data-theme=monochrome]_&]:text-foreground');
    expect(source).toContain('text-foreground/90 [html[data-theme=monochrome]_&]:text-foreground');
  });
});
