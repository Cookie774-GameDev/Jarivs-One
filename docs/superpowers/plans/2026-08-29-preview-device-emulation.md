# Preview Device Emulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver accurate, generation-specific preview viewports with native WebView2 device metrics and shared Workbench presets.

**Architecture:** A single TypeScript catalog derives a validated emulation payload. Preview Studio sends it through the Tauri bridge, and Windows WebView2 applies logical viewport, DPR, orientation, touch, and visual scale through CDP; iframe previews reuse the catalog and logical dimensions.

**Tech Stack:** React, TypeScript, Vitest, Tauri 2, Rust, WebView2 DevTools Protocol.

**Spec:** `docs/superpowers/specs/2026-08-29-preview-device-emulation-design.md`

## Global Constraints

- Preserve all current agent changes and existing preset IDs.
- Do not use Computer Use or control the live VibeSpace app.
- Do not mutate Firebase, credentials, deployments, or production services.
- Use failing tests before production changes and commit only owned files.

---

### Task 1: Catalog and emulation contract

**Files:** Modify `app/src/features/preview/previewDevices.ts`; test `app/src/features/preview/previewDevices.test.ts`.

**Interfaces:** Produces `PreviewEmulation`, `createPreviewEmulation(...)`, and a shared picker preset list.

- [ ] Add literal tests for iPhone 13/16, iPad, laptop compatibility IDs, orientation, DPR, touch, and zoom-independent logical dimensions.
- [ ] Run `pnpm vitest run src/features/preview/previewDevices.test.ts` and observe the missing-preset/contract failure.
- [ ] Add the generation-specific catalog and pure emulation derivation with bounded numeric normalization.
- [ ] Rerun the focused test and require all cases to pass.

### Task 2: Frontend/native bridge contract

**Files:** Modify `app/src/features/preview/previewBridge.ts`, `app/src/features/preview/PreviewStudio.tsx`, and lifecycle test; create `previewBridge.test.ts`.

**Interfaces:** `previewCreate(url, bounds, emulation)` and `previewSetBounds(bounds, emulation)` invoke Tauri with the exact serializable contract.

- [ ] Add a bridge test asserting literal create/update payloads and a component regression proving selected logical dimensions survive visual zoom.
- [ ] Run the two focused tests and observe missing emulation arguments.
- [ ] Thread the derived payload through creation and every bounds/device/orientation/zoom update without changing navigation or lifecycle behavior.
- [ ] Rerun both focused tests and require all cases to pass.

### Task 3: Native WebView2 emulation

**Files:** Modify `app/src-tauri/src/preview.rs` and its in-file tests.

**Interfaces:** Rust `PreviewEmulation` validates frontend input and builds literal CDP parameters for `Emulation.setDeviceMetricsOverride` and `Emulation.setTouchEmulationEnabled`.

- [ ] Add Rust tests for valid iPhone 13 portrait/landscape parameters, visual scale separation, invalid numeric bounds, and desktop touch behavior.
- [ ] Run `cargo test preview::tests --lib` and observe missing emulation types/builders.
- [ ] Implement validation, CDP parameter builders, Windows WebView2 calls, and create/bounds reapplication; keep a truthful non-Windows fallback.
- [ ] Run the focused Rust tests and `cargo fmt --check`.

### Task 4: Shared Workbench device picker

**Files:** Modify `DevicePreviewPanel.tsx`, `EditorPanel.tsx`; create `DevicePreviewPanel.test.tsx`.

**Interfaces:** Workbench consumes the shared catalog and renders the document iframe at logical width/height with a display-only transform.

- [ ] Add a component test selecting iPhone 13 and asserting a 390 x 844 iframe plus a separately scaled wrapper.
- [ ] Run the focused test and observe the absent shared preset/failing dimensions.
- [ ] Replace duplicate picker IDs with the shared picker export and remove rounded logical-layout coupling.
- [ ] Rerun Workbench and catalog tests.

### Task 5: Verification and owned commit

**Files:** All owned paths plus append-only coordination records.

- [ ] Run focused preview/Workbench Vitest batches once, Rust preview tests, Prettier check, `cargo fmt --check`, TypeScript check, and `git diff --check`.
- [ ] Inspect exact staged paths and scan the staged diff for secrets.
- [ ] Commit only owned product/tests/docs while preserving the shared dirty ledger and every unrelated change.
- [ ] Append final results and release only `VS-CODEX-PREVIEW-DEVICE-EMULATION-20260829` ownership.
