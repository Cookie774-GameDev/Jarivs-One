/**
 * Shared Pet controls + how-to for Account page / Settings → Account.
 */
import { Cat } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PET_CHARACTER_LIST } from './petCharacters';
import { notifyPetCharacterChanged, usePetSettingsStore } from './petSettingsStore';
import { cn } from '@/lib/utils';

export function PetAccountPanel({ className }: { className?: string }) {
  const enabled = usePetSettingsStore((s) => s.enabled);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const characterId = usePetSettingsStore((s) => s.characterId);
  const setEnabled = usePetSettingsStore((s) => s.setEnabled);
  const setOverlayVisible = usePetSettingsStore((s) => s.setOverlayVisible);
  const setReducedMotion = usePetSettingsStore((s) => s.setReducedMotion);
  const setCharacterId = usePetSettingsStore((s) => s.setCharacterId);

  const show = enabled && overlayVisible;
  const selectedCharacter = PET_CHARACTER_LIST.find((c) => c.id === characterId) ?? PET_CHARACTER_LIST[0];

  const showPetNow = () => {
    setEnabled(true);
    setOverlayVisible(true);
    // Force main PetHost to clear panel latch and show the sprite again.
    window.dispatchEvent(new CustomEvent('jarvis:pet:show'));
  };

  const openPanel = () => {
    setEnabled(true);
    setOverlayVisible(true);
    window.dispatchEvent(new CustomEvent('jarvis:pet:open-panel'));
  };

  const chooseCharacter = (id: typeof characterId) => {
    setCharacterId(id);
    notifyPetCharacterChanged(id);
    showPetNow();
  };

  return (
    <div className={cn('flex flex-col gap-5', className)} data-settings-pet-tab="true" data-account-pet-section="true">
      <div className="flex items-center gap-2">
        <Cat className="h-5 w-5 text-accent-copper" />
        <h2 className="text-page-title text-foreground">Pet</h2>
        <Badge variant="outline">{selectedCharacter.name}</Badge>
      </div>

      <section className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="grid w-full max-w-md shrink-0 grid-cols-1 gap-3 sm:w-[380px] sm:grid-cols-2">
          {PET_CHARACTER_LIST.map((character) => {
            const selected = character.id === characterId;
            return (
              <button
                key={character.id}
                type="button"
                aria-pressed={selected}
                aria-label={`Select ${character.name}`}
                className={cn(
                  'rounded-lg border bg-muted/30 p-2 text-left transition-colors',
                  'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-accent-copper bg-accent-copper/10' : 'border-border',
                )}
                onClick={() => chooseCharacter(character.id)}
              >
                <img
                  src={character.preview}
                  alt={`${character.title} preview`}
                  className="mb-2 h-auto w-full rounded-md"
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-ui-strong text-sm', character.accent)}>
                    {character.name}
                  </span>
                  <Badge variant={selected ? 'success' : 'outline'}>
                    {selected ? 'Selected' : character.badge}
                  </Badge>
                </div>
                <div className="mt-1 text-metadata text-muted-foreground">{character.blurb}</div>
              </button>
            );
          })}
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
