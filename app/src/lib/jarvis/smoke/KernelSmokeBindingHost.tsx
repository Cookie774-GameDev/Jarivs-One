import * as React from 'react';

import {
  activateKernelSmokeBinding,
  clearKernelSmokeBinding,
  getKernelSmokeDispatchPath,
  KERNEL_SMOKE_PROVIDER_ID,
  subscribeKernelSmokeDispatchPath,
  type KernelSmokeBindingEvidence,
} from '@/lib/ai/providers/kernelSmoke';
import { buildProviderCatalog } from '@/lib/ai/adapters/catalog';
import { useAuthStore } from '@/stores/auth';
import { isKernelSmokeEnabled } from './config';
import { SIK_EVIDENCE } from './evidenceIds';

type NativeSmokeBinding = Readonly<{
  nativePid: number;
  cdpPort: number;
  canonicalProfile: string;
  nonce: string;
}>;

export type KernelSmokeBindingHostProps = Readonly<{
  devBuild?: boolean;
  explicitFlag?: string;
}>;

const NATIVE_SMOKE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'sik_smoke_release_build',
  'sik_smoke_flag_disabled',
  'sik_smoke_non_loopback_host',
  'sik_smoke_invalid_port',
  'sik_smoke_port_not_bound',
  'sik_smoke_invalid_profile',
  'sik_smoke_appdata_outside_profile',
  'sik_smoke_localappdata_outside_profile',
  'sik_smoke_invalid_nonce',
  'sik_smoke_invalid_window',
]);

function safeNativeSmokeFailureCode(error: unknown): string {
  const candidate = error instanceof Error ? error.message : String(error);
  return NATIVE_SMOKE_FAILURE_CODES.has(candidate)
    ? candidate
    : 'sik_smoke_binding_invalid';
}

function isCanonicalAbsolutePath(value: string): boolean {
  return (
    value === value.trim() &&
    value.length >= 3 &&
    value.length <= 4096 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/'))
  );
}

function nativeSmokeBinding(value: unknown): NativeSmokeBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join('|') !== 'canonicalProfile|cdpPort|nativePid|nonce') return undefined;
  if (!Number.isSafeInteger(record.nativePid) || (record.nativePid as number) <= 0)
    return undefined;
  if (
    !Number.isSafeInteger(record.cdpPort) ||
    (record.cdpPort as number) < 1 ||
    (record.cdpPort as number) > 65_535
  ) {
    return undefined;
  }
  if (
    typeof record.canonicalProfile !== 'string' ||
    !isCanonicalAbsolutePath(record.canonicalProfile)
  ) {
    return undefined;
  }
  if (
    typeof record.nonce !== 'string' ||
    record.nonce.length !== 64 ||
    !/^[a-f0-9]+$/.test(record.nonce)
  ) {
    return undefined;
  }
  return {
    nativePid: record.nativePid as number,
    cdpPort: record.cdpPort as number,
    canonicalProfile: record.canonicalProfile,
    nonce: record.nonce,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function KernelSmokeBindingHost({
  devBuild = import.meta.env.DEV,
  explicitFlag = import.meta.env.VITE_SIK_SMOKE,
}: KernelSmokeBindingHostProps) {
  const enabled = isKernelSmokeEnabled({ devBuild, explicitFlag });
  const [evidence, setEvidence] = React.useState<KernelSmokeBindingEvidence>();
  const [failureCode, setFailureCode] = React.useState<string>();
  const [runtimeState, setRuntimeState] = React.useState<
    'sent' | 'running' | 'done' | 'error' | 'cancelled'
  >();
  const dispatchPath = React.useSyncExternalStore(
    subscribeKernelSmokeDispatchPath,
    getKernelSmokeDispatchPath,
    () => undefined,
  );
  const previousSelectionRef = React.useRef(useAuthStore.getState().chatModelSelection);

  React.useEffect(() => {
    setRuntimeState(undefined);
    if (!enabled) return;
    const onSend = () => setRuntimeState('sent');
    const onRunState = (event: Event) => {
      const status = (event as CustomEvent<{ status?: unknown }>).detail?.status;
      if (
        status === 'running' ||
        status === 'done' ||
        status === 'error' ||
        status === 'cancelled'
      ) {
        setRuntimeState(status);
      }
    };
    window.addEventListener('jarvis:send', onSend);
    window.addEventListener('jarvis:run-state', onRunState);
    return () => {
      window.removeEventListener('jarvis:send', onSend);
      window.removeEventListener('jarvis:run-state', onRunState);
    };
  }, [enabled]);

  React.useEffect(() => {
    let disposed = false;
    clearKernelSmokeBinding();
    setEvidence(undefined);
    setFailureCode(undefined);
    if (!enabled) return () => undefined;

    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const native = nativeSmokeBinding(await invoke('sik_smoke_binding'));
        if (disposed) return;
        if (!native) {
          setFailureCode('sik_smoke_binding_invalid');
          return;
        }
        const sanitized = Object.freeze({
          nativePid: native.nativePid,
          cdpPort: native.cdpPort,
          profileSha256: await sha256Hex(native.canonicalProfile),
          nonce: native.nonce,
        });
        if (disposed) return;
        activateKernelSmokeBinding(sanitized);
        const smokeConnection = buildProviderCatalog({ devBuild, explicitFlag }).connections.find(
          (connection) => connection.id === 'vibespace-kernel-smoke-native',
        );
        if (!smokeConnection) {
          clearKernelSmokeBinding();
          setFailureCode('sik_smoke_binding_invalid');
          return;
        }
        useAuthStore.getState().setChatModelSelection({
          mode: 'single',
          providerId: KERNEL_SMOKE_PROVIDER_ID,
          modelId: 'kernel-smoke-v1',
          connectionId: smokeConnection.id,
          connectionMode: smokeConnection.mode,
          authSource: smokeConnection.authSource,
          capabilities: smokeConnection.capabilities,
        });
        setEvidence(sanitized);
      } catch (error) {
        if (!disposed) setFailureCode(safeNativeSmokeFailureCode(error));
      }
    })();

    return () => {
      disposed = true;
      clearKernelSmokeBinding();
      const current = useAuthStore.getState().chatModelSelection;
      if (current.mode === 'single' && current.providerId === KERNEL_SMOKE_PROVIDER_ID) {
        useAuthStore.getState().setChatModelSelection(previousSelectionRef.current);
      }
    };
  }, [devBuild, enabled, explicitFlag]);

  if (!evidence) {
    return failureCode ? (
      <output
        hidden
        data-sik-evidence={SIK_EVIDENCE.smokeBindingError}
        data-error-code={failureCode}
      />
    ) : null;
  }
  return (
    <>
      <output
        hidden
        data-sik-evidence={SIK_EVIDENCE.smokeBinding}
        data-native-pid={String(evidence.nativePid)}
        data-cdp-port={String(evidence.cdpPort)}
        data-profile-sha256={evidence.profileSha256}
        data-nonce={evidence.nonce}
      />
      {dispatchPath ? (
        <output
          hidden
          data-sik-evidence={SIK_EVIDENCE.smokeDispatchKind}
          data-dispatch-kind={dispatchPath}
        />
      ) : null}
      {runtimeState ? (
        <output
          hidden
          data-sik-evidence={SIK_EVIDENCE.smokeRuntimeState}
          data-runtime-state={runtimeState}
        />
      ) : null}
    </>
  );
}
