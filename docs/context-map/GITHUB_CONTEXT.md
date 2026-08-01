# GitHub Context Integration

## Overview

Context Map has a bounded GitHub repository integration foundation backed by a scoped Supabase
Edge Function proxy. The contracts use GitHub App installation authentication with RSA-signed
JWTs; no personal access tokens are stored client-side. The current Context page routes the
GitHub source card to Tools and does not itself implement the complete flow below.

Sources:

- `app/src/features/context/githubContextAuth.ts`
- `app/src/features/context/githubRepositoryCatalog.ts`
- `app/src/features/context/githubRepositoryRetrieval.ts`
- `supabase/functions/github-context/index.ts`
- `supabase/functions/_shared/githubContextProxy.ts`

## Connection-Flow Contract

| Step | ID                           | Description                           |
| ---- | ---------------------------- | ------------------------------------- |
| 1    | connect                      | User initiates GitHub connection      |
| 2    | authenticate                 | Supabase auth session verified        |
| 3    | authorize_github_app         | GitHub App installation authorized    |
| 4    | list_accessible_repositories | Catalog fetched via proxy             |
| 5    | choose_repository            | User selects repository               |
| 6    | choose_ref                   | Branch or tag selected                |
| 7    | choose_metadata_scopes       | Optional permissions selected         |
| 8    | choose_analysis_location     | local (default) or cloud              |
| 9    | create_map                   | Request reaches map creation/indexing |

These state IDs are implemented and tested as authorization/catalog contracts. They should not
be read as evidence that a production proxy deployment, real GitHub installation, or complete
Context-page wizard has been verified.

## Permissions

### Required (always requested)

| Permission | Level |
| ---------- | ----- |
| contents   | read  |
| metadata   | read  |

### Optional (user-selected)

- issues
- pull_requests
- actions
- checks
- discussions
- releases

All optional permissions are read-only.

## Proxy Architecture

The Supabase Edge Function (`supabase/functions/github-context/index.ts`):

- Authenticates requests via Supabase JWT (account-bound).
- Signs GitHub API requests using the GitHub App private key (RSA, PKCS#1 or PKCS#8).
- Restricts CORS to the explicit desktop and local-development allowlist:
  - `tauri://localhost`
  - `https://tauri.localhost`
  - `http://localhost:1420`
  - `http://localhost:5173`
- Limits upstream response size to 32 MB (`MAX_UPSTREAM_BYTES`).
- Never exposes the App private key to the client.

## Repository Catalog

The catalog (`githubRepositoryCatalog.ts`) lists installation-accessible repositories:

- The client catalog accepts at most 10,000 repository records and 120,000 decoded object nodes.
- The proxy returns at most 100 repositories per page/grant and 50,000 tree entries.
- Each entry: id, owner, name, visibility (public/private/internal).
- Installation authority is server-verified; client cannot forge installation state.

## Map Storage

GitHub-sourced maps store:

- `installationId`: GitHub App installation identifier.
- `owner` / `repository`: validated against `/^[A-Za-z0-9_.-]{1,100}$/`.
- `selectedRef`: branch or tag name.
- `resolvedCommitSha`: 40- or 64-character lowercase hex.
- `visibility`: public, private, or internal.

The Context workspace badge projection exposes bounded repository/ref/status metadata and does
not include installation authority tokens. A full repository/ref/scope selection UI is not
established by the current Context page.

## Privacy

- GitHub content is fetched through the scoped proxy; no direct GitHub API calls from client.
- Refresh signals are privacy-safe: they report map IDs and status, not content.
- Secret detection rejects a decoded blob before ingestion when protected content is detected.
- Private content is local after proxy fetch unless the user later selects an explicit,
  separately guarded cloud-analysis or document-sync path.

## Failure Modes

| Status              | Cause                                       | Resolution                                    |
| ------------------- | ------------------------------------------- | --------------------------------------------- |
| permission_required | Installation permissions revoked or changed | Re-authorize through the GitHub tool flow     |
| offline             | GitHub unreachable or proxy down            | Retry later; map retains last indexed state   |
| error               | Unexpected API failure                      | Check proxy logs; re-create map if persistent |
| stale               | Commit SHA no longer matches branch HEAD    | Run refresh to re-index at new HEAD           |
