import { useState } from 'react';
import { Mail, User2, Copy, Check, LogIn, LogOut, UserPlus, Cat } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/toast';
import { SignInDialog } from '@/features/auth/SignInDialog';
import { PetAccountPanel } from '@/features/pets/PetAccountPanel';

/**
 * Account section — profile + optional Pet tab (Settings modal).
 * Account page passes `profileOnly` and hosts Pet on its own top-level tab.
 */
export function Account({ profileOnly = false }: { profileOnly?: boolean }) {
  const displayName = useAuthStore((s) => s.displayName);
  const setDisplayName = useAuthStore((s) => s.setDisplayName);
  const localUserId = useAuthStore((s) => s.localUserId);
  const cloudSession = useAuthStore((s) => s.cloudSession);
  const setCloudSession = useAuthStore((s) => s.setCloudSession);

  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMode, setSignInMode] = useState<'signin' | 'signup'>('signin');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'profile' | 'pet'>('profile');

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

  const profileBody = (
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
  );

  if (profileOnly) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h2 className="text-page-title text-foreground">Account</h2>
          <p className="text-secondary text-muted-foreground mt-1">
            Local profile and optional cloud sync.
          </p>
        </header>
        {profileBody}
        <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} initialMode={signInMode} />
      </div>
    );
  }

  return (
    <div className="mc7f-settings-account flex flex-col gap-6 [html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-foreground/20 [html[data-theme=monochrome]_&]:pl-4 [html[data-theme=monochrome]_&_*]:rounded-none [html[data-theme=monochrome]_&_*]:bg-none [html[data-theme=monochrome]_&_*]:shadow-none">
      <header>
        <h2 className="text-page-title text-foreground">Account</h2>
        <p className="text-secondary text-muted-foreground mt-1">
          Profile, cloud sign-in, and your desktop Pet.
        </p>
      </header>

      <div
        className="flex gap-1 border-b border-border pb-1"
        role="tablist"
        aria-label="Account sections"
      >
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

      {tab === 'profile' && profileBody}
      {tab === 'pet' && <PetAccountPanel />}

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} initialMode={signInMode} />
    </div>
  );
}
