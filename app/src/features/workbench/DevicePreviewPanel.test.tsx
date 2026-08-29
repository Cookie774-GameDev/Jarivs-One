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

  it('groups verified Android devices and exposes exact emulation metadata', () => {
    const panel: WorkbenchPanel = {
      id: 'preview-android',
      kind: 'device-preview',
      title: 'Preview',
      x: 0,
      y: 0,
      width: 900,
      height: 700,
      z: 1,
      minimized: false,
      status: 'ready',
      settings: {
        previewDeviceId: 'pixel-9',
        previewOrientation: 'portrait',
        previewZoom: 0.5,
        previewDocument: '<!doctype html><html><body>Android test</body></html>',
      },
    };

    const { container } = render(<DevicePreviewPanel panel={panel} onUpdate={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Android phones' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Google adaptive layouts' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Google Pixel 9 (412×924)' })).toBeTruthy();
    expect(screen.getByText(/Android compact width · expanded height/i)).toBeTruthy();
    expect(screen.getByText(/Chrome DevTools verified/i)).toBeTruthy();

    const shell = container.querySelector<HTMLElement>('.workbench-device-preview-shell');
    expect(shell?.dataset.platform).toBe('android');
    expect(shell?.dataset.windowWidthClass).toBe('compact');
    expect(shell?.dataset.windowHeightClass).toBe('expanded');
    expect(shell?.dataset.dpr).toBe('2.625');

    const iframe = screen.getByTitle('Google Pixel 9 preview');
    expect(iframe.style.width).toBe('412px');
    expect(iframe.style.height).toBe('924px');
    expect(iframe.style.transform).toBe('scale(0.5)');
  });
});
