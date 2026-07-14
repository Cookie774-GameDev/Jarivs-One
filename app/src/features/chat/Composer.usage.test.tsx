import { describe, expect, it } from 'vitest';
import { parseUsageSlashCommand } from '@/lib/usage/usageService';

describe('Composer usage interception contract', () => {
  it.each(['/usage', '/usage refresh', '/usage session', '/usage all'])(
    '%s is recognized as a local usage command',
    (command) => expect(parseUsageSlashCommand(command)).toBeDefined(),
  );

  it('does not absorb ordinary model prompts', () => {
    expect(parseUsageSlashCommand('explain /usage in prose')).toBeUndefined();
  });
});
