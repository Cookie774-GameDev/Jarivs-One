# Sakura regression results

Current status: production UI/effects implemented; bounded source/DOM/browser evidence passes.

| Area                                 | Result  | Evidence                                                                                                                                     |
| ------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Binding reference                    | PASS    | exact `index.html` path and SHA-256 frozen in manifest, config, fixture, and reference contract                                              |
| Reference file hashes                | PASS    | supplied package remains byte-identical for the four binding reference inputs                                                                |
| Image dimensions                     | PASS    | both PNGs measured 1440×900                                                                                                                  |
| Production theme and UI/effects      | PASS    | registry/sync, tokens, seven-layer scene, shared primitives, shell, routes, portals/overlays, and motion contracts are implemented           |
| Consolidated source contracts        | PASS    | reference, token, contrast, scene, motion, route, overlay, and harness checks green at the completion checkpoint                             |
| VoiceModal regression repair         | PASS    | protected stop/STT smoke suites pass 12/12 after deterministic reduced-motion mock repair                                                    |
| Real-app browser matrix              | PASS    | 8/8 across 1440×900 and 1024×768; 16 evidence captures for representative routes, reduced motion, forced colors, and default-theme isolation |
| Pixel diff / SSIM / Delta E          | NOT RUN | harness intentionally uses no screenshot-baseline assertion                                                                                  |
| Assistive technology / screen reader | NOT RUN | no AT session or semantic-tree audit established                                                                                             |
| Dedicated keyboard / 200% zoom       | NOT RUN | forced-colors focus semantics passed, but complete keyboard and zoom matrices were not run                                                   |
| Quantitative performance trace       | NOT RUN | architecture is bounded; CPU/GPU/frame/memory evidence remains pending                                                                       |
| Native/package smoke                 | NOT RUN | no packaged Tauri or Windows-native pass claimed                                                                                             |
| Whole-PR/full release matrix         | NOT RUN | broad app/build/Rust/release completion remains controller-owned                                                                             |

Browser evidence is real but representative. No pixel-equivalence, native,
assistive-technology, performance-trace, or whole-PR completion claim is made.
