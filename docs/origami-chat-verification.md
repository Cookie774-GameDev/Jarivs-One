# Origami Chat Verification Report

This is a machine-checked verification report for the Origami Chat reconstruction.
Every required final-report field carries an explicit `VERIFIED` or `PENDING_EVIDENCE` status.
`VERIFIED` means the claim is bound to accepted tracked metadata or a coordinator-verified local
receipt whose SHA-256 and required values the companion checker
`scripts/visual-chat/verification-doc.test.mjs` re-derives and matches. `PENDING_EVIDENCE` is reserved
for a field that lacks such evidence. Every required field below is now evidence-bound. This status
does not mean the target thresholds were all reached, does not attest pixel-perfect fidelity, and does
not claim completion or acceptance of PR #30.

## Report Status

- Overall Status: FINAL
- Status Date: 2026-07-29
- Queue Task: VS-PR30-SOL-ORIGAMI-VERIFICATION-DOC-20260729-040
- Requirement IDs: ORIGAMI-389 through ORIGAMI-405
- Pixel-Perfect Claim: NOT_MADE
- Live-Service / GitHub Mutation: NONE_PERFORMED

The Overall Status is `FINAL` because every required report field is `VERIFIED` against the evidence
listed below and the machine-bound comparison remains valid. `FINAL` applies only to this verification
report. It is not a pixel-perfect claim and is not a statement that PR #30 is complete or accepted.

## Evidence Provenance

- Repository: VibeSpace
- Worktree: .worktrees/shared-intelligence-kernel-design-20260716
- Branch: codex/shared-intelligence-kernel-design-20260716
- Accepted evidence commit: e71cb480cbbcfccdbc5cd2d7f772fb6a8ca4a774
- Baseline source commit: 8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696
- Origami scope commit: 30600cd4940b424a513f4b997f3cfca433a8f32b
- Route under test: Chat

All measured visual bindings below resolve to the accepted evidence commit and the dependency-produced
`tests/visual/chat/final-metadata.json` contract. The checker proves that the accepted evidence commit
contains the exact current pass ledger and that final metadata re-derives from that ledger. Supporting
tracked inputs include `tests/visual/chat/baseline-metadata.json`,
`tests/visual/chat/asset-manifest.json`, `tests/visual/chat/reference/reference-integrity.json`,
`tests/visual/chat/reference/reference-spec.json`, and `tests/visual/chat/reference/design-tokens.json`.

The coordinator-verified final evidence inputs are:

- `tests/visual/chat/final-metadata.json`, SHA-256
  99ccb5c6e13af5a172fa4c0d61e136cd56a0631f4596c6787a0d96e4e487a40c.
- `tests/visual/chat/scope-allowlist.json`, SHA-256
  80c0699c1c446e9500b5fdbfc574b2cb30e3c35583682e5b2190c448b02fa596.
- `tests/visual/chat/live-verification-evidence.json`, SHA-256
  a86b1fad4b93b2d059a46f025f98d288cd258e87fe12d5209ead0c7837c0bb26.
- `.artifacts/origami-chat/pass-012-assistant-spacing/chat.png`, SHA-256
  2f5a34cdbb8b1f1b54f523f13db3f2864acf67a392b02561cca65fe1c6cb9582.
- `.artifacts/origami-chat/origami-final-interaction-20260729-i.receipt.json`, SHA-256
  727ccb81dd975243f5f92af6eed802350410615a77343c6c7fb637797b67a826.
- `.artifacts/origami-chat/origami-final-nonchat-20260729-g.receipt.json`, SHA-256
  86f29a6c7aa937460aafb46d67adfd5146a3344d1f7158ece8def93cc2737090.

Captured screenshots, comparison reports, diff images, and overlay images are written beneath
`.artifacts/origami-chat/`, which is git-ignored (`.gitignore` entry `.artifacts/origami-chat/`). Those
binary artifacts are local-only working evidence and are not present in a clean clone. Their accepted
SHA-256 digests and required live-interaction/non-Chat facts are preserved in the tracked
`live-verification-evidence.json` record; when local artifacts are present, the checker additionally
re-hashes and compares them to that record.

