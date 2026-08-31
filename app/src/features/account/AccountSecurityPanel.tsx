import * as React from 'react';
import { ChevronDown, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { validatePassword } from '@/features/auth/authValidation';
import { formatAuthError } from '@/features/auth/authErrors';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth';

export function AccountSecurityPanel({ accountId }: { accountId: string }) {
  const normalizedAccountId = accountId.trim();
  const cloudSession = useAuthStore((state) => state.cloudSession);
  const activeSessionId = cloudSession?.user_id.trim() ?? '';
  const ownsActiveSession = Boolean(normalizedAccountId && activeSessionId === normalizedAccountId);
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [showPasswords, setShowPasswords] = React.useState(false);
  const accountRef = React.useRef(normalizedAccountId);
  const generationRef = React.useRef(0);

  React.useLayoutEffect(() => {
    accountRef.current = normalizedAccountId;
    generationRef.current += 1;
    setPassword('');
    setConfirmation('');
    setBusy(false);
    setStatus(null);
    setError(null);
    setExpanded(false);
    setShowPasswords(false);
    return () => {
      accountRef.current = '';
      generationRef.current += 1;
    };
  }, [activeSessionId, normalizedAccountId]);

  if (!ownsActiveSession) {
    const guidance =
      normalizedAccountId && activeSessionId
        ? 'The active cloud session is unavailable for this account. Reload Account or sign in again before changing security settings.'
        : 'Sign in to change your cloud account password.';
    return (
      <section className="mt-5 rounded-2xl border border-border/70 bg-background/45 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent-copper" />
          <h3 className="text-ui-strong text-foreground">Account security</h3>
        </div>
        <p className="mt-2 text-secondary text-muted-foreground">{guidance}</p>
      </section>
    );
  }

  async function changePassword() {
    setStatus(null);
    setError(null);
    const validationError = validatePassword(password, 'signup');
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError('Cloud authentication is not configured in this build.');
      return;
    }

    const operationAccount = normalizedAccountId;
    const operationGeneration = generationRef.current;
    const isCurrentOperation = () =>
      accountRef.current === operationAccount &&
      generationRef.current === operationGeneration &&
      useAuthStore.getState().cloudSession?.user_id.trim() === operationAccount;

    setBusy(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (!isCurrentOperation()) return;
      setPassword('');
      setConfirmation('');
      setStatus('Password updated.');
      toast.success('Password updated', 'Your new password is active.');
    } catch (caught) {
      if (!isCurrentOperation()) return;
      const message = formatAuthError(caught, 'Could not update your password.');
      setError(message);
      toast.error('Password update failed', message);
    } finally {
      if (isCurrentOperation()) setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-background/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent-copper" />
          <div>
            <h3 className="text-ui-strong text-foreground">Account security</h3>
            <p className="mt-1 text-metadata text-muted-foreground">
              Password changes use your active cloud session and never expose credentials locally.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls="account-password-form"
          onClick={() => {
            setExpanded((value) => !value);
            setError(null);
          }}
        >
          Change password
          <ChevronDown className={expanded ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} />
        </Button>
      </div>
      <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-3">
        <h4 className="text-ui-strong text-foreground">Active cloud session</h4>
        <p className="mt-1 text-secondary text-foreground">
          {cloudSession?.email?.trim() || 'Email unavailable'}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-metadata text-muted-foreground">
          <span>Account ID: {normalizedAccountId}</span>
          <span>
            Session expires:{' '}
            {cloudSession?.expires_at
              ? new Date(cloudSession.expires_at * 1000).toLocaleString()
              : 'not reported'}
          </span>
        </div>
      </div>
      {expanded ? (
        <div id="account-password-form" className="mt-4 border-t border-border/50 pt-4">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-new-password">New account password</Label>
              <Input
                id="account-new-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-confirm-password">Confirm account password</Label>
              <Input
                id="account-confirm-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !password || !confirmation}
              onClick={() => void changePassword()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save new password
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPasswords((value) => !value)}
            >
              {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </Button>
            {status ? (
              <span className="text-metadata text-success" role="status">
                {status}
              </span>
            ) : null}
            {error ? (
              <span className="text-metadata text-destructive" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        </div>
      ) : status ? (
        <p className="mt-3 text-metadata text-success" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
