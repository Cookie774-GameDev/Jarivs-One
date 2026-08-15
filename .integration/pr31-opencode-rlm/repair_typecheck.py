from __future__ import annotations

from pathlib import Path


def replace_exact(path: Path, old: str, new: str, expected: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} replacement(s), found {count}: {old[:120]!r}"
        )
    path.write_text(text.replace(old, new), encoding="utf-8")


# The exact PR31 base already had two test-fixture inference errors. Keep the
# repair test-only and literal so no benchmark/news product behavior changes.
replace_exact(
    Path("app/src/features/benchmarks/benchmarkApi.test.ts"),
    "  sourceName: 'Artificial Analysis',",
    "  sourceName: 'Artificial Analysis' as const,",
)
replace_exact(
    Path("app/src/features/news/newsApi.test.ts"),
    "    const fetcher = vi.fn(async () =>",
    "    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>",
)

# Use one valid existing repository selection reason in the RLM production fixture.
replace_exact(
    Path("app/src/features/context/rlm/contextRlmProduction.test.ts"),
    "        whySelected: ['task_intent'],",
    "        whySelected: ['task_relevance'],",
)

context = Path("app/src/features/context/rlm/contextRlmProduction.ts")
replace_exact(
    context,
    """} from './pointerAuthority';
import { decideContextRoute } from './routeDecision';
""",
    """} from './pointerAuthority';
import { decideContextRoute } from './routeDecision';

type RlmInvestigationInput = Parameters<RlmInvestigationWorker['investigate']>[0];
""",
)
replace_exact(
    context,
    "    async investigate(input) {",
    "    async investigate(input: RlmInvestigationInput) {",
)
replace_exact(
    context,
    "  route: 'retrieval' | 'rlm',",
    "  route: ProductionRlmContextResult['route'],",
)

rlm_tool = Path("app/src/features/context/rlm/rlmOpenCodeTool.ts")
replace_exact(
    rlm_tool,
    "  async query(input) {",
    "  async query(input: Parameters<RlmOpenCodeToolDependencies['query']>[0]) {",
)
replace_exact(
    rlm_tool,
    "    async invoke(input) {",
    "    async invoke(input: RlmOpenCodeToolInput) {",
)

# The generic previously inferred the first literal record as the return type,
# even though merging intentionally returns the common metadata contract.
catalog = Path("app/src/lib/ai/catalog/canonicalModelCatalog.ts")
replace_exact(
    catalog,
    """export function dedupeModelMetadata<T extends SimpleModelCatalogRecord>(
  records: readonly Readonly<T>[],
): T[] {
  const byId = new Map<string, T>();
""",
    """export function dedupeModelMetadata(
  records: readonly Readonly<SimpleModelCatalogRecord>[],
): SimpleModelCatalogRecord[] {
  const byId = new Map<string, SimpleModelCatalogRecord>();
""",
)
replace_exact(
    catalog,
    "    const candidate = { ...raw, id, label: raw.label.trim() || id } as T;",
    "    const candidate: SimpleModelCatalogRecord = { ...raw, id, label: raw.label.trim() || id };",
)
replace_exact(
    catalog,
    """    byId.set(key, {
      ...loser,
      ...winner,
      variants: mergeStringVariants(current.variants, candidate.variants),
    } as T);
""",
    """    byId.set(key, {
      ...loser,
      ...winner,
      variants: mergeStringVariants(current.variants, candidate.variants),
    });
""",
)

runtime = Path("app/src/lib/ai/runtime.ts")
replace_exact(
    runtime,
    "        workspaceId: chatRecord?.workspace_id ? String(chatRecord.workspace_id) : authState.workspaceId,",
    "        workspaceId: (chatRecord?.workspace_id ? String(chatRecord.workspace_id) : authState.workspaceId) ?? undefined,",
)

sdk_test = Path("app/src/lib/harness/__tests__/OpenCodeSdkSessionClient.test.ts")
replace_exact(
    sdk_test,
    """  OpenCodeSdkSessionClient,
  type ModelControlPromptAdapter,
""",
    """  OpenCodeSdkSessionClient,
  type ModelControlPromptAdapter,
  type OpenCodeRawEvent,
""",
)
replace_exact(
    sdk_test,
    "function asyncEvents(events: readonly unknown[]) {",
    "function asyncEvents(events: readonly OpenCodeRawEvent[]) {",
)
replace_exact(
    sdk_test,
    "function fakeClient(events: readonly unknown[] = []) {",
    "function fakeClient(events: readonly OpenCodeRawEvent[] = []) {",
)

turn_test = Path("app/src/lib/harness/__tests__/OpenCodeTurnCoordinator.test.ts")
replace_exact(
    turn_test,
    "access: 'read'",
    "access: 'read-only'",
    expected=2,
)

print("Typecheck repair applied without changing production benchmark/news behavior.")