The accepted `tests/visual/chat/pass-ledger.json` contains the complete measured pass sequence and its
reassessment. The final-metadata producer selects the last accepted pass and copies its values and
evidence digests. The checker independently re-derives the ledger hash, decision counts, accepted pass,
baseline, viewport, scores, regions, and evidence digests.

## Machine-Bound Baseline

The checker parses the following JSON block and asserts it equals the committed `baseline-metadata.json`
values and the committed pass-ledger baseline evidence. These are stable baseline facts, not final results.

```json
{
  "sourceCommit": "8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696",
  "origamiCommit": "30600cd4940b424a513f4b997f3cfca433a8f32b",
  "route": "Chat",
  "viewport": {
    "width": 1672,
    "height": 941,
    "deviceScaleFactor": 1,
    "browserZoomPercent": 100
  },
  "referenceTargetSha256": "1f61e223d6db54d9f32de4c3de8c98ff3028556b579b1f6a69b5317d35e8fe27",
  "fixtureSha256": "4db0e6aafcc439be18b5103d135bdd2e79d6f26976b04eb0c9c57e2225fd72fc",
  "screenshotSha256": "e4b9696d2ad87e552800673f8fafacf822dc21a372016d1b6ef3aa0e384da877",
  "reportSha256": "6829814f494b704df0f85694defc4d4e1d979518cda1c18dc6398d69f7acc58f",
  "diffSha256": "ab665e69a5f0b2f29eb91d87162fac9edd2b5282a4b32d32d4c89c456496d3ed",
  "overlaySha256": "807e6894efc9303c422ce90c06b1672a0382361b4f977bd3d0ec540eb383ed25",
  "fullDiff": 0.3409084553234114,
  "weightedDiff": 0.3837766819429744,
  "regions": {
    "assistant_message": 0.1764074844074844,
    "composer": 0.33595553859364563,
    "header_full": 0.4747076023391813,
    "jarvis_module": 0.5083234244946492,
    "lower_right_flower": 0.606341252861915,
    "paper_closeup": 0.18854166666666666,
    "session_panel": 0.1473036961668656,
    "sidebar_full": 0.4662217567167162,
    "top_ribbon": 0.5596790271132377,
    "upper_left_crane": 0.745991847826087,
    "user_bubble": 0.4390808823529412
  }
}
```

## Machine-Bound Final Metadata

The checker parses this dependency-produced contract and asserts exact equality with
`tests/visual/chat/final-metadata.json`. It also independently hashes the accepted ledger and derives
the decision counts and final accepted pass from that ledger.

```json
{
  "schemaVersion": 1,
  "referenceTargetSha256": "1f61e223d6db54d9f32de4c3de8c98ff3028556b579b1f6a69b5317d35e8fe27",
  "passLedgerSha256": "5458a21b861a22780c85e0df57f3ed1911e3452069ec15cefcc6214df93df005",
  "passCount": 12,
  "keptPassCount": 7,
  "rejectedPassCount": 5,
  "baseline": {
    "revision": {
      "kind": "commit",
      "value": "8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696"
    },
    "fullDiff": 0.3409084553234114,
    "weightedDiff": 0.3837766819429744,
    "regions": {
      "assistant_message": 0.1764074844074844,
      "composer": 0.33595553859364563,
      "header_full": 0.4747076023391813,
      "jarvis_module": 0.5083234244946492,
      "lower_right_flower": 0.606341252861915,
      "paper_closeup": 0.18854166666666666,
      "session_panel": 0.1473036961668656,
      "sidebar_full": 0.4662217567167162,
      "top_ribbon": 0.5596790271132377,
      "upper_left_crane": 0.745991847826087,
      "user_bubble": 0.4390808823529412
    },
    "evidence": {
      "screenshotSha256": "e4b9696d2ad87e552800673f8fafacf822dc21a372016d1b6ef3aa0e384da877",
      "reportSha256": "6829814f494b704df0f85694defc4d4e1d979518cda1c18dc6398d69f7acc58f",
      "diffSha256": "ab665e69a5f0b2f29eb91d87162fac9edd2b5282a4b32d32d4c89c456496d3ed",
      "overlaySha256": "807e6894efc9303c422ce90c06b1672a0382361b4f977bd3d0ec540eb383ed25"
    }
  },
  "final": {
    "revision": {
      "kind": "working-tree",
      "value": "working-tree:c7ee2b4-assistant-spacing"
    },
    "route": "http://127.0.0.1:4173/chat",
    "viewport": {
      "width": 1672,
      "height": 941,
      "deviceScaleFactor": 1,
      "browserZoomPercent": 100
    },
    "fullDiff": 0.1730464638555136,
    "weightedDiff": 0.21474362955816892,
    "regions": {
      "assistant_message": 0.12357172557172558,
      "composer": 0.22339948478198646,
      "header_full": 0.21460216197058302,
      "jarvis_module": 0.2844034879112168,
      "lower_right_flower": 0.2661487069774425,
      "paper_closeup": 0.06549479166666666,
      "session_panel": 0.12961531688418415,
      "sidebar_full": 0.2902779021933119,
      "top_ribbon": 0.13865629984051037,
      "upper_left_crane": 0.5811141304347827,
      "user_bubble": 0.1745955882352941
    },
    "evidence": {
      "screenshotSha256": "2f5a34cdbb8b1f1b54f523f13db3f2864acf67a392b02561cca65fe1c6cb9582",
      "reportSha256": "c532391934fb0102be3ebc6cda45075daad7352adb0eb61bd81ff2e18431cae2",
      "diffSha256": "cf5a64b896af02389bd38cfe8e9075714f0f64f740944ca6c273fa1ceeedda80",
      "overlaySha256": "be0e87b6ccf0a3e81f612447b31dd4eaabab57b9eba6d1bd1d757cef85ec5f01"
    }
  }
}
```

