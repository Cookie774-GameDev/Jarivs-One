import { useState } from 'react';
import { Mail, User2, Copy, Check, LogIn, LogOut, UserPlus, Cat } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { SignInDialog } from '@/features/auth/SignInDialog';
import { usePetSettingsStore } from '@/features/pets/petSettingsStore';
import { cn } from '@/lib/utils';
import petPreview from '@/assets/pets/characters/vibespace-axolotl-pixel/previews/idlePrimary-contact-sheet.png';

/**
 * Account section — identity + Pet tab (selected companion, how to use).
 */
export function Account() {
  const displayName = useAuthStore((s) => s.displayName);
  const setDisplayName = useAuthStore((s) => s.setDisplayName);
  const localUserId = useAuthStore((s) => s.localUserId);
  const cloudSession = useAuthStore((s) => s.cloudSession);
  const setCloudSession = useAuthStore((s) => s.setCloudSession);

  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMode, setSignInMode] = useState<'signin' | 'signup'>('signin');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'profile' | 'pet'>('profile');

  const enabled = usePetSettingsStore((s) => s.enabled);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const setEnabled = usePetSettingsStore((s) => s.setEnabled);
  const setOverlayVisible = usePetSettingsStore((s) => s.setOverlayVisible);
  const setReducedMotion = usePetSettingsStore((s) => s.setReducedMotion);

  const cloudEmail = cloudSession?.email;

  function openAuth(mode: 'signin' | 'signup') {
    setSignInMode(mode);
    setSignInOpen(true);
  }

  async function handleSignOut() {
    try {
      const client = getSupabaseClient();
      await client?.auth.signOut();
    } catch {
      /* ignore */
    }
    setCloudSession(null);
    toast.success('Signed out', 'You have been signed out of your account.');
  }

  function copyId() {
    if (!localUserId) return;
    navigator.clipboard?.writeText(localUserId).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => toast.error('Could not copy', 'Clipboard access was denied.'),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-page-title text-foreground">Account</h2>
        <p className="text-secondary text-muted-foreground mt-1">
          Profile, cloud sign-in, and your desktop Pet.
        </p>
      </header>

      <div className="flex gap-1 border-b border-border pb-1" role="tablist" aria-label="Account sections">
        <Button
          size="sm"
          variant={tab === 'profile' ? 'secondary' : 'ghost'}
          role="tab"
          aria-selected={tab === 'profile'}
          onClick={() => setTab('profile')}
        >
          <User2 className="h-3.5 w-3.5 mr-1" />
          Profile
        </Button>
        <Button
          size="sm"
          variant={tab === 'pet' ? 'secondary' : 'ghost'}
          role="tab"
          aria-selected={tab === 'pet'}
          onClick={() => setTab('pet')}
          data-testid="account-pet-tab"
        >
          <Cat className="h-3.5 w-3.5 mr-1" />
          Pet
        </Button>
      </div>

      {tab === 'profile' && (
        <>
          <section className="flex flex-col gap-3">
            <Label htmlFor="acct-name">Display name</Label>
            <div className="flex items-center gap-2 max-w-md">
              <User2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                id="acct-name"
                placeholder="What should Jarvis call you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <p className="text-metadata text-muted-foreground">
              Used in greetings and the persona prompt.
            </p>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <Label>Local user ID</Label>
            <div className="flex items-center gap-2 max-w-md">
              <code className="flex-1 px-2.5 h-8 inline-flex items-center rounded-md border border-border bg-muted font-mono text-secondary text-muted-foreground select-all">
                {localUserId ?? 'not assigned'}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyId}
                disabled={!localUserId}
                aria-label="Copy local user id"
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
            <p className="text-metadata text-muted-foreground">
              Generated locally. Used as the owner of your offline data.
            </p>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between max-w-md gap-3">
              <div className="flex flex-col gap-1">
                <Label>Account</Label>
                <p className="text-metadata text-muted-foreground">
                  {cloudSession
                    ? 'You are signed in.'
                    : 'Sign in or create an account to save your workspace and plan.'}
                </p>
              </div>
              {cloudSession ? (
                <Badge variant="success">Signed in</Badge>
              ) : (
                <Badge variant="outline">Signed out</Badge>
              )}
            </div>

            {cloudEmail && (
              <div className="flex items-center gap-2 text-secondary text-muted-foreground max-w-md">
                <Mail className="h-3.5 w-3.5" />
                <span>{cloudEmail}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {cloudSession ? (
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  Sign out
                </Button>
              ) : (
                <>
                  <Button variant="accent" size="sm" onClick={() => openAuth('signin')}>
                    <LogIn className="h-3.5 w-3.5 mr-1.5" />
                    Sign in
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openAuth('signup')}>
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    Create account
                  </Button>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {tab === 'pet' && (
        <div className="flex flex-col gap-5" data-settings-pet-tab="true">
          <section className="flex flex-col sm:flex-row gap-4 items-start">
            <div
              className={cn(
                'shrink-0 rounded-xl border border-border bg-muted/40 p-2 w-[180px]',
                'flex flex-col items-center gap-2',
              )}
            >
              <img
                src={petPreview}
                alt="VibeSpace Axolotl Pixel Pet"
                className="w-full h-auto rounded-lg image-pixelated"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="text-ui-strong text-center text-sm">Axolotl Pixel</div>
              <Badge variant="outline">Selected</Badge>
            </div>
            <div className="flex flex-col gap-3 flex-1 min-w-0">
              <div>
                <h3 className="text-ui-strong text-foreground">Your desktop companion</h3>
                <p className="text-secondary text-muted-foreground mt-1">
                  The pet floats on every page of VibeSpace. Click to open a mini panel with real
                  chats and terminals. Drag to move. Right-click → Close to hide.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 max-w-md">
                <div>
                  <Label htmlFor="pet-on">Show Pet</Label>
                  <p className="text-metadata text-muted-foreground">Always visible while enabled</p>
                </div>
                <Switch
                  id="pet-on"
                  checked={enabled && overlayVisible}
                  onCheckedChange={(v) => {
                    const on = Boolean(v);
                    setEnabled(on);
                    setOverlayVisible(on);
                    if (on) window.dispatchEvent(new CustomEvent('jarvis:pet:open-panel'));
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-3 max-w-md">
                <div>
                  <Label htmlFor="pet-rm">Reduced motion</Label>
                  <p className="text-metadata text-muted-foreground">Calmer animations</p>
                </div>
                <Switch
                  id="pet-rm"
                  checked={reducedMotion}
                  onCheckedChange={(v) => setReducedMotion(Boolean(v))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEnabled(true);
                    setOverlayVisible(true);
                  }}
                >
                  Show Pet now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.dispatchEvent(new CustomEvent('jarvis:pet:open-panel'))}
                >
                  Open mini panel
                </Button>
              </div>
            </div>
          </section>

          <Separator />

          <section className="rounded-lg border border-border p-4 space-y-3 max-w-xl">
            <h3 className="text-ui-strong text-foreground">How to use</h3>
            <ol className="list-decimal pl-5 space-y-2 text-secondary text-muted-foreground text-sm">
              <li>
                <strong className="text-foreground">See the pet</strong> — Turn on Show Pet above.
                It stays on screen on every page (chat, terminals, settings…).
              </li>
              <li>
                <strong className="text-foreground">Move the pet</strong> — Click and drag it.
              </li>
              <li>
                <strong className="text-foreground">Open the mini panel</strong> — Click the pet
                (without dragging). A resizable panel appears (drag the title bar; resize from the
                corner).
              </li>
              <li>
                <strong className="text-foreground">Close the pet</strong> — Right-click the pet →{' '}
                <em>Close</em>.
              </li>
              <li>
                <strong className="text-foreground">Send a chat to the panel</strong> — Right-click a
                chat tab → <em>Send to Pet panel</em>. Same thread, not a copy.
              </li>
              <li>
                <strong className="text-foreground">Send a terminal to the panel</strong> —
                Right-click a terminal → <em>Send to Pet panel</em>. Same live PTY, no restart.
                Max 4 terminals in the panel.
              </li>
              <li>
                <strong className="text-foreground">Bring things back</strong> — Use “Bring back
                here” on the main chat/terminal when they are living in the Pet panel.
              </li>
            </ol>
          </section>
        </div>
      )}

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} initialMode={signInMode} />
    </div>
  );
}
