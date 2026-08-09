import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Mail,
  Sparkles,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { OtpCodeInput } from './OtpCodeInput';
import { formatAuthError, isLikelyExistingAccountSignUp } from './authErrors';
import {
  isCompleteOtpCode,
  normalizeOtpCode,
  validateEmail,
  validatePassword,
} from './authValidation';
import './sakura-auth.css';

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to open on. Defaults to 'signin'. */
  initialMode?: Mode;
}

type Mode = 'signin' | 'signup' | 'magic' | 'recovery';
type Phase = 'credentials' | 'verify' | 'new-password';
type VerifyKind = 'signup' | 'email' | 'recovery';

/**
 * Supabase auth form:
 *   - signin: email + password
 *   - signup: email + password, then 6-digit email verification code
 *   - magic:  email-only sign-in via 6-digit code (no password)
 */
export function SignInDialog({ open, onOpenChange, initialMode }: SignInDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signin');
  const [phase, setPhase] = useState<Phase>('credentials');
  const [verifyKind, setVerifyKind] = useState<VerifyKind>('signup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const generationRef = useRef(0);
  const cloudReady = isCloudSyncConfigured();

  const NOT_CONFIGURED =
    'VibeSpace Cloud is not configured in this build. Install the official release, or ask the maintainer to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';

  const reset = useCallback(() => {
    generationRef.current += 1;
    setEmail('');
    setPassword('');
    setPasswordConfirmation('');
    setOtpCode('');
    setMode(initialMode ?? 'signin');
    setPhase('credentials');
    setVerifyKind('signup');
    setBusy(false);
    setError(null);
    setInfo(null);
  }, [initialMode]);

  useEffect(() => {
    // Controlled parents can close without Radix emitting onOpenChange.
    // Reset on both edges so no secret or recovery state survives a closed interval.
    reset();
  }, [open, reset]);

  function closeDialog() {
    reset();
    onOpenChange(false);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      closeDialog();
      return;
    }
    onOpenChange(true);
  }

  function selectMode(next: Mode) {
    setMode(next);
    setPhase('credentials');
    setOtpCode('');
    setError(null);
    setInfo(null);
  }

  function captureGeneration() {
    const generation = generationRef.current;
    return () => generationRef.current === generation;
  }

  async function handleCredentialsSubmit() {
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim().toLowerCase();
    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    if (mode !== 'magic' && mode !== 'recovery') {
      const passwordError = validatePassword(password, mode);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setBusy(true);
    const client = getSupabaseClient();
    if (!client) {
      setBusy(false);
      setError(NOT_CONFIGURED);
      return;
    }
    const isCurrent = captureGeneration();

    try {
      if (mode === 'recovery') {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(trimmedEmail);
        if (!isCurrent()) return;
        if (recoveryError) throw recoveryError;
        setVerifyKind('recovery');
        setPhase('verify');
        setOtpCode('');
        setInfo(
          'Enter the recovery code from your email. The code expires in one hour and works once.',
        );
        toast.success('Recovery code sent', `Check ${trimmedEmail}.`);
        return;
      }

      if (mode === 'magic') {
        const { error: otpError } = await client.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: false,
            // Desktop / local web — OTP is entered in-app; no redirect required.
          },
        });
        if (!isCurrent()) return;
        if (otpError) throw otpError;
        setVerifyKind('email');
        setPhase('verify');
        setOtpCode('');
        setInfo('Check your inbox (and spam) for a 6-digit code. Codes expire in one hour.');
        toast.success('Code sent', `We emailed a code to ${trimmedEmail}.`);
        return;
      }

      if (mode === 'signup') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: undefined,
          },
        });
        if (!isCurrent()) return;
        if (signUpError) throw signUpError;

        if (data.session) {
          toast.success('Welcome to VibeSpace', 'Your account is ready and cloud sync is on.');
          closeDialog();
          return;
        }

        if (isLikelyExistingAccountSignUp(data)) {
          setError(
            'That email already has an account. Sign in with your password, or use Email code.',
          );
          setMode('signin');
          return;
        }

        setVerifyKind('signup');
        setPhase('verify');
        setOtpCode('');
        setInfo(
          'We sent a 6-digit code to your email. Enter it below to finish signup. Check spam if it is missing.',
        );
        toast.success('Check your email', `Verification code sent to ${trimmedEmail}.`);
        return;
      }

      const { error: signInError } = await client.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (!isCurrent()) return;
      if (signInError) throw signInError;
      toast.success('Signed in', 'Cloud sync is enabled for this device.');
      closeDialog();
    } catch (err) {
      if (isCurrent()) setError(formatAuthError(err, 'Sign in failed. Try again.'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function handleVerifySubmit() {
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    const token = normalizeOtpCode(otpCode);
    if (!isCompleteOtpCode(token)) {
      setError('Enter the full 6-digit code from your email.');
      return;
    }

    setBusy(true);
    const client = getSupabaseClient();
    if (!client) {
      setBusy(false);
      setError(NOT_CONFIGURED);
      return;
    }
    const isCurrent = captureGeneration();

    try {
      const { error: verifyError } = await client.auth.verifyOtp({
        email: trimmedEmail,
        token,
        type: verifyKind,
      });
      if (!isCurrent()) return;
      if (verifyError) throw verifyError;

      if (verifyKind === 'recovery') {
        setPhase('new-password');
        setOtpCode('');
        setPassword('');
        setPasswordConfirmation('');
        setInfo('Recovery code accepted. Choose a new password for your VibeSpace account.');
        return;
      }

      toast.success(
        verifyKind === 'signup' ? 'Account verified' : 'Signed in',
        verifyKind === 'signup'
          ? 'Your email is confirmed and cloud sync is enabled.'
          : 'Cloud sync is enabled for this device.',
      );
      closeDialog();
    } catch (err) {
      if (isCurrent()) {
        setError(formatAuthError(err, 'Verification failed. Check the code and try again.'));
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function handleNewPasswordSubmit() {
    setError(null);
    setInfo(null);
    const passwordError = validatePassword(password, 'signup');
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const client = getSupabaseClient();
    if (!client) {
      setBusy(false);
      setError(NOT_CONFIGURED);
      return;
    }
    const isCurrent = captureGeneration();

    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (!isCurrent()) return;
      if (updateError) throw updateError;
      toast.success('Password updated', 'Your new password is active.');
      closeDialog();
    } catch (err) {
      if (isCurrent()) {
        setError(formatAuthError(err, 'Could not update your password. Request a new code.'));
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim().toLowerCase();
    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    setBusy(true);
    const client = getSupabaseClient();
    if (!client) {
      setBusy(false);
      setError(NOT_CONFIGURED);
      return;
    }
    const isCurrent = captureGeneration();

    try {
      if (verifyKind === 'signup') {
        const { error: resendError } = await client.auth.resend({
          type: 'signup',
          email: trimmedEmail,
        });
        if (!isCurrent()) return;
        if (resendError) {
          // Fallback: some projects only re-send via signUp when password is still available.
          if (password) {
            const { error: signUpError } = await client.auth.signUp({
              email: trimmedEmail,
              password,
            });
            if (!isCurrent()) return;
            if (signUpError) throw resendError;
          } else {
            throw resendError;
          }
        }
      } else if (verifyKind === 'email') {
        const { error: otpError } = await client.auth.signInWithOtp({
          email: trimmedEmail,
          options: { shouldCreateUser: false },
        });
        if (!isCurrent()) return;
        if (otpError) throw otpError;
      } else {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(trimmedEmail);
        if (!isCurrent()) return;
        if (recoveryError) throw recoveryError;
      }
      setOtpCode('');
      setInfo(
        'A new code is on the way. Check inbox and spam — wait a minute before requesting another.',
      );
      toast.success('New code sent', `Check ${trimmedEmail}.`);
    } catch (err) {
      if (isCurrent()) setError(formatAuthError(err, 'Could not resend the code.'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  const verifying = phase === 'verify';
  const choosingPassword = phase === 'new-password';
  const trimmedEmail = email.trim();

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sakura-auth-dialog max-w-[440px] overflow-hidden border-border/80 bg-elevated p-0 shadow-2xl sm:rounded-2xl">
        <div
          className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 pb-5 pt-6"
          data-sakura-surface="auth-header"
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-accent-copper/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-sky-500/15 blur-3xl" />
          <DialogHeader className="relative z-10 gap-2">
            <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-copper/35 bg-accent-copper/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-copper">
              <Sparkles className="h-3 w-3" />
              VibeSpace Cloud
            </div>
            <DialogTitle className="text-xl text-white sm:text-2xl">
              {choosingPassword
                ? 'Choose a new password'
                : verifying
                  ? 'Enter your code'
                  : mode === 'signup'
                    ? 'Create your account'
                    : mode === 'magic'
                      ? 'Email code sign-in'
                      : mode === 'recovery'
                        ? 'Reset your password'
                        : 'Welcome back'}
            </DialogTitle>
            <DialogDescription className="text-[13.5px] leading-relaxed text-slate-300">
              {choosingPassword ? (
                'Use at least 8 characters with a letter and a number.'
              ) : verifying ? (
                <>
                  We sent a <span className="font-medium text-white">6-digit code</span> to{' '}
                  <span className="font-medium text-sky-200">{trimmedEmail}</span>. Paste it below
                  to{' '}
                  {verifyKind === 'signup'
                    ? 'finish creating your account'
                    : verifyKind === 'recovery'
                      ? 'reset your password'
                      : 'sign in'}
                  .
                </>
              ) : mode === 'signup' ? (
                'Create an account with email and password. We’ll email a one-time code so only you can activate it.'
              ) : mode === 'magic' ? (
                'No password needed. We’ll email a one-time code for this device.'
              ) : mode === 'recovery' ? (
                'We’ll email a one-time recovery code. VibeSpace never asks you to share it.'
              ) : (
                'Sign in to sync plans, billing, and workspace data across devices.'
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {!cloudReady && (
            <div
              className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
              role="status"
              data-sakura-tone="warning"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm leading-snug text-amber-100/95">
                Cloud auth is not configured in this build, so sign-in cannot reach the server.
              </p>
            </div>
          )}

          {!verifying && !choosingPassword && (
            <div
              className="grid grid-cols-3 gap-1 rounded-xl border border-border/80 bg-muted/60 p-1"
              data-sakura-surface="auth-modes"
            >
              <ModeButton
                current={mode}
                value="signin"
                onSelect={selectMode}
                icon={<KeyRound className="h-3.5 w-3.5" />}
              >
                Sign in
              </ModeButton>
              <ModeButton
                current={mode}
                value="signup"
                onSelect={selectMode}
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
              >
                Sign up
              </ModeButton>
              <ModeButton
                current={mode}
                value="magic"
                onSelect={selectMode}
                icon={<Mail className="h-3.5 w-3.5" />}
              >
                Email code
              </ModeButton>
            </div>
          )}

          {choosingPassword ? (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recovery-new-password">New password</Label>
                <Input
                  id="recovery-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recovery-confirm-password">Confirm new password</Label>
                <Input
                  id="recovery-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          ) : verifying ? (
            <div className="flex flex-col items-center gap-4 py-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/10 text-sky-300 shadow-inner">
                <Mail className="h-5 w-5" />
              </div>
              <OtpCodeInput
                value={otpCode}
                onChange={setOtpCode}
                disabled={busy}
                autoFocus
                aria-invalid={Boolean(error)}
              />
              <p className="max-w-sm text-center text-metadata leading-relaxed text-muted-foreground">
                Codes expire after one hour. You can paste all six digits at once.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-secondary"
                disabled={busy}
                onClick={() => void handleResendCode()}
              >
                Resend code
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCredentialsSubmit();
                    }
                  }}
                  disabled={busy}
                  className="h-10"
                />
              </div>

              {mode !== 'magic' && mode !== 'recovery' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCredentialsSubmit();
                      }
                    }}
                    disabled={busy}
                    className="h-10"
                  />
                  {mode === 'signup' ? (
                    <p className="text-metadata text-muted-foreground">
                      Use 8+ characters with at least one letter and one number.
                    </p>
                  ) : null}
                </div>
              )}
              {mode === 'signin' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit px-0 text-secondary"
                  disabled={busy}
                  onClick={() => selectMode('recovery')}
                >
                  Forgot password?
                </Button>
              ) : null}
            </div>
          )}

          {info && !error && (
            <div
              className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden />
              <p className="text-sm leading-snug text-sky-50/95">{info}</p>
            </div>
          )}

          {error && (
            <div
              className="flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/15 px-3 py-2.5"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm font-medium leading-snug text-foreground">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="!justify-between gap-2 border-t border-border/70 bg-muted/20 px-6 py-4 sm:!justify-between">
          {verifying || choosingPassword ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPhase(choosingPassword ? 'verify' : 'credentials');
                setOtpCode('');
                setError(null);
                setInfo(null);
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button
            variant="accent"
            className="min-w-[9.5rem]"
            onClick={() =>
              void (choosingPassword
                ? handleNewPasswordSubmit()
                : verifying
                  ? handleVerifySubmit()
                  : handleCredentialsSubmit())
            }
            disabled={
              busy ||
              !cloudReady ||
              (verifying && !isCompleteOtpCode(otpCode)) ||
              (choosingPassword && (!password || !passwordConfirmation))
            }
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Working…
              </>
            ) : choosingPassword ? (
              <>Save new password</>
            ) : verifying ? (
              <>{verifyKind === 'recovery' ? 'Verify recovery code' : 'Verify & continue'}</>
            ) : mode === 'recovery' ? (
              <>
                <Mail className="h-3.5 w-3.5" />
                Send recovery code
              </>
            ) : mode === 'magic' ? (
              <>
                <Mail className="h-3.5 w-3.5" />
                Send code
              </>
            ) : mode === 'signup' ? (
              <>Create account</>
            ) : (
              <>Sign in</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  current,
  value,
  onSelect,
  children,
  icon,
}: {
  current: Mode;
  value: Mode;
  onSelect: (m: Mode) => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-[12.5px] font-medium transition-all',
        active
          ? 'bg-elevated text-foreground shadow-sm ring-1 ring-border'
          : 'text-muted-foreground hover:bg-background/40 hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
