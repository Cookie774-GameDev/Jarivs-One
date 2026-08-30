# PR #31 License Bundle

This directory is the distributable license bundle for dependencies newly
adopted by the PR #31 intelligence and Browser Agent program. Exact npm package
provenance is recorded in `../dependency-lock.json`. Native vendored-source
provenance and distribution scope are recorded in
`../ESPEAK_RS_SYS_VENDOR_DECISION.md`, `../copied-code-inventory.md`, and
`../sbom-pr31.cdx.json`.

| Component                              | License text                                                 | Additional notice                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gpt-tokenizer` 3.4.0                  | `MIT-gpt-tokenizer.txt`                                      | None in the pinned package                                                                                                                              |
| `@huggingface/tokenizers` 0.1.3        | `Apache-2.0.txt`                                             | None in the pinned package                                                                                                                              |
| `web-tree-sitter` 0.26.11              | `MIT-tree-sitter.txt`                                        | None in the pinned package                                                                                                                              |
| `@repomix/tree-sitter-wasms` 0.1.17    | `UNLICENSE.txt`                                              | None in the pinned package                                                                                                                              |
| `tree-sitter-json` 0.24.8              | `MIT-tree-sitter-json.txt`                                   | None in the pinned package                                                                                                                              |
| TypeScript / TSX grammar 0.23.2        | `MIT-tree-sitter-typescript.txt`                             | Compiled in the pinned WASM bundle                                                                                                                      |
| JavaScript / JSX grammar 0.25.0        | `MIT-tree-sitter-javascript.txt`                             | Compiled in the pinned WASM bundle                                                                                                                      |
| Rust grammar 0.24.0                    | `MIT-tree-sitter-rust.txt`                                   | Compiled in the pinned WASM bundle                                                                                                                      |
| Python grammar 0.25.0                  | `MIT-tree-sitter-python.txt`                                 | Compiled in the pinned WASM bundle                                                                                                                      |
| `@opentelemetry/api` 1.9.1             | `Apache-2.0.txt`                                             | None in the pinned package                                                                                                                              |
| `@opentelemetry/sdk-trace-base` 2.10.0 | `Apache-2.0.txt`                                             | None in the pinned package                                                                                                                              |
| `@modelcontextprotocol/sdk` 1.30.0     | `MIT-mcp-sdk.txt`                                            | None in the pinned package                                                                                                                              |
| `playwright-core` 1.61.1               | `Apache-2.0-playwright.txt`                                  | `NOTICE-playwright.txt`                                                                                                                                 |
| `@playwright/test` 1.61.1              | `Apache-2.0-playwright.txt`                                  | `NOTICE-playwright.txt`                                                                                                                                 |
| `promptfoo` 0.121.20                   | `MIT-promptfoo.txt`                                          | Development/CI only                                                                                                                                     |
| `espeak-rs-sys` 0.2.0 wrapper          | No authoritative standalone text in the pinned crate archive | Cargo metadata declares MIT; crate checksum `2d45d148019084e930df6cc3964a58c4c211342451ec5d3c328d8a6cc6b3464d`; production distribution remains blocked |
| Embedded eSpeak NG 1.52.0.1            | `GPL-3.0-or-later-espeak-ng.txt`                             | GPL-3.0-or-later source; statically linked; see `../ESPEAK_RS_SYS_VENDOR_DECISION.md`                                                                   |

The distribution packaging step must include this directory without rewriting
the texts. Dependencies that predate PR #31 remain governed by the existing
application-wide third-party notice process.
