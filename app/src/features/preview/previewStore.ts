import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getDevicePreset } from './previewDevices';

export type PreviewOrientation = 'portrait' | 'landscape';
export type ColorSchemeEmulation = 'system' | 'light' | 'dark';

export interface PreviewErrorState {
  code: string;
  message: string;
  url?: string;
  recoverable: boolean;
}

interface PreviewState {
  url: string;
  draftUrl: string;
  deviceId: string;
  orientation: PreviewOrientation;
  zoom: number;
  fitToWorkspace: boolean;
  showDeviceFrame: boolean;
  showRulers: boolean;
  colorScheme: ColorSchemeEmulation;
  customWidth: number;
  customHeight: number;
  recentUrls: string[];
  surfaceReady: boolean;
  loading: boolean;
  error: PreviewErrorState | null;
  detectedServers: Array<{ url: string; host?: string; port?: string }>;
  staticServerUrl: string | null;
  consoleOpen: boolean;
  diagnostics: string[];
  setDraftUrl: (v: string) => void;
  setUrl: (v: string) => void;
  setDeviceId: (id: string) => void;
  setOrientation: (o: PreviewOrientation) => void;
  setZoom: (z: number) => void;
  setFitToWorkspace: (v: boolean) => void;
  setShowDeviceFrame: (v: boolean) => void;
  setShowRulers: (v: boolean) => void;
  setColorScheme: (v: ColorSchemeEmulation) => void;
  setCustomSize: (w: number, h: number) => void;
  pushRecent: (url: string) => void;
  setSurfaceReady: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (e: PreviewErrorState | null) => void;
  setDetectedServers: (rows: Array<{ url: string; host?: string; port?: string }>) => void;
  setStaticServerUrl: (url: string | null) => void;
  setConsoleOpen: (v: boolean) => void;
  pushDiagnostic: (line: string) => void;
  clearPreviewData: () => void;
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set, get) => ({
      url: '',
      draftUrl: '',
      deviceId: 'iphone-15',
      orientation: 'portrait',
      zoom: 0.75,
      fitToWorkspace: true,
      showDeviceFrame: true,
      showRulers: false,
      colorScheme: 'system',
      customWidth: 390,
      customHeight: 844,
      recentUrls: [],
      surfaceReady: false,
      loading: false,
      error: null,
      detectedServers: [],
      staticServerUrl: null,
      consoleOpen: false,
      diagnostics: [],
      setDraftUrl: (draftUrl) => set({ draftUrl }),
      setUrl: (url) => set({ url, draftUrl: url }),
      setDeviceId: (deviceId) => {
        const preset = getDevicePreset(deviceId);
        set({
          deviceId,
          customWidth: preset.width || get().customWidth,
          customHeight: preset.height || get().customHeight,
        });
      },
      setOrientation: (orientation) => set({ orientation }),
      setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.2, zoom)) }),
      setFitToWorkspace: (fitToWorkspace) => set({ fitToWorkspace }),
      setShowDeviceFrame: (showDeviceFrame) => set({ showDeviceFrame }),
      setShowRulers: (showRulers) => set({ showRulers }),
      setColorScheme: (colorScheme) => set({ colorScheme }),
      setCustomSize: (customWidth, customHeight) =>
        set({
          customWidth: Math.min(3840, Math.max(200, customWidth)),
          customHeight: Math.min(2160, Math.max(200, customHeight)),
        }),
      pushRecent: (url) => {
        const recentUrls = [url, ...get().recentUrls.filter((u) => u !== url)].slice(0, 12);
        set({ recentUrls });
      },
      setSurfaceReady: (surfaceReady) => set({ surfaceReady }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setDetectedServers: (detectedServers) => set({ detectedServers }),
      setStaticServerUrl: (staticServerUrl) => set({ staticServerUrl }),
      setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
      pushDiagnostic: (line) =>
        set({ diagnostics: [`${new Date().toISOString()} ${line}`, ...get().diagnostics].slice(0, 80) }),
      clearPreviewData: () =>
        set({
          recentUrls: [],
          error: null,
          diagnostics: [],
          staticServerUrl: null,
        }),
    }),
    {
      name: 'vibespace-preview-studio:v1',
      partialize: (s) => ({
        url: s.url,
        draftUrl: s.draftUrl,
        deviceId: s.deviceId,
        orientation: s.orientation,
        zoom: s.zoom,
        fitToWorkspace: s.fitToWorkspace,
        showDeviceFrame: s.showDeviceFrame,
        showRulers: s.showRulers,
        colorScheme: s.colorScheme,
        customWidth: s.customWidth,
        customHeight: s.customHeight,
        recentUrls: s.recentUrls,
      }),
    },
  ),
);