## Required Final-Report Fields

### Baseline Full-Page Diff Ratio

- Status: VERIFIED
- Evidence: Bound to `baseline-metadata.json` `scores.fullDiffRatio` and the committed pass-ledger `baseline.fullDiff` in the Machine-Bound Baseline block above.

### Baseline Weighted Diff Ratio

- Status: VERIFIED
- Evidence: Bound to `baseline-metadata.json` `scores.weightedDiffRatio` and the committed pass-ledger `baseline.weightedDiff` in the Machine-Bound Baseline block above.

### Baseline Per-Region Diff Table

- Status: VERIFIED
- Evidence: Bound to `baseline-metadata.json` `scores.regions`; the checker asserts the table below matches every region name and value exactly.

| Region             | Baseline Diff Ratio |
| ------------------ | ------------------- |
| assistant_message  | 0.1764074844074844  |
| composer           | 0.33595553859364563 |
| header_full        | 0.4747076023391813  |
| jarvis_module      | 0.5083234244946492  |
| lower_right_flower | 0.606341252861915   |
| paper_closeup      | 0.18854166666666666 |
| session_panel      | 0.1473036961668656  |
| sidebar_full       | 0.4662217567167162  |
| top_ribbon         | 0.5596790271132377  |
| upper_left_crane   | 0.745991847826087   |
| user_bubble        | 0.4390808823529412  |

### Baseline Evidence Hashes

- Status: VERIFIED
- Evidence: Baseline screenshot SHA-256 e4b9696d2ad87e552800673f8fafacf822dc21a372016d1b6ef3aa0e384da877 and report SHA-256 6829814f494b704df0f85694defc4d4e1d979518cda1c18dc6398d69f7acc58f are bound from `baseline-metadata.json`.
- Evidence: Baseline diff SHA-256 ab665e69a5f0b2f29eb91d87162fac9edd2b5282a4b32d32d4c89c456496d3ed and overlay SHA-256 807e6894efc9303c422ce90c06b1672a0382361b4f977bd3d0ec540eb383ed25 are bound from the committed pass-ledger `baseline.evidence`.
- Evidence: The referenced binary artifacts live beneath the git-ignored `.artifacts/origami-chat/` path and are local-only; only these digests are committed.

### Reference Target And Contract Integrity

