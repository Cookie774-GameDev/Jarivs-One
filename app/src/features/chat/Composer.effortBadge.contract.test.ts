import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(process.cwd(), 'src', 'features', 'chat', 'Composer.tsx'),
  'utf8',
);

describe('Composer selected-effort badge contract', () => {
  it('anchors a non-default effort to the model trigger without showing Auto', () => {
    expect(source).toContain("initialEffort !== 'auto'");
    expect(source).toContain('data-composer-effort={initialEffort}');
    expect(source).toContain("initialEffort === 'ultra' && 'vibespace-composer-effort-ultra'");
  });
});
