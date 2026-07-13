import { useState } from 'react';
import {
  Mail,
  User2,
  Copy,
  Check,
  LogIn,
  LogOut,
  UserPlus,
  Cloud,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/toast';
import { SignInDialog } from '@/features/auth/SignInDialog';
import { cn } from '@/lib/utils';

/**
 * Account section - identity, cloud session, and the sign-in entry point.
 * Local-first: localUserId always exists. Cloud is opt-in via VibeSpace Cloud.
 */
export function Account() {
  const displayName = useAuthStore((s) => s.displayName);
  const setDisplayName = useAuthStore((s) => s.setDisplayName);
  const localUserId = useAuthStore((s) => s.localUserId);
  const cloudSession = useAuthStore((s) => s.cloudSession);
  const setCloudSession = useAuthStore((s) => s.setCloudSession);
  const cloudReady = isCloudSyncConfigured();

  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMode, setSignInMode] = useState<'signin' | 'signup'>('signin');
  const [copied, setCopied] = useState(false);

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
      /* ignore network errors on sign-out */
    }
    setCloudSession(null);
    toast.success('Signed out', 'You have been signed out of your cloud account.');
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
        <p className="mt-1 text-secondary text-muted-foreground">
          Local profile and optional VibeSpace Cloud sign-in.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <Label htmlFor="acct-name">Display name</Label>
        <div className="flex max-w-md items-center gap-2">
          <User2 className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        <div className="flex max-w-md items-center gap-2">
          <code className="inline-flex h-8 flex-1 select-all items-center rounded-md border border-border bg-muted px-2.5 font-mono text-secondary text-muted-foreground">
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
          Generated locally. Owner of offline data on this device.
        </p>
      </section>

      <Separator />

      <section
        className={cn(
          'relative overflow-hidden rounded-2xl border p-4 shadow-soft',
          cloudSession
            ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-panel to-panel'
            : 'border-border bg-gradient-to-br from-slate-950/40 via-panel to-panel',
        )}
      >
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-accent-copper/15 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-accent-copper" />
                <Label className="text-foreground">VibeSpace Cloud</Label>
              </div>
              <p className="max-w-md text-metadata leading-relaxed text-muted-foreground">
                {cloudSession
                  ? 'Signed in. Plans, billing, and sync use this account.'
                  : cloudReady
                    ? 'Sign in or create an account to save your plan and sync workspace data.'
                    : 'Cloud is not configured in this build, so sign-in cannot reach the server.'}
              </p>
            </div>
            {cloudSession ? (
              <Badge variant="success" className="shrink-0">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Signed in
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                Signed out
              </Badge>
            )}
          </div>

          {cloudEmail && (
            <div className="flex max-w-md items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-secondary text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{cloudEmail}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-0.5">
            {cloudSession ? (
              <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                Sign out
              </Button>
            ) : (
              <>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => openAuth('signin')}
                  disabled={!cloudReady}
                >
                  <LogIn className="mr-1.5 h-3.5 w-3.5" />
                  Sign in
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAuth('signup')}
                  disabled={!cloudReady}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Create account
                </Button>
              </>
            )}
          </div>

          {!cloudSession && cloudReady && (
            <p className="text-metadata text-muted-foreground/90">
              New accounts receive a <span className="text-foreground/80">6-digit email code</span>.
              Check spam if it does not appear within a minute.
            </p>
          )}
        </div>
      </section>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} initialMode={signInMode} />
    </div>
  );
}
