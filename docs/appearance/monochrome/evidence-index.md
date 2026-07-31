---
title: VibeSpace MonoChrome evidence index
ledgerId: vibespace-monochrome-evidence-index
schemaVersion: 1
baselineCommit: 10ade2cb205be6aae93e239e8debd9eaf584b6de
privacy: repository-relative sanitized evidence and synthetic fixtures; private frames excluded
---

# MonoChrome evidence index

This index separates completed proof from planned, unavailable, and blocked
work. A command is `PASS` only when it ran successfully against the recorded
commit or explicitly identified working tree and inputs. Future commands remain
`NOT_RUN` until independently executed and verified. The authorized reference
recording is now source-locked measured evidence; private source bytes and
frames remain outside tracked artifacts.

## Status summary

| Status                  | Count |
| ----------------------- | ----: |
| PASS                    |     3 |
| FAIL                    |     0 |
| BLOCKED                 |     0 |
| BLOCKED_MISSING_SOURCE  |     0 |
| SKIPPED_NOT_APPLICABLE  |     0 |
| UNAVAILABLE_BY_MANIFEST |     1 |
| NOT_RUN                 |    16 |

## Machine-readable ledger

```json evidence-ledger
{
  "schemaVersion": 1,
  "ledgerId": "vibespace-monochrome-evidence-index",
  "baselineCommit": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
  "generatedAtUtc": "2026-07-31T01:49:36.9833531Z",
  "records": [
    {
      "id": "MC8A-REFERENCE-CONTRACT",
      "requirementIds": ["MC-029", "MC-030", "MC-039"],
      "reviewDomain": "reference contract integrity and privacy",
      "surface": "six committed reference artifacts, schemas, and analyzer",
      "status": "PASS",
      "command": "node --test scripts/visual-monochrome/reference-artifacts.test.mjs",
      "cwd": ".",
      "testedCommitSha": null,
      "testedTreeKind": "working_tree",
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": "2026-07-30T05:02:20.8634790Z",
      "finishedAtUtc": "2026-07-30T05:02:32.7288441Z",
      "durationMs": 11865,
      "exitCode": 0,
      "environment": {
        "platform": "windows",
        "runtime": "node",
        "inputScope": "the measured fourteen-path MC8A/MC8B contract in the task199 working tree"
      },
      "fixtureIds": ["measured-reference-contract", "blocked-status-negative-contract"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [
        {
          "path": "scripts/visual-monochrome/reference-artifacts.test.mjs",
          "sha256": "171F0E1D36CB15175A511FCA82DAE0BD7F4499B307E90556F692CA2DEE7CB28D",
          "result": "22 tests passed, 0 failed"
        },
        {
          "path": "scripts/visual-monochrome/analyze-reference.mjs",
          "sha256": "AA8DEC28FA5247A165BD3D4B7570060BA7C5016F057DFF7BB23BC5669F0125C2",
          "result": "exact-basename guarded analyzer and staged validator exercised"
        },
        {
          "path": "docs/appearance/monochrome/FRAME_MANIFEST.json",
          "sha256": "76227264B006F7A606521E5ECEFB0B71FC5C086E3FC602544C8F7693BAC0A9C4",
          "result": "validated source-locked measured manifest"
        },
        {
          "path": "docs/appearance/monochrome/reference-spec.json",
          "sha256": "4D0FDC1CFE72D0034D65E90A55C57F368AC2E2AB613BEAD42461A540C2C72AF9",
          "result": "validated measured ROI, typography, geometry, motion, and motif specification"
        }
      ],
      "reviewer": "task199 working-tree analyzer and contract run",
      "severityCounts": [
        { "severity": "critical", "count": 0 },
        { "severity": "important", "count": 0 },
        { "severity": "minor", "count": 0 }
      ],
      "blockerReason": null,
      "retryLineage": [
        "094 rejected",
        "095 corrected",
        "096 rejected",
        "097 corrected",
        "098 rejected",
        "099 corrected",
        "100 accepted",
        "199 measured-source migration"
      ],
      "cleanup": "No browser, service, user profile, or external state was used; synthetic test artifacts were removed."
    },
    {
      "id": "MC8B-VIDEO-CALIBRATION",
      "requirementIds": ["MC-029"],
      "reviewDomain": "measured reference fidelity",
      "surface": "video-derived palette, geometry, typography, and motion",
      "status": "PASS",
      "command": "node --test scripts/visual-monochrome/reference-artifacts.test.mjs",
      "cwd": ".",
      "testedCommitSha": null,
      "testedTreeKind": "working_tree",
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": "2026-07-30T05:02:20.8634790Z",
      "finishedAtUtc": "2026-07-30T05:02:32.7288441Z",
      "durationMs": 11865,
      "exitCode": 0,
      "environment": {
        "platform": "windows",
        "runtime": "node 24 plus ffmpeg 8.1.1",
        "inputScope": "authorized exact basename; 3449336 bytes; SHA-256 B7C1EF966BC3BB118472F8EFD7334A5AF792DEB3DFF240105886F05F4043F6C1"
      },
      "fixtureIds": ["authorized-recording-measurement", "isolated-synthetic-analyzer"],
      "fixtureHashes": ["B7C1EF966BC3BB118472F8EFD7334A5AF792DEB3DFF240105886F05F4043F6C1"],
      "mockedProviders": [],
      "evidence": [
        {
          "path": "docs/appearance/monochrome/REFERENCE_ANALYSIS.md",
          "sha256": "858FCA2231D8FADCD7CAA671C5850B6AF0A5938C5B045D3FC5753F275E551265",
          "result": "source-locked measured method, limitations, and privacy record"
        },
        {
          "path": "docs/appearance/monochrome/FRAME_MANIFEST.json",
          "sha256": "76227264B006F7A606521E5ECEFB0B71FC5C086E3FC602544C8F7693BAC0A9C4",
          "result": "395 extracted frames, 22 sanitized selected-frame records"
        },
        {
          "path": "docs/appearance/monochrome/design-tokens.json",
          "sha256": "0AE1E765E145F9A5E276AFE36A7A8D22E45B651EA7D3EEDB9FD789B40DE1AAD6",
          "result": "15 palette tokens with three rectangular ROI samples each"
        },
        {
          "path": "docs/appearance/monochrome/reference-spec.json",
          "sha256": "4D0FDC1CFE72D0034D65E90A55C57F368AC2E2AB613BEAD42461A540C2C72AF9",
          "result": "45 ROIs, 72 WOFF2 metric candidates, five geometry metrics, and six motion samples"
        },
        {
          "path": "docs/appearance/monochrome/DESIGN.md",
          "sha256": "BA29A41B0833C9D1B518F40FAAECE5F40E09879C1DF2B68672A397BC132337BC",
          "result": "measured authority and conservative design decisions"
        },
        {
          "path": "docs/appearance/monochrome/component-mapping.md",
          "sha256": "88363E39E1BB0BAD02A6C75E433BEEC387562D1A1B326B9F6A7A4E830C37FD77",
          "result": "three measured motif/frame mappings"
        },
        {
          "path": "scripts/visual-monochrome/analyze-reference.mjs",
          "sha256": "AA8DEC28FA5247A165BD3D4B7570060BA7C5016F057DFF7BB23BC5669F0125C2",
          "result": "guarded ffprobe/ffmpeg measurement, WOFF2 parsing, staged schema validation, and sanitized publication"
        }
      ],
      "reviewer": "task199 working-tree measured-reference run",
      "severityCounts": [
        { "severity": "critical", "count": 0 },
        { "severity": "important", "count": 0 },
        { "severity": "minor", "count": 0 }
      ],
      "blockerReason": null,
      "retryLineage": ["199 exact authorized basename and source hash"],
      "cleanup": "Private source bytes were unchanged; extracted frames remain only in the ignored task199 artifact root. Browser typography rasterization was not run."
    },
    {
      "id": "MC9-STRUCTURAL-MANIFEST",
      "requirementIds": ["VS-PR30-MC-EVIDENCE-INDEX", "MC-024"],
      "reviewDomain": "structural visual authority",
      "surface": "frozen B0 identities and current MC9 screenshot path corpus",
      "status": "PASS",
      "command": "node --test tests/visual/monochrome/baseline-manifest.test.ts tests/visual/monochrome/fixture-manifest.test.ts tests/visual/monochrome/route-manifest.test.ts tests/visual/monochrome/shell-overlay-manifest.test.ts tests/visual/monochrome/native-window-manifest.test.ts",
      "cwd": ".",
      "testedCommitSha": null,
      "testedTreeKind": "working_tree",
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": "2026-07-31T01:49:23.3028454Z",
      "finishedAtUtc": "2026-07-31T01:49:36.9833531Z",
      "durationMs": 13681,
      "exitCode": 0,
      "environment": {
        "platform": "windows",
        "runtime": "node 24",
        "inputScope": "canonical transitive working-tree content, grouped B0 PNG bytes, current capability JSON content, MC9 PNG filenames, and immutable Git inputs; no browser, native runtime, external service, or B0 replay execution"
      },
      "inputIdentity": {
        "schemaVersion": 1,
        "kind": "canonical-transitive-input-manifest",
        "testedTreeKind": "working_tree",
        "canonicalization": "UTF-8 JSON; POSIX repository-relative paths; lexicographic order; uppercase SHA-256",
        "entryCount": 301,
        "groupCount": 6,
        "aggregateSha256": "D4DFDF81675DE148481379962A4C12483EBFA80523B6CCB082B10536C0EA2225",
        "groups": [
          {
            "id": "working-tree-files",
            "mode": "repository-relative-path-and-content-sha256",
            "entryCount": 130,
            "sha256": "BF729F59B49F317D6DCD0F379D3B5222B5ECBA56348D4D966BA7D70E01B54E51"
          },
          {
            "id": "b0-png-content",
            "mode": "repository-relative-path-and-content-sha256",
            "entryCount": 10,
            "sha256": "C3FB8314CEB1348B0783AC00226FD953C72477277C533DCE23253CFDA5CDB05B"
          },
          {
            "id": "current-capability-json-content",
            "mode": "repository-relative-path-and-content-sha256",
            "entryCount": 5,
            "sha256": "FFA467A7338041D35F540229554C2F9F8ED735B58CD2889405526C69C7499483"
          },
          {
            "id": "mc9-png-filenames",
            "mode": "repository-relative-filename-only",
            "entryCount": 111,
            "sha256": "06B6DC0524799615E94662EA9625BA55A6DD65A54028E6CD905CEE4468EC0E30"
          },
          {
            "id": "immutable-git-commits",
            "mode": "commit-object-identity",
            "entryCount": 3,
            "sha256": "7F36753C739985BF70DE391964CFD7C1ED0F94CB5C45488C828625D22522BBA2"
          },
          {
            "id": "immutable-git-files",
            "mode": "commit-path-and-content-sha256",
            "entryCount": 42,
            "sha256": "C3B4F3086A384DF8BCC9087836E675712E24DD29671EC62DB2803E38FE4602B5"
          }
        ],
        "capturedAtUtc": "2026-07-31T01:49:14.7923752Z",
        "verifiedAtUtc": "2026-07-31T01:49:48.2178281Z",
        "beforeAggregateSha256": "D4DFDF81675DE148481379962A4C12483EBFA80523B6CCB082B10536C0EA2225",
        "afterAggregateSha256": "D4DFDF81675DE148481379962A4C12483EBFA80523B6CCB082B10536C0EA2225"
      },
      "fixtureIds": ["frozen-b0-corpus", "mc9-111-structural-corpus"],
      "fixtureHashes": [
        "C3FB8314CEB1348B0783AC00226FD953C72477277C533DCE23253CFDA5CDB05B",
        "06B6DC0524799615E94662EA9625BA55A6DD65A54028E6CD905CEE4468EC0E30"
      ],
      "mockedProviders": [],
      "evidence": [
        {
          "path": "tests/visual/monochrome/baseline-manifest.test.ts",
          "sha256": "A281BAD5B466E40CBA39997AD4AE3BBA7C50040A8638D4F277CF3913963B1763",
          "result": "7 tests passed; MC9 declared and actual PNG closure is exactly 111 with no missing, orphan, duplicate, reordered, or unsafe path"
        },
        {
          "path": "tests/visual/monochrome/baseline-manifest.ts",
          "sha256": "8B5050EDA2866251057B4248EA75FA6C1CF280EA8CD8CB5EA9533EBE350B226B",
          "result": "10 frozen B0 capture identities and one deterministic 111-entry MC9 path authority"
        },
        {
          "path": "tests/visual/monochrome/fixture-manifest.test.ts",
          "sha256": "4DA5309CCB549F75929942EC05917684E1B80A22B89CCEB4AD822B13FB10EE86",
          "result": "5 tests passed, including fixture-hash and cross-authority path closure"
        },
        {
          "path": "tests/visual/monochrome/fixture-manifest.ts",
          "sha256": "5994A5EF08D14517E100C0C886F54478BAB1FCB462ABD0C17AF4BB695A7A778E",
          "result": "three deterministic fixture identities and hashes"
        },
        {
          "path": "tests/visual/monochrome/native-window-manifest.test.ts",
          "sha256": "6003E47B4F0EE728E8765778FDCE41AE1CDEB16379ABC3FB800B971F413A3562",
          "result": "11 structural tests passed; this is not a native runtime or platform PASS"
        },
        {
          "path": "tests/visual/monochrome/native-window-manifest.ts",
          "sha256": "7B5798B275EEF62FEFC2D64B5B2807A8F9E6E5784B5843CCC9789DEC396B9069",
          "result": "four production capability identities and six native surface declarations"
        },
        {
          "path": "tests/visual/monochrome/route-manifest.test.ts",
          "sha256": "9890206ECBE01AC269972C0A15BA519EC3944DAF4F96321BCFCCD48A2BDB03F3",
          "result": "9 structural route-authority tests passed"
        },
        {
          "path": "tests/visual/monochrome/route-manifest.ts",
          "sha256": "4F66450D444663E119AAD4E0E2817AF91FE60F9B883B56321541095784F730CA",
          "result": "86 stable route, settings, overlay, detached, native, access, embedded, development, and unavailable entries"
        },
        {
          "path": "tests/visual/monochrome/shell-overlay-manifest.test.ts",
          "sha256": "2AA6AEA49744E1A5693736480DD8CC0E5031776EF6735FA7CB002A86C2701B4B",
          "result": "6 shell and overlay structural tests passed"
        },
        {
          "path": "tests/visual/monochrome/shell-overlay-manifest.ts",
          "sha256": "C750735EE79FDC4143B289494EC0BF93B6A5C29EFA22DA0B3F022F0B61D05CF8",
          "result": "31 stable shell, overlay, and dispatch surfaces"
        }
      ],
      "reviewer": "Task344 implementation evidence revalidated and transitively input-bound by Task350R1",
      "severityCounts": [
        { "severity": "critical", "count": 0 },
        { "severity": "important", "count": 0 },
        { "severity": "minor", "count": 0 }
      ],
      "blockerReason": null,
      "retryLineage": [
        "Task344 RED 21/26 then GREEN 38/38",
        "Task350 fresh structural replay 38/38",
        "Task350R1 canonical pre/post input identity and fresh structural replay 38/38"
      ],
      "cleanup": "Canonical input identity was unchanged before and after the command. No browser, native application, external service, snapshot regeneration, or B0 replay ran; no process remained."
    },
    {
      "id": "MC9-FIXED-ENVIRONMENT",
      "requirementIds": ["MC-034", "MC-038"],
      "reviewDomain": "deterministic harness isolation",
      "surface": "paired runtime profiles, fixtures, port, time, fonts, motion, and app-data",
      "status": "NOT_RUN",
      "command": "node --test scripts/visual-monochrome/native-session.test.mjs scripts/visual-monochrome/manifest-contract.test.mjs",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "implementation active" },
      "fixtureIds": ["frozen-route-manifest", "frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "Implementation is active and the focused command has not been independently run against an accepted MC9 commit.",
      "retryLineage": [],
      "cleanup": "No harness process has been started by this ledger task."
    },
    {
      "id": "MC9-VISUAL-METRICS",
      "requirementIds": ["MC-015", "MC-016", "MC-017", "MC-020", "MC-021", "MC-034"],
      "reviewDomain": "visual capture and computed style metrics",
      "surface": "complete frozen route and state matrix",
      "status": "NOT_RUN",
      "command": "npx playwright test --config playwright.monochrome.config.ts --grep visual",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "implementation active" },
      "fixtureIds": ["frozen-route-manifest", "synthetic-account-free-fixtures"],
      "fixtureHashes": [],
      "mockedProviders": ["deterministic local provider fixtures"],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "The Playwright suite and style-metrics collector are not yet accepted or executed.",
      "retryLineage": [],
      "cleanup": "Future artifacts remain confined to the ignored MonoChrome artifact root."
    },
    {
      "id": "MC9-PRESERVED-THEMES",
      "requirementIds": ["MC-023", "MC-024"],
      "reviewDomain": "theme isolation and Origami preservation",
      "surface": "Default, VibeSpace, Jarvis Core, and Origami route matrix",
      "status": "NOT_RUN",
      "command": "npx playwright test --config playwright.monochrome.config.ts --grep preserved",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "implementation active" },
      "fixtureIds": ["B0-preserved-theme-baselines", "origami-acceptance-oracle"],
      "fixtureHashes": [],
      "mockedProviders": ["deterministic local provider fixtures"],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "No accepted MC9 preserved-theme or Origami comparison run exists yet.",
      "retryLineage": [],
      "cleanup": "No baseline image is updated by this index."
    },
    {
      "id": "MC9-FUNCTIONAL-REGRESSION",
      "requirementIds": ["MC-022", "MC-025", "MC-031", "MC-032"],
      "reviewDomain": "functional and account-boundary regression",
      "surface": "routes, chat, agents, voice, terminal, Canvas, files, plugins, billing, access, and settings",
      "status": "NOT_RUN",
      "command": "npx playwright test --config playwright.monochrome.config.ts --grep behavior",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "implementation active" },
      "fixtureIds": ["synthetic-account-free-fixtures"],
      "fixtureHashes": [],
      "mockedProviders": ["deterministic local provider fixtures", "billing test fixtures"],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "The functional matrix has not been run against an accepted MC9 integration.",
      "retryLineage": [],
      "cleanup": "No live provider, billing, database, or user account was contacted."
    },
    {
      "id": "MC9-ACCESSIBILITY",
      "requirementIds": ["MC-019", "MC-027", "MC-040"],
      "reviewDomain": "accessibility and responsive behavior",
      "surface": "routes, primitives, zoom, reflow, contrast, forced colors, focus, targets, and reduced motion",
      "status": "NOT_RUN",
      "command": "npx playwright test --config playwright.monochrome.config.ts --grep accessibility",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "implementation active" },
      "fixtureIds": ["frozen-route-manifest", "primitive-workbench"],
      "fixtureHashes": [],
      "mockedProviders": ["deterministic local provider fixtures"],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "Axe, keyboard, focus, contrast, target-size, forced-color, reduced-motion, and zoom runs remain pending.",
      "retryLineage": [],
      "cleanup": "No browser session has been started by this ledger task."
    },
    {
      "id": "MC9-NATIVE-VALIDATE",
      "requirementIds": ["MC-034", "MC-038", "MC-041"],
      "reviewDomain": "native-session contract validation",
      "surface": "profile, capability, nonce, app-data, port, artifact, and cleanup invariants",
      "status": "NOT_RUN",
      "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/visual-monochrome/native-session.ps1 -ValidateOnly",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "implementation active" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "The native-session validator has not run against an accepted MC9 integration.",
      "retryLineage": [],
      "cleanup": "Validate-only must not launch a native process or mutate profiles, ports, registry, credentials, or user paths."
    },
    {
      "id": "MC9-NATIVE-WINDOWS",
      "requirementIds": ["MC-010", "MC-028", "MC-038", "MC-041"],
      "reviewDomain": "native Windows isolation and appearance",
      "surface": "main, detached, dictation, Pixel Pet, mini panel, preview, and dialogs",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "not started" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "The contained native Windows session has not run against an accepted MC9 integration.",
      "retryLineage": [],
      "cleanup": "The future run must clean only its exact nonce-bound process, port, app-data root, and artifact root."
    },
    {
      "id": "MC9-RELEASE-EXECUTABLE",
      "requirementIds": ["MC-038", "MC-041"],
      "reviewDomain": "optimized release executable",
      "surface": "release-mode Windows executable under the contained MonoChrome profile",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "not started" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "No optimized executable has been built or launched for this checkpoint.",
      "retryLineage": [],
      "cleanup": "No release executable, build process, or host application profile was touched."
    },
    {
      "id": "MC9-UNSIGNED-NSIS",
      "requirementIds": ["MC-038", "MC-041"],
      "reviewDomain": "unsigned Windows package construction",
      "surface": "unsigned NSIS installer artifact",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "not started" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "No unsigned NSIS artifact has been built for this checkpoint.",
      "retryLineage": [],
      "cleanup": "Building an artifact must not install it, change the registry, or touch a host application profile."
    },
    {
      "id": "MC9-INSTALLED-PACKAGE",
      "requirementIds": ["MC-038", "MC-041"],
      "reviewDomain": "installed-package behavior",
      "surface": "unsigned NSIS package installed inside an approved disposable Sandbox or VM",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows-sandbox-or-vm", "runtime": "not started" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending approved disposable environment",
      "severityCounts": [],
      "blockerReason": "The package has not been installed or exercised in an approved disposable Sandbox or VM.",
      "retryLineage": [],
      "cleanup": "No installer may run on the host; disposable-environment identity and teardown evidence are required."
    },
    {
      "id": "MC9-WEBKIT-PREVIEW",
      "requirementIds": ["MC-010", "MC-028", "MC-041"],
      "reviewDomain": "WebKit layout fallback",
      "surface": "MonoChrome route and native-window layouts in a WebKit preview runtime",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "webkit-preview", "runtime": "not started" },
      "fixtureIds": ["frozen-route-manifest", "frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": ["deterministic local provider fixtures"],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "No WebKit preview run exists for this checkpoint.",
      "retryLineage": [],
      "cleanup": "The future preview must remain loopback-only and use synthetic account-free fixtures."
    },
    {
      "id": "MC9-MACOS",
      "requirementIds": ["MC-028", "MC-041"],
      "reviewDomain": "macOS platform coverage",
      "surface": "native window chrome, menus, dialogs, and detached surfaces",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "macos", "runtime": "not started" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending platform availability",
      "severityCounts": [],
      "blockerReason": "No macOS run or exact SKIPPED_NOT_APPLICABLE ruling exists for this checkpoint.",
      "retryLineage": [],
      "cleanup": "A later platform run must use an isolated application profile and repository-relative evidence."
    },
    {
      "id": "MC9-LINUX",
      "requirementIds": ["MC-028", "MC-041"],
      "reviewDomain": "Linux platform coverage",
      "surface": "native window chrome, dialogs, and detached surfaces",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "linux", "runtime": "not started" },
      "fixtureIds": ["frozen-native-window-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending platform availability",
      "severityCounts": [],
      "blockerReason": "No Linux run or exact SKIPPED_NOT_APPLICABLE ruling exists for this checkpoint.",
      "retryLineage": [],
      "cleanup": "A later platform run must use an isolated application profile and repository-relative evidence."
    },
    {
      "id": "MC9-PERFORMANCE-SECURITY",
      "requirementIds": ["MC-025", "MC-026", "MC-030", "MC-031", "MC-035"],
      "reviewDomain": "performance, security, privacy, and dependency integrity",
      "surface": "theme switch, style/layout/paint, memory, Canvas traces, CSS scope, persisted input, webviews, fonts, URLs, SVGs, and secrets",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "not started" },
      "fixtureIds": ["frozen-route-manifest", "frozen-effect-manifest"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending independent reviews",
      "severityCounts": [],
      "blockerReason": "The accepted MC9 integration and its measured traces do not exist yet.",
      "retryLineage": [],
      "cleanup": "No live provider page, credential value, or private data is in scope."
    },
    {
      "id": "MC9-FUTURE-MESSAGING",
      "requirementIds": ["MC-021", "MC-022", "MC-035"],
      "reviewDomain": "literal route-manifest availability",
      "surface": "future messaging channels",
      "status": "UNAVAILABLE_BY_MANIFEST",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "no production surface" },
      "fixtureIds": [],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [
        {
          "path": "tests/visual/monochrome/route-manifest.ts",
          "result": "future:messaging-channels has no source path, writer path, or production surface"
        }
      ],
      "reviewer": "frozen route-coverage audit",
      "severityCounts": [],
      "blockerReason": "The accepted literal manifest classifies future:messaging-channels as unavailable; it receives no screenshot, accessibility, behavior, native, skip, or pass claim.",
      "retryLineage": [],
      "cleanup": "No unavailable surface was synthesized or added to production navigation."
    },
    {
      "id": "MC9-WORKBENCH-DEV-ONLY",
      "requirementIds": ["MC-033"],
      "reviewDomain": "development-only Workbench isolation",
      "surface": "primitive Workbench route and production-absence contract",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "not started" },
      "fixtureIds": ["primitive-workbench"],
      "fixtureHashes": [],
      "mockedProviders": ["deterministic local provider fixtures"],
      "evidence": [],
      "reviewer": "pending coordinator verification",
      "severityCounts": [],
      "blockerReason": "The development registration and production-absence assertions have not run against an accepted MC9 integration.",
      "retryLineage": [],
      "cleanup": "Workbench evidence must never register the route in a production build or production navigation."
    },
    {
      "id": "MC9-FINAL-MATRIX",
      "requirementIds": ["MC-021", "MC-022", "MC-034", "MC-035", "MC-041"],
      "reviewDomain": "full deterministic acceptance matrix",
      "surface": "focused Node, Playwright, TypeScript, Vitest, Vite, Rust, native, platform, and evidence gates",
      "status": "NOT_RUN",
      "command": "",
      "cwd": ".",
      "testedCommitSha": null,
      "provenanceCommitSha": "10ade2cb205be6aae93e239e8debd9eaf584b6de",
      "startedAtUtc": null,
      "finishedAtUtc": null,
      "durationMs": null,
      "exitCode": null,
      "environment": { "platform": "windows", "runtime": "not started" },
      "fixtureIds": ["complete-MC9-matrix"],
      "fixtureHashes": [],
      "mockedProviders": [],
      "evidence": [],
      "reviewer": "pending coordinator and independent review",
      "severityCounts": [],
      "blockerReason": "The final matrix starts only after all MC9 implementation slices are integrated and independently verified.",
      "retryLineage": [],
      "cleanup": "Only exact owned processes and disposable artifacts may be cleaned during future runs."
    }
  ]
}
```

## Interpretation

- `PASS` means the exact recorded command completed with exit code zero.
- `MC9-STRUCTURAL-MANIFEST` proves identifier and path closure only. It does
  not prove browser pixels, native behavior, platform behavior, external
  services, or the pending replay evidence.
- `NOT_RUN` never implies partial success.
- `BLOCKED_MISSING_SOURCE` is retained for future evidence whose exact required
  source is absent; no current record uses it.
- `SKIPPED_NOT_APPLICABLE` may be used only after recording the exact
  environment and reason for a platform scenario.
- `UNAVAILABLE_BY_MANIFEST` may be used only when an accepted literal manifest
  proves that a runner or surface does not exist.
- Live services, private accounts, secrets, source media, and user data are
  outside this evidence index.
