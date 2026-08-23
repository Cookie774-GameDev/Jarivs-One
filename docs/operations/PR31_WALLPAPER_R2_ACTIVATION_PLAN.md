# PR31 Wallpaper R2 Activation Plan

## Ownership and starting state

- Agent: `VS-CODEX-WALLPAPER-R2-ACTIVATION-20260823`
- Task: `PR31-WALLPAPER-R2-ACTIVATION`
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch: `integration/UnifiedChungus-final`
- Base HEAD: `69846d38fa0905e127b9be78e3f6b482a3a1ea5e`
- Upstream: `origin/UnifiedChungus`
- Merge/rebase/cherry-pick: none detected at preflight
- User source: `D:\Random\VibeSpace-WallpAPPERS`
- Private destination: Cloudflare R2 bucket `vibespace-wallpapers-free`, account `0127c65bfc43176539c9973d62f180fb`
- Owned source/test files are listed in `.agent-coordination.lock/VS-CODEX-WALLPAPER-R2-ACTIVATION-20260823.txt`.

## Evidence and intended architecture

- The source folder contains 23 MP4 masters totaling 949,056,156 bytes.
- The generated catalog declares the same 23 wallpapers with expected size and SHA-256 metadata.
- All 23 tiny previews and fallback images are bundled under `app/public/wallpapers`; previews are available independently of entitlement.
- The existing R2 bucket is private and initially empty.
- Supabase remains the entitlement authority. `authorize_wallpaper_download` grants full catalog access to an app admin or an eligible paid plan, and only redeemed slots to the starter/orbit tier.
- A private Cloudflare Worker will stream an R2 object only when presented with a short-lived HMAC grant issued after Supabase authorization. No R2 public domain, service-role key, API token, or signing secret is exposed to the client.
- Official references: [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), [Cloudflare R2 data access](https://developers.cloudflare.com/r2/data-access/), and [Supabase Edge Functions](https://supabase.com/docs/guides/functions).

## Acceptance criteria

1. Every local master matches its catalog size and SHA-256 before upload.
2. R2 contains exactly the intended master keys with matching object sizes and content types; the bucket stays private.
3. Anonymous/free users can see bundled preview/fallback assets but cannot obtain a full-master grant.
4. Preview video is muted, approximately one second, and plays on hover/focus rather than continuously across the grid.
5. Eligible paid plans and app admins receive a short-lived URL only after the existing server-side entitlement RPC succeeds.
6. The delivery Worker rejects missing, expired, malformed, or invalid signatures; prevents path traversal; supports HEAD and byte ranges; and streams without buffering the full MP4.
7. Errors are sanitized and no secret appears in source, logs, fixtures, commits, or responses.
8. No live/manual VibeSpace app testing is performed, per the user's explicit instruction.

## Verification matrix

| Area                       | Automated evidence                                                | Status  |
| -------------------------- | ----------------------------------------------------------------- | ------- |
| Catalog/source integrity   | 23/23 name mapping, byte size, full SHA-256; 949,056,156 bytes    | PASS    |
| Bundled preview inventory  | 23/23 preview and fallback assets                                 | PASS    |
| Hover preview behavior     | 2/2 focused component tests                                       | PASS    |
| Entitlement grant creation | 3/3 HMAC grant tests plus 21/21 existing policy/catalog tests     | PASS    |
| Worker authentication      | Valid, expired, tampered, traversal, and unsigned requests        | PASS    |
| Worker media delivery      | GET/HEAD/range headers; remote 1 KiB signed range                 | PASS    |
| Cloud deployment           | Worker check/dry-run and live deployment metadata                 | PASS    |
| R2 upload                  | 23/23 signed remote HEAD checks with exact object sizes           | PASS    |
| Supabase deployment        | 23 rows, two migrations, three active JWT-verified Edge Functions | PASS    |
| Official app manual QA     | Explicitly excluded by user                                       | NOT RUN |

## Risks and rollback

- Shared branch and worktree are active; stage and commit only the owned manifest.
- Upload/deployment may be blocked by missing Cloudflare or Supabase secret configuration. Never print or commit secrets.
- R2 object uploads are additive and can be checked before routing any production download request to them.
- Worker version deployment provides Cloudflare rollback; source commits preserve the exact implementation.
- If catalog hashes do not match, stop before uploading the mismatched object.

## Findings queue

- `F-01`: The existing preview component autoplays every tile continuously; change to hover/focus playback with reduced-motion handling.
- `F-02`: The existing Supabase function signs a Supabase Storage bucket that is not the requested R2 destination; replace only its delivery-grant step while preserving entitlement RPC behavior.
- `F-03`: Confirm live Supabase schema/functions and Cloudflare credentials before mutating either service.
- `F-04`: The legacy asset-preparation script labels a filename/size/mtime fingerprint as SHA-256 for files over 12 MiB. All 23 masters exceed or approach that path, so replace it with streaming full-content SHA-256 and publish a verified manifest/catalog migration before upload.
- `F-05`: The first remote HEAD probe returned `206` because R2 exposes resolved range metadata on HEAD even without a Range request. Fixed the Worker to emit `206` only when the request contains a Range header; regression test and remote checks pass.

## Checkpoints, commits, and release

- 2026-08-23 preflight: claimed exact non-overlapping scope at base `69846d38fa0905e127b9be78e3f6b482a3a1ea5e`; source folder and existing private bucket found; no source edit, upload, or deployment performed yet.
- 2026-08-23 implementation checkpoint: the shared branch advanced independently while this scope remained isolated. Full-byte hashing replaced the invalid large-file fingerprint shortcut. The generated catalog, activation migration, and upload manifest agree on 23 objects and 949,056,156 bytes. Bundled previews remain public and are hover-driven with reduced-motion support.
- 2026-08-23 cloud checkpoint:
  - Applied Supabase migrations `wallpaper_r2_catalog_activation` and `wallpaper_rls_performance` to project `tipeobvisjqvpbzcpckh`.
  - Deployed JWT-verified `wallpaper-catalog`, `wallpaper-download-url`, and `wallpaper-redeem-orbit`; the deployed source hashes match the owned files.
  - Deployed `vibespace-wallpaper-delivery` at `https://vibespace-wallpaper-delivery.vibespace-viper.workers.dev`; code deployment `08809a8a-54d3-4cae-9bcc-8577e5bded11`. Secret-only versions advance whenever the automated verification rotates the shared HMAC key.
  - Uploaded all 23 masters to private R2 keys under `wallpapers/<slug>/wallpaper.mp4`.
  - Rotated the HMAC key into Cloudflare and Supabase secret stores without persisting it locally. Automated signed HEAD checks verified all 23 exact sizes and a signed `bytes=0-1023` request returned `206` with 1,024 bytes. Unsigned Worker request returned `403`; unauthenticated Supabase catalog/download requests returned `401`.
  - Cloudflare's bucket-management size summary still showed its older zero-object analytics snapshot immediately after upload. Direct signed R2 binding reads, not that lagging summary, are the acceptance evidence.
- 2026-08-23 verification checkpoint:
  - Focused app/Supabase: 6 files, 26/26 tests passed under jsdom.
  - Worker: 3/3 tests, TypeScript, and Wrangler dry-run passed.
  - Upload/integrity tooling: 4/4 Node tests passed; 23 full-content hashes generated and remote objects verified.
  - Staged `gitleaks` scan: 192.04 KB scanned, no leaks.
  - Supabase advisor after the follow-up migration: no wallpaper security warnings; only expected unused-index informational notices before production traffic.
  - Repository-wide `npm run typecheck`: blocked by four pre-existing errors in concurrently owned SiYuan tests (`siyuanRlmProduction.test.ts` and `siyuanRlmRepository.test.ts`); no wallpaper file error was reported.
  - Native/manual app QA: NOT RUN, per the user's explicit instruction.
- Product commit: `33e111562d1d2ad17fe536f525a83f877b64f8c1` (`feat(wallpaper): activate private R2 masters`).
- Documentation evidence commit: `a5830c20183293a63a6b91a8516f3bc6d86963d0` (`docs(wallpaper): record R2 activation evidence`).
- Final lock release: completed; the agent-scoped lock is marked `released` after the exact product and documentation commits.
