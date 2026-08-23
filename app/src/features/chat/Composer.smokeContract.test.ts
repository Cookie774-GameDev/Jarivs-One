import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(process.cwd(), 'src', 'features', 'chat', 'Composer.tsx'),
  'utf8',
);

describe('Composer smoke controls', () => {
  it('exposes the genuine composer, submit, model-picker, and Hive controls only through constants', () => {
    expect(source).toContain('SIK_CONTROL.chatComposer');
    expect(source).toContain('SIK_CONTROL.chatSubmit');
    expect(source).toContain('SIK_CONTROL.modelPicker');
    expect(source).toContain('SIK_CONTROL.hiveFixture');
    expect(source).toContain('SIK_CONTROL.hiveDispatch');
    expect(source).toContain('handleSend(KERNEL_SMOKE_HIVE_TEXT)');
    expect(source).not.toContain('data-sik-evidence="chat.composer"');
    expect(source).not.toContain('data-sik-evidence="chat.submit"');
    expect(source).not.toContain('data-sik-evidence="hive.fixture"');
    expect(source).not.toContain('data-sik-evidence="hive.dispatch"');
  });

  it('keeps bare /canvas on the registered local attachment-picker path', () => {
    const bareCanvasGuard = "if (cmd === 'canvas' && !rest) return openAttachPicker('canvas');";
    const remainderRoute = "canvas: 'canvas',";
    expect(source).toContain(bareCanvasGuard);
    expect(source).toContain(remainderRoute);
    expect(source.indexOf(bareCanvasGuard)).toBeLessThan(source.indexOf(remainderRoute));
  });

  it('renders the main model picker above app-level overlays', () => {
    expect(source).toContain(
      'className="z-[120] w-auto border-0 bg-transparent p-0 shadow-none"',
    );
    expect(source).not.toContain(
      "className={cn('w-auto border-0 bg-transparent p-0 shadow-none', compact && 'z-[120]')}",
    );
  });
});
