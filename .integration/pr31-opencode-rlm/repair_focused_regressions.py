from __future__ import annotations

from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one replacement, found {count}: {old[:100]!r}"
        )
    path.write_text(text.replace(old, new), encoding="utf-8")


def replace_range(path: Path, start_marker: str, end_marker: str, replacement: str) -> None:
    text = path.read_text(encoding="utf-8")
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    path.write_text(text[:start] + replacement + text[end:], encoding="utf-8")


picker = Path("app/src/lib/ai/useAccessibleChatModels.ts")
replace_once(
    picker,
    "import { useCallback, useEffect, useMemo, useState } from 'react';",
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';",
)
replace_once(
    picker,
    "  | { readonly loadedAt: number; readonly models: readonly PickerCatalogModel[] }",
    "  | { readonly generation: number; readonly loadedAt: number; readonly models: readonly PickerCatalogModel[] }",
)
replace_once(
    picker,
    "    && openCodeModelCache\n    && now - openCodeModelCache.loadedAt < OPEN_CODE_MODEL_CACHE_TTL_MS",
    "    && openCodeModelCache\n    && openCodeModelCache.generation === generation\n    && now - openCodeModelCache.loadedAt < OPEN_CODE_MODEL_CACHE_TTL_MS",
)
replace_once(
    picker,
    "        openCodeModelCache = { loadedAt, models: normalized };",
    "        openCodeModelCache = { generation, loadedAt, models: normalized };",
)
replace_once(
    picker,
    "        modeLabel: `${connection.displayName} · ${CONNECTION_MODE_LABELS[connection.mode]}`,\n",
    "        modeLabel: CONNECTION_MODE_LABELS[connection.mode],\n",
)
replace_range(
    picker,
    "  // Remove stale/unavailable duplicates",
    "\n\n  return [...groups.values()];",
    """  // Dedupe only within an exact connection+canonical-model route. Distinct
  // API/subscription routes—including unavailable sign-in rows—remain visible
  // so auth, billing, and provider identity are never silently collapsed.
  for (const group of groups.values()) {
    const uniqueByRoute = new Map<string, ModelPickerOption>();
    for (const option of group.options) {
      const modelKey = pickerCanonicalModelId(group.provider, option.modelId);
      const routeKey = `${option.connectionId ?? ''}\\u0000${modelKey}`;
      if (!uniqueByRoute.has(routeKey)) uniqueByRoute.set(routeKey, option);
    }
    const visible = [...uniqueByRoute.values()];
    const routeCounts = new Map<string, number>();
    for (const option of visible) {
      const key = pickerCanonicalModelId(group.provider, option.modelId);
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
    }
    group.options = visible.map((option) => {
      const key = pickerCanonicalModelId(group.provider, option.modelId);
      return {
        ...option,
        label: modelRouteLabel(
          option.label,
          option.connection?.displayName,
          routeCounts.get(key) ?? 1,
        ),
      };
    });
  }""",
)
replace_once(
    picker,
    """  const openCodeSessionState = readConnectionSessionPickerStates()[OPENCODE_CLI_CONNECTION.id];
  const openCodeReady =
    !offlineMode &&
    isConnectionSessionChecked(OPENCODE_CLI_CONNECTION.id) &&
    openCodeSessionState?.available === true &&
    openCodeSessionState.auth === 'authenticated';
""",
    """  const openCodeSessionState = readConnectionSessionPickerStates()[OPENCODE_CLI_CONNECTION.id];
  const openCodeSessionChecked = isConnectionSessionChecked(OPENCODE_CLI_CONNECTION.id);
  const openCodeReady =
    !offlineMode &&
    openCodeSessionChecked &&
    openCodeSessionState?.available === true &&
    openCodeSessionState.auth === 'authenticated';
  const openCodeStateSignature = [
    openCodeSessionChecked,
    openCodeSessionState?.available === true,
    openCodeSessionState?.auth ?? 'unknown',
  ].join(':');
  const openCodeStateSignatureRef = useRef(openCodeStateSignature);
  openCodeStateSignatureRef.current = openCodeStateSignature;
""",
)
replace_once(
    picker,
    """    const updateConnection = () => {
      invalidateOpenCodeModelCatalog();
      setConnectionRevision((value) => value + 1);
    };
""",
    """    const updateConnection = () => {
      const sessionState = readConnectionSessionPickerStates()[OPENCODE_CLI_CONNECTION.id];
      const nextSignature = [
        isConnectionSessionChecked(OPENCODE_CLI_CONNECTION.id),
        sessionState?.available === true,
        sessionState?.auth ?? 'unknown',
      ].join(':');
      if (nextSignature !== openCodeStateSignatureRef.current) {
        openCodeStateSignatureRef.current = nextSignature;
        invalidateOpenCodeModelCatalog();
      }
      setConnectionRevision((value) => value + 1);
    };
""",
)
replace_range(
    picker,
    "    const modernOpenCodeHealthy =",
    "    const legacy =",
    """    const pickerConnections = offlineMode
      ? PROVIDER_CONNECTIONS.filter((connection) => connection.mode === 'local')
      : PROVIDER_CONNECTIONS;
""",
)

picker_test = Path("app/src/lib/ai/useAccessibleChatModels.test.ts")
replace_once(
    picker_test,
    """  buildModelPickerGroups,
  useAccessibleChatModels,
""",
    """  buildModelPickerGroups,
  requestOpenCodeModelCatalogRefresh,
  useAccessibleChatModels,
""",
)
replace_once(
    picker_test,
    """vi.mock('./adapters/opencode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/opencode')>();
  return {
    ...actual,
    openCodeCliAdapter: Object.freeze({
      ...actual.openCodeCliAdapter,
      listModels: listOpenCodeModels,
    }),
  };
});
""",
    """vi.mock('./adapters/opencodePersistent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/opencodePersistent')>();
  return {
    ...actual,
    openCodePersistentAdapter: Object.freeze({
      ...actual.openCodePersistentAdapter,
      listModels: listOpenCodeModels,
    }),
  };
});
""",
)
replace_once(
    picker_test,
    """    listOpenCodeModels.mockResolvedValue([]);
    syncDiscoveredOllamaModels([]);
""",
    """    listOpenCodeModels.mockResolvedValue([]);
    requestOpenCodeModelCatalogRefresh();
    syncDiscoveredOllamaModels([]);
""",
)

