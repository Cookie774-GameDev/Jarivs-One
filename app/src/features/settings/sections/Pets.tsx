/**
 * Settings → Pets — enable/show overlay, panel controls, optional diagnostics.
 */
import { useEffect, useState } from 'react';
import { Cat, Eye, EyeOff, MapPin, PanelRight, RotateCcw, Moon, Sparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  forcePetAnim,
  usePetSettingsStore,
  type PetForceAnimDetail,
} from '@/features/pets/petSettingsStore';
import { usePetPresentationStore } from '@/features/pets/petPresentationStore';
import {
  hidePetOverlay,
  hidePetPanel,
  isPetOverlayVisible,
  isTauriRuntime,
  openOrFocusPetPanel,
  setPetOverlayPosition,
  showPetOverlay,
} from '@/features/pets/petTauriBridge';
import { invoke } from '@tauri-apps/api/core';

export function Pets() {
  const enabled = usePetSettingsStore((s) => s.enabled);
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);
  const showDiagnostics = usePetSettingsStore((s) => s.showDiagnostics);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const setEnabled = usePetSettingsStore((s) => s.setEnabled);
  const setReducedMotion = usePetSettingsStore((s) => s.setReducedMotion);
  const setSleepTimeoutMs = usePetSettingsStore((s) => s.setSleepTimeoutMs);
  const setIdleFunIntervalMs = usePetSettingsStore((s) => s.setIdleFunIntervalMs);
  const setShowDiagnostics = usePetSettingsStore((s) => s.setShowDiagnostics);
  const setOverlayVisible = usePetSettingsStore((s) => s.setOverlayVisible);

  const panelLifecycle = usePetPresentationStore((s) => s.panelLifecycle);
  const chats = usePetPresentationStore((s) => s.chats);
  const terminals = usePetPresentationStore((s) => s.terminals);
  const panelActiveChatId = usePetPresentationStore((s) => s.panelActiveChatId);
  const pushActivity = usePetPresentationStore((s) => s.pushActivity);

  const [tauri, setTauri] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    setTauri(isTauriRuntime());
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void invoke<boolean>('pet_is_panel_visible')
      .then(setPanelVisible)
      .catch(() => setPanelVisible(false));
    void isPetOverlayVisible().catch(() => false);
  }, [panelLifecycle]);

  const showPet = async () => {
    setEnabled(true);
    setOverlayVisible(true);
    await showPetOverlay();
  };

  const hidePet = async () => {
    setOverlayVisible(false);
    await hidePetOverlay();
  };

  const resetPetPosition = async () => {
    await setPetOverlayPosition(40, 120);
    await showPetOverlay();
    setOverlayVisible(true);
  };

  const resetPanelPosition = async () => {
    await openOrFocusPetPanel(200, 120);
  };

  const openPanel = async () => {
    await openOrFocusPetPanel();
  };

  const diag = (anim: PetForceAnimDetail['anim']) => {
    forcePetAnim(anim);
  };

  const petChats = Object.values(chats).filter((c) => c.owner === 'pet-mini-panel');
  const petTerms = Object.values(terminals).filter((t) => t.owner === 'pet-mini-panel');

  const isDev =
    typeof import.meta !== 'undefined' &&
    // Vite
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

  return (
    <div className="flex flex-col gap-6" data-settings-pets="true">
      <header>
        <h2 className="text-page-title text-foreground flex items-center gap-2">
          <Cat className="h-5 w-5 text-accent-copper" />
          Pixel Pet
        </h2>
        <p className="text-secondary text-muted-foreground mt-1">
          Desktop axolotl companion — separate overlay and mini panel with real chats and terminals.
        </p>
      </header>

      <section className="flex items-start justify-between gap-3 max-w-md">
        <div>
          <Label htmlFor="pet-enabled" className="flex items-center gap-2">
            Enable Pet
          </Label>
          <p className="text-metadata text-muted-foreground mt-1">
            Shows the always-on-top Pet overlay when VibeSpace is running.
          </p>
        </div>
        <Switch
          id="pet-enabled"
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(Boolean(v));
            if (v) void showPet();
            else void hidePet();
          }}
        />
      </section>

      <section className="flex items-start justify-between gap-3 max-w-md">
        <div>
          <Label htmlFor="pet-reduced" className="flex items-center gap-2">
            Reduced motion
          </Label>
          <p className="text-metadata text-muted-foreground mt-1">
            Softens or skips busy animations (fun idle, long sleep transition).
          </p>
        </div>
        <Switch
          id="pet-reduced"
          checked={reducedMotion}
          onCheckedChange={(v) => setReducedMotion(Boolean(v))}
        />
      </section>

      <section className="flex flex-col gap-2 max-w-md">
        <Label htmlFor="pet-sleep">Sleep timeout (minutes)</Label>
        <input
          id="pet-sleep"
          type="number"
          min={1}
          max={60}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={Math.round(sleepTimeoutMs / 60_000)}
          onChange={(e) => setSleepTimeoutMs(Number(e.target.value) * 60_000)}
        />
      </section>

      <section className="flex flex-col gap-2 max-w-md">
        <Label htmlFor="pet-fun">Fun idle interval (seconds)</Label>
        <input
          id="pet-fun"
          type="number"
          min={10}
          max={1800}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={Math.round(idleFunIntervalMs / 1000)}
          onChange={(e) => setIdleFunIntervalMs(Number(e.target.value) * 1000)}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <Label className="flex items-center gap-2">
          <PanelRight className="h-3.5 w-3.5" />
          Window controls
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void showPet()}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            Show Pet
          </Button>
          <Button size="sm" variant="outline" onClick={() => void hidePet()}>
            <EyeOff className="h-3.5 w-3.5 mr-1" />
            Hide Pet
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void openPanel()}>
            Open Mini Panel
          </Button>
          <Button size="sm" variant="outline" onClick={() => void hidePetPanel()}>
            Hide Mini Panel
          </Button>
          <Button size="sm" variant="outline" onClick={() => void resetPetPosition()}>
            <MapPin className="h-3.5 w-3.5 mr-1" />
            Reset Pet Position
          </Button>
          <Button size="sm" variant="outline" onClick={() => void resetPanelPosition()}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset Panel Position
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border p-3 text-sm space-y-1 max-w-lg">
        <div className="text-ui-strong">Status</div>
        <div className="text-muted-foreground">Pet enabled: {enabled ? 'yes' : 'no'}</div>
        <div className="text-muted-foreground">Overlay visible flag: {overlayVisible ? 'yes' : 'no'}</div>
        <div className="text-muted-foreground">Runtime: {tauri ? 'Tauri' : 'Browser fallback'}</div>
        <div className="text-muted-foreground">Panel lifecycle: {panelLifecycle}</div>
        <div className="text-muted-foreground">
          Panel visible (Tauri): {panelVisible ? 'yes' : 'no / n/a'}
        </div>
        <div className="text-muted-foreground">Chats on panel: {petChats.length}</div>
        <div className="text-muted-foreground">
          Active chat: {panelActiveChatId ?? '—'}
        </div>
        <div className="text-muted-foreground">
          Terminals on panel: {petTerms.map((t) => t.ptyId).join(', ') || '—'}
        </div>
      </section>

      {(isDev || showDiagnostics) && (
        <>
          <Separator />
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between max-w-md">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Developer diagnostics
              </Label>
              {isDev && (
                <Switch
                  checked={showDiagnostics}
                  onCheckedChange={(v) => setShowDiagnostics(Boolean(v))}
                />
              )}
            </div>
            <p className="text-metadata text-muted-foreground max-w-md">
              Force animations for visual QA. Never logs secrets, keys, or raw paths.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  'welcome',
                  'idlePrimary',
                  'idleFun',
                  'walkLeft',
                  'walkRight',
                  'sleepTransition',
                  'sleepingLoop',
                  'wakeFromSleep',
                ] as const
              ).map((a) => (
                <Button key={a} size="sm" variant="outline" onClick={() => diag(a)}>
                  {a === 'sleepTransition' ? (
                    <>
                      <Moon className="h-3 w-3 mr-1" />
                      Enter Sleep
                    </>
                  ) : a === 'wakeFromSleep' ? (
                    'Wake Pet'
                  ) : (
                    a
                  )}
                </Button>
              ))}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  pushActivity(
                    {
                      id: `act_test_${Date.now()}`,
                      kind: 'notification',
                      summary: 'Safe test notification from Pet settings',
                      target: { type: 'notification', id: 'pet-test' },
                      createdAt: Date.now(),
                    },
                    false,
                  )
                }
              >
                Trigger safe test notification
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
