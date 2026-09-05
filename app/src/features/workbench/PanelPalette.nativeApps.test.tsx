import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelPalette } from './PanelPalette';
import type { NativeAppDescriptor } from './nativeApps';

const detectedApps: NativeAppDescriptor[] = [
  { id: 'chatgpt', name: 'ChatGPT', running: true, pinned: true, launchable: true },
  { id: 'edge', name: 'Microsoft Edge', running: true, pinned: false, launchable: true },
];

describe('Workbench native app palette', () => {
  it('shows detected ADEs as direct icons plus one custom app chooser', () => {
    const onOpenNativeApp = vi.fn();
    const onOpenNativeAppPicker = vi.fn();
    render(
      <PanelPalette
        onAdd={vi.fn()}
        detectedApps={detectedApps}
        onOpenNativeApp={onOpenNativeApp}
        onOpenNativeAppPicker={onOpenNativeAppPicker}
      />,
    );

    screen.getByRole('button', { name: 'Open ChatGPT' }).click();
    expect(onOpenNativeApp).toHaveBeenCalledWith(detectedApps[0]);
    expect(screen.queryByRole('button', { name: 'Add ChatGPT ADE' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Microsoft Edge' })).toBeNull();
    screen.getByRole('button', { name: 'Open app' }).click();
    expect(onOpenNativeAppPicker).toHaveBeenCalledTimes(1);
  });
});
