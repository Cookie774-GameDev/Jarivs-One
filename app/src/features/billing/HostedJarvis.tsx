import { CreditCard, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Legacy settings surface kept as a safe bridge for older routes.
 *
 * Live subscriptions are managed only through Settings -> Plans, where
 * checkout is created by the signed-in Supabase Edge Function. This component
 * intentionally does not open static Stripe links or write profile tiers.
 */
export function HostedJarvis() {
  const openPlans = () => {
    window.dispatchEvent(
      new CustomEvent('jarvis:settings:tab', { detail: { tab: 'plans' } }),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-ui-strong">
          <ShieldCheck className="h-4 w-4 text-accent-cyan" />
          Hosted billing is managed in Plans
        </CardTitle>
        <CardDescription>
          VibeSpace creates checkout sessions from the signed-in account so
          Stripe subscriptions map back to Supabase securely.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="accent" size="sm" onClick={openPlans}>
          <CreditCard className="h-3.5 w-3.5" />
          Open Plans
        </Button>
      </CardContent>
    </Card>
  );
}
