# PR31 Luna effort and Ultra polish coordination

## 2026-08-22 — claim

- Agent/task: `VS-CODEX-EFFORT-ULTRA-LUNA-20260822` / `PR31-LUNA-EFFORT-ULTRA-POLISH`.
- Branch/base: `integration/UnifiedChungus-final` at `fc16ca23`; shared dirty work preserved.
- Exact boundary: model-specific effort validation, model-picker effort ordering/visuals, and focused tests. Provider discovery, authentication, exact route identity, credentials, and unrelated Composer changes are excluded.
- Existing controller-owned native picker actionability regression in the smoke test is preserved and will be verified with this slice.
- Scope extension: only the small selected-effort badge inside the existing Composer model trigger is included so the committed effort remains visibly anchored to the text box. All other Composer diffs remain preserved and excluded.

## 2026-08-22 — verified implementation checkpoint

- GPT-5.6 Luna rejects Ultra while retaining Auto, Minimal, Low, Medium, High, and Max; eligible models render Ultra last. Selection remains atomic through the existing model-then-effort boundary.
- The effort surface now uses a purpose-built Ultra sigil, inward root animation, selected-row glow, and a compact committed-effort badge beside the model trigger. Every new animation is disabled under `prefers-reduced-motion`.
- Catalog rendering is bounded: only the selected provider starts expanded, collapsed model rows are not mounted, and search temporarily spans all providers without mutating collapse state.
- Automated verification: `modelVariants`, `reasoningControls`, picker smoke, and Composer effort-badge suites passed 40/40.
- Official native-WebView proof: attached Playwright to VibeSpace PID 34600 (`D:\VibeSpace-CargoTarget-20260822\debug\jarvis.exe`, official `ai.jarvis.desktop` WebView profile). The real picker became visible in 336 ms, showed provider headings, mounted only two rows for the one expanded provider, and exposed the accessible `Search providers and models` input. No provider, model, credential, or message was changed during this check.
