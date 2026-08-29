import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevicePreviewPanel } from './DevicePreviewPanel';
import type { WorkbenchPanel } from './types';

afterEach(cleanup);

describe('DevicePreviewPanel logical viewport', () => {
  it('offers iPhone 13 and keeps its exact CSS viewport separate from fractional display zoom', () => {
    const panel: WorkbenchPanel = {
      id: 'preview-1',
      kind: 'device-preview',
      title: 'Preview',
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      z: 1,
      minimized: false,
      status: 'ready',
      settings: {
        previewDeviceId: 'iphone-13',
        previewOrientation: 'portrait',
        previewZoom: 0.35,
        previewDocument: '<!doctype html><html><body>Device test</body></html>',
      },
    };

    const { container } = render(<DevicePreviewPanel panel={panel} onUpdate={vi.fn()} />);

    expect(screen.getByRole('option', { name: 'iPhone 13 / 13 Pro (390×844)' })).toBeTruthy();
    const iframe = screen.getByTitle('iPhone 13 / 13 Pro preview');
    expect(iframe.style.width).toBe('390px');
    expect(iframe.style.height).toBe('844px');
    expect(iframe.style.transform).toBe('scale(0.35)');

    const scaleBox = container.querySelector<HTMLElement>('.workbench-device-preview-scale-box');
    expect(scaleBox?.style.width).toBe('136.5px');
    expect(scaleBox?.style.height).toBe('295.4px');
  });
});
