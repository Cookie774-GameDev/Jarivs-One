import { describe, expect, it } from 'vitest';
import {
  nativeAppSelectionForPanel,
  pinnedNativeApps,
  sanitizeNativeAppDescriptor,
  type NativeAppDescriptor,
} from './nativeApps';
import type { WorkbenchPanel } from './types';

const app = (patch: Partial<NativeAppDescriptor> = {}): NativeAppDescriptor => ({
  id: 'chatgpt',
  name: 'ChatGPT',
  running: true,
  pinned: true,
  launchable: true,
  ...patch,
});

describe('Workbench native app catalog', () => {
  it('treats legacy ADE panels as the real ChatGPT desktop app', () => {
    const panel = { kind: 'ade', settings: {} } as WorkbenchPanel;
    expect(nativeAppSelectionForPanel(panel)).toEqual({ appId: 'chatgpt' });
  });

  it('projects only detected ADEs into the always-visible pinned strip', () => {
    expect(pinnedNativeApps([app(), app({ id: 'edge', name: 'Edge', pinned: false })])).toEqual([
      app(),
    ]);
  });
  it('rejects unsafe native app descriptors before they reach persistence or launch', () => {
    expect(sanitizeNativeAppDescriptor(app())).toEqual(app());
    expect(
      sanitizeNativeAppDescriptor(app({ id: '../escape', path: 'C:\\Temp\\tool.exe' })),
    ).toBeNull();
    expect(
      sanitizeNativeAppDescriptor(app({ id: 'custom', path: 'C:\\Temp\\tool.exe --flag' })),
    ).toBeNull();
  });

  it('uses a validated custom executable path for custom app panels', () => {
    const panel = {
      kind: 'native-app',
      settings: { nativeAppId: 'custom', nativeAppPath: 'C:\\Tools\\Demo.exe' },
    } as WorkbenchPanel;
    expect(nativeAppSelectionForPanel(panel)).toEqual({
      appId: 'custom',
      path: 'C:\\Tools\\Demo.exe',
    });
  });
});