pool = Path("app/src/lib/harness/OpenCodeSessionPool.ts")
replace_once(
    pool,
    """export function openCodeScopeKey(scope: Readonly<HarnessScope>): string {
  return JSON.stringify([
    cleanScopePart(scope.accountId, true),
    cleanScopePart(scope.workspaceId),
    cleanScopePart(scope.projectId),
    cleanScopePart(scope.worktreeId),
    cleanScopePart(scope.workingDirectory),
  ]);
}
""",
    """export function openCodeScopeKey(scope: Readonly<HarnessScope>): string {
  return JSON.stringify([
    cleanScopePart(scope.accountId, true),
    cleanScopePart(scope.workspaceId),
    cleanScopePart(scope.projectId),
    cleanScopePart(scope.worktreeId),
    cleanScopePart(scope.workingDirectory),
  ]);
}

function legacyOpenCodeScopeKeys(scope: Readonly<HarnessScope>): readonly string[] {
  return [
    JSON.stringify([
      cleanScopePart(scope.accountId, true),
      cleanScopePart(scope.projectId),
      cleanScopePart(scope.workingDirectory),
    ]),
  ];
}
""",
)
replace_once(
    pool,
    """  private readonly scopeEpoch = new Map<string, number>();
  private globalEpoch = 0;
""",
    """  private readonly scopeEpoch = new Map<string, number>();
  private readonly chatRequests = new Map<
    string,
    Promise<{
      client: OpenCodeSessionClient;
      sessionId: string;
      runtimeGeneration: string;
    }>
  >();
  private globalEpoch = 0;
""",
)
replace_once(
    pool,
    """    const persisted = await this.options.registry?.load(key, chatId);
    if (entry.disposed) throw new Error('HARNESS_SCOPE_DISPOSED');
""",
    """    const registry = this.options.registry;
    let persistedKey = key;
    let persisted = (await registry?.load(key, chatId)) ?? null;
    if (!persisted && registry) {
      for (const legacyKey of legacyOpenCodeScopeKeys(entry.scope)) {
        if (legacyKey === key) continue;
        const candidate = await registry.load(legacyKey, chatId);
        if (candidate) {
          persisted = candidate;
          persistedKey = legacyKey;
          break;
        }
      }
    }
    if (entry.disposed) throw new Error('HARNESS_SCOPE_DISPOSED');
""",
)
replace_once(
    pool,
    """        if (entry.disposed) throw new Error('HARNESS_SCOPE_DISPOSED');
        entry.sessions.set(chatId, persisted.sessionId);
        return persisted.sessionId;
""",
    """        if (entry.disposed) throw new Error('HARNESS_SCOPE_DISPOSED');
        entry.sessions.set(chatId, persisted.sessionId);
        if (registry && persistedKey !== key) {
          await registry.save(key, chatId, persisted).catch(() => undefined);
        }
        return persisted.sessionId;
""",
)
replace_range(
    pool,
    "  async sessionForChat(",
    "\n\n  async cancelChat(",
    """  async sessionForChat(scope: HarnessScope, chatId: string, title?: string): Promise<{
    client: OpenCodeSessionClient;
    sessionId: string;
    runtimeGeneration: string;
  }> {
    const cleanChatId = cleanScopePart(chatId, true);
    const key = openCodeScopeKey(scope);
    const requestKey = `${key}\\u0000${cleanChatId}`;
    let request = this.chatRequests.get(requestKey);
    if (!request) {
      request = (async () => {
        const entry = await this.ensureReady(scope);
        if (entry.disposed) throw new Error('HARNESS_SCOPE_DISPOSED');
        let sessionId = entry.sessions.get(cleanChatId);
        if (!sessionId) {
          let creating = entry.sessionStarting.get(cleanChatId);
          if (!creating) {
            creating = this.createOrRestoreSession(key, entry, cleanChatId, title)
              .finally(() => entry.sessionStarting.delete(cleanChatId));
            entry.sessionStarting.set(cleanChatId, creating);
          }
          sessionId = await creating;
        }
        entry.lastUsedAt = this.now();
        return { client: entry.client, sessionId, runtimeGeneration: entry.handle.generation };
      })().finally(() => {
        if (this.chatRequests.get(requestKey) === request) this.chatRequests.delete(requestKey);
      });
      this.chatRequests.set(requestKey, request);
    }
    return request;
  }""",
)
replace_range(
    pool,
    "  async cancelChat(",
    "\n\n  /** Crash/recovery path",
    """  async cancelChat(scope: HarnessScope, chatId: string): Promise<void> {
    const cleanChatId = cleanScopePart(chatId, true);
    const key = openCodeScopeKey(scope);
    const inFlight = this.chatRequests.get(`${key}\\u0000${cleanChatId}`);
    if (inFlight) {
      const session = await inFlight.catch(() => undefined);
      if (session) await session.client.abort(session.sessionId);
      return;
    }
    const entry = this.entries.get(key);
    if (!entry || entry.disposed) return;
    const sessionId = entry.sessions.get(cleanChatId);
    if (!sessionId) return;
    await entry.client.abort(sessionId);
  }""",
)

print("Focused OpenCode model-catalog/session repair applied.")
