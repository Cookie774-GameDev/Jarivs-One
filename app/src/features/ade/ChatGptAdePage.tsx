import { useUIStore } from '@/stores/ui';
import { ChatGptAdeTaskSurface } from './ChatGptAdeTaskSurface';
import {
  createProductionChatGptAdeTaskRun,
  type ChatGptAdeMissingScope,
  useProductionChatGptAdePageBinding,
} from './productionChatGptAdeBinding';

function RecoveryNotice({
  recovery,
}: {
  recovery: ReturnType<typeof useProductionChatGptAdePageBinding>['recovery'];
}) {
  if (!recovery) return null;
  const label =
    recovery.status === 'interrupted'
      ? 'Previous ADE run was interrupted. Start a new run to retry safely.'
      : `Previous ADE run ${recovery.status}.`;
  return (
    <p className="rounded-xl border border-border/60 bg-background/45 px-4 py-3 text-sm text-muted-foreground">
      {label}
    </p>
  );
}

function openProviders() {
  useUIStore.getState().setSettingsOpen(true);
  window.dispatchEvent(new CustomEvent('jarvis:settings:tab', { detail: { tab: 'providers' } }));
}

function openRoute(route: 'account' | 'chat' | 'files') {
  useUIStore.getState().setRoute(route);
}

function ScopeRecoveryActions({
  missingScope,
}: {
  missingScope: readonly ChatGptAdeMissingScope[];
}) {
  const needsAccount = missingScope.includes('account') || missingScope.includes('workspace');
  return (
    <>
      {needsAccount ? (
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => openRoute('account')}
        >
          Open account setup
        </button>
      ) : null}
      {missingScope.includes('project') ? (
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => openRoute('chat')}
        >
          Choose project
        </button>
      ) : null}
      {missingScope.includes('worktree') ? (
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => openRoute('files')}
        >
          Choose project folder
        </button>
      ) : null}
      {missingScope.includes('chat') ? (
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => openRoute('chat')}
        >
          Open chat
        </button>
      ) : null}
    </>
  );
}

export function ChatGptAdePage() {
  const binding = useProductionChatGptAdePageBinding();
  if (binding.authority.kind === 'unavailable') {
    const supportsCatalogRefresh =
      binding.authority.code === 'catalog_unavailable' ||
      binding.authority.code === 'route_unavailable';
    return (
      <main
        className="h-full overflow-auto bg-background p-6 text-foreground"
        data-ade-implementation-state="unavailable"
        data-monochrome-route="ade"
      >
        <div className="mx-auto flex min-h-full w-full max-w-4xl items-center justify-center">
          <section className="w-full rounded-2xl border border-border/70 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              VibeSpace-local agent development environment
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold">ChatGPT ADE</h1>
              <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                ADE unavailable
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {binding.authority.message}
            </p>
            <div className="mt-5">
              <RecoveryNotice recovery={binding.recovery} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {binding.authority.code === 'scope_unavailable' ? (
                <ScopeRecoveryActions missingScope={binding.authority.missingScope} />
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                  onClick={openProviders}
                >
                  Open Providers
                </button>
              )}
              {supportsCatalogRefresh ? (
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                  onClick={binding.refresh}
                >
                  Retry ADE authority
                </button>
              ) : null}
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              No provider substitution, credential entry, write tool, or unrestricted terminal
              authority is enabled here.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const authority = binding.authority;
  return (
    <section
      className="h-full overflow-auto bg-background p-6 text-foreground"
      data-ade-implementation-state="read-capable"
      data-monochrome-route="ade"
    >
      <div className="mx-auto mb-4 w-full max-w-4xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              VibeSpace-local agent development environment
            </p>
            <h1 className="mt-1 text-2xl font-semibold">ChatGPT ADE</h1>
          </div>
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Read capable
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Authenticated account · {authority.accountSource}
        </p>
        <RecoveryNotice recovery={binding.recovery} />
      </div>
      <ChatGptAdeTaskSurface
        executionIdentity={authority.executionIdentity}
        scope={authority.scope}
        accessCeiling="read"
        createRun={(draft) => createProductionChatGptAdeTaskRun(authority, draft)}
      />
    </section>
  );
}
