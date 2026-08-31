# Official VibeSpace native Playwright acceptance

This deterministic Phase 0 corpus records the repository-native acceptance identity.

- The application process must be the exact worktree binary at `app/src-tauri/target/debug/jarvis.exe`.
- The accepted browser target is a descendant `msedgewebview2.exe` owned by that `jarvis.exe` process.
- Its WebView2 user-data profile must normalize to `%LOCALAPPDATA%/ai.jarvis.desktop/EBWebView`.
- The official WebView must expose CDP on loopback port `9223`, while the development renderer is served from loopback port `5173`.
- The page must be titled `VibeSpace`, have `document.readyState === "complete"`, contain `#root`, expose `window.__TAURI_INTERNALS__`, and present the public main/navigation surface.
- Ollama is prohibited for PR31 Phase 0. No `ollama` process and no listener on port `11434` may exist before attachment, during the scenario, or after it.
- Standalone Chromium, headless browser, Vite preview, and mock DOM fixtures do not count as official native evidence.

Repository authorities are the root agent policy, native acceptance harness, Tauri CDP configuration, and this architecture map.

Revision canary: the exact selected OpenCode route must hydrate this changed source into its stable SiYuan child document before the grounded Chat acceptance is considered complete.
