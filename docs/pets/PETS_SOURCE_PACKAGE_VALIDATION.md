# VibeSpace Pixel Pets source-package validation

Date: 2026-07-11

Character catalog ID: `vibespace-axolotl-pixel`

Archival manifest ID: `vibespace-axolotl-light`

Status: PASS

## Scope and provenance

The supplied package at `C:\Users\viper\Downloads\VibeSpaceOs` remains unchanged. The repository contains a byte-for-byte working-input copy: 136 layer PNGs plus 15 other supplied files. The normalized package adds only `notes.md`, `archival/source-hashes.json`, and the deterministic complete archive. The original PSD, ORA, manifest, PNG layers, reports, previews, assembly scripts, V logo, and flat reference are archival inputs and are not processing outputs.

The unrelated pre-existing deletion of `install/install.ps1` was not modified, restored, staged, or included in the package.

## Independently verified source facts

| Check | Result |
|---|---:|
| PSD signature/version/canvas | PASS — `8BPS`, version 1, 1254 × 1254 |
| PSD layer records | PASS — 182 records, 46 section dividers, 136 leaf layers, 23 groups |
| ORA required entries and safe paths | PASS |
| ORA layer/group counts | PASS — 136 leaf layers, 23 groups |
| Manifest paths and IDs | PASS — 136 unique IDs and 136 unique files |
| Layer dimensions/alpha/non-empty content | PASS |
| Pivots and layer references | PASS |
| Required anatomy underlaps | PASS — 17 present |
| Default expression | PASS — happy |
| Happy expression provenance | PASS — extracted source pixels, not reconstructed pixels |
| Guide/reference default visibility | PASS — hidden |
| V-mark mirror policy | PASS — all branding layers are non-mirrorable |
| Default-pose recomposition | PASS — exact equality to the transparent preview, zero differing pixels |
| Preview alpha | PASS — true transparency; 4,065 partial-alpha pixels retained for later classification |

## Normalization evidence

`archival/source-hashes.json` records 152 SHA-256 entries: 151 supplied files and the repository provenance note. Every copied supplied file matched its source hash at intake.

The complete archive contains 153 entries: all hash-inventoried inputs plus `source-hashes.json`. It excludes itself, contains no absolute/traversal paths, has no duplicate member names, all members can be read, and every member uses the fixed ZIP timestamp `1980-01-01 00:00:00`.

- Canonical archive: `archival/vibespace_axolotl_layered_package.zip`
- Entries: 153
- SHA-256: `b4847021b3a0952f7dfc28e8e51617003f77b9cb70f1d0c00faa87fe987fef04`
- Determinism: PASS — two consecutive builds produced the identical SHA-256 and identical bytes
- Duplicate source-content groups: 20 total (three groups of three and seventeen groups of two)

The duplicate groups are expected reuse within expression and reference layers and are enumerated in `source-package-validation.json`. No duplicate mismatch was hidden or discarded.

## Security bounds

The validator rejects path traversal, absolute or drive-qualified paths, symlink escape, unsafe ORA members, malformed/truncated PSD structures, missing required ORA entries, oversized manifests, oversized aggregate image dimensions, corrupt PNGs, duplicate manifest IDs/paths, missing files, empty layers, invalid pivots/references, count disagreement, missing underlaps, and archive/source hash mismatch. JSON and ZIP outputs use temporary sibling files, descriptor flushes, and atomic replacement.

No remote model, model cache, credential, secret, Supabase resource, Stripe resource, database, deployment, release, migration, or production data was accessed or changed.

## Reproduction

From the repository root:

```powershell
.\tools\pets\setup.ps1
.\tools\pets\build-all.ps1 -Manifest .\grok\pets\input\characters.json -Quality Best
.\tools\pets\validate-all.ps1
```

The machine-readable evidence is at `app/src/assets/pets/characters/vibespace-axolotl-pixel/qa/source-package-validation.json`.

## Warnings, remaining gates, and rollback

- The current Windows account cannot create a symlink in the pytest temporary directory, so the symlink-escape test is skipped there; traversal, absolute-path, drive-path, and normal-path cases run normally. The production check still rejects any discovered symlink.
- Partial alpha is not hardened in Phase 1. Phase 2 must classify intentional glow/shadow alpha before creating the canonical hard-alpha master.
- Native logical pixel scale is not claimed in this report; it must be detected independently in Phase 2.
- No application runtime behavior is introduced by this phase.

Rollback is file-local: remove the added `grok/pets/input`, `tools/pets`, Pet schema/report paths, and this report from the feature branch. Do not modify the external source package, and do not restore or stage the unrelated installer deletion.
