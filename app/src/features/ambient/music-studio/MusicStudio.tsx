import * as React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  FolderPlus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useUIStore } from '@/stores/ui';
import { AmbientAudioEngine } from '../ambientAudio';
import { shouldAmbientMusicPlay } from '../ambientPlayback';
import { MUSIC_LIBRARY, MUSIC_LIBRARY_TOTAL_BYTES, type MusicLibraryTrack } from './catalog';
import {
  MUSIC_SPEEDS,
  musicClipUrl,
  revokeLocalMusicClip,
  useMusicProjectStore,
  type MusicClip,
} from './musicProject';

const PREVIEW_MS = 15_000;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function restoreAmbientProject(): void {
  const ui = useUIStore.getState();
  const project = useMusicProjectStore.getState();
  if (
    !shouldAmbientMusicPlay(ui.ambient, ui.ambientActive, ui.ambientDrone, ui.ambientAlwaysPlay)
  ) {
    AmbientAudioEngine.getInstance().stop();
    return;
  }
  if (project.enabledForAmbient && project.clips.length > 0) {
    AmbientAudioEngine.getInstance().playProject(project.clips, project.loop, ui.ambientVolume);
  }
}

function previewClip(clip: MusicClip): boolean {
  if (!musicClipUrl(clip)) return false;
  AmbientAudioEngine.getInstance().playProject([clip], false, useUIStore.getState().ambientVolume);
  void AmbientAudioEngine.getInstance().resume();
  return true;
}

