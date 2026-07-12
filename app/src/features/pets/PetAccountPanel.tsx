/**
 * Shared Pet controls + how-to for Account page / Settings → Account.
 */
import { Cat } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { usePetSettingsStore } from './petSettingsStore';
import { cn } from '@/lib/utils';

// Vite asset URL (built into the app bundle).
import petPreviewUrl from '@/assets/pets/characters/vibespace-axolotl-pixel/previews/idlePrimary-contact-sheet.png';

export function PetAccountPanel({ className }: { className?: string }) {
  const enabled = usePetSettingsStore((s) => s.enabled);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const setEnabled = usePetSettingsStore((s) => s.setEnabled);
  const setOverlayVisible = usePetSettingsStore((s) => s.setOverlayVisible);
  const setReducedMotion = usePetSettingsStore((s) => s.setReducedMotion);

  const show = enabled && overlayVisible;

  const showPetNow = () => {
    setEnabled(true);
    setOverlayVisible(true);
  };

  const openPanel = () => {
    showPetNow();
    window.dispatchEvent(new CustomEvent('jarvis:pet:open-panel'));
  };

  return (
    <div className={cn('flex flex-col gap-5', className)} data-settings-pet-tab="true" data-account-pet-section="true">
      <div className="flex items-center gap-2">
        <Cat className="h-5 w-5 text-accent-copper" />
        <h2 className="text-page-title text-foreground">Pet</h2>
        <Badge variant="outline">Axolotl Pixel</Badge>
      </div>

      <section className="flex flex-col sm:flex-row gap-4 items-start">
        <div
          className={cn(
            'shrink-0 rounded-xl border border-border bg-muted/40 p-2 w-[180px]',
            'flex flex-col items-center gap-2',
          )}
        >
          <img
            src={typeof petPreviewUrl === 'string' ? petPreviewUrl : String(petPreviewUrl)}
            alt="VibeSpace Axolotl Pixel Pet"
            className="w-full h-auto rounded-lg"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="text-ui-strong text-center text-sm">Axolotl Pixel</div>
          <Badge variant="success">Selected</Badge>
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <p className="text-secondary text-muted-foreground">
            Your desktop companion floats on every page. Drag to move, click to open the mini panel,
            right-click → Close to hide.
          </p>

          <div className="flex items-center justify-between gap-3 max-w-md">
            <div>
              <Label htmlFor="pet-on-account">Show Pet</Label>
              <p className="text-metadata text-muted-foreground">Always visible while enabled</p>
            </div>
            <Switch
              id="pet-on-account"
              checked={show}
              onCheckedChange={(v) => {
                const on = Boolean(v);
                setEnabled(on);
                setOverlayVisible(on);
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 max-w-md">
            <div>
              <Label htmlFor="pet-rm-account">Reduced motion</Label>
              <p className="text-metadata text-muted-foreground">Calmer animations</p>
            </div>
            <Switch
              id="pet-rm-account"
              checked={reducedMotion}
              onCheckedChange={(v) => setReducedMotion(Boolean(v))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={showPetNow}>
              Show Pet now
            </Button>
            <Button size="sm" variant="outline" onClick={openPanel}>
              Open mini panel
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-ui-strong text-foreground">How to use</h3>
        <ol className="list-decimal pl-5 space-y-2 text-secondary text-muted-foreground text-sm">
          <li>
            <strong className="text-foreground">Show Pet</strong> — toggle above, then look for the
            axolotl on the main window.
          </li>
          <li>
            <strong className="text-foreground">Move</strong> — click and drag the pet.
          </li>
          <li>
            <strong className="text-foreground">Mini panel</strong> — click the pet (no drag). Resize
            from the corner; drag the title bar to move the panel.
          </li>
          <li>
            <strong className="text-foreground">Hide pet</strong> — right-click pet → Close.
          </li>
          <li>
            <strong className="text-foreground">Chat → panel</strong> — right-click a chat tab → Send
            to Pet panel.
          </li>
          <li>
            <strong className="text-foreground">Terminal → panel</strong> — right-click a terminal →
            Send to Pet panel (same live session, max 4).
          </li>
        </ol>
      </section>
    </div>
  );
}
