import * as React from 'react';
import { Button } from '@/components/ui/button';
import { flushWorkspacePersistence } from '@/lib/persistence/workspaceFlush';
import { getSupabaseClient, type TypedSupabaseClient } from '@/lib/supabase/client';
import { openExternal } from '@/lib/tauri';
import { useAuthStore } from '@/stores/auth';
import { adaptAccessDecision } from './accessDecisionAdapter';
import {
  createAccessGateway,
  type AccessGateway,
  type AccessGatewayTransport,
} from './accessGateway';
import { AccessHost } from './AccessHost';
import { AccessPaywall, type PendingAction } from './AccessPaywall';
import type { AccessViewModel } from './accessViewModel';

export interface AccessAppRuntime {
  loadViewModel(signal: AbortSignal): Promise<AccessViewModel>;
  createCheckoutUrl(signal?: AbortSignal): Promise<string>;
  createPortalUrl(signal?: AbortSignal): Promise<string>;
  openExternalUrl(url: string): Promise<void>;
  signOut(): Promise<void>;
  backupLocalData(): Promise<void>;
}

export interface AccessAppHostProps {
  children: React.ReactNode;
  enabled: boolean;
  runtime: AccessAppRuntime;
  privacyUrl?: string;
  termsUrl?: string;
}

const ACCESS_LOAD_ERROR = 'Access could not be verified. Check your connection and try again.';

function safeHttpsUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 2_048) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname === '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

const noop = () => undefined;

export function AccessAppHost({
  children,
  enabled,
  runtime,
  privacyUrl,
  termsUrl,
}: AccessAppHostProps) {
  const [viewModel, setViewModel] = React.useState<AccessViewModel | null>(null);
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const actionGeneration = React.useRef(0);
  const actionController = React.useRef<AbortController | null>(null);

  React.useEffect(
    () => () => {
      actionGeneration.current += 1;
      actionController.current?.abort();
    },
    [],
  );

  const loadAccess = React.useCallback(
    async (signal: AbortSignal) => {
      const next = await runtime.loadViewModel(signal);
      if (!signal.aborted) {
        setViewModel(next);
        setActionError(null);
      }
      return next.host;
    },
    [runtime],
  );

  const runAction = React.useCallback(
    async (
      action: PendingAction,
      operation: (signal: AbortSignal) => Promise<void>,
      errorMessage: string,
      refresh?: () => void,
    ) => {
      actionController.current?.abort();
      const controller = new AbortController();
      actionController.current = controller;
      const generation = ++actionGeneration.current;
      setPendingAction(action);
      setActionError(null);
      try {
        await operation(controller.signal);
        if (!controller.signal.aborted && generation === actionGeneration.current) refresh?.();
      } catch {
        if (!controller.signal.aborted && generation === actionGeneration.current) {
          setActionError(errorMessage);
        }
      } finally {
        if (generation === actionGeneration.current) {
          actionController.current = null;
          setPendingAction(null);
        }
      }
    },
    [],
  );

  const openLegal = React.useCallback(
    (kind: 'privacy' | 'terms', configured: string | undefined) => {
      const url = safeHttpsUrl(configured);
      if (!url) {
        setActionError(
          `${kind === 'privacy' ? 'Privacy' : 'Terms'} link is not configured for this build.`,
        );
        return;
      }
      void runAction(
        null,
        () => runtime.openExternalUrl(url),
        `The ${kind} link could not be opened.`,
      );
    },
    [runAction, runtime],
  );

  if (!enabled) return <>{children}</>;

  const recoveryPaywall = (refresh: () => void, error: string | null, loading: boolean) => (
    <AccessPaywall
      displayState="unknown"
      featureTier={viewModel?.featureTier ?? 'unknown'}
      loading={loading}
      error={error}
      pendingAction={pendingAction}
      onContinue={noop}
      onSubscribe={noop}
      onManageBilling={() => {
        void runAction(
          'manage-billing',
          async (signal) => {
            const url = await runtime.createPortalUrl(signal);
            await runtime.openExternalUrl(url);
          },
          'Billing could not be opened. Please try again.',
        );
      }}
      onRestoreAccess={refresh}
      onSignOut={() => {
        void runAction(
          'sign-out',
          () => runtime.signOut(),
          'Sign out could not be completed. Please try again.',
          refresh,
        );
      }}
      onExportData={() => {
        void runAction(
          'export',
          () => runtime.backupLocalData(),
          'Local data could not be backed up. Please try again.',
        );
      }}
      onPrivacy={() => openLegal('privacy', privacyUrl)}
      onTerms={() => openLegal('terms', termsUrl)}
    />
  );

  return (
    <AccessHost
      enabled
      loadAccess={loadAccess}
      loadingFallback={({ refresh }) => recoveryPaywall(refresh, actionError, true)}
      renderError={({ refresh }) =>
        recoveryPaywall(refresh, actionError ?? ACCESS_LOAD_ERROR, false)
      }
      renderBlocked={({ snapshot, refresh }) => {
        const model = viewModel?.host.capturedAt === snapshot.capturedAt ? viewModel : null;
        const projection = model?.paywall;

        const checkout = () =>
          runAction(
            'subscribe',
            async (signal) => {
              const url = await runtime.createCheckoutUrl(signal);
              await runtime.openExternalUrl(url);
            },
            'Checkout could not be opened. Please try again.',
          );
        const paywall = (
          <AccessPaywall
            displayState={projection?.displayState ?? snapshot.displayState}
            featureTier={projection?.featureTier ?? snapshot.featureTier}
            trialDaysRemaining={projection?.trialDaysRemaining}
            trialEndDate={projection?.trialEndDate}
            graceDaysRemaining={projection?.graceDaysRemaining}
            graceEndDate={projection?.graceEndDate}
            paidThroughDate={projection?.paidThroughDate}
            error={actionError}
            pendingAction={pendingAction}
            onContinue={refresh}
            onSubscribe={() => void checkout()}
            onManageBilling={() => {
              void runAction(
                'manage-billing',
                async (signal) => {
                  const url = await runtime.createPortalUrl(signal);
                  await runtime.openExternalUrl(url);
                },
                'Billing could not be opened. Please try again.',
              );
            }}
            onRestoreAccess={() => {
              actionController.current?.abort();
              actionGeneration.current += 1;
              setPendingAction(null);
              setActionError(null);
              refresh();
            }}
            onSignOut={() => {
              void runAction(
                'sign-out',
                () => runtime.signOut(),
                'Sign out could not be completed. Please try again.',
                refresh,
              );
            }}
            onExportData={() => {
              void runAction(
                'export',
                () => runtime.backupLocalData(),
                'Local data could not be backed up. Please try again.',
              );
            }}
            onPrivacy={() => openLegal('privacy', privacyUrl)}
            onTerms={() => openLegal('terms', termsUrl)}
          />
        );

        if (!model?.checkoutNeeded || snapshot.displayState !== 'locked') return paywall;
        return (
          <>
            {paywall}
            <div className="mx-auto -mt-8 w-full max-w-lg px-4 pb-10">
              <Button
                type="button"
                variant="accent"
                size="lg"
                className="w-full"
                disabled={pendingAction !== null}
                onClick={() => void checkout()}
              >
                Subscribe to VibeSpace Access
              </Button>
            </div>
          </>
        );
      }}
    >
      {children}
    </AccessHost>
  );
}