export function MusicStudio({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const clips = useMusicProjectStore((state) => state.clips);
  const loop = useMusicProjectStore((state) => state.loop);
  const enabledForAmbient = useMusicProjectStore((state) => state.enabledForAmbient);
  const savedAt = useMusicProjectStore((state) => state.savedAt);
  const [query, setQuery] = React.useState('');
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const previewTimer = React.useRef<number | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const stopPreview = React.useCallback(() => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreviewingId(null);
    restoreAmbientProject();
  }, []);

  React.useEffect(
    () => () => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
      restoreAmbientProject();
    },
    [],
  );

  const preview = (track: MusicLibraryTrack) => {
    if (previewingId === track.id) {
      stopPreview();
      return;
    }
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    const clip: MusicClip = {
      id: `preview-${track.id}`,
      source: 'cloud',
      trackId: track.id,
      name: track.name,
      trimStart: 0,
      trimEnd: 15,
      speed: 1,
    };
    if (!previewClip(clip)) return;
    setPreviewingId(track.id);
    previewTimer.current = window.setTimeout(stopPreview, PREVIEW_MS);
  };

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? MUSIC_LIBRARY.filter((track) => track.name.toLowerCase().includes(needle))
      : MUSIC_LIBRARY;
  }, [query]);

  const remove = (clip: MusicClip) => {
    revokeLocalMusicClip(clip);
    useMusicProjectStore.getState().removeClip(clip.id);
  };

  const clear = () => {
    for (const clip of clips) revokeLocalMusicClip(clip);
    useMusicProjectStore.getState().clear();
    AmbientAudioEngine.getInstance().stop();
  };

  const playMix = () => {
    if (clips.length === 0) return;
    AmbientAudioEngine.getInstance().playProject(clips, loop, useUIStore.getState().ambientVolume);
    void AmbientAudioEngine.getInstance().resume();
    setPreviewingId('mix');
  };

  const save = () => {
    useMusicProjectStore.getState().save();
    toast.success(
      'Mix saved',
      `${clips.length} clip${clips.length === 1 ? '' : 's'} ready for ambience.`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopPreview();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="h-[min(90vh,56rem)] w-[min(96vw,86rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0"
        overlayProps={{ className: 'bg-black/75 backdrop-blur-sm' }}
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-accent-copper" /> VibeSpace Music Studio
          </DialogTitle>
          <DialogDescription>
            Build one continuous ambience mix from 64 cloud tracks or your own device audio. Local
            files never upload automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <section
            aria-label="Music library"
            className="flex min-h-0 flex-col border-r border-border bg-paper-soft"
          >
            <div className="space-y-2 border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  aria-label="Search cloud music"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search 64 songs"
                  className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{MUSIC_LIBRARY.length} cloud songs</span>
                <span>{formatBytes(MUSIC_LIBRARY_TOTAL_BYTES)}</span>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*"
                multiple
                hidden
                onChange={(event) => {
                  for (const file of Array.from(event.target.files ?? [])) {
                    const url = URL.createObjectURL(file);
                    if (!useMusicProjectStore.getState().addLocalFile(file, url))
                      URL.revokeObjectURL(url);
                  }
                  event.currentTarget.value = '';
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => fileInput.current?.click()}
              >
                <FolderPlus className="h-4 w-4" /> Add your songs
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.map((track) => (
                <div
                  key={track.id}
                  className="mb-1 flex items-center gap-1 rounded-lg border border-transparent p-1 hover:border-border hover:bg-background"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-2 py-1.5 text-left"
                    onClick={() => preview(track)}
                    aria-label={`${previewingId === track.id ? 'Pause' : 'Preview'} ${track.name}`}
                  >
                    <span className="block truncate text-xs font-medium text-foreground">
                      {track.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatBytes(track.bytes)} · click to preview
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Add ${track.name} to mix`}
                    onClick={() => useMusicProjectStore.getState().addCloudTrack(track.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Mix timeline" className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <Button
                type="button"
                size="sm"
                onClick={previewingId === 'mix' ? stopPreview : playMix}
                disabled={clips.length === 0}
              >
                {previewingId === 'mix' ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}{' '}
                {previewingId === 'mix' ? 'Pause mix' : 'Play mix'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={save}>
                <Save className="h-4 w-4" /> Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clear}
                disabled={clips.length === 0}
              >
                <RotateCcw className="h-4 w-4" /> Clear
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="music-loop">Loop mix</Label>
                <Switch
                  id="music-loop"
                  checked={loop}
                  onCheckedChange={(value) => useMusicProjectStore.getState().setLoop(value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="music-ambient">Use in ambience</Label>
                <Switch
                  id="music-ambient"
                  checked={enabledForAmbient}
                  onCheckedChange={(value) => {
                    useMusicProjectStore.getState().setEnabledForAmbient(value);
                    useMusicProjectStore.getState().save();
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 border-b border-border bg-paper-soft px-4 py-2 text-xs text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              <span>
                {clips.length} clip{clips.length === 1 ? '' : 's'} in one continuous track
              </span>
              {savedAt ? (
                <span className="ml-auto flex items-center gap-1 text-accent-copper">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {clips.length === 0 ? (
                <div className="grid h-full min-h-52 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                  <div>
                    <Music2 className="mx-auto mb-2 h-8 w-8" />
                    <p>Add songs from the library to build your track.</p>
                  </div>
                </div>
              ) : (
                <ol className="space-y-2">
                  {clips.map((clip, index) => (
                    <li
                      key={clip.id}
                      className="grid gap-3 rounded-xl border border-border bg-paper p-3 md:grid-cols-[2rem_minmax(12rem,1fr)_minmax(18rem,1fr)_auto] md:items-center"
                    >
                      <span className="text-center text-xs font-bold text-accent-copper">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{clip.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {clip.source === 'cloud'
                            ? 'VibeSpace cloud'
                            : clip.missing
                              ? 'Local file — re-add after restart'
                              : 'Local device only'}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] text-muted-foreground">
                          Start (s)
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={clip.trimStart}
                            onChange={(event) =>
                              useMusicProjectStore
                                .getState()
                                .updateClip(clip.id, { trimStart: Number(event.target.value) })
                            }
                            className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
                          />
                        </label>
                        <label className="text-[10px] text-muted-foreground">
                          End (s)
                          <input
                            type="number"
                            min={clip.trimStart}
                            step="0.5"
                            value={clip.trimEnd ?? ''}
                            placeholder="Full"
                            onChange={(event) =>
                              useMusicProjectStore
                                .getState()
                                .updateClip(clip.id, {
                                  trimEnd: event.target.value ? Number(event.target.value) : null,
                                })
                            }
                            className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
                          />
                        </label>
                        <label className="text-[10px] text-muted-foreground">
                          Speed
                          <select
                            value={clip.speed}
                            onChange={(event) =>
                              useMusicProjectStore
                                .getState()
                                .updateClip(clip.id, { speed: Number(event.target.value) })
                            }
                            className="mt-1 h-8 w-full rounded border border-border bg-background px-1 text-xs"
                          >
                            {MUSIC_SPEEDS.map((speed) => (
                              <option key={speed} value={speed}>
                                {speed}×
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Move ${clip.name} up`}
                          disabled={index === 0}
                          onClick={() => useMusicProjectStore.getState().moveClip(clip.id, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Move ${clip.name} down`}
                          disabled={index === clips.length - 1}
                          onClick={() => useMusicProjectStore.getState().moveClip(clip.id, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${clip.name}`}
                          onClick={() => remove(clip)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
