export interface FoundryModelCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: 'fixture' | 'downloadable';
  readonly publisher: string;
  readonly sourceUri: string;
  readonly revision: string;
  readonly license: string;
  readonly parameterCount: number;
  readonly displaySize: string;
  readonly minimumRamBytes: number;
  readonly recommendedRamBytes: number;
  readonly format: 'fixture' | 'safetensors';
  readonly remoteCode: false;
  readonly download?: {
    readonly url: string;
    readonly expectedSha256: string;
    readonly approvedMaximumBytes: number;
  };
}

export const FOUNDRY_MODEL_CATALOG: readonly FoundryModelCatalogEntry[] = [
  {
    id: 'fixture-base', name: 'Fixture Base', kind: 'fixture', publisher: 'VibeSpace',
    sourceUri: 'fixture://models/base', revision: 'fixture-r1', license: 'Apache-2.0',
    parameterCount: 1_000_000, displaySize: '1 KB metadata', minimumRamBytes: 2_048,
    recommendedRamBytes: 2_048, format: 'fixture', remoteCode: false,
  },
  {
    id: 'smollm2-135m-instruct', name: 'SmolLM2 135M Instruct', kind: 'downloadable', publisher: 'Hugging FaceTB',
    sourceUri: 'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct',
    revision: 'a91318be21aeaf0879874faa161dcb40c68847e9', license: 'Apache-2.0',
    parameterCount: 135_000_000, displaySize: '269 MB', minimumRamBytes: 4 * 1024 ** 3,
    recommendedRamBytes: 8 * 1024 ** 3, format: 'safetensors', remoteCode: false,
    download: {
      url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/resolve/a91318be21aeaf0879874faa161dcb40c68847e9/model.safetensors',
      expectedSha256: '5af571cbf074e6d21a03528d2330792e532ca608f24ac70a143f6b369968ab8c',
      approvedMaximumBytes: 300_000_000,
    },
  },
] as const;

export function modelCompatibility(model: FoundryModelCatalogEntry, ramBytes: number | null): 'compatible' | 'constrained' | 'unknown' {
  if (model.kind === 'fixture') return 'compatible';
  if (ramBytes === null) return 'unknown';
  return ramBytes >= model.recommendedRamBytes ? 'compatible' : ramBytes >= model.minimumRamBytes ? 'constrained' : 'unknown';
}
