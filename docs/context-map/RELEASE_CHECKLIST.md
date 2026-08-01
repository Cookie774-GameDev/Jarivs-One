# Release Checklist

## Overview

This checklist covers the verification gates for releasing Context Map changes. It applies to
the documentation set and any future product changes to the Context system.

## Pre-Release Verification

| Step              | Command                                                     | Expected               |
| ----------------- | ----------------------------------------------------------- | ---------------------- |
| TypeScript strict | `npm run typecheck`                                         | Exit 0, no errors      |
| Frontend tests    | `npm --prefix app run test`                                 | All pass               |
| Production build  | `npm run build`                                             | Exit 0                 |
| Rust compilation  | `cargo check --manifest-path app/src-tauri/Cargo.toml`      | Exit 0                 |
| Rust tests        | `cargo test --manifest-path app/src-tauri/Cargo.toml --lib` | All pass               |
| Release manifest  | `npm run test:release-manifest`                             | All pass               |
| Whitespace check  | `git diff --check`                                          | No trailing whitespace |

## Documentation Release Gates

For documentation-only changes (such as this set):

- [ ] All files exist at the expected paths.
- [ ] No unresolved placeholders (search for TODO, TBD, placeholder).
- [ ] No false parity claims (search for "exact parity").
- [ ] All repository-relative paths validated against the current tree.
- [ ] All named commands validated against package.json scripts.
- [ ] Internal Markdown links resolve locally.
- [ ] `git diff --check` passes (no whitespace errors).
- [ ] `git status --short` shows only authorized files.

## Proposed Documentation Commit Manifest

The documentation integration commit is limited to these exact paths:

```text
docs/context-map/ARCHITECTURE.md
docs/context-map/DATA_MODEL.md
docs/context-map/GITHUB_CONTEXT.md
docs/context-map/JARVIS_RETRIEVAL.md
docs/context-map/MARKDOWN_LINKS.md
docs/context-map/MIGRATION_V1_TO_V2.md
docs/context-map/PERFORMANCE.md
docs/context-map/README.md
docs/context-map/RELEASE_CHECKLIST.md
docs/context-map/SEARCH_LANGUAGE.md
docs/context-map/SECURITY.md
docs/context-map/SHELL_INTEGRATION.md
docs/context-map/TERMINAL_COMMANDS.md
docs/context-map/TEST_PLAN.md
```

## Rollback Plan

Revert only the documentation commit containing the manifest above. This package changes no
runtime code, schema, migration, or user data.

## Known Risks

| Risk                              | Mitigation                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Dexie schema or migration failure | Per-snapshot writes are transactional; retained V1 data and backups support recovery |
| Tantivy index corruption          | Damaged index is quarantined and marked for source repopulation                      |
| GitHub proxy downtime             | Proxy contracts preserve bounded failures; deployment remains separately verified    |
| Large repository performance      | Enforced bounds are documented; real-corpus timing remains unbenchmarked             |

## Environments Not Verified

- macOS and Linux (Windows-primary development).
- Real GitHub App installation (tests use mocks).
- Production Supabase deployment.
- Real AI provider responses (tests use fixtures).
- Users with existing V1 data exceeding 5 maps.

## Sign-Off

- [ ] All pre-release verification commands pass.
- [ ] Documentation gates satisfied.
- [ ] Rollback plan reviewed.
- [ ] Known risks accepted.
- [ ] Release notes drafted (if product changes included).
