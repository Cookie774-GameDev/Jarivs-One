import { describe, expect, it } from 'vitest';
import {
  DEVICE_PRESETS,
  WORKBENCH_DEVICE_PRESETS,
  createPreviewEmulation,
  defaultOrientationForPreset,
  getDevicePreset,
  orientSize,
} from './previewDevices';

describe('device presets', () => {
  it('uses accurate CSS viewport sizes', () => {
    expect(getDevicePreset('iphone-se')).toMatchObject({ width: 375, height: 667, dpr: 2 });
    expect(getDevicePreset('iphone-13-mini')).toMatchObject({ width: 360, height: 780, dpr: 3 });
    expect(getDevicePreset('iphone-13')).toMatchObject({ width: 390, height: 844, dpr: 3 });
    expect(getDevicePreset('iphone-13-pro-max')).toMatchObject({ width: 428, height: 926, dpr: 3 });
    expect(getDevicePreset('iphone-15')).toMatchObject({ width: 393, height: 852, dpr: 3 });
    expect(getDevicePreset('iphone-15-pro-max')).toMatchObject({ width: 430, height: 932, dpr: 3 });
    expect(getDevicePreset('iphone-16-pro')).toMatchObject({ width: 402, height: 874, dpr: 3 });
    expect(getDevicePreset('iphone-16-pro-max')).toMatchObject({ width: 440, height: 956, dpr: 3 });
    expect(getDevicePreset('pixel')).toMatchObject({ width: 412, height: 915 });
    expect(getDevicePreset('ipad-mini')).toMatchObject({ width: 744, height: 1133, dpr: 2 });
    expect(getDevicePreset('ipad-pro-11')).toMatchObject({ width: 834, height: 1210, dpr: 2 });
    expect(getDevicePreset('ipad-pro-13')).toMatchObject({ width: 1032, height: 1376, dpr: 2 });
    expect(getDevicePreset('ipad-air-11')).toMatchObject({ width: 820, height: 1180, dpr: 2 });
    expect(getDevicePreset('ipad-air-13')).toMatchObject({ width: 1024, height: 1366, dpr: 2 });
    expect(getDevicePreset('small-laptop')).toMatchObject({ width: 1366, height: 768 });
    expect(getDevicePreset('macbook')).toMatchObject({ width: 1440, height: 900, dpr: 2 });
    expect(getDevicePreset('macbook-air-13')).toMatchObject({ width: 1280, height: 832, dpr: 2 });
    expect(getDevicePreset('macbook-pro-14')).toMatchObject({ width: 1512, height: 982, dpr: 2 });
    expect(getDevicePreset('macbook-pro-16')).toMatchObject({ width: 1728, height: 1117, dpr: 2 });
    expect(getDevicePreset('desktop-1080')).toMatchObject({ width: 1920, height: 1080 });
  });

  it('derives native device metrics without letting visual zoom alter the logical viewport', () => {
    const iphone13 = getDevicePreset('iphone-13');
    expect(createPreviewEmulation(iphone13, 'portrait', { width: 390, height: 844 }, 0.5)).toEqual({
      viewportWidth: 390,
      viewportHeight: 844,
      screenWidth: 390,
      screenHeight: 844,
      deviceScaleFactor: 3,
      displayScale: 0.5,
      mobile: true,
      touch: true,
      orientation: 'portrait',
    });

    expect(
      createPreviewEmulation(iphone13, 'landscape', { width: 844, height: 390 }, 0.75),
    ).toMatchObject({
      viewportWidth: 844,
      viewportHeight: 390,
      screenWidth: 844,
      screenHeight: 390,
      deviceScaleFactor: 3,
      displayScale: 0.75,
      orientation: 'landscape',
    });
  });

  it('shares generation-specific fixed and custom presets with Workbench without responsive sizing', () => {
    expect(WORKBENCH_DEVICE_PRESETS.map((device) => device.id)).toContain('iphone-13');
    expect(WORKBENCH_DEVICE_PRESETS.map((device) => device.id)).toContain('ipad-pro-13');
    expect(WORKBENCH_DEVICE_PRESETS.map((device) => device.id)).toContain('small-laptop');
    expect(WORKBENCH_DEVICE_PRESETS.map((device) => device.id)).not.toContain('responsive');
    expect(WORKBENCH_DEVICE_PRESETS.map((device) => device.id)).toContain('custom');
  });

  it('keeps exact CSS size (not visually scaled) from orientSize', () => {
    const iphone = getDevicePreset('iphone-15');
    const portrait = orientSize(iphone, 'portrait', 0, 0, 800, 600);
    expect(portrait).toEqual({ width: 393, height: 852 });
    const landscape = orientSize(iphone, 'landscape', 0, 0, 800, 600);
    expect(landscape).toEqual({ width: 852, height: 393 });
  });

  it('all fixed presets have positive width/height', () => {
    for (const d of DEVICE_PRESETS) {
      if (d.id === 'responsive') continue;
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
    }
  });

  it('defaults laptop and desktop previews to landscape without rotating mobile presets', () => {
    expect(defaultOrientationForPreset(getDevicePreset('small-laptop'))).toBe('landscape');
    expect(defaultOrientationForPreset(getDevicePreset('macbook'))).toBe('landscape');
    expect(defaultOrientationForPreset(getDevicePreset('desktop-1080'))).toBe('landscape');
    expect(defaultOrientationForPreset(getDevicePreset('ipad-mini'))).toBe('portrait');
    expect(defaultOrientationForPreset(getDevicePreset('iphone-15'))).toBe('portrait');
  });
});
