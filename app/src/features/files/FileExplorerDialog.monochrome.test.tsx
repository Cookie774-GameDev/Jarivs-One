import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FileExplorerHost } from './FileExplorerDialog';

/**
 * MonoChrome visual-effect + contrast closure for the file explorer dialog
 * (overlay:file-explorer-host / data-monochrome-surface="file-explorer-dialog").
 *
 * MC-017/MC-020/MC-027: under html[data-theme=monochrome] the dialog chrome must
 * stay flat (no copper glow shadow, no translucent panels, no blurred sticky
 * headers) while other themes keep their presentation. runtimeEffectsEnabled=false
 * renders the contained "Choose folder" chrome deterministically without
 * filesystem or store side effects. The Radix dialog portals to document.body, so
 * assertions query baseElement (not container). Faded conditional icons (error
 * state, directory chevrons) only render with filesystem state and are covered by
 * diff inspection + typecheck rather than this deterministic harness.
 */
function renderDialog() {
  return render(<FileExplorerHost runtimeEffectsEnabled={false} />);
}

describe('FileExplorerDialog MonoChrome closure', () => {
  afterEach(() => cleanup());

  it('keeps the dialog sheet flat under monochrome (no glow shadow, flat bg, tight radius)', () => {
    const { baseElement } = renderDialog();
    const sheet = baseElement.querySelector('[data-monochrome-surface="file-explorer-dialog"]');
    expect(sheet).not.toBeNull();
    expect(sheet!.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(sheet!.className).toContain('[html[data-theme=monochrome]_&]:bg-background');
    expect(sheet!.className).toContain('[html[data-theme=monochrome]_&]:rounded-sm');
  });

  it('flattens translucent chrome panels (toolbar, status bar, footer) to solid under monochrome', () => {
    const { baseElement } = renderDialog();
    const toolbar = baseElement.querySelector('[class*="bg-elevated/40"]');
    const statusBar = baseElement.querySelector('[class*="bg-paper-soft/80"]');
    const footer = baseElement.querySelector('[class*="bg-elevated/30"][class*="px-4"]');
    for (const el of [toolbar, statusBar, footer]) {
      expect(el).not.toBeNull();
      expect(el!.className).toContain('[html[data-theme=monochrome]_&]:bg-panel');
    }
  });

  it('drops blur and translucency from sticky date-group headers under monochrome', async () => {
    const mod = (await import('./FileExplorerDialog')) as Record<string, unknown>;
    const sticky = mod.FILE_EXPLORER_MONOCHROME_STICKY_HEADER_CLASS as string | undefined;
    expect(sticky).toBeDefined();
    expect(sticky).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
    expect(sticky).toContain('[html[data-theme=monochrome]_&]:bg-background');
  });
});
