import type { AmbientTrack } from '@/stores/ui';
import { AMBIENT_TRACKS, getAmbientTrackIndex } from './tracks';

export interface AmbientLoadError {
  url: string;
  message: string;
  at: number;
}

export type AmbientLoadStatus =
  | { state: 'idle' }
  | { state: 'playing'; url: string }
  | { state: 'error'; url: string; message: string };

function mediaErrorMessage(audio: HTMLAudioElement): string {
  const err = audio.error;
  if (!err) return 'Failed to load track';
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback aborted';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error — check R2 public access';
    case MediaError.MEDIA_ERR_DECODE:
      return 'Decode error — file may be corrupt or not MP3';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Could not play this track — file missing or unsupported format';
    default:
      return err.message || `Media error ${err.code}`;
  }
}

export class AmbientAudioEngine {
  private static instance: AmbientAudioEngine | null = null;
  private audio: HTMLAudioElement | null = null;
  private currentTrackIndex = 0;
  private isEngineRunning = false;
  private currentVolumePercent = 40;
  private lastLoadError: AmbientLoadError | null = null;
  private loadStatus: AmbientLoadStatus = { state: 'idle' };
  private listeners = new Set<() => void>();
  private statusListeners = new Set<(status: AmbientLoadStatus) => void>();

  private constructor() {}

  public static getInstance(): AmbientAudioEngine {
    if (!AmbientAudioEngine.instance) {
      AmbientAudioEngine.instance = new AmbientAudioEngine();
    }
    return AmbientAudioEngine.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeStatus(listener: (status: AmbientLoadStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.loadStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public getLastLoadError(): AmbientLoadError | null {
    return this.lastLoadError;
  }

  public getLoadStatus(): AmbientLoadStatus {
    return this.loadStatus;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private notifyStatus(): void {
    for (const listener of this.statusListeners) listener(this.loadStatus);
  }

  private setLoadStatus(status: AmbientLoadStatus): void {
    this.loadStatus = status;
    this.notifyStatus();
  }

  private setLoadError(url: string, message: string): void {
    this.lastLoadError = { url, message, at: Date.now() };
    this.setLoadStatus({ state: 'error', url, message });
    this.notify();
  }

  private markPlaying(url: string): void {
    this.lastLoadError = null;
    this.setLoadStatus({ state: 'playing', url });
    this.notify();
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.loop = true;
      this.audio.addEventListener('error', this.handleTrackError);
    }
    return this.audio;
  }

  private currentTrackDef() {
    return AMBIENT_TRACKS[this.currentTrackIndex] ?? AMBIENT_TRACKS[0];
  }

  private resolvedAudioUrl(url: string): string {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }

  private loadCurrentTrack(): void {
    const audio = this.getAudio();
    const nextUrl = this.currentTrackDef().url;
    if (!nextUrl) return;
    const resolved = this.resolvedAudioUrl(nextUrl);
    const current = audio.currentSrc || audio.src;
    if (!current || this.resolvedAudioUrl(current) !== resolved) {
      audio.src = nextUrl;
      audio.load();
    }
  }

  private startPlayback(): void {
    if (!this.isEngineRunning) return;
    this.loadCurrentTrack();
    void this.getAudio()
      .play()
      .then(() => {
        this.markPlaying(this.currentTrackDef().url);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Playback blocked until user gesture';
        this.setLoadError(this.currentTrackDef().url, message);
        console.warn('Ambient music playback is waiting for a user gesture:', err);
      });
  }

  private handleTrackError = (): void => {
    const def = this.currentTrackDef();
    const failedUrl = def.url;
    const audio = this.getAudio();
    const message = mediaErrorMessage(audio);
    this.setLoadError(failedUrl, message);
    console.warn(`Ambient music failed to load: ${failedUrl} — ${message}`);
    this.stop();
  };

  public play(track: AmbientTrack, volume: number): void {
    const nextTrackIndex = getAmbientTrackIndex(track);
    const trackChanged = nextTrackIndex !== this.currentTrackIndex;
    this.currentTrackIndex = nextTrackIndex;
    this.currentVolumePercent = volume;
    this.isEngineRunning = true;

    const audio = this.getAudio();
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    if (trackChanged) audio.pause();
    this.startPlayback();
  }

  public stop(): void {
    this.isEngineRunning = false;
    this.setLoadStatus({ state: 'idle' });
    if (!this.audio) return;
    this.audio.pause();
  }

  public setVolume(volume: number): void {
    this.currentVolumePercent = volume;
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, volume / 100));
    }
  }

  public setTrack(track: AmbientTrack): void {
    this.currentTrackIndex = getAmbientTrackIndex(track);
    if (this.isEngineRunning) {
      this.getAudio().pause();
      this.startPlayback();
    }
  }

  public async resume(): Promise<void> {
    if (!this.isEngineRunning) return;
    this.getAudio().volume = Math.max(0, Math.min(1, this.currentVolumePercent / 100));
    try {
      await this.getAudio().play();
      this.markPlaying(this.currentTrackDef().url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Playback blocked until user gesture';
      this.setLoadError(this.currentTrackDef().url, message);
      console.warn('Ambient music playback is waiting for a user gesture:', err);
    }
  }

  public isPlaying(): boolean {
    return this.isEngineRunning && Boolean(this.audio && !this.audio.paused);
  }

  public dispose(): void {
    this.stop();
    if (!this.audio) return;
    this.audio.removeEventListener('error', this.handleTrackError);
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio = null;
    this.listeners.clear();
    this.statusListeners.clear();
  }
}
