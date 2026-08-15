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


picker = Path("app/src/lib/ai/useAccessibleChatModels.ts")
replace_once(
    picker,
    """  canonicalProviderModelId,
  dedupeModelMetadata,
""",
    """  canonicalModelId,
  canonicalProviderModelId,
  dedupeModelMetadata,
""",
)
replace_once(
    picker,
    """function asCatalogModels(
  models: readonly Readonly<{ id: string; label: string; variants?: readonly string[] }>[],
  source: ModelCatalogSource,
  lastVerifiedAt?: number,
): PickerCatalogModel[] {
  return dedupeModelMetadata(
    models.map((model) => ({
      ...model,
      source,
      ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    })),
  );
}
""",
    """function dedupeModelMetadataInOrder(
  records: readonly Readonly<PickerCatalogModel>[],
): PickerCatalogModel[] {
  const byId = new Map<string, PickerCatalogModel>();
  const order: string[] = [];
  for (const raw of records) {
    const candidate = dedupeModelMetadata([raw])[0];
    if (!candidate) continue;
    const key = canonicalModelId(candidate.id);
    const current = byId.get(key);
    if (!current) {
      order.push(key);
      byId.set(key, candidate);
      continue;
    }
    const merged = dedupeModelMetadata([current, candidate])[0];
    if (merged) byId.set(key, merged);
  }
  return order.map((key) => byId.get(key)!).filter(Boolean);
}

function asCatalogModels(
  models: readonly Readonly<{ id: string; label: string; variants?: readonly string[] }>[],
  source: ModelCatalogSource,
  lastVerifiedAt?: number,
): PickerCatalogModel[] {
  return dedupeModelMetadataInOrder(
    models.map((model) => ({
      ...model,
      source,
      ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    })),
  );
}
""",
)
replace_once(
    picker,
    """    const models = dedupeModelMetadata(
      args.modelsByConnection?.[connection.id] ??
        args.modelsByProvider[connection.providerId] ??
        [],
    );
""",
    """    const models = dedupeModelMetadataInOrder(
      args.modelsByConnection?.[connection.id] ??
        args.modelsByProvider[connection.providerId] ??
        [],
    );
""",
)

print("Stable connection model ordering repair applied.")
