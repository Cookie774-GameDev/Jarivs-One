# Security and Privacy

## Overview

Context Map is local-first by design. This document describes the privacy boundaries,
security controls, and threat mitigations implemented in the current system.

## Data Residency

| Data                                        | Location                    | Leaves machine?                                |
| ------------------------------------------- | --------------------------- | ---------------------------------------------- |
| Context graph (entities, edges, provenance) | IndexedDB (Dexie)           | Excluded from generic cloud sync               |
| Full-text index                             | Native filesystem (Tantivy) | No sync path implemented                       |
| Notes, revisions, assets, and embeddings    | IndexedDB (Dexie)           | Excluded from generic cloud sync               |
| V1 legacy data and migration backups        | localStorage / IndexedDB    | No sync path implemented                       |
| GitHub content fetch                        | Supabase proxy -> local     | Crosses the proxy boundary during retrieval    |
| Approved cloud documents                    | Supabase sync queue         | Separate, explicitly guarded document boundary |

## Account Isolation

- Every record carries an `accountId` field.
- All queries are scoped by `accountId + mapId` at the repository layer.
- The native search index is filesystem-isolated per account+map scope.
- Public repository and contract operations validate account and map scope and reject conflicts.
- Note keys incorporate account identity.
- V1 migration validates the legacy account fingerprint and fails closed on a mismatch.

## Secret Detection

Source: `app/src/lib/security/secretDetector.ts`, used at protected GitHub ingestion and
cloud-document boundaries.

- Detects patterns matching API keys, tokens, and credentials.
- Decoded GitHub blobs containing detected secrets are rejected before ingestion.
- Protected cloud-sync strings fail closed when a secret or forbidden content class is detected.
- Secret detection is a defense-in-depth measure; it does not guarantee detection of all
  secret formats.

## GitHub Proxy Security

- The GitHub App private key exists only server-side (Supabase Edge Function).
- Client requests are authenticated via Supabase JWT (account-bound).
- CORS is restricted to the two Tauri origins and localhost ports 1420/5173 used by development.
- Upstream response size limited to 32 MB.
- Installation authority is server-verified; client cannot forge installation state.
- No personal access tokens are stored client-side.

## Input Validation

All user-facing inputs are validated at contract boundaries:

- IDs: strict pattern, max 200 characters.
- Text fields: length bounds, control character rejection.
- GitHub names: `/^[A-Za-z0-9_.-]{1,100}$/`.
- GitHub SHAs: exactly 40 or 64 hex characters.
- Prototype pollution guards: only plain Object/null prototypes accepted.
- Query language: metacharacter rejection, depth limits, token limits.

## Bounded Resource Usage

| Resource                          | Bound       |
| --------------------------------- | ----------- |
| Search index writer memory        | 50 MB       |
| Concurrent index workers          | 4           |
| Max document body                 | 1 MB        |
| Max mutation batch                | 64 MB       |
| Native search query length        | 1,024 bytes |
| Max results                       | 100         |
| Max active maps                   | 5           |
| Proxy repositories per page/grant | 100         |
| Client repository catalog records | 10,000      |
| Proxy tree entries                | 50,000      |
| Client catalog parse nodes        | 120,000     |

## Activity Signal Privacy

Exportable cloud activity telemetry contains only account-scoped event identity, kind, time,
disposition, and an optional item count. It excludes source text, search queries, map/source
IDs, and paths. Local activity may retain a path only when the local preference explicitly
enables it.

## Threat Model Summary

| Threat                                      | Mitigation                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Cross-account data leak                     | Structural accountId scoping at every layer                             |
| Secret exposure across protected boundaries | Shared detector with fail-closed rejection                              |
| GitHub token theft                          | Server-side only; no client storage                                     |
| Index corruption                            | Tantivy open/schema validation, quarantine, rebuild markers, file locks |
| Prototype pollution                         | Plain-object guards at parse boundaries                                 |
| Query injection                             | AST parser with strict grammar; no eval                                 |
| Unbounded resource use                      | Hard caps on all input dimensions                                       |
| Stale/corrupt migration data                | Quarantine + backup + recovery options                                  |

## What Is NOT Implemented

- End-to-end encryption of local storage (relies on OS-level disk encryption).
- Network-level encryption between proxy and GitHub (relies on HTTPS).
- Formal security audit or penetration test.
- Content signing or an application-level checksum scheme beyond Tantivy open/schema validation.
