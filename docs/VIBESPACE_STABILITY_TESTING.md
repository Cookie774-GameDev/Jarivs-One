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
- `npm --prefix app run build` currently stops at the untouched baseline TypeScript diagnostic in `app/src/features/context/ContextPage.tsx:930`: `PositionedContextNode` lacks required `summary`. The changed Task 13 files produced no remaining diagnostic.
- Existing Vite esbuild/oxc deprecation, dynamic-import, and large-chunk warnings remain.
- Repository-wide Rust dead-code and formatting warnings are assessed in final verification; unrelated files are not reformatted.

## Remaining final gates

- Full frontend, Rust, release-manifest, and latest-main integration checks.
- Fifty terminal navigation cycles, ten-pane Fleet reuse/cancel behavior, repeated Pet panel/four-slot behavior, repeated voice ownership handoff, and drag cleanup stress.
- Physical monitor scaling, real microphone permission, real installed/missing CLI cases, signed updater behavior, and synthetic-only visual capture.
