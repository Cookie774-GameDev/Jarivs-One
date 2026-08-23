import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/warm-theme.css'), 'utf8');

describe('Warm Settings surface hierarchy', () => {
  it('keeps semantic layout groups transparent while retaining explicit card surfaces', () => {
    const semanticGroups = css.match(
      /html\[data-theme='warm'\] \.mc7f-settings-modal \[role='tabpanel'\] section,\s*html\[data-theme='warm'\] \.mc7f-settings-modal \[role='tabpanel'\] article \{([^}]+)\}/u,
    )?.[1];
    expect(semanticGroups).toContain('background: transparent');
    expect(semanticGroups).toContain('box-shadow: none');

    const explicitCards = css.match(
      /\[data-sakura-surface='settings-content'\]\s*\[class\*='rounded-'\]\[class\*='border-border'\] \{([^}]+)\}/u,
    )?.[1];
    expect(explicitCards).toContain('background-color: rgb(242 225 205 / 0.48)');
    expect(explicitCards).toContain('box-shadow:');
  });
});