- Status: VERIFIED
- Evidence: The visual source of truth `tests/visual/chat/reference/target-chat.png` has SHA-256 1f61e223d6db54d9f32de4c3de8c98ff3028556b579b1f6a69b5317d35e8fe27, which equals `baseline-metadata.json` `referenceTargetSha256` and `asset-manifest.json` `source.target_sha256`.
- Evidence: The committed `reference/reference-integrity.json` lists 16 SHA-256 entries; the checker confirms every hash cited in this report is drawn from committed evidence files.
- Evidence: The reference specification SHA-256 is 75fcdbcf034b02ff3daf45abcc48efffb83cdc4fe963b52e22d6a1deec8a59c4 and the reference asset-manifest SHA-256 is e560d4e4d226d36b2fcef31943f8ca3dd456453eed9467fe38b4fcec96836f37.

### Locked Design Specification

- Status: VERIFIED
- Evidence: The locked design specification `tests/visual/chat/reference/DESIGN.md` has SHA-256 17208f33a053833e0a79d2c1ce24d857f7898a305c42626f39da407b2f8f9d00.
- Evidence: That committed specification scopes the treatment to the default Chat page only and enumerates non-goals for every other route.

### Design Tokens

- Status: VERIFIED
- Evidence: The committed `tests/visual/chat/reference/design-tokens.json` has SHA-256 c615406e0481c12dca4ddbf22635f0782f78242ff50900c360ecd9c8005aa6a4 and records the sampled palette, material ranges, and reference geometry.

### Files Changed

- Status: VERIFIED
- Evidence: `tests/visual/chat/scope-allowlist.json` has SHA-256
  80c0699c1c446e9500b5fdbfc574b2cb30e3c35583682e5b2190c448b02fa596 and records 71 approved paths,
  57 approved selectors, and 11 approved assets. The checker re-hashes the file, confirms every
  selector begins with the exact VibeSpace Workspace Chat gate, and derives this exact production
  inventory:
  - `app/public/assets/origami-chat/bottom-mountains.svg`
  - `app/public/assets/origami-chat/crane.webp`
  - `app/public/assets/origami-chat/jarvis-frame-9slice.webp`
  - `app/public/assets/origami-chat/left-foliage.webp`
  - `app/public/assets/origami-chat/panel-9slice.webp`
  - `app/public/assets/origami-chat/paper-base.webp`
  - `app/public/assets/origami-chat/paper-grain.webp`
  - `app/public/assets/origami-chat/right-flower.webp`
  - `app/public/assets/origami-chat/sidebar-active-row-9slice.webp`
  - `app/public/assets/origami-chat/sidebar-row-9slice.webp`
  - `app/public/assets/origami-chat/top-ribbon.svg`
  - `app/src/features/chat/ChatView.tsx`
  - `app/src/features/chat/OrigamiChatDecor.tsx`
  - `app/src/main.tsx`
  - `app/src/styles/origami-chat.css`
  - `app/src/styles/vibespace-theme.css`

### Files And Assets Inventory

- Status: VERIFIED
- Evidence: The committed `tests/visual/chat/asset-manifest.json` inventories 11 assets, and all 11 files are tracked at `app/public/assets/origami-chat/`.
- Evidence: Asset manifest policy is `full_target_as_asset:false`, `live_text_and_icons_in_assets:false`, `remote_sources:false`, `workbench_only:true`.
- Evidence: Asset SHA-256 digests: bottom-mountains.svg 9eb04326d8cced64672416805d72c698aa2d1604f330b086670d22e93dc681be; crane.webp 720c30d13f5cac1ef2a602e9d00f62be0afae1db3b58218fa5d3cf01b149e463; jarvis-frame-9slice.webp 97d436a77cdba973e920da20c981735a2c2cb107d4eb5bb68be514539b9e1d34; left-foliage.webp db4e7a930b222fe87107b4ae14da314ab128a105b129054fcd70fd16038fff38; panel-9slice.webp f6d9b542b998c91310b2e90ccc1c0e0d8221ecaed6cd4607ef83272c273a996f; paper-base.webp b84f66e1d2b41c32fb1e3c5d8473e186ef695819d19af808108252586112a744; paper-grain.webp e45f116c38b17d9d013328a47b62599124b6df07b47a0906c6dae11f81fdac0b; right-flower.webp 1eaa911257fb7ca229d9d42633a870b486609d0a326db7f013de1fe80e0e6856; sidebar-active-row-9slice.webp 012705e53175fa3db82902becec7c6d670f540570d7e614f4dca28233b241856; sidebar-row-9slice.webp f843923ff424bda83ff2e077e70379f6be7e2affb94251c6f233523c2f00498d; top-ribbon.svg fb06b4ab248e2fcb7e1a3233002bac4cdd359ea9d8ceb0a6f9a2475a92bdc442.

