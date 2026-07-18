/** Admin entitlement evidence and development-only access status. */
import { Shield, Infinity, Cloud, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAppEntitlementSnapshot } from '@/lib/admin';
import { useAuthStore } from '@/stores/auth';
import { effectivePlan, entitlementSnapshotAllowsAdmin } from '@/lib/entitlements';

export function Admin() {
  const snapshot = useAppEntitlementSnapshot();
  const admin = entitlementSnapshotAllowsAdmin(snapshot);
  const plan = useAuthStore((state) => state.plan);
  const cloudUserId = useAuthStore((state) => state.cloudSession?.user_id);
  const cloudEmail = useAuthStore((state) => state.cloudSession?.email);

  if (!admin) {
    return (
      <p className="text-secondary text-muted-foreground">
        Admin tools are not available for this account.
      </p>
    );
  }

  const activePlan = effectivePlan(plan, admin);
  const serverVerified = snapshot.source === 'server';

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent-cyan" />
          <h2 className="text-ui-strong text-foreground">Admin access</h2>
          <Badge variant="outline" className="border-accent-cyan/40 text-accent-cyan">
            {serverVerified ? 'Server verified' : 'Development only'}
          </Badge>
        </div>
        <p className="mt-2 text-secondary text-muted-foreground">
          {serverVerified
            ? 'This signed-in account has current, server-authoritative admin access.'
            : 'This access comes from explicit local development configuration. It is not production authority.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-panel p-4">
        <div className="flex items-center gap-2 text-foreground">
          <Infinity className="h-4 w-4 text-accent-cyan" />
          <span className="text-ui-strong">Effective plan</span>
          <Badge>{activePlan}</Badge>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-secondary text-muted-foreground">
          <li>System voice and cloud TTS without quota blocks</li>
          <li>Phone Jarvis and hosted features per the verified entitlement</li>
          <li>Deepgram BYOK in Settings → Voice uses your own API credits</li>
        </ul>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <span className="text-ui-strong text-foreground">Entitlement authority</span>
        </div>
        <p className="text-secondary text-muted-foreground">
          Server-side admins live in the <code className="text-foreground">app_admins</code> table.
          Signed-in accounts use an authenticated server entitlement check that evaluates this list
          without exposing a client admin-query endpoint. The verified result expires after five
          minutes.
        </p>
        {cloudUserId ? (
          <p className="text-metadata text-muted-foreground">
            Signed in as {cloudEmail ?? cloudUserId}
            {serverVerified ? ' · verified by server' : ' · development access only'}
          </p>
        ) : (
          <p className="text-metadata text-muted-foreground">
            Sign in with cloud sync for server-authoritative admin verification.
          </p>
        )}
        <p className="text-metadata text-muted-foreground">
          To add someone in Supabase SQL:{' '}
          <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-foreground">
            insert into public.app_admins (user_id) select id from auth.users where email =
            &apos;you@example.com&apos;;
          </code>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="text-ui-strong text-foreground">Deepgram voice</span>
        </div>
        <p className="text-secondary text-muted-foreground">
          Paste your Deepgram API key under Settings → Voice → Deepgram. Jarvis speaks through Aura
          voices using your account credits; the key stays in the OS keychain.
        </p>
      </div>
    </div>
  );
}
