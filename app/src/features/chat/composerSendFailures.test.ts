import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatComposerSendFailure } from './composerSendFailures';

describe('Composer send failure narration', () => {
  it('provides a precise retry path without accepting thrown implementation details', () => {
    const message = formatComposerSendFailure();

    expect(message).toBe(
      'The action failed, sir. Action: Chat message send. ' +
        'Cause: The message could not be sent. Your draft was preserved; ' +
        'review the connection, then try again.',
    );
    expect(message).not.toContain('synthetic database implementation detail');
  });

  it('keeps raw diagnostics in the console while closing the user-visible toast boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/features/chat/Composer.tsx'), 'utf8');
    const start = source.indexOf("console.error('[Composer] send failed:', err);");
    const end = source.indexOf('} finally {', start);
    const failureBlock = source.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(failureBlock).toContain("console.error('[Composer] send failed:', err);");
    expect(failureBlock).toContain("toast.error('Message not sent', formatComposerSendFailure());");
    expect(failureBlock.match(/\btoast\.(?:error|warning|info|success)\(/gu)).toEqual([
      'toast.error(',
    ]);
    expect(failureBlock).not.toContain("Couldn't send message");
    expect(failureBlock).not.toMatch(
      /(?:String|JSON\.stringify)\s*\(\s*err\s*\)|\$\{\s*err\s*\}|err\s*\.\s*(?:message|toString)\b/gu,
    );
    expect(source.slice(end, end + 80)).toContain('setSending(false);');
  });
});