### Tool Accountability

- Status: VERIFIED
- Evidence: Open Design disposition: no Open Design service mutation is evidenced; the design authority is the locked local `DESIGN.md` and the local `target-chat.png` reference.
- Evidence: Image-generation disposition: the asset manifest records that `crane.webp` and `right-flower.webp` used an image-generation segmentation guide only to select already-locked reference pixels; the committed asset bytes are exact locked-pixel extracts, not generated content.
- Evidence: Remote-source disposition: `asset-manifest.json` policy sets `remote_sources:false`; no remote image URL or network-fetched asset is used.

### GitHub And Live-Service Disposition

- Status: VERIFIED
- Evidence: Live-Service / GitHub Mutation: NONE_PERFORMED.
- Evidence: This Origami verification slice performed no GitHub or pull-request mutation and did not push or update existing PR #30; no CI check was run; no Supabase, Stripe, deployment, or other live service was mutated.
- Evidence: All evidence is local committed repository content; remote connectors were used read-only at most.

### Chat-Only Scope

- Status: VERIFIED
- Evidence: The locked `DESIGN.md` (SHA-256 17208f33a053833e0a79d2c1ce24d857f7898a305c42626f39da407b2f8f9d00) declares the treatment applies to the default Chat page only and lists every other route as a non-goal.
- Evidence: The exact path/selector/asset range proof is
  `tests/visual/chat/scope-allowlist.json`, SHA-256
  80c0699c1c446e9500b5fdbfc574b2cb30e3c35583682e5b2190c448b02fa596. The checker validates the
  exact inventory and proves every approved selector is beneath
  `html[data-theme='vibespace'] body:has(main[aria-label='Workspace'] [data-vibespace-page='chat'])`.
- Evidence: The real non-Chat execution receipt is independently bound under Other-Route Appearance.

### Measured Pass Ledger

- Status: VERIFIED
- Evidence: The Machine-Bound Final Metadata block records the ledger digest, total pass count, kept
  count, and rejected count. The checker derives each value from the accepted ledger rather than trusting
  this prose.
- Evidence: The checker proves the final accepted result is the last kept ledger pass and that the
  maximum-pass reassessment names that accepted pass.

### Canonical Viewport And Geometry

- Status: VERIFIED
- Evidence: Bound to `baseline-metadata.json` `viewport` and `reference/reference-spec.json`: width 1672, height 941, device scale factor 1, browser zoom 100 percent.
- Evidence: The reference specification records 11 diagnostic regions plus a full-page aggregate; acceptance guardrail thresholds are full-page 0.16, layout region 0.1, and major region 0.18, with a maximum of 12 passes before reassessment.

### Functional Smoke Tests

- Status: VERIFIED
- Evidence: The coordinator-verified real Edge receipt
  `.artifacts/origami-chat/origami-final-interaction-20260729-i.receipt.json` has SHA-256
  727ccb81dd975243f5f92af6eed802350410615a77343c6c7fb637797b67a826.
- Evidence: The checker requires live Chat/session/composer/thread structure; live message rendering;
  editable input; model selector and Agent Mode open/close; send enablement; Ctrl+Enter and send-button
  submissions; session expand/restore; sidebar, project, and chat controls; dictation availability;
  focus across composer, model selector, Agent Mode, send, dictation, Jarvis opener, session expand,
  navigation toggle, project creation, and chat creation; reduced-motion behavior; Jarvis open/close,
  Command Center expansion, and transcript presence; and zero unexpected page errors.

### Other-Route Appearance

- Status: VERIFIED
- Evidence: The coordinator-verified real Edge receipt
  `.artifacts/origami-chat/origami-final-nonchat-20260729-g.receipt.json` has SHA-256
  86f29a6c7aa937460aafb46d67adfd5146a3344d1f7158ece8def93cc2737090.
