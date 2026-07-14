# VibeSpace Stability Testing Record

Date: 2026-07-14

## Verified focused results

| Area | Result |
|---|---:|
| Shared voice main/controller matrix | 24/24 passed |
| Pet settings/surface/streaming voice | 22/22 passed |
| AI runtime voice request/cancellation | 28/28 passed |
| Related VoiceService/chat routing/store/speech | 44/44 passed |
| Shared Pet chat/panel lifecycle | 25/25 passed |
| Resource router/menu/right-drag/drop payload | 19/19 passed |
| TerminalView resource/refit integration | 6/6 passed |
| Agent resource insertion + shared menu | 14/14 passed |
| NavPane Skills-row regression | 1/1 passed |
| Fleet/refit/Pet automated stress group | 28/28 passed |
| Rust library suite | 31/31 passed |
| Release-manifest suite | 1/1 passed |
| Debug `cargo check` | passed |
| Direct Vite production bundle | passed; 3,709 modules transformed |

Task 12 TypeScript checking passed before Task 13. Task 13 direct Vite production bundling passed with 3,709 modules transformed. Do not sum overlapping reruns as a unique repository total.

## Commands used for the latest slice

```powershell
npm --prefix app run test -- --run --pool=threads --maxWorkers=1 src/lib/resourceInteraction.test.ts src/lib/rightClickDrag.test.ts src/components/ui/ResourceContextMenu.test.tsx src/features/chat/dropPayload.test.ts
npm --prefix app run test -- --run --pool=threads --maxWorkers=1 src/features/terminals/TerminalView.refit.test.tsx
npm --prefix app run test -- --run --pool=threads --maxWorkers=1 src/features/agents/AgentManager.test.tsx src/components/ui/ResourceContextMenu.test.tsx
npm --prefix app run test -- --run --pool=threads --maxWorkers=1 src/components/layout/NavPane.test.tsx
Set-Location app
node ..\node_modules\vite\bin\vite.js build
```

## Warnings and failures

- One combined Vitest fork run failed before executing tests because workers timed out under process contention. Every requested file was rerun successfully with one thread worker.
- A repository-wide frontend run with one thread worker was terminated after five minutes without producing a result. It is unverified, not passed or failed.
- `npm --prefix app run build` currently stops at the untouched baseline TypeScript diagnostic in `app/src/features/context/ContextPage.tsx:930`: `PositionedContextNode` lacks required `summary`. The changed Task 13 files produced no remaining diagnostic.
- Existing Vite esbuild/oxc deprecation, dynamic-import, and large-chunk warnings remain.
- Rust library tests passed 31/31 with two existing dead-code warnings. Debug `cargo check` passed with three existing dead-code warnings.
- Release `cargo check` was terminated after five minutes without returning and is unverified.
- Repository-wide `cargo fmt --check` remains unclean across unrelated Rust files; no unrelated file was reformatted.

## Remaining final gates

- Full frontend completion, release `cargo check`, and latest-main integration checks.
- Physical fifty-cycle terminal navigation, real ten-pane Fleet reuse/cancel behavior, repeated Pet four-slot attempts, repeated real microphone ownership handoff, and interactive drag cleanup observation.
- Physical monitor scaling, real microphone permission, real installed/missing CLI cases, signed updater behavior, and synthetic-only visual capture.