type RpcRequest = PromiseLike<{ data: unknown; error: unknown }> & {
  abortSignal(signal: AbortSignal): RpcRequest;
};

function requireClient(): TypedSupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error('Access service is unavailable.');
  return client;
}

async function authenticatedClient(signal?: AbortSignal): Promise<TypedSupabaseClient> {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (error || !data.session?.user.id) throw new Error('Authentication is required.');
  return client;
}

function createInstalledGateway(appVersion: string): AccessGateway {
  const transport: AccessGatewayTransport = {
    async rpc(fn, params, options) {
      const client = await authenticatedClient(options?.signal);
      const transportClient = client as unknown as {
        rpc(name: string, parameters: Record<string, unknown>): RpcRequest;
      };
      let request = transportClient.rpc(fn, params);
      if (options?.signal) request = request.abortSignal(options.signal);
      return await request;
    },
    async invokeFunction(fn, options) {
      const client = await authenticatedClient(options.signal);
      return await client.functions.invoke(fn, {
        body: options.body,
        signal: options.signal,
      });
    },
  };
  return createAccessGateway({ transport, appVersion });
}

function createInstalledRuntime(featureTier: string, appVersion: string): AccessAppRuntime {
  let gateway: AccessGateway | null = null;
  const accessGateway = () => {
    gateway ??= createInstalledGateway(appVersion);
    return gateway;
  };

  return {
    async loadViewModel(signal) {
      const snapshot = await accessGateway().checkAccess(signal);
      return adaptAccessDecision(snapshot, {
        active: featureTier !== 'free',
        tier: featureTier,
      }).viewModel;
    },
    async createCheckoutUrl(signal) {
      return (await accessGateway().createCheckoutUrl(signal)).url;
    },
    async createPortalUrl(signal) {
      return (await accessGateway().createPortalUrl(signal)).url;
    },
    openExternalUrl: openExternal,
    async signOut() {
      const client = requireClient();
      const { error } = await client.auth.signOut();
      useAuthStore.setState({ cloudSession: null, plan: 'free' });
      if (error) throw new Error('Sign out failed.');
    },
    async backupLocalData() {
      const result = await flushWorkspacePersistence('access-backup');
      if (
        result.failed > 0 ||
        result.timedOut ||
        result.canvas.failed > 0 ||
        result.canvas.timedOut
      ) {
        throw new Error('Local backup failed.');
      }
    },
  };
}

type AccessBuildEnvironment = Record<string, string | undefined>;

export function isAccessGateEnabled(environment: AccessBuildEnvironment): boolean {
  return environment.VITE_ACCESS_GATE_ENABLED?.trim().toLowerCase() === 'true';
}

export function InstalledAccessAppHost({ children }: { children: React.ReactNode }) {
  const featureTier = useAuthStore((state) => state.plan);
  const environment = import.meta.env as AccessBuildEnvironment;
  const appVersion = environment.VITE_APP_VERSION?.trim() || '0.0.0';
  const runtime = React.useMemo(
    () => createInstalledRuntime(featureTier, appVersion),
    [appVersion, featureTier],
  );

  return (
    <AccessAppHost
      enabled={isAccessGateEnabled(environment)}
      runtime={runtime}
      privacyUrl={safeHttpsUrl(environment.VITE_PRIVACY_URL)}
      termsUrl={safeHttpsUrl(environment.VITE_TERMS_URL)}
    >
      {children}
    </AccessAppHost>
  );
}