- Evidence: All six captured cases report the exact Chat gate inactive:
  `schedule-vibespace` (Schedule under VibeSpace), `terminal-vibespace` (Terminals under VibeSpace),
  `settings-appearance-vibespace` (Settings Appearance over Terminals under VibeSpace), `chat-default`
  (default Chat), `chat-jarvis` (Jarvis Chat), and `chat-monochrome` (MonoChrome Chat). The checker
  rejects a missing case, changed route/theme identity, uncaptured case, or active Chat gate.

### Final Full-Page Diff Ratio

- Status: VERIFIED
- Evidence: The coordinator-verified final comparison full-page ratio is 0.17304709944119306.
- Evidence: The Machine-Bound Final Metadata block preserves the pass-ledger lineage value separately.
  The checker accepts both explicit evidence values and does not silently substitute one for the other.

### Final Weighted Diff Ratio

- Status: VERIFIED
- Evidence: The coordinator-verified final comparison weighted ratio is 0.21474210831767848.
- Evidence: The Machine-Bound Final Metadata block preserves the pass-ledger lineage value separately.
  The checker accepts both explicit evidence values and does not silently substitute one for the other.

### Final Per-Region Diff Table

- Status: VERIFIED
- Evidence: Bound to `final-metadata.json` `final.regions` in the Machine-Bound Final Metadata block.
  The checker independently matches the complete region map to the last accepted ledger pass.

### Final Pass Count

- Status: VERIFIED
- Evidence: Bound to the pass, kept, and rejected counts in the Machine-Bound Final Metadata block.
  The checker derives all three counts directly from the accepted ledger.

### Final Screenshot Path

- Status: VERIFIED
- Evidence: The final screenshot is
  `.artifacts/origami-chat/pass-012-assistant-spacing/chat.png`, SHA-256
  2f5a34cdbb8b1f1b54f523f13db3f2864acf67a392b02561cca65fe1c6cb9582. The checker hashes the local
  file and matches the digest to `final-metadata.json` `final.evidence.screenshotSha256`.

### Final Visible Mismatches

- Status: VERIFIED
- Evidence: The coordinator-verified human review records these remaining visible mismatch groups:
  header/Jarvis positioning; sidebar/foliage overlap; pet covering upper-left crane;
  typography/assistant layout; composer/session alignment; flower/crane scale/placement.
- Evidence: These limitations are retained because the target thresholds were not all met. They prevent
  the final report status from being misread as a pixel-perfect fidelity claim.

### Pixel-Perfect Attestation

- Status: VERIFIED
- Evidence: Pixel-Perfect Claim: NOT_MADE.
- Evidence: This report makes no pixel-perfect claim and no identical-to-the-reference claim. The bound baseline full-page diff ratio is non-zero, which demonstrates the current output differs from the reference.
- Evidence: Any future such claim would require a bound final comparison with a full-page diff ratio of exactly zero plus captured committed evidence.

## Final-Status Gate

The companion checker enforces all of the following:

- every required field section is present and carries a valid `VERIFIED` or `PENDING_EVIDENCE` status;
- every 64-character SHA-256 cited anywhere in this report is drawn from committed evidence files;
- every high-precision diff score cited anywhere in this report is a machine-bound baseline or accepted
  final value;
- the Machine-Bound Baseline block and the baseline per-region table equal the committed baseline metadata;
- the Machine-Bound Final Metadata block exactly equals the dependency-produced contract;
- the dependency-produced contract re-derives from the accepted evidence commit's measured ledger,
  including its digest, decision counts, accepted pass, scores, region map, viewport, and evidence hashes;
- the final metadata, scope allowlist, final screenshot, interaction receipt, and non-Chat receipt have
  the exact coordinator-accepted SHA-256 digests;
- the exact scope inventory and Chat-gated selectors match the allowlist;
- all six real Edge non-Chat cases are captured with the Chat gate inactive;
- the real Edge interaction receipt proves the required controls, both submission paths, focus targets,
  reduced motion, Jarvis Command Center transcript, cleanup, and zero unexpected page errors;
- the coordinator-verified final comparison values and human-visible mismatch review are present;
- no affirmative pixel-perfect or identical-to-the-reference claim appears;
- no affirmative GitHub, CI, deployment, or live-service mutation claim appears;
- an `Overall Status: FINAL` assertion is rejected while any field remains `PENDING_EVIDENCE`, while any
  placeholder token remains, or while the complete bound final comparison is absent.
