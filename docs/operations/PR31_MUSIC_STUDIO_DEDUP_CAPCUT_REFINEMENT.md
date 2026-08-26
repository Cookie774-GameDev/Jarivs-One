# PR31 Music Studio Deduplication and CapCut Refinement

## Starting state

- Agent/task: `VS-CODEX-MUSIC-DEDUP-CAPCUT-20260825` / `PR31-MUSIC-DEDUP-CAPCUT-REFINEMENT`
- Branch/base: `integration/UnifiedChungus-final` at `1240eaa1f80d1cf1224b2df9b4a0efbe4139fda9`
- Upstream: `origin/UnifiedChungus`
- Scope: six clean Music Studio catalog/project/UI source and test files. Generated inventory, Cloudflare, audio assets, and ambient engine are excluded.

## Root-cause evidence

- The 64-object source inventory contains two `Play No Games` objects with different IDs and names but the same exact content SHA-256.
- The default mix maps every object ID directly, so byte-identical audio appears twice.
- `addCloudTrack` checks only track existence and the 100-clip capacity; it accepts the same content repeatedly.
- Restore normalizes individual clips but has no project-level content deduplication.

## Acceptance matrix

- Studio/default mix exposes every unique cloud recording once while raw delivery inventory remains truthful.
- Existing persisted cloud duplicates retain the first clip and its edits/order; unrelated cloud and local clips remain unchanged.
- Adding a cloud track whose content is already present fails without mutation.
- Timeline remains one continuous editor and gains denser CapCut-style ruler/lane/playhead/zoom presentation without creating a second page or audio engine.
- Selection, drag reorder, trim, speed, preview seek, save, loop, ambient enablement, local files, and playback remain covered.
- Commit only the claimed files after focused and adjacent verification.

## Checkpoints

### 2026-08-25 18:51 CDT — Claim and diagnosis

- Confirmed both prior Music Studio locks are released and all six source/test files are clean.
- Confirmed the exact duplicate source-content boundary and the missing project-level uniqueness guard before source edits.

### 2026-08-25 19:02 CDT — Implementation and verification

- TDD RED reproduced six missing contracts across catalog, project restore/add, and Studio rendering; the separate CapCut presentation RED reproduced the missing lane/zoom/waveform/playhead behavior.
- Raw delivery inventory remains 64 objects and unchanged. `MUSIC_STUDIO_LIBRARY` exposes 63 unique recordings by immutable SHA-256 and calculates its truthful unique byte total.
- Default creation, persisted restore, and future additions now enforce cloud content identity. Restore preserves the first duplicate clip exactly, including its order and edits; local clips are not guessed or collapsed.
- Music Studio now presents one compact dark editing timeline with an aligned clip ruler, sticky `A1` lane, deterministic per-clip waveforms, 0.65×–1.8× zoom, drag reorder, selected state, and a bounded active-clip playhead. The existing selected-song scrubber, trim, speed, preview, loop, save, ambience, and audio engine remain authoritative.
- Verification: focused TDD matrix `3 files / 13 tests` PASS; adjacent ambient matrix `8 files / 27 tests` PASS; direct Vite production build PASS (`4,981` modules). Prettier PASS. Repository typecheck reports only concurrent protected Context/SiYuan diagnostics and no owned-file diagnostic.
- Manual/native QA was not run; no app process was started.

### 2026-08-25 19:05 CDT — Product commit

- Product commit: `4f72ae89` (`feat(ambient): dedupe and refine music timeline`).
- Exact committed scope: six Music Studio source/test files plus this evidence document. Generated catalog inventory, cloud services, audio assets, ambient engine, and unrelated dirty work remained untouched.
- Release status: product scope complete and lock released. Repository-wide typecheck remains independently blocked by the recorded concurrent Context/SiYuan diagnostics.
