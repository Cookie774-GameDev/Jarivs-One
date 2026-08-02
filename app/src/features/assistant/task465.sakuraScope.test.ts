import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const featureRoot = resolve(__dirname, '..');

const surfaces = [
  {
    owner: 'onboarding',
    css: 'onboarding/onboarding.sakura.css',
    source: 'onboarding/Onboarding.tsx',
  },
  {
    owner: 'product-tutorial',
    css: 'product-tutorial/product-tutorial.sakura.css',
    source: 'product-tutorial/ProductTutorialHost.tsx',
  },
  {
    owner: 'voice',
    css: 'voice/voice.sakura.css',
    source: 'voice/VoiceModal.tsx',
  },
  {
    owner: 'updates',
    css: 'updates/updates.sakura.css',
    source: 'updates/UpdateWarningHost.tsx',
  },
  {
    owner: 'whats-new',
    css: 'whats-new/whats-new.sakura.css',
    source: 'whats-new/WhatsNewModal.tsx',
  },
  {
    owner: 'command-palette',
    css: 'command-palette/command-palette.sakura.css',
    source: 'command-palette/CommandPalette.tsx',
  },
  {
    owner: 'launcher',
    css: 'launcher/launcher.sakura.css',
    source: 'launcher/LauncherDialog.tsx',
  },
  {
    owner: 'assistant',
    css: 'assistant/assistant.sakura.css',
    source: 'assistant/AssistantBar.tsx',
  },
] as const;

function optionalSource(relativePath: string) {
  const path = resolve(featureRoot, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('Task465 Sakura overlay ownership', () => {
  it.each(surfaces)(
    'gates $owner paint behind app-owned Sakura chrome',
    ({ owner, css, source }) => {
      const stylesheet = optionalSource(css);
      const component = optionalSource(source);
      const scope = `html[data-theme='sakura'] [data-vibespace-owned-chrome='${owner}']`;

      expect(component).toContain(`data-vibespace-owned-chrome="${owner}"`);
      expect(stylesheet).toContain(scope);
      expect(stylesheet).toContain('var(--sakura-panel-fallback)');
      expect(stylesheet).toContain('@media (forced-colors: active)');
      expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
      expect(stylesheet).not.toContain('!important');
      expect(stylesheet).not.toMatch(/url\s*\(/i);
      expect(stylesheet).not.toMatch(/html:not|body\s|:root/);
    },
  );

  it('exposes non-color state hooks for onboarding, tutorial, voice, and updates', () => {
    expect(optionalSource('onboarding/onboarding.sakura.css')).toContain("[aria-selected='true']");
    expect(optionalSource('product-tutorial/product-tutorial.sakura.css')).toContain(
      "[data-product-tutorial='offer']",
    );
    expect(optionalSource('product-tutorial/product-tutorial.sakura.css')).toContain(
      "[data-product-tutorial='tour']",
    );
    expect(optionalSource('voice/voice.sakura.css')).toContain(
      "[data-voice-appearance-state='listening']",
    );
    expect(optionalSource('voice/voice.sakura.css')).toContain(
      "[data-voice-appearance-state='error']",
    );
    expect(optionalSource('updates/updates.sakura.css')).toContain(
      "[data-update-appearance-state='countdown']",
    );
    expect(optionalSource('updates/updates.sakura.css')).toContain(
      "[data-update-appearance-state='updating']",
    );
  });

  it('keeps focus and reflow policy local to the owned overlays', () => {
    for (const { css } of surfaces) {
      const stylesheet = optionalSource(css);
      expect(stylesheet).toContain(':focus-visible');
      expect(stylesheet).toMatch(/@media\s+\(max-width:/);
    }
  });
});
