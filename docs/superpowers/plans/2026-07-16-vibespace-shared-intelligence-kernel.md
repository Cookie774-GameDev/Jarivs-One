# VibeSpace Shared Intelligence Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Shared Intelligence Kernel as the real,
persisted, safety-enforcing foundation consumed by typed JARVIS chat, voice,
scheduled work, Hive final responses, deterministic actions, and a thin
truthful Command Center shell.

**Architecture:** Add one protected JARVIS identity/profile boundary, one
request envelope and prompt compiler, one provider prompt transport, one
response envelope and prose-enforcement pipeline, and one normalized
run/event/approval/artifact journal. Persist the new records in additive,
account-scoped Dexie v3 stores that never enter generic cloud sync. Migrate
consumers incrementally behind a runtime gate while projecting canonical state
into existing UI contracts until later phases replace those projections.

**Tech stack:** TypeScript 5.6, React 18, Zustand 5, Dexie 4, Vitest 4, Tauri 2,
Rust, existing VibeSpace AI/provider adapters and stores.

**Approved design:**
`docs/superpowers/specs/2026-07-16-vibespace-shared-intelligence-kernel-design.md`

**Program plan:** `docs/unified-goals/EXECUTION_PLAN.md`

**Frozen implementation/merge base:**
`8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6`

**Pre-plan-commit upstream observation:** predecessor HEAD
`56d669f60b0eb93309f332ed700d9b0f4b0b82ee`; observed `origin/main`
`65931c1cbb2982e6991238af45a3cf39702c7802`; divergence `22` ahead / `2`
behind. Task 0R refreshes moving-ref truth in `GIT_BASELINE.md`.

**Branch:** `codex/shared-intelligence-kernel-design-20260716`

## Execution Rules

- Keep `integrate/grok-workbench-pr25-v2`, its worktree, and all pre-existing
  localhost processes untouched.
- Never stage or restore the unrelated `install/install.ps1` deletion.
- Before each task, acquire exact file locks in `AGENT_COORDINATION.md`.
- Read-only discovery and brief preparation may run concurrently. Product
  implementation tasks run sequentially through fresh implementer and reviewer
  gates; contract-defining tasks land before their consumers.
- Each behavior change begins with a focused failing test and an observed
  expected failure.
- Do not use snapshot-only tests for security, migration, state-machine, or
  transport behavior.
- Use `superpowers:systematic-debugging` for unexpected failures and
  `superpowers:verification-before-completion` before any completion claim.
- Never stage a directory. Construct every `git add` from the exact literal
  files enumerated by that task.
- Immediately before every commit, run `git diff --cached --name-only`,
  `git diff --cached --check`, and `git diff --cached -- <each exact task
path>`. The name list must contain only the task's locked files, and
  `install/install.ps1` must never appear.
- Do not push, open a draft PR, or claim the kernel complete until Task 22.
- After every independently accepted product commit, the primary coordinator
  updates only the affected stable rows in
  `docs/unified-goals/REQUIREMENTS_MATRIX.md` and
  `docs/unified-goals/TEST_MATRIX.md`, plus model/skill evidence when a new
  worker was used, in a separate exact-path documentation commit. Product
  workers never rewrite those shared ledgers, and no row advances to `PASS`
  without observed evidence.

### Dependency-safe execution order

Execute the task briefs in this dependency-safe order:

`1A (complete), 2 (landed/review pending), 1B (complete), 3 (complete), 0R, 4, 5, 6,
7, 8, 9, 10, 18, 11, 12, 13, 13P, 16A, 14, 15, 16W, 19A, 19B, 19C,
19D, 20A, 20B, 20C, 16B, 21A, 17, 21B, 21C, 22`.

The plan retains `22` numbered product-task families and adds the retrospective
directive-reconciliation slice `0R`, the App-integration slice `13P`, plus the
single-owner slice `16W`, for `34`
executable slices after the `1`, `16`, `19`, `20`, and `21` lettered splits.
The conditional Task 2R review-fix path below is not counted or claimed as an
executable slice unless the fresh Task 2 reviewer requests changes. If
instantiated, Task 0R must register it, update the sequence/count and affected
artifacts, and obtain plan review before executing it.
Task 1A is
complete. Task 2's implementation landed at `fd0cf3c`, but its narrow
four-file acceptance remains `IMPLEMENTED_UNVERIFIED` until the fresh Task 0R
independent code-review gate below returns PASS. Task 1B has initial commit
`50f7ea5`, first hardening commit `991b13c`, R2 implementation commit
`3f45ffe`, R3 critical-race commit `b63e32d`, R4 commit `98c7304`, R5 commit
`6f47a21`, and R6 commit `83da2f6`. R6 passed its focused, exact, widened,
typecheck, formatting, and scope gates, but independent review rejected it
with an Important sync-quiescence finding. R7 did not obtain acceptance. The
separately locked R8 TDD correction is independently accepted and complete at
`e2fdfa0a208186b2a6afe3709c25c4600e68100b` with subject
`fix(jarvis): bind cloud sync to durable account claims`. Its immutable exact
17-path tracked manifest is frozen below and matches that commit. Task 1B is
complete. Its exact-file review-fix slices were allowed to proceed
concurrently through Task 6; that historical overlap is closed. Task 7's R8
dependency-manifest gate is satisfied, and Tasks 9–13 no longer overlap R8's
shared sync/repository paths. Task 0R is the next executable slice. No further
product edit may begin until its complete directive-mandated planning and
traceability artifact set is committed and Tasks 1A, 2, 1B, and 3 are
retrospectively reconciled into stable requirement rows. Task 16A is unblocked
by Task 1B after this plan is accepted, while its other stated prerequisites
remain in force. Task 18 precedes request consumers so it alone allocates caller-stable run IDs,
owns legal state transitions, and lands the closed producer-source event union
before Tasks 19B, 16B, 21A, and 17 write or verify those rows. Task 16W lands
the single trusted cross-webview owner/client boundary before any production
security or kernel runtime composition. Task 19 lands
strictly as `19A -> 19B -> 19C -> 19D`; 19A closes the account/grant-bound
plugin runtime and immutable literal action catalog before 19B can execute a
registered action. Task 20 lands strictly as
`20A -> 20B -> 20C`. Task 16A establishes
`legacy | shadow | kernel` shadow compilation before response cutover; Task 16B
owns the tested production default switch to `kernel`. Task 21A binds voice
before schedule/Hive Task 17, Task 21B mounts the read-only Command Center only
after all canonical lifecycle consumers exist, Task 21C then lands the isolated
development-only smoke fixtures, and docs/evidence-only Task 22 consumes those
committed fixtures.

### Parallelization matrix

| Work                                                                   | Parallel status                                                                       | Required gate                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Read-only discovery, independent review, and ignored brief preparation | May run concurrently only with distinct output paths and no overlapping logical locks | Re-read the root coordination ledger under its mutex before claiming any file         |
| Task 1B R8 review-fix slice                                            | Complete; its former bounded overlap with Tasks 2–6 is closed                         | Accepted exact 17-path commit `e2fdfa0a208186b2a6afe3709c25c4600e68100b`              |
| Task 0R                                                                | Next and docs-only; no product work overlaps it                                       | Complete artifact set, hashes, stable IDs, and retrospective Task 1A/2/1B/3 mapping   |
| Tasks 4–10, 18, 11–13, and 13P                                         | Sequential in the exact global order                                                  | Predecessor commit/review complete and exact product-file locks acquired              |
| Tasks 16A, 14, and 15                                                  | Strictly serial                                                                       | Task 1B accepted, Task 13 complete, then the exact predecessor slice                  |
| Task 16W                                                               | Strictly after Task 15 and before Task 19A                                            | Native owner broker and secondary-window client boundary accepted                     |
| Tasks 19A–19D                                                          | Strictly serial                                                                       | Each slice consumes the preceding approval/cancellation authority                     |
| Tasks 20A–20C                                                          | Strictly serial                                                                       | 20B consumes 20A's private receipt issuer; 20C starts only after real producers exist |
| Tasks 16B, 21A, 17, 21B, 21C, and 22                                   | Strictly serial in that order                                                         | Canonical cutover, consumers, proof shell, smoke fixtures, then docs/evidence         |
| Independent post-implementation review                                 | Read-only reviewers may run concurrently after the reviewed commit exists             | Every product fix becomes a separately locked serial TDD task and commit              |

No product implementation overlap is authorized. The historical bounded Task
1B review-fix overlap ended with the accepted R8 commit.

## Contract Naming and Persistence Conventions

- Domain contracts use camelCase.
- Dexie rows use snake_case.
- Explicit mappers are the only conversion boundary.
- Times are Unix milliseconds.
- IDs use stable prefixes: `jrun_`, `jappr_`, `jart_`, `jprof_`, `jident_`.
- A `JarvisEvent` has no separate prefixed ID. Its canonical identity is the
  compound `(runId, seq)` key; `idempotencyKey` is a distinct retry/crash
  deduplication key.
- `JarvisRun.id` is the caller-stable run ID and run idempotency key. Task 18
  allocates and persists it before any request envelope is built.
- Mutable identity/profile records remain separate from immutable request
  snapshots. A dispatched envelope and every nested snapshot/collection are
  deeply immutable.
- Secret values, raw credentials, cookies, auth headers, and browser storage
  never appear in any row, event, approval, artifact, log, or diagnostic.
- `accountId` is always explicit for account-bearing repository reads.
- There is no `local-unassigned` fallback.

## Task 0R: Directive Artifacts and Retrospective Traceability

This docs-only reconciliation is the next executable slice. The directive
required these artifacts before product edits; Tasks 1A, 2, 1B, and 3 already
landed, so this slice records that sequencing defect truthfully, reconstructs
their source-to-commit evidence, and closes the gate before Task 4. It does not
rewrite accepted product commits or claim unverified work.

**Files:**

- Create: `docs/unified-goals/ATTACHMENT_INVENTORY.md`
- Create: `docs/unified-goals/REQUIREMENTS_MATRIX.md`
- Create: `docs/unified-goals/CONFLICT_RESOLUTION.md`
- Create: `docs/unified-goals/CURRENT_ARCHITECTURE.md`
- Create: `docs/unified-goals/TARGET_ARCHITECTURE.md`
- Create: `docs/unified-goals/DEPENDENCY_GRAPH.md`
- Modify: `docs/unified-goals/EXECUTION_PLAN.md`
- Create: `docs/unified-goals/SUBAGENT_PLAN.md`
- Create: `docs/unified-goals/SKILL_CAPABILITY_MATRIX.md`
- Create: `docs/unified-goals/SKILL_USAGE_EVIDENCE.md`
- Create: `docs/unified-goals/TEST_MATRIX.md`
- Create: `docs/unified-goals/THREAT_MODEL.md`
- Create: `docs/unified-goals/PERFORMANCE_PLAN.md`
- Create: `docs/unified-goals/MIGRATION_PLAN.md`
- Create: `docs/unified-goals/ROLLBACK_PLAN.md`
- Create: `docs/unified-goals/MODEL_AND_REASONING_EVIDENCE.md`
- Create: `docs/unified-goals/GIT_BASELINE.md`

**Frozen source inventory:**

| Authority                                      |   Bytes / lines | SHA-256                                                            |
| ---------------------------------------------- | --------------: | ------------------------------------------------------------------ |
| Unified directive v2                           |  48,718 / 2,613 | `581AF05D1D20B457FE60BCA73944E52B39FF32970FEF31F60C0D0E2700445290` |
| Superseded unified directive v1                |  50,808 / 2,112 | `49EF2C5BAC134B16248D7E1A4963E75AC2E25CF698E98637F35D78AB29EB2CC8` |
| JARVIS Response Intelligence                   |  53,377 / 1,899 | `67E16D6009523770A66F1F44957C9F6CE40A21CCAD315878D477A7D1CCEFDE29` |
| JARVIS Command Center                          |  52,481 / 1,828 | `C2AF1EDDB7265747B0856EB7C77F1EBCAF13B1526E6A924743369CF96AD5FF89` |
| SOUL/Memory/Skills/Subagents/Messaging/Browser |  84,433 / 4,093 | `FE03265FB37E1AAE0A4247B094D7624B64F9944ADB6476F3C87DB2458669E059` |
| Context Map/GitHub/JARVIS/Terminal             |  69,774 / 3,656 | `F3390F99C049B6C2C2ADAA11E8C27984CE9A1C5D06FA71827B680A33B2F96E3B` |
| Prompt Forge/Infinite Canvas/Access            |  76,868 / 3,498 | `284FF5D4BA09F78A12CB478D8175E450A48C3DF83299574FE3E4718B40816099` |
| Subscription/Browser Chat/Local Tool Bridge    |  59,064 / 2,548 | `251F9B7822504931A5D89B701C20C64B6798FDDDBB29282F1BCBF239C5F635CF` |
| Origami Chat                                   |    18,227 / 676 | `25A9A12B8DA9CF305C5880D8E6B464AFFECC7261BC18546A81E6B68492A1EFBC` |
| Origami reference locator note                 |        953 / 25 | `EB1103F766957BBE514B07301772B5F7E949789F9529604CFD0F7B6F6AA37E16` |
| Approved Shared Intelligence Kernel design     |  49,132 / 1,363 | `D0054D04396AF428A636FDE8C99984F70FDD2876A7AA318498CE43EBBFC5B10D` |
| Goal 8 MonoChrome                              |  59,694 / 3,183 | `3A944882AD3F76572BA7D6D183730F7129CE85AB99D2F8D1ED1B168D806D98E7` |
| Root `SYSTEM_PROMPT.md`                        |    13,587 / 309 | `8F5C3FD60769266C62D4BA9819EBFA91B0DE6BE012236102DA21FBD940889B69` |
| Root `AGENTS.md`                               |     5,929 / 130 | `C0EAF1A10EB1026BFED12B5C3A89E1F9DF90A6E6521DE2A0E9A5362B378081AA` |
| Root coordination ledger frozen prefix         | 600,842 / 6,281 | `5619FAC825D05CA4A692CE1281C3EE5E17CB572C32AE03090700F1E7F26C0B42` |
| Worktree `AGENTS.md` drift occurrence          |      2,677 / 46 | `0652B45CE28FFFB4C75B92CBDDC20D6646BC14844D28957759102B6BACF5FC51` |

The attachment inventory records exact absolute source paths locally but never
copies private reference media into Git. It also records the approved Shared
Intelligence Kernel specification commit and SHA.

The v1 directive row is `SUPERSEDED` context and never an eighth product goal.
The authoritative instruction paths are exactly the three root-repository
paths above, ranked separately as `SYSTEM_PROMPT.md` then root `AGENTS.md` then
approved coordination decisions. The worktree `AGENTS.md` is a distinct
`NON_AUTHORITATIVE_DRIFT` occurrence and may not replace the allowlisted root
file. The coordination row freezes the first 600,842 raw bytes as of
`2026-07-17T03:58:11.6082423Z`; later append-only bytes are new occurrences,
not source drift in the frozen prefix. Extract only current state and approved
decisions at that cutoff, retain stale blockers as historical/superseded
events, and never treat them as current authority. Create separate `AUTH`
occurrences for the user's SIK approval/standing authorization and the later
Goal 8 attachment authorization, each with conversation turn/timestamp and no
invented file hash.

The approved SIK design row is the exact file
`docs/superpowers/specs/2026-07-16-vibespace-shared-intelligence-kernel-design.md`
at commit `88c3e54887427d363df9b0aebd961ead8a02a733`. The standalone and packaged
Origami master goals are byte-identical aliases of the one canonical `25A9...`
source; both paths remain inventory occurrences without duplicate requirements.
Inventory every present file in the Origami implementation pack, including all
eleven crops and five scripts:

| Pack-relative path                        | Bytes / lines or dimensions | SHA-256                                                            |
| ----------------------------------------- | --------------------------: | ------------------------------------------------------------------ |
| `README_START_HERE.md`                    |                  1,210 / 44 | `7665FAFBC12F2D3260F52D44707588EE967F5D2EFB73A01893F6D5F56983A215` |
| `DESIGN.md`                               |                 8,242 / 258 | `17208F33A053833E0A79D2C1CE24D857F7898A305C42626F39DA407B2F8F9D00` |
| `reference-spec.json`                     |                 3,065 / 138 | `75FCDBCF034B02FF3DAF45ABCC48EFFFB83CDC4FE963B52E22D6A1DEEC8A59C4` |
| `design-tokens.json`                      |                  1,339 / 55 | `C615406E0481C12DCA4DDBF22635F0782F78242FF50900C360ECD9C8005AA6A4` |
| `asset-manifest.json`                     |                  2,346 / 79 | `E560D4E4D226D36B2FCEF31943F8CA3DD456453EED9467FE38B4FCEC96836F37` |
| `source/previous-goal.txt`                |                23,164 / 970 | `BA8CEB2E57FAFE5CDC8F359D4619AEC729458B3F05CFE113F49E7B7055D2056B` |
| `references/target-chat.png`              |        3,463,908 / 1672x941 | `1F61E223D6DB54D9F32DE4C3DE8C98FF3028556B579B1F6A69B5317D35E8FE27` |
| `references/crops/assistant_message.png`  |           377,834 / 925x260 | `3E18222A223C476AC6C731305784AE589B6E7669992A84701B94907E8159A80D` |
| `references/crops/composer.png`           |          300,536 / 1115x188 | `AC29618DF45195C6FBFF08FCABDD075EFDC582067F85D8E9473CD796D059BB25` |
| `references/crops/header_full.png`        |          360,384 / 1672x135 | `95DAC622B66488FE596225F055222EDD0C2CB2D109E2720C59580E713A197D73` |
| `references/crops/jarvis_module.png`      |            80,353 / 435x116 | `17FBB510A1C90534F0342A835305B95317336E2DFDB63B15EDA207CDAF192307` |
| `references/crops/lower_right_flower.png` |           180,294 / 332x321 | `8F7FB33811105F473867713C54FCF5C9E5420CAB8264F0B49E89F542536E7400` |
| `references/crops/paper_closeup.png`      |           112,906 / 320x240 | `5B52AC6BCC3473EEB8D848C9DB02357ECD07B8C678C135E39C57C8EE5D3F44FB` |
| `references/crops/session_panel.png`      |          294,931 / 1043x196 | `F3ED50BE553E3951451030DFE88B0F34E38D0A4039C0DE0E414AC88170615C14` |
| `references/crops/sidebar_full.png`       |           493,035 / 334x869 | `CB545FE48E524B9A4C2399988CCC667F5A58A89DD75902ECCF99E77FC39C7181` |
| `references/crops/top_ribbon.png`         |           161,602 / 1140x88 | `C1C610D908299FEC4012B1A603D0E40C017777FFDF009F3844097BD89ADC0444` |
| `references/crops/upper_left_crane.png`   |            25,900 / 115x128 | `BE12882C05F2F914055CEA189844C1657DBA9EDFC274BFBA9825AB88009A7E08` |
| `references/crops/user_bubble.png`        |             40,981 / 320x85 | `3AE274F7E269A39E48CB3D9779985420805F55F4C6393C80DB1814DD6A406797` |
| `scripts/capture-chat.mjs`                |                  1,681 / 72 | `DDD9388A31328B54F7BEFAFDE2D6BF00A06CAC46037060FDE91BFE407768AB03` |
| `scripts/compare-images.mjs`              |                 3,106 / 112 | `40FC72E9044349A5A2A3589D3A114CC77F1D86DD3D9A1098DF995A1DE940C5AA` |
| `scripts/sample-palette.mjs`              |                  1,244 / 38 | `86919BDE04874224D2A696747701BBF10D4DE8993E32C036C0B6D499019E8ECD` |
| `scripts/save-checkpoint.ps1`             |                    594 / 20 | `AAB8EC4D63BCB8F179E0EE576C62C579DE84F64756B1F69FCD67A99F47CE06C3` |
| `scripts/validate-scope.mjs`              |                    575 / 23 | `2D5CE004350D01671DB85D5A343B728522170D4D4AB5AC56DEFC74B05B726B8B` |

Record the following authorized-repository inputs as `MISSING_UNVERIFIED`, not
as hashed/used evidence: `.codex/config.toml`, `.agents/skills/`, and
`.agents/tools/agent-lock.mjs`. Record the Goal 8 reference video as
`MISSING_UNHASHED` until the exact file appears. The user's approval message is
an `AUTH` transcript source with timestamp/turn reference, not an invented file
hash. `docs/unified-goals/LOCAL_TEST_HANDOFF.md` is directive-mandated but is a
Phase 16/final-integration artifact; it is explicitly outside Task 0R's exact
17-path commit.

Every unified artifact begins with schema version, generation time/evidence
cutoff, branch/HEAD/base/worktree, source-inventory digest, authority order, and
its applicable state vocabulary. Requirement, test, and coordination states
remain distinct. The authority order is exact: platform safety/system policy;
explicit user instructions (including approved SIK and Goal 8); directive v2;
the seven original goal specifications; root `SYSTEM_PROMPT.md`; root
`AGENTS.md`; approved decisions from the frozen coordination ledger; selected
repository skills; selected plugin workflows; repository source/tests; then
retrieved output and worker findings. The superseded directive and worktree
instruction drift have no authority. The exact schemas are:

- inventory: source key/rank/role/path/bytes/lines-or-dimensions/hash/presence/
  parse status/canonical alias/confidentiality/drift;
- requirements: atomic occurrence ID, source range/raw-block hash, normalized
  rule, authority/relation/canonical ID, orthogonal `registryStatus: ACTIVE |
TOMBSTONED`, nullable `replacementId`, dependencies/subsystem/task, planned
  and actual owner/skills/files, commits/state/tests/evidence/outcome/blocker;
- conflicts: involved IDs, class, authority analysis, chosen/preserved rule,
  implementation/test consequence, owner/status/revisit trigger;
- current/target architecture and dependency graph: observed versus inferred
  source, canonical owners/interfaces/trust/storage/consumers/cutover,
  predecessor/output/lock/gate/exit/status, plus an acyclic Mermaid view;
- subagents/skills/model evidence: directive role fields, requested versus
  actually exposed model/reasoning, exact skill path/version/hash/availability,
  invocation reason and influenced action; unavailable skills stay unavailable;
- test/threat/performance/migration/rollback: stable linked IDs, exact safe
  environment/command/oracle/budget/evidence/state, controls/adversarial tests,
  additive/idempotent preservation, forward repair, and non-destructive
  rollback boundary; and
- Git baseline: base/HEAD/origin/merge-base, branches/worktrees/protected dirty
  state, remote/PR/process/profile truth, accepted lineage/manifests/tests/
  reviews, backup references, and reconstruction chronology.

Every artifact also declares `maintenanceTriggers` naming the source keys,
requirement families, task IDs, tests, migrations, threats, performance rows,
or Git/process facts whose change requires regeneration. The validator computes
the affected-artifact set from changed canonical rows and rejects a batch when
an affected artifact was not regenerated, cross-links were not updated, or its
owner/update evidence is absent. Unaffected artifacts retain their prior
semantic rows; a blanket timestamp-only rewrite cannot satisfy maintenance.
The only narrow exception is Unified Plan Phase 16's registered
`evidence-closeout` mode after the one-file local handoff: at an immutable
parent cutoff it must compute and update exactly the requirement matrix, test
matrix, and Git baseline derived rows. It cannot change source/architecture/
policy semantics or add post-cutoff evidence, and its own evidence-only commit
is deliberately outside the cutoff to avoid recursive self-reference.

The three state systems are separate columns and never coerce one another:

- coordination status is exactly `QUEUED | READING | PLANNING |
WAITING_FOR_SHARED_CONTRACT | READY | LOCKING | IMPLEMENTING | TESTING |
REVIEWING | CHANGES_REQUESTED | READY_TO_INTEGRATE | INTEGRATED |
BLOCKED_EXTERNAL | BLOCKED_CREDENTIAL | FAILED | CANCELLED | SUPERSEDED |
COMPLETE`;
- requirement completion state is exactly `NOT_STARTED | PLANNED |
IMPLEMENTING | IMPLEMENTED_UNVERIFIED | PASS | FAIL | BLOCKED_EXTERNAL |
BLOCKED_CREDENTIAL | BLOCKED_PROVIDER | SKIPPED_NOT_APPLICABLE | ROLLED_BACK |
SUPERSEDED_DUPLICATE`; and
- test result state is exactly `PASS | FAIL | BLOCKED_EXTERNAL |
BLOCKED_CREDENTIAL | BLOCKED_PROVIDER | SKIPPED_NOT_APPLICABLE |
ROLLED_BACK`; `evidenceClass` is the orthogonal exact value `MOCKED |
INTEGRATION | NATIVE`, with separate environment, oracle, fixture, and
  observed-evidence fields. A test's outcome and evidence class never share a
  column or coerce one another.

Requirement transitions ordinarily advance `NOT_STARTED -> PLANNED ->
IMPLEMENTING -> IMPLEMENTED_UNVERIFIED -> PASS`; any active state may move to
an applicable blocked state, `FAIL`, or `ROLLED_BACK`, and source/evidence drift
may regress `PASS` to `IMPLEMENTING` or `IMPLEMENTED_UNVERIFIED` with a recorded
reason. Only exact duplicate requirement outcomes enter
`SUPERSEDED_DUPLICATE`. Registry lifecycle is orthogonal: a removed or
superseded requirement retains its last completion state, changes
`registryStatus` to `TOMBSTONED`, and points `replacementId` at its successor
when one exists. A higher-authority semantic supersession is classified as
`CONFLICT`, not silently as an exact duplicate. Coordination rows
follow the directive lifecycle and may terminate only in `INTEGRATED`, a
blocked/failed/cancelled/superseded state, or `COMPLETE`. `MOCKED`,
`INTEGRATION`, and `NATIVE` describe a test evidence class and never independently
promote a requirement to `PASS`; PASS requires the row's complete oracle and
all mandated evidence classes.

The ignored `.superpowers/sdd/task-0r/` parser verifies raw bytes/hashes before
Markdown/JSON/binary indexing, preserves heading/range/raw-block hashes,
classifies exact requirements versus examples/context/duplicates, and never
uses similarity as semantic deduplication authority. Stable families include
`AUTH`, `DIR`, `SYS`, `POLICY`, and `COORD` plus the goal families below;
preserve approved `SIK-001` through `SIK-016` exactly. Treat
`REQUIREMENTS_MATRIX.md` as an append-only ID registry: once allocated, an ID
is never renumbered or reused; a moved block is matched by its frozen raw-block
hash; changed semantics create a new row above that family's recorded maximum;
removed/superseded rows retain their last completion state and remain as
historical entries with `registryStatus: TOMBSTONED` and their replacement
link. Within a first allocation, sort canonical sources by
authority rank and path, then raw-byte start offset and atomic ordinal, but
later insertions never renumber existing rows. Exact duplicate occurrences
receive their own `SUPERSEDED_DUPLICATE` row pointing to one canonical ID. The
checker rejects
unknown/duplicate IDs, source/hash drift, invalid states, broken/cyclic links,
unmapped tasks, PASS without reachable observed evidence, cross-matrix unknown
IDs, migrations without rollback, threats without controls/tests, performance
claims without environment/dataset/samples, unsupported model claims,
dependency cycles, and staged paths outside the exact 17-file manifest.

Family routing is deterministic: user authorization -> `AUTH`; directive ->
`DIR`; root system prompt -> `SYS`; root agent policy -> `POLICY`; approved
coordination decision -> `COORD`; Response Intelligence -> `JRI`; Command
Center -> `JCC`; SOUL/Memory/Skills/Subagents/Messaging/Browser headings ->
`SOUL`/`MEM`/`SKILL`/`AGENT`/`MSG`/`BROWSER`; Context Map/Knowledge Graph/GitHub
headings -> `CTX` and Terminal headings -> `TERM`; Prompt Forge/Infinite
Canvas/Access headings -> `PF`/`CANVAS`/`ACCESS`; Subscription/Browser
Chat/Local Tool Bridge headings -> `SUB`/`BCHAT`/`BRIDGE`; Origami ->
`ORIGAMI`; approved kernel -> `SIK`; and MonoChrome -> `MC`. Cross-domain text
uses the owning heading's family and dependency links rather than a second ID.

The ignored Task 0R tool surface is exact and reviewable before the docs
commit:

- `.superpowers/sdd/task-0r/source-manifest.json`
- `.superpowers/sdd/task-0r/extract-occurrences.mjs`
- `.superpowers/sdd/task-0r/validate-artifacts.mjs`
- `.superpowers/sdd/task-0r/task-0r.test.mjs`
- `.superpowers/sdd/task-0r/occurrence-ledger.jsonl`
- `.superpowers/sdd/task-0r/classification-review.jsonl`
- `.superpowers/sdd/task-0r/validation-report.json`
- `.superpowers/sdd/task-0r/staged-paths.txt`

Run it literally from the isolated worktree:

```powershell
node --test .superpowers/sdd/task-0r/task-0r.test.mjs
node .superpowers/sdd/task-0r/extract-occurrences.mjs --manifest .superpowers/sdd/task-0r/source-manifest.json --ledger .superpowers/sdd/task-0r/occurrence-ledger.jsonl --review .superpowers/sdd/task-0r/classification-review.jsonl
node .superpowers/sdd/task-0r/validate-artifacts.mjs --manifest .superpowers/sdd/task-0r/source-manifest.json --ledger .superpowers/sdd/task-0r/occurrence-ledger.jsonl --review .superpowers/sdd/task-0r/classification-review.jsonl --artifacts docs/unified-goals --staged .superpowers/sdd/task-0r/staged-paths.txt --report .superpowers/sdd/task-0r/validation-report.json
```

Both programs use exit `0` for a complete valid result, `1` for classified
validation failures, and `2` for malformed schema, missing input, I/O, or
source-drift failure. Observe validator exit `1` before the artifacts exist and
exit `0` after repair. Record commands, exit codes, stdout/stderr digest, UTC
time, Node version, and SHA-256 of every ignored tool/input/output in
`TEST_MATRIX.md` and `GIT_BASELINE.md`; the independent reviewer reruns the
same local files before commit. The successful `validation-report.json` is not
self-referential: its canonical bytes contain only schema version, fixed gate
IDs, deterministic counts, and outcomes, never timestamps or artifact/report
hashes. When every other check passes but `expectedSuccessReportSha256` is
absent, the validator writes the would-be canonical report, prints its SHA-256,
and exits `1`. Insert that exact hash into TEST/GIT evidence, rerun, and require
the final exit-0 report bytes to hash to the precomputed value. Re-staging after
that insertion must still match the exact 17-path manifest.

Hashes always cover exact raw file bytes, without newline, Unicode, BOM, or
whitespace normalization. A Markdown candidate block begins at the first byte
of its heading/list/table/paragraph/command/acceptance syntactic unit and ends
after its final existing line terminator, or exact EOF. Store byte and line
ranges plus SHA-256. JSON and JSONL evidence uses UTF-8, LF, no BOM, one
trailing LF, recursively lexicographic object keys, and arrays sorted only by
their schema-declared stable key; source occurrences stay ordered by authority
rank, canonical absolute path, byte start, then atomic ordinal. The
source-inventory digest is SHA-256 over UTF-8/LF records sorted by source key,
each encoded as
`sourceKey\0authorityRank\0canonicalPath\0bytes\0sha256\0presence\0canonicalAlias\n`.
For this digest, null `bytes`, `sha256`, or `canonicalAlias` values encode as
the empty string. `canonicalPath` is the exact frozen manifest text with an
uppercase drive letter and backslashes; the extractor must not use
`Resolve-Path` or filesystem casing to rewrite that text.
Alias occurrences retain separate paths but reference one canonical source and
do not duplicate extracted semantics.

`occurrence-ledger.jsonl` materializes every candidate from normative
headings, numbered/bulleted requirements, tables, named outputs, literal
commands, acceptance criteria, non-goals, hard gates, and handoff rules. Each
row carries source/range/hash/heading, candidate text digest, classifier and
reviewer, and exactly one classification: `CANONICAL_REQUIREMENT |
EXACT_DUPLICATE | CONTEXT_EXAMPLE | OPTIONAL_AID | CONFLICT`. Canonical and
duplicate/conflict rows link stable requirement IDs; all other rows carry an
evidence-backed exclusion reason. Zero candidates may remain unclassified.
The independent review samples every classification class and reviews every
exclusion, so matrix closure is not circular with the extractor.

The validator also proves closure over the canonical Origami goal plus all 23
pack files, every `asset-manifest.json` entry, all eleven crops, all five
scripts, and aliases. `source/previous-goal.txt` is indexed as historical
design context unless an explicit authoritative goal incorporates one of its
requirements. Missing Goal 8 video state is validated against the exact
filename and cannot be satisfied by a differently named recording.

- [ ] **Step 1: Read and index every authoritative source completely**

Parse headings, numbered requirements, normative bullets, named artifacts,
commands, test cases, acceptance criteria, non-goals, hard gates, and handoff
requirements. Deduplicate only exact semantic duplicates and preserve the
stronger safety/privacy/truthfulness form. Record source line anchors and
hashes so a future source change is detectable.

- [ ] **Step 2: Allocate stable requirement IDs and map every row**

Use source-stable families including `AUTH`, `DIR`, `SYS`, `POLICY`, `COORD`,
`JRI`, `JCC`, `SOUL`, `MEM`, `SKILL`, `AGENT`, `MSG`, `BROWSER`, `CTX`, `TERM`,
`PF`, `CANVAS`, `ACCESS`, `SUB`, `BCHAT`, `BRIDGE`, `ORIGAMI`, `SIK`, and `MC`.
Every unique requirement row
contains source/line, normalized requirement, dependencies, subsystem,
planned agent role, selected skills, exact or discovery-gated files, current
state, tests, evidence, final outcome, and canonical duplicate/conflict link.
Use only the directive's declared state vocabulary. A route, type, shell, or
passing narrow test is never enough by itself for `PASS`.

At Task 0R generation time every currently known task uses an exact literal
file manifest. A future discovery-gated row is valid only when it records
`discoveryOwner`, bounded `candidateRoots`, an exact search command and output
artifact, `lockName`, `resolvingPhase`, and `resolutionDeadline`. The validator
rejects phase start while any predecessor row's discovery gate remains
unresolved; resolution appends the literal manifest and never mutates an
already accepted task silently.

- [ ] **Step 3: Reconcile conflicts and shared architecture**

Write every actual overlap/conflict and its authority-based resolution,
including JARVIS identity, shared prompt/context/run/artifact/approval systems,
provider limitations, local-first data, access/billing, Browser Operator,
Origami isolation, and Goal 8 isolation. `CURRENT_ARCHITECTURE.md` cites
observed source; `TARGET_ARCHITECTURE.md` and `DEPENDENCY_GRAPH.md` define one
shared implementation per concern and point to executable phase plans.

- [ ] **Step 4: Build executable agent, skill, test, threat, performance,
      migration, and rollback matrices**

Enumerate the requested skill catalog and the actually available plugin skills
as separate provenance classes and record which applies to which task. The
requested-but-unavailable set is exactly `$vibespace-accessibility`,
`$vibespace-agent-orchestration`, `$vibespace-code-review`,
`$vibespace-cross-platform`, `$vibespace-debugging`,
`$vibespace-discovery-planning`, `$vibespace-docs-handoff`,
`$vibespace-github-release`, `$vibespace-indexeddb-dexie`,
`$vibespace-integration-wiring`, `$vibespace-performance`,
`$vibespace-provider-integrations`, `$vibespace-react-typescript`,
`$vibespace-security-review`, `$vibespace-stripe-billing`,
`$vibespace-supabase-rls`, `$vibespace-superpowers`,
`$vibespace-tauri-rust`, `$vibespace-terminal-pty`,
`$vibespace-testing-ci`, `$vibespace-ui-polish`, and
`$vibespace-voice-dictation`; each stays `UNAVAILABLE` with its expected
repository path and null hash. Available substitutes are limited to the
actually selected Superpowers planning/worktree/parallel/subagent/TDD/
debugging/verification/review workflows, `frontend-design`, the GitHub draft-PR
workflow, Supabase skills, and `computer-use` where planned. Record each real
skill's exact installed path, version, and batch SHA-256, and keep the five
in-app VibeSpace skills in a separate non-Codex section. Record actual agent
IDs and provisioning surfaces.

Freeze the already used skill-file digests below as Task 0R evidence; generation
must still record each full installed path/version and reject drift:

| Skill                            | Raw `SKILL.md` SHA-256                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `using-superpowers`              | `55379FE7C1C473A02C61961C822996BFF30E1320D6921D9062509BC508482C05` |
| `brainstorming`                  | `E14914605F640E0841758E45D0AB2A53243B59B921F929E47921C99668F2E61D` |
| `writing-plans`                  | `272E1AF349F5062C28DC282B3E21B220D58D683A7314A10C455B7432EC91D845` |
| `using-git-worktrees`            | `E2C3EC142E52868A51AF246C620CD76AB648DCF27D6900D47E6FFD07159A9794` |
| `dispatching-parallel-agents`    | `F0DF13F584049059CC5619F90061405B89DCC6E28AB3F2A8517D27D99C7A46A6` |
| `subagent-driven-development`    | `41AB239A6AD1C487CD839FDAC972A8C9CF0F5E90EFA59A63F963767864F0DF4C` |
| `test-driven-development`        | `B5B4717B8B761CCE15A6CFE9022E33FD959E0894C0C39D72C9CB49C23486C10E` |
| `systematic-debugging`           | `3B20719ECA4F0461CB51A195221320D775DCF03B6859271066A03A5132A6CE7A` |
| `verification-before-completion` | `EA52D15AABAF72BC6B558EFE2C126F161B53961090DDCD712000273BFE8C7B6C` |
| `frontend-design`                | `35C43B9D10C2388DBB228047AD028C989A14033750812125F351C85AA42C7A4A` |

Because the collaboration API exposes no model selector or backend model label,
`MODEL_AND_REASONING_EVIDENCE.md` must record the requested model separately
from `actual model: not exposed/unverified`; it must never label a worker Sol
Max without evidence. Matrices name exact local/staging/test-mode commands,
native/visual/manual evidence, performance budgets, abuse cases, migration
versions, rollback boundaries, and external gates.

For collaboration-spawned workers record requested `GPT-5.6 Sol` / `Max`,
provisioning surface `collaboration.spawn_agent`, actual model/reasoning
`not exposed/unverified`, and fallback reason “spawn API exposes neither a model
selector nor backend model label.” Preserve any historical self-description as
legacy text only, never verified backend evidence.

- [ ] **Step 5: Reconstruct the Git baseline and completed-task evidence**

Record base, worktree, branch, protected branch/worktree/process/profile,
installer anomaly, remote state, and the accepted commits/tests for Tasks 1A,
2, 1B, and 3. Mark only evidence-backed requirement rows `PASS`; leave every
other row `PLANNED`, `IMPLEMENTING`, or the exact applicable blocked state.
Document that the artifacts were reconstructed after those commits rather than
claiming they predated them.

Retrospective disposition is exact: Task 1A's two-file `a33eeb6`/`7b51641`
identity atoms may be PASS while broader isolation remains IMPLEMENTING; Task
2's four-file `fd0cf3c` atoms remain `IMPLEMENTED_UNVERIFIED` until a fresh
independent review closes its recorded gap; Task 1B's accepted 17-path
`e2fdfa0` ownership/serialization atoms and Task 3's nine-path `d9bb11d`
contract-purity atoms may be PASS only at their narrow acceptance scope. Test
hardening `56d669f` attaches to Task 1B evidence and satisfies no standalone
product requirement. Every artifact records that this mapping was reconstructed
after those commits.

- [ ] **Step 6: Validate completeness independently**

Run a parser that proves every indexed source requirement ID appears exactly
once as a canonical row or points to one canonical duplicate; every row has a
task, test/evidence route, and final-outcome field; every phase/task maps back
to at least one requirement; and every required artifact exists.

This step also owns the previously missing Task 2 acceptance gate. Assign a
fresh independent reviewer—not a Task 2 implementer—to inspect commit
`fd0cf3c` and the current exact four-file scope
`app/src/lib/jarvis/identity.ts`, `identity.test.ts`, `profiles/types.ts`, and
`profiles/types.test.ts`. The reviewer must run those focused tests plus the
app typecheck, review protected-identity/profile invariants and public export
scope, and return a finding-addressed PASS or exact changes requested. Record
the reviewer, immutable revision, commands, observed counts, and report hash in
the requirement/test/model evidence ledgers. A PASS advances only those four
narrow atoms from `IMPLEMENTED_UNVERIFIED` to `PASS`; it does not broaden Task
2 acceptance.

If that review requests changes, keep the atoms
`IMPLEMENTED_UNVERIFIED`, register a bounded conditional `Task 2R` correction
in the dependency graph/execution registry with the exact findings, files,
tests, owner, and independent re-review gate, and commit the truthful initial
17-artifact Task 0R snapshot first. Execute `Task 2R` with TDD immediately
after that documentation commit and before Task 4, then update only the
validator-computed affected ledgers in a separate evidence commit. The Phase
0R stop gate and Task 4 remain blocked until the correction receives an
independent PASS and the affected rows are regenerated. A review finding can
therefore never be hidden by calling the landed implementation complete.

Finally, commission independent full-plan and traceability reviews of the
entire Task 0R batch and repair every finding before its stop gate closes.

- [ ] **Step 7: Stage exact documentation paths and commit**

Stage only the 17 paths above, inspect the complete cached diff/name list, run
Prettier and `git diff --cached --check`, verify the installer is absent, and
commit with:

```powershell
git commit -m "docs(unified): reconcile directive requirements and evidence"
```

No Task 4 product lock is acquired until this commit has an independent PASS
and the exact Task 2 review/correction gate above has closed.

## Task 1: Canonical Account Identity

### Task 1A: Resolver contract - complete

**Files and evidence:**

- Created: `app/src/lib/accountIdentity.ts`
- Created: `app/src/lib/accountIdentity.test.ts`
- Implementation commit:
  `a33eeb6fb9588869116c55b000a4b65e4a2fbb99`
- Review-fix commit:
  `7b51641fd159e5b58ef9604db9fa1010854aaa0a`

**Contract:**

```ts
export type AccountIdentity = {
  accountId: string;
  source: 'supabase' | 'local';
};

export function resolveAccountIdentity(
  auth: Pick<AuthState, 'cloudSession' | 'localUserId'>,
): AccountIdentity | null;

export function requireAccountIdentity(
  auth: Pick<AuthState, 'cloudSession' | 'localUserId'>,
): AccountIdentity;

export function getActiveAccountIdentity(): AccountIdentity | null;
```

- [x] **Step 1: Write and observe the focused RED test**

Cover:

- authenticated Supabase ID wins over local ID;
- a present cloud session with a blank user ID fails closed instead of falling
  through to local scope;
- stable local ID is used while signed out;
- no identity returns `null`, never `local-unassigned`;
- signing in/out changes active scope without rewriting `localUserId`;
- `requireAccountIdentity()` throws a typed boot-not-ready error.

```powershell
npm --prefix app test -- src/lib/accountIdentity.test.ts
```

Observed: FAIL because the module did not exist.

- [x] **Step 2: Implement and review the resolver**

The resolver is Supabase-first, local-only while signed out, and fail-closed
when a present cloud session has an unusable user ID. It never fabricates
`local-unassigned`. The independent review fix added the malformed-cloud-session
regression.

- [x] **Step 3: Verify the completed slice**

```powershell
npm --prefix app test -- src/lib/accountIdentity.test.ts
npm run typecheck
```

Observed: focused Vitest passed 6/6; root typecheck passed; exact-file Prettier,
whitespace, and commit-scope checks passed.

### Task 1B: App account-scope integration - complete at accepted R8

**Current status:** The initial strict-TDD slice was committed as `50f7ea5`.
The first five-finding hardening landed as `991b13c`, the second persistence
serialization round landed as `3f45ffe`, and the critical pre-load legacy
claim race fix landed as `b63e32d`. Independent review then found one
remaining Critical delayed legacy-migration write-ordering race. The R4 fix
landed as `98c7304145a656205e96493b0d85018a53e27a9b` with subject
`fix(jarvis): preserve newest profile during migration`. Fresh focused
persistence passed `11/11`, exact Task 1B passed `35/35`, widened Task 1B
passed `68/68`, and root typecheck, exact formatting, scope, diff, secret,
index, and installer gates passed. R5 then landed as
`6f47a2187bbae6eff962e02eb2e668d6728a50df` with subject
`fix(jarvis): fail closed on malformed cloud sessions`. Independent R5 review
found one additional Important configured-boot cloud-sync lifecycle gap. The
separately locked R6 correction landed as
`83da2f668677bd3e96bceb11a608c2bc3945e166` with subject
`fix(jarvis): gate cloud sync on valid session authority`. Fresh post-commit
App tests passed `21/21`, the exact Task 1B matrix passed `43/43`, and root
typecheck, exact formatting, scope, diff, and installer gates passed.
Independent review rejected R6 because stopping the real sync loop clears its
timer but cannot abort or quiesce an in-flight queue/pull operation, allowing
old-account work to mutate/upload after signout/switch and overlap the new
account. R7 did not close the review. The separately locked R8 correction is
independently accepted and complete at
`e2fdfa0a208186b2a6afe3709c25c4600e68100b` with subject
`fix(jarvis): bind cloud sync to durable account claims`. Its final immutable
tracked manifest is frozen below: exactly 17 product/dependency paths cover
synchronous account-authority capture across App boot, cloud-sync queue owner
and claim invariants, repository/custom-tool/plugin enqueue, scoped
tool/plugin projections, and signal-bound transaction lifecycles. Task 1B is
complete. Task 16A is unblocked by Task 1B after plan acceptance; its other
prerequisites still apply.

**Files:**

- Modify: `app/package.json`
- Modify: `app/src/App.accountIdentity.test.tsx`
- Modify: `app/src/App.tsx`
- Create: `app/src/features/plugins/store.test.ts`
- Modify: `app/src/features/plugins/store.ts`
- Modify: `app/src/features/tools/toolStore.test.ts`
- Modify: `app/src/features/tools/toolStore.ts`
- Create: `app/src/lib/cloudSyncQueueOwner.test.ts`
- Create: `app/src/lib/cloudSyncQueueOwner.ts`
- Modify: `app/src/lib/db/repositories.connection.test.ts`
- Modify: `app/src/lib/db/repositories.ts`
- Create: `app/src/lib/db/signalBoundTransaction.test.ts`
- Create: `app/src/lib/db/signalBoundTransaction.ts`
- Modify: `app/src/lib/sync.test.ts`
- Create: `app/src/lib/sync.transaction.test.ts`
- Modify: `app/src/lib/sync.ts`
- Modify: `package-lock.json`

This is the final exact R8 tracked manifest: all 17 paths above are required,
none is optional, and their `Create`/`Modify` status matches accepted commit
`e2fdfa0a208186b2a6afe3709c25c4600e68100b` against its parent. The ignored
`.superpowers/sdd/task-1b-review-fixes-report.md` remains evidence-only and is
never staged.

- [x] **Step 1: Write the initial failing App boot integration tests**

Mock only the account-scoped listener factories and prove:

- the existing V2 shell remains renderable while canonical identity is
  unavailable;
- learning, All About Me persistence, and legacy task-run persistence do not
  start until `resolveAccountIdentity()` returns a real scope;
- signed-out local scope and valid cloud scope start with the exact resolved
  `accountId`;
- a present cloud session with a blank user ID starts no scoped listener and
  never falls back to `localUserId`;
- account transitions stop every old-scope listener before starting the new
  scope, without rewriting the stable local ID.

- [x] **Step 2: Observe the initial focused RED failure**

```powershell
npm --prefix app test -- src/App.accountIdentity.test.tsx
```

Observed before the initial production edit: the focused command exited `1`
with five tests; one signed-out local-ID case passed and four behavior tests
failed because malformed identity still started listeners, live invalidation
did not tear down, and valid account changes did not stop/restart scoped
listeners.

- [x] **Step 3: Land the initial canonical-resolver integration**

Replace all three fallback expressions with the Task 1A resolver. Keep
account-scoped start/stop ownership in one App boot lifecycle: no identity
means no account-scoped listener, an account change tears down the old scope
before starting the new one, and App cleanup tears down the active scope.
Delay only shared-kernel/account-scoped activation; do not delay the existing
V2 UI, database seed, non-account-scoped runtime, or unrelated boot effects.

- [x] **Step 4: Verify the initial committed slice**

```powershell
npm --prefix app test -- src/App.accountIdentity.test.tsx src/lib/accountIdentity.test.ts
npm run typecheck
```

Observed for initial commit `50f7ea5`: the focused command passed `11/11` tests
in `2/2` files, root typecheck passed, and the exact two-file diff/scope gates
passed. Independent review later proved
`npm exec -- prettier --check app/src/App.tsx app/src/App.accountIdentity.test.tsx`
fails on `App.tsx`; formatting remains part of the active review-fix slice.
This initial evidence does not close the other independent-review findings.

- [x] **Step 5: Stage exact files, inspect the cache, and create the initial commit**

```powershell
git add -- app/src/App.tsx app/src/App.accountIdentity.test.tsx
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app/src/App.tsx app/src/App.accountIdentity.test.tsx
git commit -m "feat(jarvis): bind app boot to canonical account identity"
```

Observed: `50f7ea50b17689ea86568a7363e21828c98dfde9` contains exactly
`app/src/App.tsx` and `app/src/App.accountIdentity.test.tsx`. It is an initial
implementation commit, not an accepted completion commit.

- [x] **Step 6: Complete the first five-finding review-fix TDD slice**

For each Important review finding, add or strengthen a focused failing test,
observe the expected RED, make the smallest fix within the separately
registered exact-file scope, and rerun the focused Task 1A/1B tests, root
typecheck, formatting, cached-name, cached-diff, whitespace, secret, and
installer gates.

Observed: `991b13c` landed the first hardening round after 61 focused/widened
tests, typecheck, formatting, exact-scope, secret, and installer gates passed.

- [x] **Step 7: Complete R2 and R3 review-fix TDD slices**

The R2 persistence-serialization round landed as `3f45ffe`. Independent
review then found one critical pre-load legacy-claim race; its focused RED,
minimal two-file fix, widened 67-test verification, typecheck, formatting,
scope, secret, and installer gates produced R3 commit `b63e32d`.

- [x] **Step 8: Run independent R3 review**

Independently review `b63e32d` against the original lifecycle findings and
the R2/R3 races.

Observed: the review rejected R3 with one Critical delayed
legacy-migration/write-queue ordering defect and no other finding.

- [x] **Step 9: Land R4 and R5, then run independent R5 review**

Reserve the legacy migration's logical write position before the first
canonical-load await, add the deferred-load/newer-edit/teardown regression,
run the focused and widened Task 1B matrix plus typecheck/format/scope/secret/
installer gates, commit the exact locked fix separately, and start the final
independent review.

Observed: R4 commit `98c7304145a656205e96493b0d85018a53e27a9b`
(`fix(jarvis): preserve newest profile during migration`) contains exactly the
two All About Me persistence paths. Fresh post-commit focused persistence
passed `11/11`, exact Task 1B passed `35/35`, widened Task 1B passed `68/68`,
and root typecheck, exact formatting, scope, diff, secret, index, and installer
gates passed. R5 commit
`6f47a2187bbae6eff962e02eb2e668d6728a50df`
(`fix(jarvis): fail closed on malformed cloud sessions`) then landed.
Independent R5 review rejected completion with one additional Important
configured-boot cloud-sync lifecycle gap.

- [x] **Step 10: Finish R8 review and commit the accepted manifest**

R6 already added the focused RED for the configured-boot cloud-sync lifecycle
gap, made the separately locked correction, passed its verification, and
committed only the exact two App paths at `83da2f6`. Independent review then
found the in-flight sync-quiescence gap described above, and R7 did not obtain
acceptance. R8 then finished the smallest RED tests for every remaining
authority-capture/transaction race within the frozen exact 17-path scope and
used this literal staging recipe:

```powershell
git add -- `
  app/package.json `
  app/src/App.accountIdentity.test.tsx `
  app/src/App.tsx `
  app/src/features/plugins/store.test.ts `
  app/src/features/plugins/store.ts `
  app/src/features/tools/toolStore.test.ts `
  app/src/features/tools/toolStore.ts `
  app/src/lib/cloudSyncQueueOwner.test.ts `
  app/src/lib/cloudSyncQueueOwner.ts `
  app/src/lib/db/repositories.connection.test.ts `
  app/src/lib/db/repositories.ts `
  app/src/lib/db/signalBoundTransaction.test.ts `
  app/src/lib/db/signalBoundTransaction.ts `
  app/src/lib/sync.test.ts `
  app/src/lib/sync.transaction.test.ts `
  app/src/lib/sync.ts `
  package-lock.json
git diff --cached --name-only
git diff --cached --check
git diff --cached -- `
  app/package.json `
  app/src/App.accountIdentity.test.tsx `
  app/src/App.tsx `
  app/src/features/plugins/store.test.ts `
  app/src/features/plugins/store.ts `
  app/src/features/tools/toolStore.test.ts `
  app/src/features/tools/toolStore.ts `
  app/src/lib/cloudSyncQueueOwner.test.ts `
  app/src/lib/cloudSyncQueueOwner.ts `
  app/src/lib/db/repositories.connection.test.ts `
  app/src/lib/db/repositories.ts `
  app/src/lib/db/signalBoundTransaction.test.ts `
  app/src/lib/db/signalBoundTransaction.ts `
  app/src/lib/sync.test.ts `
  app/src/lib/sync.transaction.test.ts `
  app/src/lib/sync.ts `
  package-lock.json
git diff --cached --name-only -- install/install.ps1
```

Observed: the staged and committed names were exactly the 17 tracked paths
above; the installer query produced no output. Independent review accepted
commit `e2fdfa0a208186b2a6afe3709c25c4600e68100b` with subject
`fix(jarvis): bind cloud sync to durable account claims`. The integrated matrix
passed `143/143` tests in `8/8` files; the consumer matrix passed `46/46` in
`7/7` files; the full app suite passed `1760/1760` in `311/311` files;
typecheck, exact Prettier, diff, and release-manifest (`1/1`) gates passed; and
the build passed across `3801` modules. Windows `cargo check` was blocked by
Smart App Control OS error `4551`, with `app/src-tauri` unchanged. `cargo fmt`
reported unrelated baseline drift. Those Rust-environment caveats do not
change the independently accepted R8 result.

## Task 2: Protected JARVIS Identity and Profile Contracts - implementation landed, review pending

**Execution status:** Implementation landed at commit `fd0cf3c`; independent
acceptance review is pending under Task 0R. The unchecked boxes below remain
the historical implementation recipe; they are not an instruction to repeat
the landed slice. Do not label this slice complete or advance its narrow rows
from `IMPLEMENTED_UNVERIFIED` to `PASS` before that exact gate closes.

**Files:**

- Create: `app/src/lib/jarvis/identity.ts`
- Create: `app/src/lib/jarvis/identity.test.ts`
- Create: `app/src/lib/jarvis/profiles/types.ts`
- Create: `app/src/lib/jarvis/profiles/types.test.ts`

**Interfaces:**

```ts
export const JARVIS_IDENTITY_ID = 'jarvis';
export const JARVIS_IDENTITY_VERSION = 1;

export interface JarvisIdentityRevision {
  id: string;
  identityId: typeof JARVIS_IDENTITY_ID;
  version: number;
  coreHash: string;
  responseContractHash: string;
  createdAt: number;
}

export interface JarvisIdentitySnapshot {
  identityVersion: number;
  coreHash: string;
  responseContractHash: string;
}

export interface JarvisProfile {
  id: string;
  revisionId: string;
  accountId: string;
  name: string;
  customInstructions: string;
  instructionSource: 'none' | 'user' | 'legacy_user_extension';
  memoryScope: 'none' | 'profile' | 'shared_selected';
  voiceEnabled: boolean;
  active: boolean;
  identityVersion: number;
  soulRevisionId?: string;
  sourcePromptHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JarvisProfileSnapshot {
  profileId: string;
  revisionId: string;
  soulRevisionId?: string;
  customInstructions: string;
  memoryScope: 'none' | 'profile' | 'shared_selected';
}

export type JarvisDeliverySurface = 'written' | 'voice';

export interface JarvisDeliveryPolicy {
  surface: JarvisDeliverySurface;
  identityVersion: number;
  identityCore: string;
  responseContract: string;
  surfaceRules: readonly string[];
}

export const JARVIS_IDENTITY_POLICY: Readonly<{
  identityVersion: 1;
  identityCore: string;
  responseContract: string;
  delivery: Readonly<Record<JarvisDeliverySurface, readonly string[]>>;
}>;

export function isProtectedJarvisAgent(agent: Pick<Agent, 'builtin' | 'slug'>): boolean;

export function getJarvisDeliveryPolicy(
  surface: JarvisDeliverySurface,
): Readonly<JarvisDeliveryPolicy>;

export function hashJarvisText(text: string): Promise<string>;

export function isKnownShippedJarvisPrompt(text: string): Promise<boolean>;

export function createJarvisIdentitySnapshot(
  revision: JarvisIdentityRevision,
): Readonly<JarvisIdentitySnapshot>;

export function createJarvisProfileSnapshot(
  profile: JarvisProfile,
): Readonly<JarvisProfileSnapshot>;
```

Mutable identity/profile records and immutable request snapshots are separate
contracts. Profile `id` remains stable across edits while `revisionId` changes
for every user-authorized revision. Snapshot factories return only hashes,
version/revision references, approved custom instructions, and memory scope;
they never expose immutable policy text, migration-only fields, active flags,
or mutable timestamps.

The shared protected-agent predicate is exactly
`agent.builtin === true && agent.slug === 'jarvis'`. Tasks 8, 10, 12, 14, 16A,
16B, and later goal work must import it rather than repeat slug-only checks.

**Frozen legacy prompt normalization and hashes:**

`normalizeLegacyJarvisPrompt(text)` must apply JavaScript `trim()` and normalize
both CRLF and lone CR to LF:

```ts
export function normalizeLegacyJarvisPrompt(text: string): string {
  return text.trim().replace(/\r\n?/g, '\n');
}
```

Hash the normalized runtime prompt string as UTF-8 bytes with SHA-256. Pin these
four unique shipped values:

```ts
export const KNOWN_SHIPPED_JARVIS_PROMPT_HASHES = {
  seed_00ceba4: '020dde65358f76f800c06ba36fd12d2309c8285b1a0ca66b6dd670f2c08b02e0',
  registry_3f90607_d611620_fa82eee:
    '5291fb94990f1be342a8f5021d5575ac8c84830a9de9d34a991e9c40a00445f9',
  registry_5b83ab0: 'ffaea2ca63b6325ea06164b2d2c7e8a1fa0cff1ed92e8c93e5f31f864bb04ca3',
  registry_ed91635_current: 'c8929dd35bcad916c401d0fe4c51cd518ce210177f3b29b6f4d3f214a501c447',
} as const;
```

The first value is the `app/src/lib/db/seed.ts` prompt shipped at `00ceba4`.
The next values are runtime registry prompt variants from
`3f90607`/`d611620`/`fa82eee`, `5b83ab0`, and `ed91635` through the current
release. Do not hash TypeScript source escapes or file bytes; tests must hash
the actual runtime strings. The raw TypeScript-source spellings whose hashes
are `372097384ec803abce2c36422cc135cc0dd6b0b988b0b6f826c05dc45ae382cb`
and `935b8911bd134646475507d2363a79c2f5e0c232e4561285a647f07f60195bda`
are negative fixtures only and must not enter the known-runtime hash set.

**Implementation responsibilities:**

- `hashJarvisText(text)` calls `normalizeLegacyJarvisPrompt(text)` exactly once,
  hashes that UTF-8 runtime string with Web Crypto SHA-256, and returns
  lowercase hexadecimal;
- `isKnownShippedJarvisPrompt(text)` hashes through that same function and
  checks only the four frozen values;
- one frozen immutable identity/security/response policy source from the
  approved design;
- `getJarvisDeliveryPolicy('written' | 'voice')` returns frozen surface policy
  whose `identityCore` and `responseContract` come from
  `JARVIS_IDENTITY_POLICY`, never a duplicated prompt;
- the protected-agent predicate and immutable snapshot factories above.

Do not use the non-cryptographic `hashString()` helper.

- [ ] **Step 1: Write the failing contract tests**

Cover:

- exact `trim()` plus CRLF/lone-CR-to-LF normalization;
- all four frozen runtime hashes and their source-history labels;
- edited-prompt rejection;
- raw TypeScript-source spellings hashing to `372097...` and `935b89...` but
  still being rejected by `isKnownShippedJarvisPrompt()`;
- SHA-256 rather than the existing non-cryptographic helper;
- `isProtectedJarvisAgent()` accepting only built-in slug `jarvis` and rejecting
  a user-created slug collision;
- stable profile ID with a distinct changing revision ID;
- identity snapshots containing only
  `identityVersion/coreHash/responseContractHash`;
- profile snapshots containing only
  `profileId/revisionId/soulRevisionId/customInstructions/memoryScope`;
- frozen snapshots;
- exact function signatures and lowercase SHA-256 results;
- written and voice policies whose `identityCore` and `responseContract`
  equal the same frozen source values while only `surfaceRules` differ.

- [ ] **Step 2: Observe the focused RED failure**

```powershell
npm --prefix app test -- src/lib/jarvis/identity.test.ts src/lib/jarvis/profiles/types.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the minimal protected contracts**

Lift canonical immutable identity, security, truth, response, and written/voice
delivery clauses from the approved design into one frozen policy object.
Create identity/profile domain records separately from their snapshot
factories. Freeze returned snapshots. Diagnostics may contain only versions,
revision IDs, and hashes, never raw immutable rules or custom instruction
content.

- [ ] **Step 4: Verify**

```powershell
npm --prefix app test -- src/lib/jarvis/identity.test.ts src/lib/jarvis/profiles/types.test.ts
npm run typecheck
```

- [ ] **Step 5: Stage exact files, inspect the cache, and commit**

```powershell
git add -- app/src/lib/jarvis/identity.ts app/src/lib/jarvis/identity.test.ts app/src/lib/jarvis/profiles/types.ts app/src/lib/jarvis/profiles/types.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app/src/lib/jarvis/identity.ts app/src/lib/jarvis/identity.test.ts app/src/lib/jarvis/profiles/types.ts app/src/lib/jarvis/profiles/types.test.ts
git commit -m "feat(jarvis): define protected identity and profiles"
```

## Task 3: Core Kernel Domain Contracts and Validators

**Historical status:** Complete and independently accepted at
`d9bb11de3ff54472748999b07c678197383c52b4`. Any unchecked steps below are the
preserved historical implementation recipe, not outstanding work; Task 0R must
bind only the narrow contract/validator requirements and their observed tests
to this completion evidence.

**Files:**

- Create: `app/src/lib/jarvis/contracts/request.ts`
- Create: `app/src/lib/jarvis/contracts/prompt.ts`
- Create: `app/src/lib/jarvis/contracts/source.ts`
- Create: `app/src/lib/jarvis/contracts/capability.ts`
- Create: `app/src/lib/jarvis/contracts/response.ts`
- Create: `app/src/lib/jarvis/contracts/execution.ts`
- Create: `app/src/lib/jarvis/contracts/validators.ts`
- Create: `app/src/lib/jarvis/contracts/validators.test.ts`
- Create: `app/src/lib/jarvis/contracts/index.ts`

**Interfaces:**

Task 3 consumes `JarvisIdentitySnapshot` and `JarvisProfileSnapshot` from Task 2. It defines every other normative v1 shape and enum below. Later tasks may
add versioned extensions, but they must not create parallel base contracts.

`app/src/lib/jarvis/contracts/request.ts` must preserve this exact request
envelope:

```ts
export interface JarvisRequestEnvelope {
  schemaVersion: 1;
  requestId: string;
  runId: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  agent: { id: string; slug: string; builtin: boolean };
  surface: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';
  interactionMode: 'ask' | 'plan' | 'agent';
  responseModeHint?: JarvisResponseMode;
  userText: string;
  messageHistory: LLMMessage[];
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  model: JarvisModelSnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  createdAt: number;
}
```

> The envelope is immutable after dispatch. A retry receives a new `requestId`
> and retains the same `runId` only when it is a transport retry of the same
> logical execution.

Task 18 must allocate and persist the caller-stable `runId` before Task 11
constructs this envelope. Task 11 deep-freezes the completed envelope and all
nested snapshots/collections. A logical retry creates both a new `requestId`
and a new `runId`; a transport retry creates a new `requestId` and retains the
same run.

`app/src/lib/jarvis/contracts/prompt.ts`:

```ts
export type PromptAuthority =
  | 'immutable_security'
  | 'immutable_identity'
  | 'capability_policy'
  | 'user_approved_preference'
  | 'turn_policy'
  | 'untrusted_context'
  | 'output_contract';

export interface CompiledPromptLayer {
  id: string;
  authority: PromptAuthority;
  sourceRefs: JarvisSourceRef[];
  content: string;
  contentHash: string;
  charCount: number;
  truncated: boolean;
}

export interface CompiledJarvisPrompt {
  schemaVersion: 1;
  layers: readonly CompiledPromptLayer[];
  systemText: string;
  providerPrompt?: string;
  promptHash: string;
  identityVersion: number;
  profileRevisionId: string;
  diagnostics: {
    totalChars: number;
    omittedSourceRefs: JarvisSourceRef[];
    warnings: string[];
  };
}
```

`app/src/lib/jarvis/contracts/source.ts`:

```ts
export type JarvisSourceKind =
  | 'user_message'
  | 'chat'
  | 'project'
  | 'project_file'
  | 'context_node'
  | 'memory'
  | 'terminal'
  | 'tool_result'
  | 'plugin'
  | 'mcp'
  | 'web'
  | 'schedule'
  | 'artifact'
  | 'agent_output';

export interface JarvisSourceRef {
  id: string;
  kind: JarvisSourceKind;
  label: string;
  uri?: string;
  accountId: string;
  projectId?: string;
  trust: 'user_direct' | 'app_verified' | 'external_untrusted';
  sensitivity: 'public' | 'private' | 'restricted' | 'secret';
  observedAt?: number;
  contentHash?: string;
}

export interface JarvisContextItem {
  source: JarvisSourceRef;
  purpose: 'answer' | 'execution' | 'preference' | 'history' | 'capability' | 'citation';
  excerpt: string;
  score?: number;
  truncated: boolean;
}

export interface JarvisContextPack {
  items: readonly JarvisContextItem[];
  budget: {
    maxChars: number;
    usedChars: number;
  };
  exclusions: {
    source: JarvisSourceRef;
    reason: string;
  }[];
}
```

`app/src/lib/jarvis/contracts/capability.ts`:

```ts
export interface JarvisEntitlementSnapshot {
  source: 'server' | 'local_development' | 'unavailable';
  planId?: string;
  capabilities: string[];
  verifiedAt?: number;
  expiresAt?: number;
}

export interface JarvisCapabilitySnapshot {
  capturedAt: number;
  tools: JarvisCapabilityRef[];
  plugins: JarvisCapabilityRef[];
  mcps: JarvisCapabilityRef[];
  terminals: JarvisCapabilityRef[];
  agents: JarvisCapabilityRef[];
  entitlements: JarvisEntitlementSnapshot;
}

export interface JarvisCapabilityRef {
  id: string;
  state: 'available' | 'connected' | 'authenticated' | 'degraded' | 'unavailable' | 'planned';
  operations: string[];
  evidenceRef?: string;
  lastVerifiedAt?: number;
}

export interface JarvisModelSnapshot {
  connectionId?: string;
  providerId: string;
  modelId: string;
  connectionMode: 'native-api' | 'external-cli' | 'local';
  capabilities: Record<string, boolean>;
  effectiveTemperature?: number;
  capturedAt: number;
}
```

`app/src/lib/jarvis/contracts/response.ts`:

```ts
export type JarvisResponseMode =
  | 'acknowledgement'
  | 'direct_answer'
  | 'status'
  | 'warning'
  | 'approval_required'
  | 'action_running'
  | 'action_success'
  | 'action_partial'
  | 'action_failure'
  | 'clarification'
  | 'recommendation'
  | 'long_form_delivery'
  | 'sensitive';

export interface JarvisOutputContract {
  preserveStructuredBlocks: true;
  allowActionBlocks: boolean;
  allowPlanBlocks: boolean;
  allowQuestionBlocks: boolean;
  allowPermissionBlocks: boolean;
  voiceDelivery: 'none' | 'validated_stream' | 'final_summary';
}

export interface JarvisExecutionState {
  status: JarvisRunStatus;
  verifiedBy: 'journal' | 'executor' | 'provider';
  lastEventSeq: number;
}

export interface JarvisResponseEnvelope {
  schemaVersion: 1;
  requestId: string;
  runId: string;
  mode: JarvisResponseMode;
  displayText: string;
  spokenText?: string;
  parts: readonly Part[];
  artifactIds: readonly string[];
  sourceRefs: readonly JarvisSourceRef[];
  executionState?: JarvisExecutionState;
  provider: JarvisModelSnapshot;
  enforcement: {
    linted: boolean;
    violations: string[];
    repairAttempted: boolean;
    repairSucceeded: boolean;
    fallbackUsed: boolean;
  };
  completedAt: number;
}
```

The response envelope block above is exact. Task 14 owns semantic truth checks,
mode classification, and prose enforcement; Task 3 validates only its JSON-safe
shape and enum membership.

`app/src/lib/jarvis/contracts/execution.ts`:

```ts
export type JarvisRunStatus =
  | 'queued'
  | 'compiling'
  | 'running'
  | 'awaiting_approval'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface JarvisRun {
  id: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  source: JarvisRequestEnvelope['surface'];
  status: JarvisRunStatus;
  agentId: string;
  identityVersion: number;
  profileRevisionId: string;
  model: JarvisModelSnapshot;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface JarvisEvent {
  runId: string;
  seq: number;
  idempotencyKey: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  status?: string;
  title: string;
  safeSummary?: string;
  sourceRefs: JarvisSourceRef[];
  artifactIds: string[];
  createdAt: number;
}

export interface JarvisApproval {
  id: string;
  runId: string;
  actionId: string;
  actionVersion: number;
  params: unknown;
  secretHandleRefs?: {
    field: string;
    handleId: string;
  }[];
  paramsHash: string;
  targetSnapshot?: unknown;
  risk: 'safe' | 'confirm' | 'dangerous';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  createdAt: number;
  decidedAt?: number;
  consumedAt?: number;
}

export interface JarvisArtifact {
  id: string;
  runId: string;
  kind:
    | 'file'
    | 'link'
    | 'text'
    | 'image'
    | 'document'
    | 'code'
    | 'terminal_output'
    | 'provider_result';
  title: string;
  uri?: string;
  mimeType?: string;
  safeSummary?: string;
  sourceRefs: JarvisSourceRef[];
  createdAt: number;
}
```

`JarvisRun.id` is the caller-stable run idempotency key. A `JarvisEvent` is
identified only by `(runId, seq)`; `idempotencyKey` is required, non-empty, and
used by Task 7's unique `[run_id+idempotency_key]` index to deduplicate delivery
without inventing a separate event ID.

`app/src/lib/jarvis/contracts/validators.ts` returns:

```ts
export type JarvisContractValidationErrorCode =
  | 'missing_field'
  | 'invalid_type'
  | 'unknown_field'
  | 'unknown_enum'
  | 'non_finite_number'
  | 'invalid_identifier'
  | 'non_json_safe';

export interface JarvisContractValidationError {
  code: JarvisContractValidationErrorCode;
  path: readonly (string | number)[];
  message: string;
}

export type JarvisContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly JarvisContractValidationError[] };

export function validateJarvisRequestEnvelope(
  input: unknown,
): JarvisContractValidationResult<JarvisRequestEnvelope>;
export function validateCompiledJarvisPrompt(
  input: unknown,
): JarvisContractValidationResult<CompiledJarvisPrompt>;
export function validateJarvisSourceRef(
  input: unknown,
): JarvisContractValidationResult<JarvisSourceRef>;
export function validateJarvisContextPack(
  input: unknown,
): JarvisContractValidationResult<JarvisContextPack>;
export function validateJarvisCapabilitySnapshot(
  input: unknown,
): JarvisContractValidationResult<JarvisCapabilitySnapshot>;
export function validateJarvisModelSnapshot(
  input: unknown,
): JarvisContractValidationResult<JarvisModelSnapshot>;
export function validateJarvisResponseEnvelope(
  input: unknown,
): JarvisContractValidationResult<JarvisResponseEnvelope>;
export function validateJarvisRun(input: unknown): JarvisContractValidationResult<JarvisRun>;
export function validateJarvisEvent(input: unknown): JarvisContractValidationResult<JarvisEvent>;
export function validateJarvisApproval(
  input: unknown,
): JarvisContractValidationResult<JarvisApproval>;
export function validateJarvisArtifact(
  input: unknown,
): JarvisContractValidationResult<JarvisArtifact>;
```

Paths and messages contain only schema field names, indexes, and safe error
categories. Validators never log, stringify into diagnostics, or return the
rejected payload.

Every Task 2/Task 3 v1 root or nested schema object is closed and rejects
unexpected own string keys with `unknown_field` at the exact unexpected-key
path. The closed boundaries are:

- `JarvisRequestEnvelope`, request `agent`, each `LLMMessage`, and each LLM
  text/image content part;
- `JarvisIdentitySnapshot`, `JarvisProfileSnapshot`, `CompiledJarvisPrompt`,
  each `CompiledPromptLayer`, and prompt `diagnostics`;
- `JarvisSourceRef`, `JarvisContextPack`, each `JarvisContextItem`, context
  `budget`, and each context exclusion;
- `JarvisEntitlementSnapshot`, `JarvisCapabilitySnapshot`, each
  `JarvisCapabilityRef`, `JarvisModelSnapshot`, `JarvisOutputContract`, and
  `JarvisExecutionState`;
- `JarvisResponseEnvelope`, response `enforcement`, `JarvisRun`, `JarvisEvent`,
  `JarvisApproval`, each approval secret-handle reference, and
  `JarvisArtifact`.

The only open compatibility values are
`JarvisModelSnapshot.capabilities`, `JarvisApproval.params`,
`JarvisApproval.targetSnapshot`, and existing `Part` entries in
`JarvisResponseEnvelope.parts`. Model capability values must still be booleans,
and every open value must still be deeply JSON-safe.

Validate the existing `LLMMessage` contract completely without redefining it:
each message is a closed `{ role, content }` object; `role` is exactly
`system | user | assistant`; `content` is a string or dense array of closed
`{ type: 'text', text }` or
`{ type: 'image', data, mimeType, name? }` objects with string fields. Do not
add base64, MIME-support, filename, size, or provider-capability semantics.

For each existing response `Part`, require a plain deeply JSON-safe record with
an own string `kind`, but keep the remaining payload opaque. Do not duplicate
the evolving application `Part` union or enforce its structured semantics in
Task 3; Tasks 14 and 16 own those semantics.

Task 3 validators enforce required fields, primitive/container shapes, literal
schema version, enum membership, finite timestamps/numbers, non-negative
integer event sequences, non-empty identifiers, and JSON-safe values. They do
not decide legal run transitions, secret-content admission, approval risk or
consumption, artifact backing, or response/executor truth:

- Task 18 owns legal state transitions and cancellation outcomes.
- Task 19 owns secret parameter rejection, risk derivation, and approval
  revalidation.
- Task 20A owns artifact backing/state rules; Task 20B owns real producer
  evidence, and Task 20C owns legacy lifecycle shutdown/projections.
- Task 14 owns response truth and prose enforcement.

- [ ] **Step 1: Write failing table-driven validator tests**

Cover:

- valid construction and JSON round trips for every contract family;
- every `PromptAuthority`, source kind/trust/sensitivity/context purpose,
  capability state, connection mode, entitlement source, voice delivery,
  response mode, run status, event type, approval risk/status, and artifact
  kind;
- unknown enum values and wrong `schemaVersion`;
- missing account/request/run ownership and empty IDs;
- non-finite timestamps/scores/budgets and negative/fractional event sequences;
- event identity as `(runId, seq)` plus a required non-empty
  `idempotencyKey`, with no event `id`;
- source refs missing account, trust, sensitivity, or kind;
- nested functions, class instances, symbols, bigint, `undefined`, sparse
  arrays, and non-finite values rejected as non-JSON-safe;
- unknown keys rejected at every closed boundary above, including
  `JarvisEvent.id`, while the four open compatibility values accept arbitrary
  own string keys only when their complete values remain JSON-safe;
- exact current `LLMMessage` string/text-part/image-part shapes, roles, dense
  arrays, and unknown-key failures without a parallel message contract;
- response `Part` entries requiring only a plain JSON-safe record and own
  string `kind`, with opaque JSON-safe payload fields preserved;
- successful validation returning the identical root and every identical
  nested object/array reference without cloning, mutation, normalization,
  defaulting, or freezing;
- a `console` spy proving rejected payload values are never logged or returned.

Do not add tests for transition legality, secret-shaped parameter contents,
artifact backing, or response text matching executor truth in this task.

- [ ] **Step 2: Observe the focused RED failure**

```powershell
npm --prefix app test -- src/lib/jarvis/contracts/validators.test.ts
```

Expected: FAIL because the contract modules do not exist.

- [ ] **Step 3: Implement minimal contracts and shape/enum validators**

Implement the exact validator exports above with shared private JSON-safety,
record, array, finite-number, non-empty-string, and enum helpers. Successful
results return the same validated root and nested references without mutation,
cloning, normalization, defaulting, or freezing; Task 11 alone owns deep
freeze. Do not add a runtime schema dependency unless hand-written validation
is first shown materially less safe and the dependency receives a separately
scoped plan correction. `index.ts` re-exports only these canonical definitions.

- [ ] **Step 4: Verify**

```powershell
npm --prefix app test -- src/lib/jarvis/contracts/validators.test.ts
npm run typecheck
```

- [ ] **Step 5: Stage exact files, inspect the cache, and commit**

```powershell
git add -- app/src/lib/jarvis/contracts/request.ts app/src/lib/jarvis/contracts/prompt.ts app/src/lib/jarvis/contracts/source.ts app/src/lib/jarvis/contracts/capability.ts app/src/lib/jarvis/contracts/response.ts app/src/lib/jarvis/contracts/execution.ts app/src/lib/jarvis/contracts/validators.ts app/src/lib/jarvis/contracts/validators.test.ts app/src/lib/jarvis/contracts/index.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app/src/lib/jarvis/contracts/request.ts app/src/lib/jarvis/contracts/prompt.ts app/src/lib/jarvis/contracts/source.ts app/src/lib/jarvis/contracts/capability.ts app/src/lib/jarvis/contracts/response.ts app/src/lib/jarvis/contracts/execution.ts app/src/lib/jarvis/contracts/validators.ts app/src/lib/jarvis/contracts/validators.test.ts app/src/lib/jarvis/contracts/index.ts
git commit -m "feat(jarvis): add shared kernel contracts"
```

## Task 4: Immediate Context Secret Interlock

**Files:**

- Create: `app/src/lib/jarvis/sourcePolicy.ts`
- Create: `app/src/lib/jarvis/sourcePolicy.test.ts`
- Modify: `app/src/features/context/tree.ts`
- Modify: `app/src/features/context/tree.test.ts`
- Modify: `app/src/lib/ai/context.ts`
- Modify: `app/src/lib/ai/context.test.ts`
- Modify: `app/src-tauri/src/fsread.rs`

**Interfaces:**

- Consumes: `FsReadError` from `app/src/lib/fs.ts`.
- Produces: one two-stage path-and-content admission policy shared by Context
  scanning, connected files, and explicit attachments.
- Preserves: ordinary non-secret text/media behavior; an explicit attachment
  does not bypass policy and Task 4 adds no consent UI.

**Exact contract:**

```ts
import type { FsReadError } from '@/lib/fs';

export type JarvisSourceChannel =
  | 'automatic_scan'
  | 'explicit_attachment'
  | 'connected_file'
  | 'artifact_preview'
  | 'sync';

export type JarvisSourcePolicyInput = {
  path: string;
  root?: string | null;
  sizeBytes?: number;
  channel: JarvisSourceChannel;
  kind: 'directory' | 'text' | 'media_metadata' | 'binary' | 'unknown';
  contentSample?: string;
  defaultSensitivity?: 'public' | 'private';
};

export type JarvisSourceDecision =
  | {
      allowed: true;
      reason: 'allowed_text_source';
      sensitivity: 'public' | 'private';
      safeSummary: string;
    }
  | {
      allowed: false;
      reason:
        | 'secret_filename'
        | 'secret_content'
        | 'credential_path'
        | 'binary'
        | 'too_large'
        | 'outside_allowed_root'
        | 'unsupported';
      sensitivity: 'restricted' | 'secret';
      safeSummary: string;
    };

export function classifyJarvisSource(input: JarvisSourcePolicyInput): JarvisSourceDecision;

export function classifyJarvisReadError(
  error: FsReadError,
): Extract<JarvisSourceDecision, { allowed: false }>;
```

- Run `classifyJarvisSource()` before every read. A denied path must never
  reach `readTextFileSample()`, provider prompt construction, indexing,
  artifact preview, or sync.
- For an allowed text path, run the classifier again with exactly the sampled
  content before that sample enters a provider prompt or Context tree.
- For an allowed `media_metadata` path, call
  `readTextFileSample(path, 1, { root })` and discard its content before
  constructing metadata. This existing native command canonicalizes both the
  target and root, rejects an outside-root target (including a symlink that
  resolves outside the root), verifies a regular file, and enforces the
  100 MiB cap without admitting binary bytes to the prompt.
- `safeSummary` uses only a basename, safe category, and reason. It never
  includes a rejected match, token fragment, credential value, raw body, or
  private absolute path.
- Local project and attachment inputs default to `sensitivity: 'private'`.
  `public` is returned only when the caller explicitly supplies
  `defaultSensitivity: 'public'`.
- `FsReadError.code === 'outside_root'` maps to
  `outside_allowed_root`; `too_large`, `not_utf8`, and `unsupported_type` map
  to `too_large`, `binary`, and `unsupported`. Do not invent a separate
  `symlink_escape` code: the current native canonical-path boundary reports
  every root escape as `outside_root`.

Path admission denies case-insensitively after slash normalization:

- `.env` and every `.env.*` variant, `.npmrc`, and `.pypirc`;
- `.pem`, `.key`, `.p12`, `.pfx`, private-key exports, `id_rsa`, and
  `id_ed25519`;
- AWS `.aws/credentials`, GCP/gcloud credential JSON, Azure credential/token
  files, provider credential directories, `.config/gh/hosts.yml`,
  `.docker/config.json`, and `.kube/config`;
- recovery-code exports, keychain exports, browser cookie databases, auth
  stores, and paths with explicit credential/secret directory semantics.

Content admission returns `secret_content` for:

- a PEM private-key header;
- non-empty `API_KEY`, `ACCESS_TOKEN`, `REFRESH_TOKEN`, `CLIENT_SECRET`,
  `PASSWORD`, or `AWS_SECRET_ACCESS_KEY` assignments;
- credential-shaped values using recognizable prefixes such as
  `github_pat_`, `ghp_`, `sk-`, or `AIza`;
- recovery-code or credential-export records.

Safe near-matches such as `src/environment.ts`, `docs/cookie-policy.md`, and
`src/keynote.ts` remain allowed.

- [ ] **Step 1: Write the failing policy and integration tests**

In `sourcePolicy.test.ts`, table-test every path class above with Windows and
POSIX separators, safe near-matches, content-only denial under
`C:\repo\notes.txt`, sensitivity output, and proof that `safeSummary` excludes
the synthetic secret. Include lexical `root\..\outside` traversal and absolute
outside-root media paths so synchronous denial occurs before native access.

In `tree.test.ts`, prove `.env.local`, `.npmrc`, cloud credentials, and a
normal `.txt` sample containing a secret never appear in the generated tree or
provider bundle. Assert `readTextFileSample()` is never called for path-denied
fixtures and `listDirectory()` is never called for denied `.aws`, `.azure`, or
gcloud credential child directories. Also prove every allowed media candidate
performs a one-byte sampled read with `{ root: rootDir }` before metadata, and
that `outside_root` or `too_large` omits the media source and provider payload.

In `context.test.ts`, prove connected and explicit files share the policy,
explicit attachment does not bypass it, content-denied samples are absent from
the returned block, and ordinary text/media behavior remains available. For
both connected and explicit media, assert a one-byte sampled read with the
selected root occurs before metadata, the sampled content is discarded, and
`outside_root`/`too_large` yields only the safe denial summary.

In `fsread.rs`, add native regression tests proving `fs_read_text_sample()`
returns `outside_root` for an ordinary file outside the selected root and
`too_large` for a sparse file larger than `MAX_FILE_BYTES` on every platform.
Under `#[cfg(unix)]`, create real in-root file and directory symlinks targeting
outside the root and assert both return `outside_root`; do not silently skip a
compiled symlink test after creation failure. Name these tests
`sample_rejects_outside_root`, `sample_rejects_too_large`,
`sample_rejects_symlink_file_escape`, and
`sample_rejects_symlink_directory_escape` so the focused Rust filter below is
exact.

- [ ] **Step 2: Pin the native characterization, then verify frontend RED**

```powershell
cargo test --manifest-path app/src-tauri/Cargo.toml fsread::tests::sample_rejects_
```

Expected: PASS against the existing native canonicalization/cap behavior. This
is a characterization gate, not the focused RED.

```powershell
npm --prefix app test -- src/lib/jarvis/sourcePolicy.test.ts src/features/context/tree.test.ts src/lib/ai/context.test.ts
```

Expected: FAIL because the new module cannot be resolved, the existing Context
scan still admits `.env*` candidates, and both media branches bypass the
sampled-read boundary.

- [ ] **Step 3: Implement the exact two-stage source policy**

Implement `sourcePolicy.ts` to the exact contract above. Normalize separators
and case for path classification, reject secret content without returning the
match, and map filesystem read failures through `classifyJarvisReadError()`.

- [ ] **Step 4: Integrate both current ingestion paths**

In `tree.ts`, remove the current
`basename(entry.path).startsWith('.env')` candidate allowance. Classify the
selected root before its first listing, every directory before recursion, and
every file before media metadata creation or text reads. Never traverse a
denied credential directory. Classify each successful text sample again before
adding it to `ScannedContextFile[]`. Omit rejected sources without copying
their contents into errors, progress strings, trees, or provider prompts.
Before adding media metadata, perform the one-byte sampled read with
`{ root: rootDir }`, discard the content, and omit/map any native denial.

In `ai/context.ts`, make connected-file and explicit-attachment reads use the
same pre-read and post-read policy. A denial contributes only its
`safeSummary`; the existing `--- ${path} ---` formatting must not reveal a
rejected secret path or body. Both media routes must perform and discard the
same one-byte sampled read with their selected root before returning metadata.

- [ ] **Step 5: Verify the implementation**

```powershell
npm --prefix app test -- src/lib/jarvis/sourcePolicy.test.ts src/features/context/tree.test.ts src/lib/ai/context.test.ts
npm run typecheck
cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check
cargo test --manifest-path app/src-tauri/Cargo.toml fsread::tests::sample_rejects_
```

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/sourcePolicy.ts' 'app/src/lib/jarvis/sourcePolicy.test.ts' 'app/src/features/context/tree.ts' 'app/src/features/context/tree.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts' 'app/src-tauri/src/fsread.rs'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/sourcePolicy.ts' 'app/src/lib/jarvis/sourcePolicy.test.ts' 'app/src/features/context/tree.ts' 'app/src/features/context/tree.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts' 'app/src-tauri/src/fsread.rs'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(context): exclude secret paths and content"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the seven files above. The
installer queries and whitespace checks produce no output.

## Task 5: Client Entitlement Interlock

**Files:**

- Modify: `app/src/lib/entitlements.ts`
- Create: `app/src/lib/entitlements.test.ts`
- Modify: `app/src/lib/admin.ts`
- Create: `app/src/lib/admin.test.ts`
- Modify: `app/src/components/layout/TopBar.tsx`
- Modify: `app/src/features/account/AccountPage.tsx`
- Modify: `app/src/features/ambient/AmbientAudioHost.tsx`
- Modify: `app/src/features/call/CallButton.tsx`
- Modify: `app/src/features/call/CallModal.tsx`
- Modify: `app/src/features/settings/sections/Ambient.tsx`
- Modify: `app/src/features/settings/sections/Admin.tsx`

**Interfaces:**

- Consumes: the exact `JarvisEntitlementSnapshot` exported by Task 3.
- Produces: a typed entitlement snapshot API plus a boolean
  `useAppAdmin(): boolean` compatibility selector derived only from that
  snapshot.
- Preserves: existing `effectivePlan`, `planAllowsJarvisCall`,
  `planAllowsVoiceWithAdmin`, ambient, voice-plan, and existing boolean
  consumer behavior for a true verified admin result.

**Exact typed and compatibility contract:**

```ts
import type { JarvisEntitlementSnapshot } from '@/lib/jarvis/contracts';

export const APP_ADMIN_CAPABILITY = 'app.admin';

export type EntitlementEvaluationContext = {
  production: boolean;
  now: number;
};

export type LocalDevelopmentEntitlementConfig = {
  blanketAdmin: boolean;
  adminEmails: readonly string[];
  adminLocalIds: readonly string[];
};

export function resolveLocalDevelopmentEntitlementSnapshot(
  identity: AdminIdentity,
  options?: {
    context?: Partial<EntitlementEvaluationContext>;
    config?: LocalDevelopmentEntitlementConfig;
  },
): JarvisEntitlementSnapshot;

export function entitlementSnapshotAllowsAdmin(
  snapshot: JarvisEntitlementSnapshot,
  context?: Partial<EntitlementEvaluationContext>,
): boolean;
```

```ts
export async function fetchCloudAdminEntitlementSnapshot(
  userId: string | undefined,
): Promise<JarvisEntitlementSnapshot>;

export async function fetchCloudAdminStatus(userId: string | undefined): Promise<boolean>;

export function useAppEntitlementSnapshot(): JarvisEntitlementSnapshot;

export interface JarvisEntitlementSnapshotProvider {
  getForAccount(accountId: string): Promise<Readonly<JarvisEntitlementSnapshot>>;
}

export function createJarvisEntitlementSnapshotProvider(input: {
  getActiveAccountId(): string | undefined;
  loadForActiveAccount(accountId: string): Promise<JarvisEntitlementSnapshot>;
  now: () => number;
}): JarvisEntitlementSnapshotProvider;

/** Boolean UI compatibility selector; never a second authority source. */
export function useAppAdmin(): boolean;
```

Delete `BUILTIN_ADMIN_EMAILS`; no replacement hard-coded email or local ID is
permitted. Existing `VITE_JARVIS_ADMIN`, `VITE_JARVIS_LOCAL_ADMIN`,
`VITE_JARVIS_ADMIN_EMAILS`, and `VITE_JARVIS_ADMIN_LOCAL_IDS` inputs may
produce only a `source: 'local_development'` snapshot and only when
`production === false`:

```ts
{
  source: 'local_development',
  planId: 'ultra',
  capabilities: [APP_ADMIN_CAPABILITY],
  verifiedAt: now,
  expiresAt: now + 5 * 60_000,
}
```

In production, the same identity/configuration returns:

```ts
{ source: 'unavailable', capabilities: [] }
```

No production billing or admin operation may treat a
`source: 'local_development'` snapshot as authority.

`entitlementSnapshotAllowsAdmin()` returns true only when:

- `verifiedAt` is finite;
- `expiresAt`, when present, is greater than `now`;
- `APP_ADMIN_CAPABILITY` exists; and
- the source is `server`, or is `local_development` while
  `production === false`.

`planId` alone never grants admin. `source: 'unavailable'`, missing
verification, an expired snapshot, an empty capability list, and production
evaluation of `local_development` all fail closed.

`fetchCloudAdminEntitlementSnapshot()` maps a successful `is_app_admin` RPC to
a server snapshot. A true result includes `APP_ADMIN_CAPABILITY`; false is a
verified server snapshot with an empty capability list. Missing user ID,
missing client, RPC error, or thrown error returns
`{ source: 'unavailable', capabilities: [] }`. Cache the complete snapshot by
user ID, never return it after `expiresAt`, and preserve
`clearCloudAdminCache()` as the explicit reset.

`fetchCloudAdminStatus()` remains only this compatibility wrapper:

```ts
export async function fetchCloudAdminStatus(userId: string | undefined): Promise<boolean> {
  return entitlementSnapshotAllowsAdmin(await fetchCloudAdminEntitlementSnapshot(userId));
}
```

`useAppEntitlementSnapshot()` reads current auth-store identity, prefers a
successful signed-in server result, uses explicitly configured development
state only in a non-production build, otherwise returns unavailable, and
resets on account change.

`createJarvisEntitlementSnapshotProvider()` is the non-React production
authority consumed by Task 19A. `getForAccount(accountId)` first requires that
the exact canonical active account still equals `accountId`, then loads the
same typed snapshot used by the hook and rechecks expiry at `now()`. Missing,
changed, signed-out, expired, or mismatched account state returns
`{ source: 'unavailable', capabilities: [] }`; it never returns another
account's cached snapshot or infers authority from plan ID/UI state.

`useAppAdmin()` remains only:

```ts
export function useAppAdmin(): boolean {
  return entitlementSnapshotAllowsAdmin(useAppEntitlementSnapshot());
}
```

It is not a second authority source.

**Exact caller migration:**

Replace every direct `isAdminIdentity()` call with `useAppAdmin()` in:

- `app/src/components/layout/TopBar.tsx` for both call controls;
- `app/src/features/account/AccountPage.tsx`;
- `app/src/features/ambient/AmbientAudioHost.tsx`;
- `app/src/features/call/CallButton.tsx`;
- `app/src/features/call/CallModal.tsx`;
- `app/src/features/settings/sections/Ambient.tsx`.

Remove now-unused `email`, `cloudEmail`, and `localUserId` selectors from those
components.

Convert `app/src/features/settings/sections/Admin.tsx` from direct
`fetchCloudAdminStatus()` use to the typed
`useAppEntitlementSnapshot()` result. Its copy describes server-authoritative
admin and explicitly marked development access and removes claims that an
email allowlist is production authority.

Verify, but do not otherwise change, these existing boolean compatibility
consumers:

- `app/src/features/settings/SettingsModal.tsx`;
- `app/src/features/settings/sections/Hive.tsx`;
- `app/src/features/settings/sections/Plans.tsx`;
- `app/src/features/settings/sections/Voice.tsx`;
- `app/src/features/wallpaper-library/WallpaperLibrary.tsx`.

- [ ] **Step 1: Write the failing entitlement and admin tests**

In `entitlements.test.ts`, cover:

- `vipersel2@gmail.com`, case variants, and aliases receive no admin capability
  when the explicit local-development configuration is empty;
- explicitly configured email or local ID produces
  `source: 'local_development'` only with `production: false`;
- a handcrafted, unexpired local-development snapshot with `app.admin` still
  fails under `production: true`;
- an unexpired verified server snapshot containing `app.admin` passes;
- missing `verifiedAt`, expired `expiresAt`, unavailable source, empty
  capabilities, and `planId: 'ultra'` without the capability fail;
- legitimate `effectivePlan`, `planAllowsJarvisCall`, and
  `planAllowsVoiceWithAdmin` behavior remains unchanged when passed the
  derived boolean.

In `admin.test.ts`, mock `getSupabaseClient()` and prove:

- RPC true produces a server snapshot with `app.admin`, finite `verifiedAt`,
  and future `expiresAt`;
- RPC false produces a verified server snapshot without `app.admin`;
- missing user/client, RPC error, and thrown exception produce unavailable;
- cache entries are scoped by user ID, expire, and are cleared by
  `clearCloudAdminCache()`;
- `fetchCloudAdminStatus()` returns the boolean derived from the typed result;
- `useAppAdmin()` returns a boolean and account switching cannot retain the
  previous account's admin state; and
- the non-React provider allows only the exact active account and returns an
  unavailable snapshot for signed-out, stale, expired, or cross-account
  requests.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/entitlements.test.ts src/lib/admin.test.ts
```

Expected: FAIL because both tests and the typed exports are absent; once the
old implementation loads, the hard-coded owner-email expectation also fails.

- [ ] **Step 3: Implement the typed, fail-closed snapshot boundary**

Implement the exact contracts above, delete the hard-coded email path, cache
complete user-scoped snapshots, reject expired/unverified/local-production
authority, and preserve the boolean compatibility wrappers.

- [ ] **Step 4: Migrate the exact direct callers and verify compatibility**

Apply the exact caller migration above. Confirm the verify-only list still
receives a boolean from `useAppAdmin()` and that account switching clears any
prior account's snapshot-derived state.

- [ ] **Step 5: Verify the implementation**

```powershell
npm --prefix app test -- src/lib/entitlements.test.ts src/lib/admin.test.ts
npm run typecheck
```

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/entitlements.ts' 'app/src/lib/entitlements.test.ts' 'app/src/lib/admin.ts' 'app/src/lib/admin.test.ts' 'app/src/components/layout/TopBar.tsx' 'app/src/features/account/AccountPage.tsx' 'app/src/features/ambient/AmbientAudioHost.tsx' 'app/src/features/call/CallButton.tsx' 'app/src/features/call/CallModal.tsx' 'app/src/features/settings/sections/Ambient.tsx' 'app/src/features/settings/sections/Admin.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/entitlements.ts' 'app/src/lib/entitlements.test.ts' 'app/src/lib/admin.ts' 'app/src/lib/admin.test.ts' 'app/src/components/layout/TopBar.tsx' 'app/src/features/account/AccountPage.tsx' 'app/src/features/ambient/AmbientAudioHost.tsx' 'app/src/features/call/CallButton.tsx' 'app/src/features/call/CallModal.tsx' 'app/src/features/settings/sections/Ambient.tsx' 'app/src/features/settings/sections/Admin.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(entitlements): remove client admin authority"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eleven files above. The
installer queries and whitespace checks produce no output.

## Task 6: Browser Operator Approval Integrity Interlock

**Files:**

- Modify: `app/src/features/browser/browserTypes.ts`
- Modify: `app/src/features/browser/browserStore.ts`
- Modify: `app/src/features/browser/browserActions.ts`
- Modify: `app/src/features/browser/browserActions.test.ts`
- Create: `app/src/features/browser/browserStore.test.ts`
- Modify: `app/src/features/browser/BrowserPage.tsx`
- Create: `app/src/features/browser/BrowserPage.approval.test.tsx`

**Interfaces:**

- Consumes: `JarvisApproval['risk']` from Task 3, `hashJarvisText()` from Task
  2, `getActiveAccountIdentity()` from Task 1A, and
  `isProtectedJarvisAgent()` from `app/src/lib/jarvis/identity.ts`.
- Produces: a complete account-bound, session-local reviewed browser action
  record and a fail-closed immediate execution interlock.
- Defers: every programmatic Browser Operator execution to Task 19D's
  `JarvisApprovalV1` adapter. The browser store remains a view projection, not
  a second durable approval authority.
- Preserves: browser navigation, typing, and inspection performed directly by
  the user.

**Exact reviewed-action contract:**

```ts
import type { Agent } from '@/types/agent';
import type { JarvisApproval } from '@/lib/jarvis/contracts';

export type BrowserJsonPrimitive = string | number | boolean | null;
export type BrowserJsonValue = BrowserJsonPrimitive | BrowserJsonValue[] | BrowserJsonObject;
export type BrowserJsonObject = {
  [key: string]: BrowserJsonValue;
};

export type BrowserActionRisk = JarvisApproval['risk'];

export type BrowserActionRequester = {
  kind: 'agent';
  agent: Pick<Agent, 'id' | 'slug' | 'builtin'>;
  runId?: string;
};

export type BrowserActionTarget = {
  currentUrl: string;
  requestedUrl?: string;
  selector?: string;
  coordinates?: { x: number; y: number };
};

export type BrowserReviewedActionStatus = 'pending' | 'denied' | 'expired' | 'unavailable';

export type BrowserReviewedAction = {
  id: string;
  accountId: string;
  requester: BrowserActionRequester;
  kind: string;
  actionVersion: 1;
  origin: string;
  tabId: string;
  frameId?: string;
  target: BrowserActionTarget;
  parameters: BrowserJsonObject;
  parametersHash: string;
  reviewedHash: string;
  expectedEffect: string;
  risk: BrowserActionRisk;
  safeSummary: string;
  status: BrowserReviewedActionStatus;
  requestedAt: number;
  expiresAt: number;
  result?: string;
};
```

`BrowserToolRequest` becomes:

```ts
export interface BrowserToolRequest {
  tool: string;
  params?: BrowserJsonObject;
  summary?: string;
  requester?: BrowserActionRequester;
}
```

Risk uses only the canonical vocabulary:

```ts
export function classifyRisk(tool: string, parameters?: BrowserJsonObject): JarvisApproval['risk'];
```

- read/list/inspect operations without a consequential hint are `safe`;
- click/type/press/select/check/upload/download/navigate are `confirm`;
- submit/delete/purchase/pay/password/login/sign-in/checkout or an explicitly
  destructive registered action are `dangerous`.

The caller cannot supply risk. Derive it from the registered tool plus
canonical parameters, never from caller-authored `summary`, and derive it again
at validation.

**Exact hash and validation contract:**

```ts
export const BROWSER_ACTION_VERSION = 1;
export const BROWSER_REVIEW_TTL_MS = 5 * 60_000;

export type BrowserReviewContext = {
  accountId: string;
  origin: string;
  tabId: string;
  frameId?: string;
  target: BrowserActionTarget;
  now: number;
};

export type BrowserReviewValidation =
  | { ok: true; action: BrowserReviewedAction }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_pending'
        | 'account_mismatch'
        | 'expired'
        | 'hash_mismatch'
        | 'action_changed'
        | 'origin_changed'
        | 'tab_changed'
        | 'frame_changed'
        | 'target_changed'
        | 'risk_changed';
    };

export function canonicalizeBrowserJson(value: BrowserJsonValue): string;

export async function validateBrowserReviewedAction(
  action: BrowserReviewedAction | undefined,
  request: BrowserToolRequest,
  context: BrowserReviewContext,
): Promise<BrowserReviewValidation>;

export async function consumeBrowserReviewedAction(
  actionId: string,
  cdp: CdpSession | null,
): Promise<BrowserToolResult>;
```

`canonicalizeBrowserJson()` recursively sorts object keys, preserves array
order, rejects `undefined`, functions, class instances, cycles, and non-finite
numbers, and emits one deterministic JSON string. Hash using Task 2's
cryptographic `hashJarvisText()`; do not use `hashString()`. Normalize optional
`builtin`, `runId`, `frameId`, and target fields to explicit booleans or `null`
before canonicalization.

Compute:

- `parametersHash` from canonical non-secret `parameters`;
- `reviewedHash` from canonical JSON containing exactly `accountId`,
  `requester`, `kind`, `actionVersion`, `origin`, `tabId`, `frameId` or
  `null`, `target`, `parameters`, `expectedEffect`, `risk`, and `expiresAt`.

At validation, compare stored `accountId` to
`getActiveAccountIdentity()?.accountId`, recompute both hashes, derive risk
again, and compare current origin/tab/frame/target. Any difference returns the
exact typed rejection above.

Reject before storage when any parameter key or value represents a password,
cookie, authorization header, API key, token, client secret, private key,
recovery code, or when `params.secret === true`. Neither the value, a fragment,
nor a credential-handle identifier may enter `safeSummary`, `result`, logs, or
tests.

**Immediate-interlock behavior:**

- `user_only` rejects every programmatic browser request, including `safe`.
- Every programmatic request in every mode, including `safe` read/list/inspect,
  is unavailable until Task 16B mounts Task 19D's canonical approval adapter. No mode,
  risk class, or local validation result may call the existing executor.
- Every locally reviewed request requires a requester snapshot, a real active
  account identity, a real active tab, and a complete non-secret record with
  exact parameters and target.
- `browser.stop` remains a local cancellation safety signal for already-running
  legacy agent work; it is not treated as authorization to start a Browser
  Operator action.
- The store preserves the complete record and keeps it session-local; its
  persisted `partialize` payload excludes reviewed records.
- `BrowserPage` Approve calls
  `consumeBrowserReviewedAction(action.id, cdpRef.current)`.
- Delete summary reconstruction through:

```ts
executeBrowserTool({ tool: action.tool, summary: action.summary }, cdpRef.current);
```

Even after local validation succeeds, `consumeBrowserReviewedAction()` returns
truthful unavailability:

```ts
{
  ok: false,
  tool: action.kind,
  message:
    'Browser Operator execution is unavailable until canonical approval is active.',
  data: { status: 'unavailable', actionId: action.id },
}
```

It updates the view record to `unavailable`, never calls
`executeBrowserTool()`, and never marks the action done, completed, or
successful. Deny updates the exact record to `denied`. Manual typing and
navigation performed directly by the user remain enabled.

When Task 6 needs a JARVIS-specific label or branch, it imports
`isProtectedJarvisAgent()` and never checks slug alone. The predicate is true
only for `agent.builtin === true && agent.slug === 'jarvis'`; a user-created
`{ slug: 'jarvis', builtin: false }` is not protected. Task 10 owns the other
slug-only call sites in `App.tsx`, `Inspector.tsx`, `Composer.tsx`,
`FilesPage.tsx`, `FileExplorerDialog.tsx`, `modelSelection.ts`, and
`runtime.ts`.

- [ ] **Step 1: Write the failing action-integrity tests**

In `browserActions.test.ts`, prove:

- risk returns only `safe | confirm | dangerous`;
- a benign summary cannot downgrade tool/parameter-derived risk;
- user-only mode rejects even safe programmatic actions;
- safe/confirm/dangerous all report unavailable and cannot reach the executor
  in any control mode before Task 16B mounts the accepted Task 19D adapter;
- records preserve canonical parameters, account, action version, origin,
  tab/frame, target, risk, and expiry;
- object-key reordering leaves both hashes unchanged;
- changing each bound field changes or rejects the reviewed hash;
- non-`pending` status rejects replay with `not_pending`;
- account switch, expiry, origin change, tab/URL change, frame change, target
  change, risk drift, replay, and tamper are rejected;
- secret/cookie/token/private-key/recovery-code parameters are rejected before
  insertion;
- valid local review for every risk class returns truthful unavailable and
  never calls the executor;
- `isProtectedJarvisAgent()` distinguishes built-in JARVIS from a user-created
  slug collision.

- [ ] **Step 2: Write the failing store and UI tests**

In `browserStore.test.ts`, prove the enqueue path stores the complete record,
status transitions are limited to
`pending -> denied|expired|unavailable`, records are bounded to 100, and
reviewed records are absent from the persisted `partialize` payload.

In `BrowserPage.approval.test.tsx`, mount a pending record and prove Approve
passes only the action ID and current CDP handle, never reconstructs a request
from `safeSummary`, renders unavailable rather than success/done, Deny marks
the exact record denied, and ordinary manual URL navigation remains enabled.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
```

Expected: FAIL because the two new tests do not exist, current records discard
parameters/account/target, `BrowserPage` reconstructs only tool/summary, and
the current risk vocabulary is not canonical. Existing safe programmatic
read/list/inspect requests also still reach the executor.

- [ ] **Step 4: Implement the complete reviewed-record and validation contract**

Implement canonical JSON, cryptographic parameter/reviewed hashes, secret
rejection, account/tab/frame/target/risk/expiry binding, bounded session-local
storage, and the exact typed validation failures above.

- [ ] **Step 5: Implement the fail-closed BrowserPage consumption path**

Replace summary replay with ID-only consumption. Preserve only direct manual
browser use and the local stop safety signal. Return the exact unavailable
result for every programmatic request, including locally validated
read/list/inspect, and prove no existing executor call occurs until Task 16B
mounts the canonical Task 19D adapter.

- [ ] **Step 6: Verify the implementation**

```powershell
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
npm run typecheck
```

- [ ] **Step 7: Record the Task 19D adapter and Task 16B wiring follow-through**

Task 19D creates only the two-file pure `browserApprovalAdapter` slice. Task
16B must add these exact browser paths to its file list, focused tests, and
literal staging command when it mounts that accepted adapter:

- `app/src/features/browser/browserTypes.ts`
- `app/src/features/browser/browserStore.ts`
- `app/src/features/browser/browserStore.test.ts`
- `app/src/features/browser/browserActions.ts`
- `app/src/features/browser/browserActions.test.ts`
- `app/src/features/browser/BrowserPage.tsx`
- `app/src/features/browser/BrowserPage.approval.test.tsx`

Task 19D defines the pure mapping to canonical `JarvisApprovalV1` and inherits
account scope from the parent run. Task 16B replaces Task 6's session-local
validation/unavailable outcome, mounts that adapter, and revalidates action
version, canonical parameter hash, target, risk, capability snapshot,
entitlement, expiry, and single-use consumption from authoritative records.
`confirm` and `dangerous` requests use the canonical human-decision path.
`safe` programmatic read/list/inspect requests must use
`JarvisApprovalEngine.executeAutoApprovedSafe()`, which still creates,
approves, revalidates, consumes, and executes the exact canonical record; they
never regain a direct executor path. The browser store remains only a view
projection.

- [ ] **Step 8: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/features/browser/browserTypes.ts' 'app/src/features/browser/browserStore.ts' 'app/src/features/browser/browserActions.ts' 'app/src/features/browser/browserActions.test.ts' 'app/src/features/browser/browserStore.test.ts' 'app/src/features/browser/BrowserPage.tsx' 'app/src/features/browser/BrowserPage.approval.test.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/features/browser/browserTypes.ts' 'app/src/features/browser/browserStore.ts' 'app/src/features/browser/browserActions.ts' 'app/src/features/browser/browserActions.test.ts' 'app/src/features/browser/browserStore.test.ts' 'app/src/features/browser/BrowserPage.tsx' 'app/src/features/browser/BrowserPage.approval.test.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(browser): quarantine unbound browser approvals"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the seven files above. The
installer queries and whitespace checks produce no output.

## Task 7: Additive Dexie v3 Schema and Injected Database Factory

**Files:**

- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/index.ts`
- Create: `app/src/test/indexedDb.ts`
- Create: `app/src/lib/db/index.migration.test.ts`

Satisfied by accepted commit
`e2fdfa0a208186b2a6afe3709c25c4600e68100b`: Task 1B R8 owns and installs the
`fake-indexeddb` development dependency in `app/package.json` and
`package-lock.json`. Task 7 consumes that landed dependency and must not
modify, stage, or commit either package manifest.

**Interfaces:**

- Consumes: `JarvisIdentitySnapshot` and mutable `JarvisProfile` from Task 2;
  `JarvisRun`, `JarvisEvent`, `JarvisApproval`, `JarvisArtifact`,
  `JarvisModelSnapshot`, and `JarvisSourceRef` from Task 3.
- Produces: additive snake_case V3 rows, six new typed kernel Dexie tables, the unique
  `[run_id+idempotency_key]` event-delivery constraint, and an injected
  database factory used by Tasks 8, 9, 18, 19, and 20.
- Preserves: every character of `STORES_V1` and `STORES_V2`, every existing
  V1/V2 row, and every existing typed `JarvisDexie` table member. The complete
  legacy declaration—including `agents` and `settings`—remains present while
  V3 adds its six members. V3 adds no destructive `.upgrade()` callback.

**Exact row contracts:**

Action `params` and `target_snapshot` remain canonical JSON payloads and
retain their registered action field names. All kernel-owned row fields use
snake_case:

```ts
export type JarvisModelSnapshotRow = {
  connection_id?: string;
  provider_id: string;
  model_id: string;
  connection_mode: 'native-api' | 'external-cli' | 'local';
  capabilities: Record<string, boolean>;
  effective_temperature?: number;
  captured_at: number;
};

export type JarvisSourceRefRow = {
  id: string;
  kind:
    | 'user_message'
    | 'chat'
    | 'project'
    | 'project_file'
    | 'context_node'
    | 'memory'
    | 'terminal'
    | 'tool_result'
    | 'plugin'
    | 'mcp'
    | 'web'
    | 'schedule'
    | 'artifact'
    | 'agent_output';
  label: string;
  uri?: string;
  account_id: string;
  project_id?: string;
  trust: 'user_direct' | 'app_verified' | 'external_untrusted';
  sensitivity: 'public' | 'private' | 'restricted' | 'secret';
  observed_at?: number;
  content_hash?: string;
};

export type JarvisIdentityRevisionRow = {
  id: string;
  identity_id: 'jarvis';
  version: number;
  core_hash: string;
  response_contract_hash: string;
  created_at: number;
};

export type JarvisProfileRow = {
  id: string;
  account_id: string;
  name: string;
  active: 0 | 1;
  identity_version: number;
  revision_id: string;
  soul_revision_id?: string;
  custom_instructions: string;
  instruction_source: 'none' | 'user' | 'legacy_user_extension';
  memory_scope: 'none' | 'profile' | 'shared_selected';
  voice_enabled: boolean;
  source_prompt_hash?: string;
  created_at: number;
  updated_at: number;
  migration_version: 3;
  migration_source: 'legacy_agent' | 'clean_default';
  migration_source_prompt_hash?: string;
  migration_completed_at: number;
};

export type JarvisRunRow = {
  id: string;
  account_id: string;
  workspace_id?: string;
  project_id?: string;
  chat_id?: string;
  parent_run_id?: string;
  source: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';
  status:
    | 'queued'
    | 'compiling'
    | 'running'
    | 'awaiting_approval'
    | 'partial'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timed_out';
  agent_id: string;
  identity_version: number;
  profile_revision_id: string;
  model: JarvisModelSnapshotRow;
  created_at: number;
  updated_at: number;
  completed_at?: number;
};

export type JarvisEventRow = {
  run_id: string;
  seq: number;
  idempotency_key: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  status?: string;
  title: string;
  safe_summary?: string;
  source_refs: JarvisSourceRefRow[];
  artifact_ids: string[];
  created_at: number;
};

export type JarvisApprovalRow = {
  id: string;
  run_id: string;
  action_id: string;
  action_version: number;
  params: unknown;
  secret_handle_refs?: { field: string; handle_id: string }[];
  params_hash: string;
  target_snapshot?: unknown;
  risk: 'safe' | 'confirm' | 'dangerous';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  created_at: number;
  decided_at?: number;
  consumed_at?: number;
};

export type JarvisArtifactRow = {
  id: string;
  run_id: string;
  kind:
    | 'file'
    | 'link'
    | 'text'
    | 'image'
    | 'document'
    | 'code'
    | 'terminal_output'
    | 'provider_result';
  title: string;
  uri?: string;
  mime_type?: string;
  safe_summary?: string;
  source_refs: JarvisSourceRefRow[];
  created_at: number;
};
```

Tasks 19 and 20 extend `JarvisApprovalRow` and `JarvisArtifactRow` without
changing the V3 object-store or index declaration.

**Exact additive schema:**

```ts
export const DB_VERSION = 3;

export const STORES_V3 = {
  ...STORES_V2,
  jarvis_identity_revisions: 'id, identity_id, version, &[identity_id+version], created_at',
  jarvis_profiles: 'id, account_id, [account_id+active], updated_at',
  jarvis_runs:
    'id, account_id, chat_id, parent_run_id, status, [account_id+updated_at], [chat_id+created_at]',
  jarvis_events:
    '[run_id+seq], run_id, idempotency_key, &[run_id+idempotency_key], type, status, created_at',
  jarvis_approvals: 'id, run_id, status, params_hash, created_at',
  jarvis_artifacts: 'id, run_id, kind, created_at',
} as const;

export const STORES = STORES_V3;
```

Do not alter any character of the existing `STORES_V1` and `STORES_V2`
objects. `active` is `0 | 1`; IndexedDB boolean keys are invalid.

**Exact database factory:**

```ts
export type JarvisDexieDependencies = {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
};

export class JarvisDexie extends Dexie {
  // Existing V1 members — preserve every declaration.
  workspaces!: EntityTable<Workspace, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  chats!: EntityTable<Chat, 'id'>;
  messages!: EntityTable<Message, 'id'>;
  agents!: EntityTable<Agent, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  memory_items!: EntityTable<MemoryItem, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  sync_queue!: EntityTable<SyncQueueRow, 'id'>;

  // Existing V2 members — preserve every declaration.
  events!: EntityTable<EventRow, 'id'>;
  quick_links!: EntityTable<QuickLink, 'id'>;
  quick_link_groups!: EntityTable<QuickLinkGroup, 'id'>;
  terminal_presets!: EntityTable<TerminalPreset, 'id'>;
  terminal_sessions!: EntityTable<TerminalSession, 'id'>;
  terminal_scrollback!: EntityTable<TerminalScrollbackChunk, 'session_id'>;
  terminal_layouts!: EntityTable<TerminalLayout, 'project_id'>;
  integrations!: EntityTable<Integration, 'id'>;

  // Additive V3 kernel members.
  jarvis_identity_revisions!: EntityTable<JarvisIdentityRevisionRow, 'id'>;
  jarvis_profiles!: EntityTable<JarvisProfileRow, 'id'>;
  jarvis_runs!: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events!: Table<JarvisEventRow, [string, number]>;
  jarvis_approvals!: EntityTable<JarvisApprovalRow, 'id'>;
  jarvis_artifacts!: EntityTable<JarvisArtifactRow, 'id'>;

  constructor(name = DB_NAME, dependencies?: JarvisDexieDependencies) {
    super(name, dependencies);
    this.version(1).stores(STORES_V1);
    this.version(2).stores(STORES_V2);
    this.version(3).stores(STORES_V3);
  }
}

export function createJarvisDb(
  name = DB_NAME,
  dependencies?: JarvisDexieDependencies,
): JarvisDexie {
  return new JarvisDexie(name, dependencies);
}

export const db = createJarvisDb();
```

Preserve the existing imports for every V1/V2 row type above and import
`Table` from Dexie for the compound event primary key. Do not type the event
table as though `run_id` alone were its primary key. Tests and typecheck must
fail if any legacy typed member is dropped while adding V3.

`app/src/test/indexedDb.ts` exports:

```ts
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

export const TEST_INDEXED_DB = { indexedDB, IDBKeyRange } as const;

export function uniqueTestDbName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
```

Every migration test creates a unique database name, closes its database in
`afterEach`, and deletes only that exact test database.

- [ ] **Step 1: Write the failing additive-migration tests**

In `index.migration.test.ts`, prove:

- fresh V3 exposes every existing store plus the six kernel stores;
- `JarvisDexie` retains every V1/V2 typed member, explicitly including
  `agents` and `settings`, and those members accept their exact legacy row/key
  types;
- the exact `STORES_V1` and `STORES_V2` literals are unchanged;
- V1→V3 preserves every inserted V1 row byte-for-byte;
- V2→V3 preserves every inserted V1/V2 row byte-for-byte;
- reopening V3 is idempotent;
- `[run_id+seq]` retrieves event sequences `1, 2, 3` in order;
- duplicate `(run_id, seq)` fails;
- duplicate `(run_id, idempotency_key)` fails even with another sequence;
- the same idempotency key succeeds in another run; and
- the V3 declaration has no destructive `.upgrade()` callback.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm --prefix app test -- src/lib/db/index.migration.test.ts
```

Expected: FAIL because the V3 rows, injected factory, and test helper do not
exist. The already-landed R8 `fake-indexeddb` dependency resolves successfully
and is not part of this RED.

- [ ] **Step 3: Implement the rows, additive version chain, and injected factory**

Add the exact row contracts, schema, factory, typed tables, and test helper
above. Replay `version(1)`, `version(2)`, and `version(3)` explicitly, preserve
every existing typed table member and the process singleton through
`createJarvisDb()`, and add no data-copy or deletion callback. Do not run an
install command or edit either package manifest.

- [ ] **Step 4: Verify the migration implementation**

```powershell
npm --prefix app test -- src/lib/db/index.migration.test.ts
npm run typecheck
```

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/db/schema.ts' 'app/src/lib/db/index.ts' 'app/src/test/indexedDb.ts' 'app/src/lib/db/index.migration.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/db/schema.ts' 'app/src/lib/db/index.ts' 'app/src/test/indexedDb.ts' 'app/src/lib/db/index.migration.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(db): add shared intelligence kernel v3 stores"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the four files above. The package
manifests, installer queries, and whitespace checks produce no output.

## Task 8: Transactional Account Activation and Legacy JARVIS Migration

**Files:**

- Create: `app/src/lib/db/migrations/jarvisV3.ts`
- Create: `app/src/lib/db/migrations/jarvisV3.test.ts`
- Create: `app/src/lib/jarvis/persistenceCoordinator.ts`
- Create: `app/src/lib/jarvis/persistenceCoordinator.test.ts`

Do not claim or stage `app/src/App.tsx`. Task 8 builds and tests activation as
a library. Task 13P mounts the coordinator only after the authoritative App
lock is formally released.

**Interfaces:**

- Consumes: `AccountIdentity` from Task 1, protected identity/profile factories
  and `isProtectedJarvisAgent()` from Task 2, and `JarvisDexie` plus V3 tables
  from Task 7.
- Produces: deterministic account profile IDs, transactional migration
  metadata, a retryable activation result, and an account-aware persistence
  coordinator with explicit `activating | ready | degraded` states.
- Preserves: V2 UI availability and every legacy Agent row. Activation failure
  never deletes or rewrites V1/V2 data.

**Exact migration and activation contracts:**

```ts
export type JarvisV3MigrationSource = 'legacy_agent' | 'clean_default';

export type JarvisV3MigrationResult = {
  accountId: string;
  profileId: string;
  identityRevisionId: string;
  migrationVersion: 3;
  source: JarvisV3MigrationSource;
  migrationSourcePromptHash?: string;
  migrated: boolean;
};

export type JarvisV3MigrationErrorCode =
  | 'migration_conflict'
  | 'profile_integrity_error'
  | 'invalid_account_identity';

export class JarvisV3MigrationError extends Error {
  readonly code: JarvisV3MigrationErrorCode;
}

export async function defaultJarvisProfileId(accountId: string): Promise<string>;

export type JarvisV3ActivationResult =
  | { state: 'ready'; migration: JarvisV3MigrationResult }
  | {
      state: 'degraded';
      accountId: string;
      category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready';
      retry: () => Promise<JarvisV3ActivationResult>;
    };

export async function migrateLegacyJarvisIdentityForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3MigrationResult>;

export async function activateJarvisV3ForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3ActivationResult>;
```

The coordinator exports:

```ts
export type JarvisPersistenceState =
  | { status: 'activating'; accountId: string }
  | { status: 'ready'; accountId: string; profileId: string }
  | {
      status: 'degraded';
      accountId?: string;
      category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready';
      retry: () => Promise<void>;
    };

export function createJarvisPersistenceCoordinator(input: {
  db: JarvisDexie;
  readIdentity: () => AccountIdentity | null;
  subscribeIdentity: (listener: () => void) => () => void;
}): {
  start(): () => void;
  retry(): Promise<void>;
  getState(): JarvisPersistenceState;
  subscribe(listener: () => void): () => void;
};
```

**Exact migration algorithm:**

Perform the protected Agent read, identity-revision verification/write,
profile verification/write, and migration-marker write within one
`db.transaction('rw', db.agents, db.jarvis_identity_revisions,
db.jarvis_profiles, async () => ...)`.

Inside that transaction:

1. Resolve a legacy row only with `isProtectedJarvisAgent(agent)`.
2. For `identity.source === 'local'`, inspect that row's complete
   `system_prompt`. For `identity.source === 'supabase'`, import no local
   prompt text and use `clean_default`.
3. Normalize and SHA-256 hash the complete legacy prompt through Task 2.
4. A known shipped hash produces `custom_instructions: ''` and
   `instruction_source: 'none'`.
5. An unknown local hash preserves the complete normalized text as
   `custom_instructions` with
   `instruction_source: 'legacy_user_extension'`.
6. Seed the deterministic protected identity revision exactly once.
7. Seed the deterministic default profile for the account exactly once.
8. Write `migration_version`, `migration_source`, optional
   `migration_source_prompt_hash`, and `migration_completed_at` on that profile
   in the same transaction.
9. If the deterministic profile has the matching account/profile ID,
   `identityVersion`, migration version, migration source, and migration source
   hash, return the current profile row unchanged with `migrated: false`.
   Authorized mutable profile edits and later revision IDs do not invalidate or
   replay a completed marker.
10. Do not modify a legacy Agent row, any user-created agent, provider, model,
    tools, capabilities, memory scope, effort, temperature, or timestamp.

A different source hash for an already completed migration version fails
closed with `migration_conflict`; it never silently overwrites the profile.

`defaultJarvisProfileId(accountId)` rejects blank or non-canonical
leading/trailing-whitespace account IDs, SHA-256 hashes the exact UTF-8 account
ID bytes, returns `jprof_${hexDigest.slice(0, 24)}`, and never exposes the raw
account ID:

```ts
const identityRevisionId = `jident_jarvis_v${JARVIS_IDENTITY_VERSION}`;
const profileId = await defaultJarvisProfileId(identity.accountId);
const initialRevisionId = `${profileId}_r1`;
```

For every local `legacy_agent` source, set
`migration_source_prompt_hash` and result `migrationSourcePromptHash` to the
normalized complete prompt hash, including when it matches a known shipped
prompt. Only a preserved unknown extension also sets domain
`sourcePromptHash`/row `source_prompt_hash`. For `clean_default`, all source
hash fields are absent.

Before inserting, query every profile row for the account. More than one
active row is `profile_integrity_error`. An existing deterministic profile
with a different account, identity version, or completed migration
version/source/source hash is `migration_conflict`. Once that immutable marker
matches, do not compare, reseed, or overwrite `revisionId`,
`customInstructions`, `instructionSource`, domain `sourcePromptHash`,
`memoryScope`, `voiceEnabled`, `soulRevisionId`, `active`, or mutable
timestamps. If either the deterministic identity revision ID or
`[identity_id+version]` row exists, its complete mapped immutable value must
match the protected revision or activation fails closed. Wrap Web Crypto work
performed while the transaction is open in `Dexie.waitFor(...)` so the
transaction cannot auto-commit during hashing.

The coordinator publishes `activating` before each activation attempt,
publishes only the matching account's `ready` result, and maps safe failure
categories to `degraded`. On identity change it synchronously discards the
previous ready/profile state before starting the next activation. `stop()`
unsubscribes and prevents late async publication; `retry()` reruns only the
current identity.

- [ ] **Step 1: Write the failing transactional migration tests**

In `jarvisV3.test.ts`, prove:

- a known local shipped prompt seeds empty custom instructions;
- an edited local prompt is preserved completely as
  `legacy_user_extension`;
- a signed-in cloud identity receives `clean_default` and never local text;
- only `builtin === true && slug === 'jarvis'` is selected and a user-created
  slug collision is ignored;
- the protected identity revision and one active profile seed once;
- the same migration marker/source hash is a no-op returning the current
  profile unchanged, while a changed hash is a typed conflict;
- after the initial migration, directly write a valid later profile revision
  in the Task 8 test fixture without importing Task 9, reactivate, and prove
  `migrated: false` while the later revision ID, custom instructions,
  instruction source, source hash, voice/memory settings, and timestamps remain
  byte-for-byte unchanged;
- a known shipped local prompt records only the migration source hash and
  leaves profile `sourcePromptHash` absent;
- deterministic profile IDs are stable per account, differ across accounts,
  and contain neither account ID;
- multiple active profiles and conflicting identity revisions fail closed;
- an injected failure after each write point leaves no identity, profile, or
  migration marker;
- the legacy Agent and every non-JARVIS row remain byte-for-byte unchanged.

- [ ] **Step 2: Write the failing coordinator-state tests**

In `persistenceCoordinator.test.ts`, prove:

- startup emits `activating → ready`;
- an account switch clears prior ready/profile state before activating the
  next account;
- database-open, migration, and missing-identity failures publish only their
  bounded `degraded` category plus a working retry;
- V2 UI availability is not conditioned on coordinator readiness; and
- stop unsubscribes and prevents a late activation result from publishing.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts
```

Expected: FAIL because the migration and coordinator modules do not exist.

- [ ] **Step 4: Implement the atomic migration and activation boundary**

Implement the exact contracts and transaction above. Use deterministic IDs,
complete-row conflict checks, `Dexie.waitFor()` around hashing, and typed
fail-closed errors. Do not mount the coordinator or change `App.tsx`.

- [ ] **Step 5: Implement the account-aware coordinator**

Implement start, retry, state reads, subscriptions, account generation guards,
safe degraded mapping, and stop cleanup exactly as specified. A late result
from a prior account must be ignored.

- [ ] **Step 6: Verify the activation implementation**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts
npm run typecheck
```

- [ ] **Step 7: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/db/migrations/jarvisV3.ts' 'app/src/lib/db/migrations/jarvisV3.test.ts' 'app/src/lib/jarvis/persistenceCoordinator.ts' 'app/src/lib/jarvis/persistenceCoordinator.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/db/migrations/jarvisV3.ts' 'app/src/lib/db/migrations/jarvisV3.test.ts' 'app/src/lib/jarvis/persistenceCoordinator.ts' 'app/src/lib/jarvis/persistenceCoordinator.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): add transactional account activation"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the four files above. The
installer queries and whitespace checks produce no output.

## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock

**Files:**

- Create: `app/src/lib/db/jarvisMappers.ts`
- Create: `app/src/lib/db/jarvisMappers.test.ts`
- Create: `app/src/lib/db/jarvisRepositories.ts`
- Create: `app/src/lib/db/jarvisRepositories.test.ts`
- Modify: `app/src/lib/sync.ts`
- Modify: `app/src/lib/sync.test.ts`
- Modify: `app/src/lib/db/repositories.ts`
- Modify: `app/src/lib/db/repositories.connection.test.ts`

**Interfaces:**

- Consumes: Task 2 identity/profile contracts, Task 3 execution contracts, the
  V3 rows and injected `JarvisDexie` factory from Task 7, and migration
  metadata from Task 8.
- Produces: explicit domain↔row mappers, account-scoped repositories, a
  caller-stable run ID contract, standalone idempotent non-transition event
  appends, one atomic run-transition/event primitive for Task 18, profile
  revision persistence, and the local-only sync denylist.
- Boundary: Task 18 owns the legal transition matrix and must call
  `assertJarvisRunTransition()` before the atomic repository primitive.
  Task 9 contains no legal transition table.

**Exact mapper contract:**

```ts
export type JarvisProfileMigrationMetadata = {
  migrationVersion: 3;
  migrationSource: 'legacy_agent' | 'clean_default';
  migrationSourcePromptHash?: string;
  migrationCompletedAt: number;
};

export function toJarvisIdentityRevisionRow(
  value: JarvisIdentityRevision,
): JarvisIdentityRevisionRow;
export function fromJarvisIdentityRevisionRow(
  row: JarvisIdentityRevisionRow,
): JarvisIdentityRevision;

export function toJarvisProfileRow(input: {
  profile: JarvisProfile;
  migration: JarvisProfileMigrationMetadata;
}): JarvisProfileRow;
export function fromJarvisProfileRow(row: JarvisProfileRow): {
  profile: JarvisProfile;
  migration: JarvisProfileMigrationMetadata;
};

export function toJarvisRunRow(value: JarvisRun): JarvisRunRow;
export function fromJarvisRunRow(row: JarvisRunRow): JarvisRun;
export function toJarvisEventRow(value: JarvisEvent): JarvisEventRow;
export function fromJarvisEventRow(row: JarvisEventRow): JarvisEvent;
export function toJarvisApprovalRow(value: JarvisApproval): JarvisApprovalRow;
export function fromJarvisApprovalRow(row: JarvisApprovalRow): JarvisApproval;
export function toJarvisArtifactRow(value: JarvisArtifact): JarvisArtifactRow;
export function fromJarvisArtifactRow(row: JarvisArtifactRow): JarvisArtifact;
export function toJarvisModelSnapshotRow(value: JarvisModelSnapshot): JarvisModelSnapshotRow;
export function fromJarvisModelSnapshotRow(row: JarvisModelSnapshotRow): JarvisModelSnapshot;
export function toJarvisSourceRefRow(value: JarvisSourceRef): JarvisSourceRefRow;
export function fromJarvisSourceRefRow(row: JarvisSourceRefRow): JarvisSourceRef;
```

No UI or runtime file imports a `*Row` type. Mappers clone arrays and nested
records so a caller cannot mutate persisted state through shared references.

**Exact repository interfaces:**

```ts
export interface JarvisIdentityRepository {
  getVersion(identityId: 'jarvis', version: number): Promise<JarvisIdentityRevision | undefined>;
  putIfAbsent(revision: JarvisIdentityRevision): Promise<JarvisIdentityRevision>;
}

export interface JarvisProfileRepository {
  getById(accountId: string, profileId: string): Promise<JarvisProfile | undefined>;
  getActive(accountId: string): Promise<JarvisProfile | undefined>;
  putForAccount(
    accountId: string,
    input: {
      profile: JarvisProfile;
      migration: JarvisProfileMigrationMetadata;
    },
  ): Promise<JarvisProfile>;
  updateCustomInstructions(
    accountId: string,
    profileId: string,
    customInstructions: string,
  ): Promise<JarvisProfile>;
}

export type JarvisRunTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;

export interface JarvisRunRepository {
  createIdempotent(run: JarvisRun): Promise<JarvisRun>;
  getById(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  listByAccount(
    accountId: string,
    options?: { statuses?: JarvisRunStatus[]; limit?: number },
  ): Promise<JarvisRun[]>;
  compareAndAppendTransitionEvent(input: {
    accountId: string;
    runId: string;
    expectedStatus: JarvisRunStatus;
    nextStatus: JarvisRunStatus;
    updatedAt: number;
    completedAt?: number;
    event: JarvisRunTransitionEventInput;
  }): Promise<
    { applied: true; run: JarvisRun; event: JarvisEvent } | { applied: false; current: JarvisRun }
  >;
}

export type JarvisNonTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type'> & {
  type: Exclude<JarvisEvent['type'], 'run_state'>;
};

export interface JarvisEventRepository {
  appendIdempotent(
    accountId: string,
    runId: string,
    event: JarvisNonTransitionEventInput,
  ): Promise<JarvisEvent>;
  listByRun(
    accountId: string,
    runId: string,
    options?: { afterSeq?: number; limit?: number },
  ): Promise<JarvisEvent[]>;
}

export interface JarvisApprovalRepository {
  getById(accountId: string, approvalId: string): Promise<JarvisApproval | undefined>;
  putForRun(accountId: string, approval: JarvisApproval): Promise<JarvisApproval>;
}

export interface JarvisArtifactRepository {
  getById(accountId: string, artifactId: string): Promise<JarvisArtifact | undefined>;
  listByRun(accountId: string, runId: string, limit?: number): Promise<JarvisArtifact[]>;
  putForRun(accountId: string, artifact: JarvisArtifact): Promise<JarvisArtifact>;
}

export type JarvisRepositoryErrorCode =
  | 'account_scope_mismatch'
  | 'parent_run_not_found'
  | 'run_id_conflict'
  | 'event_idempotency_conflict'
  | 'transition_event_requires_atomic_run_update'
  | 'profile_integrity_error'
  | 'invalid_limit';

export class JarvisRepositoryError extends Error {
  readonly code: JarvisRepositoryErrorCode;
}

export function newJarvisProfileRevisionId(): string;

export type JarvisRepositories = {
  identity: JarvisIdentityRepository;
  profile: JarvisProfileRepository;
  run: JarvisRunRepository;
  event: JarvisEventRepository;
  approval: JarvisApprovalRepository;
  artifact: JarvisArtifactRepository;
};

export function createJarvisRepositories(
  db: JarvisDexie,
  dependencies?: {
    now?: () => number;
    newProfileRevisionId?: () => string;
  },
): JarvisRepositories;

export const jarvisIdentityRepo: JarvisIdentityRepository;
export const jarvisProfileRepo: JarvisProfileRepository;
export const jarvisRunRepo: JarvisRunRepository;
export const jarvisEventRepo: JarvisEventRepository;
export const jarvisApprovalRepo: JarvisApprovalRepository;
export const jarvisArtifactRepo: JarvisArtifactRepository;
```

All run/profile reads require an explicit `accountId`. Event, approval, and
artifact methods load and verify parent-run ownership before reading or
writing child rows. Run creation with `parentRunId` verifies that the parent
belongs to the same account. Limits are positive integers capped at 500.
`listByRun(accountId, runId, { afterSeq, limit })` returns ascending events
strictly after `afterSeq`. When `afterSeq` is omitted, it reverse-scans the
compound `[run_id+seq]` index for only the newest `limit` rows, then reverses
that bounded tail into ascending sequence order before returning it. It never
loads an unbounded run history.

`createIdempotent()` uses the caller-supplied `run.id`; the repository never
generates a replacement. An exact retry returns the existing row after
comparing the complete detached mapped value. A different row under the same
ID throws `run_id_conflict`.

`appendIdempotent()` is only for non-transition events. It rejects a runtime
`run_state` input, including one forced through a cast, with
`transition_event_requires_atomic_run_update`. In one Dexie transaction it:

1. verifies parent-run account ownership;
2. requires a non-empty `event.idempotencyKey`;
3. returns an existing event for an exact retry after comparing every caller
   field;
4. rejects a changed payload under the same run/key with
   `event_idempotency_conflict`;
5. obtains `seq = currentMax + 1` from the upper bound of `[run_id+seq]`; and
6. inserts one event row.

An exact retry preserves the original `seq` and `createdAt`; the same
idempotency key remains valid in another run.

`compareAndAppendTransitionEvent()` is the only repository primitive that
persists a run transition. Task 18 first loads the current run and calls
`assertJarvisRunTransition(current.status, input.nextStatus)`. Task 9 then
performs the compare, update, allocation, and insert in one
`db.transaction('rw', db.jarvis_runs, db.jarvis_events, async () => ...)`.

Inside that transaction:

1. load the run and verify `accountId`;
2. if `run.status !== expectedStatus`, return
   `{ applied: false, current }` without writing either table;
3. update the run to `nextStatus`, `updatedAt`, and the supplied
   `completedAt`;
4. allocate the next sequence from `[run_id+seq]`;
5. construct the event from `event` while forcing
   `runId`, `seq`, `type: 'run_state'`, and `status: nextStatus`; and
6. insert the event before committing.

An event constraint or injected insertion failure rolls back the run update.
The returned `{ applied: true }` values are detached domain objects from the
committed rows. The repository checks only expected-status equality; it does
not import, implement, or infer the Task 18 legality matrix.

`getActive()` reads every `[account_id+active] = [accountId, 1]` row and throws
`profile_integrity_error` rather than selecting arbitrarily when more than one
exists. `putForAccount()` verifies `profile.accountId === accountId`, prevents
a second active profile, and persists supplied migration metadata unchanged.

`newJarvisProfileRevisionId()` returns
`jprof_rev_${crypto.randomUUID()}`. `updateCustomInstructions()` normalizes
CRLF and lone CR to LF without trimming user text. Unchanged normalized text
is a no-op. A changed value uses the injected generator for a new revision ID,
sets `updatedAt` from the injected clock, sets `instructionSource` to `user`
or `none`, clears domain `sourcePromptHash`, and preserves every migration
marker.

The new repositories never import generic repository mutation helpers, sync
functions, or a transition table.

**Exact sync interlock:**

```ts
export const LOCAL_ONLY_SYNC_TABLES: ReadonlySet<string> = new Set([
  'jarvis_identity_revisions',
  'jarvis_profiles',
  'jarvis_runs',
  'jarvis_events',
  'jarvis_approvals',
  'jarvis_artifacts',
] as const);

export function assertCloudSyncTableAllowed(table: string): void;
```

Call `assertCloudSyncTableAllowed()` from `enqueueMutation()`,
`buildCloudSyncRecord()`, and queue processing. Poisoned queued kernel rows are
marked `error` with safe code `local_only_table`; no payload is logged or
uploaded.

For the existing `agents` table, protected JARVIS sync payloads omit
`system_prompt`, and already-pending protected-agent rows are sanitized before
upload. Use Task 2's shared predicate, not slug-only matching. Non-JARVIS agent
sync and current connection serialization remain unchanged.

- [ ] **Step 1: Write the failing mapper tests**

In `jarvisMappers.test.ts`, round-trip every identity revision, profile plus
migration metadata, run, event, approval, artifact, model snapshot, and source
ref. Assert exact camelCase↔snake_case names and mutate each mapper result to
prove nested arrays/records are deeply detached.

- [ ] **Step 2: Write the failing repository and atomic-transition tests**

In `jarvisRepositories.test.ts`, prove:

- run/profile account isolation and cross-account child read/write rejection;
- parent-run creation rejects a parent owned by another account;
- caller-stable run ID exact retry and changed-payload conflict;
- standalone non-transition event sequences are `1, 2, 3`;
- a same-key exact retry returns one row/sequence, a changed payload rejects,
  and the same key in another run succeeds;
- standalone append rejects `run_state`;
- `compareAndAppendTransitionEvent()` updates the expected run and inserts one
  forced `run_state` event with the same committed transaction;
- a CAS miss returns the current run and changes neither the run nor event
  count;
- two concurrent expected-status attempts produce exactly one applied result
  and one transition event;
- duplicate-idempotency and injected event-insert failures roll back the run
  status, timestamps, completion field, and event count;
- the repository accepts a transition Task 18 may reject, proving there is no
  hidden legality table;
- `afterSeq` returns ascending later events, while omitted `afterSeq` returns
  only the newest bounded tail reordered ascending without an unbounded load;
- repository limits are positive and capped at 500;
- active-profile integrity failure, stable profile ID, fresh revision ID,
  line-ending normalization, no-op save, source-hash clearing, and migration
  marker preservation.

- [ ] **Step 3: Write the failing sync-interlock tests**

In `sync.test.ts` and `repositories.connection.test.ts`, prove:

- kernel repository writes create zero generic sync-queue rows;
- enqueue, cloud-record construction, and queue processing each reject every
  local-only table;
- poisoned pending kernel rows never reach Supabase and expose only
  `local_only_table`;
- protected built-in JARVIS payloads and already-pending mutations omit
  `system_prompt`;
- a user-created slug collision keeps its ordinary prompt payload; and
- current connection serialization remains green.

- [ ] **Step 4: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/sync.test.ts src/lib/db/repositories.connection.test.ts
```

Expected: FAIL because the mapper/repository modules and local-only guards do
not exist.

- [ ] **Step 5: Implement explicit mappers and repositories**

Implement the exact interfaces and rules above using the injected
`JarvisDexie`. Keep row types below the repository boundary, compare complete
detached rows for idempotency, and implement the coordinated
`compareAndAppendTransitionEvent()` transaction without a legality table.

- [ ] **Step 6: Implement all three sync boundaries and Agent sanitization**

Add the exact denylist/assertion, fail closed at enqueue/build/process time,
sanitize pending protected-agent records, preserve collision-agent prompts,
and leave non-kernel sync behavior unchanged.

- [ ] **Step 7: Verify the repository and sync implementation**

```powershell
npm --prefix app test -- src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/sync.test.ts src/lib/db/repositories.connection.test.ts
npm run typecheck
```

- [ ] **Step 8: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/db/jarvisMappers.ts' 'app/src/lib/db/jarvisMappers.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts' 'app/src/lib/sync.ts' 'app/src/lib/sync.test.ts' 'app/src/lib/db/repositories.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/db/jarvisMappers.ts' 'app/src/lib/db/jarvisMappers.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts' 'app/src/lib/sync.ts' 'app/src/lib/sync.test.ts' 'app/src/lib/db/repositories.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(sync): keep kernel records and Jarvis prompts local"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eight files above. The
installer queries and whitespace checks produce no output.

## Task 10: Canonical Built-Ins and Profile-Aware Agent Editor

**Files:**

- Create: `app/src/lib/jarvis/builtinAgents.ts`
- Create: `app/src/lib/jarvis/builtinAgents.test.ts`
- Modify: `app/src/lib/db/seed.ts`
- Create: `app/src/lib/db/seed.test.ts`
- Modify: `app/src/lib/db/index.ts`
- Modify: `app/src/lib/db/migrations/jarvisV3.test.ts`
- Modify: `app/src/features/agents/registry.ts`
- Create: `app/src/features/agents/registry.test.ts`
- Modify: `app/src/features/agents/AgentManager.tsx`
- Modify: `app/src/features/agents/AgentManager.test.tsx`
- Modify: `app/src/features/agents/AgentDetail.tsx`
- Create: `app/src/features/agents/AgentDetail.test.tsx`
- Modify: `app/src/types/agent.ts`

**Interfaces:**

- Consumes: `resolveAccountIdentity()` from Task 1,
  `isProtectedJarvisAgent()`, prompt normalization, and known shipped hashes
  from Task 2; activation/profile IDs from Task 8; and
  `jarvisProfileRepo` from Task 9.
- Produces: the only fresh-install/fallback built-in roster, a compatibility
  registry export, protected-JARVIS profile editing/detail behavior, and
  explicit later ownership for every remaining slug-only production branch.
- Preserves: every existing persisted agent on a non-fresh database and every
  non-JARVIS edit, clone, delete, model, provider, tool, capability, memory,
  effort, temperature, output-token, description, name, and color path.

**Exact canonical roster contract:**

`app/src/lib/jarvis/builtinAgents.ts` is the only roster definition. Preserve
the newer two-agent product decision exactly: `jarvis` and `coder`.

Move the currently shipped registry JARVIS prompt into this module as
`LEGACY_JARVIS_AGENT_COMPATIBILITY_PROMPT`. It is compatibility data for the
legacy `Agent.system_prompt` column, not Task 2's immutable identity text. Its
normalized SHA-256 must equal
`KNOWN_SHIPPED_JARVIS_PROMPT_HASHES.registry_ed91635_current`
(`c8929dd35bcad916c401d0fe4c51cd518ce210177f3b29b6f4d3f214a501c447`).
Move the current Coder prompt and both exact current registry definitions into
the same module; `registry.ts` retains no roster fields or prompt text.

```ts
export const BUILTIN_AGENT_ROSTER_VERSION = 1;

export function createBuiltinAgentRoster(input?: { now?: number; newId?: () => AgentId }): Agent[];

export function getBuiltinAgentDefinition(
  slug: 'jarvis' | 'coder',
): Omit<Agent, 'id' | 'created_at' | 'updated_at'>;
```

`app/src/features/agents/registry.ts` becomes only:

```ts
export {
  createBuiltinAgentRoster as getDefaultAgents,
  getBuiltinAgentDefinition,
} from '@/lib/jarvis/builtinAgents';
```

`seedIfEmpty()` calls `createBuiltinAgentRoster({ now: ts })` exactly once
inside the existing fresh-database transaction and bulk-adds that returned
array. Remove `DEFAULT_AGENT_SEEDS` and its re-export from
`app/src/lib/db/index.ts`; update its stale reference in
`app/src/types/agent.ts`. A non-fresh database never deletes, rewrites, or
backfills historical seven-agent, two-agent, or user-created rows.

**Protected predicate and collision rule:**

Every Task 10 branch imports Task 2's one shared predicate:

```ts
export function isProtectedJarvisAgent(agent: Pick<Agent, 'builtin' | 'slug'>): boolean {
  return agent.builtin === true && agent.slug === 'jarvis';
}
```

Task 10 does not define a second predicate. A user-created
`{ slug: 'jarvis', builtin: false }`, an agent with missing `builtin`, or a
built-in display name `Jarvis` under another slug is not protected.

The remaining current slug-only production sites are assigned, but not edited,
here:

- Task 13P owns `app/src/App.tsx` after its authoritative lock is released.
- Task 16B owns `app/src/components/layout/Inspector.tsx`,
  `app/src/features/chat/Composer.tsx`,
  `app/src/features/files/FilesPage.tsx`,
  `app/src/features/files/FileExplorerDialog.tsx`,
  `app/src/lib/ai/modelSelection.ts`, and `app/src/lib/ai/runtime.ts`.

Those later tasks import the same predicate and add collision regressions. No
slug-only JARVIS branch or second protected-agent predicate may remain after
Task 16B.

**Exact protected editor/detail behavior:**

- Resolve account scope only with
  `resolveAccountIdentity({ cloudSession, localUserId })`. Never use
  `local-unassigned` or fall back to local scope while a malformed cloud
  session is present.
- For protected JARVIS, load
  `jarvisProfileRepo.getActive(accountId)` only after canonical identity
  resolution.
- Label the textarea and detail card `Custom instructions`.
- The protected textarea value is `profile.customInstructions`, never
  `Agent.system_prompt`.
- Saving protected text calls:

```ts
jarvisProfileRepo.updateCustomInstructions(accountId, profile.id, text);
```

Task 9 creates a fresh profile `revisionId`, normalizes line endings, sets
`instructionSource` to `user` for non-empty text and `none` for empty text,
clears legacy domain `sourcePromptHash`, and preserves migration metadata.
An unchanged normalized value is a no-op.

- A protected-JARVIS `agentRepo.update()` patch must not contain
  `system_prompt`. Simultaneous non-prompt edits retain their existing Agent
  row path.
- For non-JARVIS agents, preserve the existing `System prompt` label,
  validation, persistence, clone, and delete behavior.
- On account change, synchronously clear the previous profile text before
  loading the next account.
- Guard async profile loads with account ID/request generation so a stale
  previous-account result cannot repopulate the editor or detail card.
- While profile state is not ready, disable only protected JARVIS custom
  instruction saving and show a bounded `Profile is still loading` state. The
  remainder of the V2 editor stays usable.
- `AgentDetail` reads protected JARVIS custom instructions from the active
  profile and retains legacy system-prompt display only for non-JARVIS agents.
- A user-created slug collision follows the ordinary non-JARVIS System prompt
  path and is never hidden or routed to profile persistence.

- [ ] **Step 1: Write the failing canonical-roster and seed tests**

In `builtinAgents.test.ts`, `registry.test.ts`, and `seed.test.ts`, prove:

- the canonical roster contains exactly `jarvis` and `coder` with the current
  shipped definitions;
- the compatibility JARVIS prompt normalizes to the frozen current hash;
- registry and seed return identical definitions apart from generated IDs and
  timestamps;
- protected built-in JARVIS is true, while false/missing `builtin`, display
  name-only, and user-created slug-collision cases are false;
- a fresh database seeds the canonical roster once; and
- a non-fresh database preserves historical and custom rows byte-for-byte.

- [ ] **Step 2: Write the failing profile-aware editor and detail tests**

In `AgentManager.test.tsx` and `AgentDetail.test.tsx`, prove:

- protected JARVIS displays `Custom instructions`;
- protected save updates the active profile/revision and never patches
  `system_prompt`;
- unchanged normalized text creates no revision;
- simultaneous non-prompt edits still update the Agent row;
- an account switch clears and reloads profile text;
- a stale previous-account load is ignored;
- profile loading disables only the protected prompt save and leaves the V2
  editor usable;
- a user-created slug collision uses ordinary `System prompt` editing;
- non-JARVIS save/clone/delete regressions remain green; and
- `AgentDetail` uses profile text only for protected JARVIS.

In `jarvisV3.test.ts`, add the Task 9/10 integration regression: migrate once,
call `jarvisProfileRepo.updateCustomInstructions()` to create a valid later
revision, reactivate the same account, and prove activation returns
`migrated: false` without replacing the new revision, text, instruction
source, or preserved migration metadata.

- [ ] **Step 3: Pin the profile-reactivation integration, then verify Task 10 RED**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts
```

Expected: PASS. This is a cross-task Task 8/9 characterization gate proving
the activation contract already preserves a repository-created later revision.

```powershell
npm --prefix app test -- src/lib/jarvis/builtinAgents.test.ts src/lib/db/seed.test.ts src/features/agents/registry.test.ts src/features/agents/AgentManager.test.tsx src/features/agents/AgentDetail.test.tsx
```

Expected: FAIL because the canonical roster module and new tests do not exist,
and the current protected editor still reads/writes `Agent.system_prompt`.

- [ ] **Step 4: Implement the canonical roster and fresh-database seed**

Move the exact two current registry definitions and compatibility prompts into
`builtinAgents.ts`, reduce `registry.ts` to the compatibility export, route
fresh seeding through `createBuiltinAgentRoster()`, and remove the stale
`DEFAULT_AGENT_SEEDS` API without modifying persisted databases.

- [ ] **Step 5: Implement profile-aware protected editing and detail display**

Use the exact account resolver, protected predicate, repository call, loading
state, generation guard, and Agent-row exclusions above. Preserve the complete
non-JARVIS lifecycle.

- [ ] **Step 6: Verify the implementation**

```powershell
npm --prefix app test -- src/lib/jarvis/builtinAgents.test.ts src/lib/db/seed.test.ts src/lib/db/migrations/jarvisV3.test.ts src/features/agents/registry.test.ts src/features/agents/AgentManager.test.tsx src/features/agents/AgentDetail.test.tsx
npm run typecheck
```

- [ ] **Step 7: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/builtinAgents.ts' 'app/src/lib/jarvis/builtinAgents.test.ts' 'app/src/lib/db/seed.ts' 'app/src/lib/db/seed.test.ts' 'app/src/lib/db/index.ts' 'app/src/lib/db/migrations/jarvisV3.test.ts' 'app/src/features/agents/registry.ts' 'app/src/features/agents/registry.test.ts' 'app/src/features/agents/AgentManager.tsx' 'app/src/features/agents/AgentManager.test.tsx' 'app/src/features/agents/AgentDetail.tsx' 'app/src/features/agents/AgentDetail.test.tsx' 'app/src/types/agent.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/builtinAgents.ts' 'app/src/lib/jarvis/builtinAgents.test.ts' 'app/src/lib/db/seed.ts' 'app/src/lib/db/seed.test.ts' 'app/src/lib/db/index.ts' 'app/src/lib/db/migrations/jarvisV3.test.ts' 'app/src/features/agents/registry.ts' 'app/src/features/agents/registry.test.ts' 'app/src/features/agents/AgentManager.tsx' 'app/src/features/agents/AgentManager.test.tsx' 'app/src/features/agents/AgentDetail.tsx' 'app/src/features/agents/AgentDetail.test.tsx' 'app/src/types/agent.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "refactor(agents): route builtin Jarvis through profiles"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirteen files above. The
installer queries and whitespace checks produce no output.

## Shared contracts consumed by Tasks 18–21C

```ts
export const MAX_JARVIS_SELECTOR_ITEMS = 500 as const;

export const JARVIS_RUN_TRANSITIONS = {
  queued: ['compiling', 'running', 'awaiting_approval', 'failed', 'cancelled', 'timed_out'],
  compiling: ['running', 'awaiting_approval', 'failed', 'cancelled', 'timed_out'],
  running: ['awaiting_approval', 'partial', 'completed', 'failed', 'cancelled', 'timed_out'],
  awaiting_approval: ['queued', 'running', 'failed', 'cancelled', 'timed_out'],
  partial: [],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
} as const satisfies Record<JarvisRunStatus, readonly JarvisRunStatus[]>;

export type CancellationDelivery =
  | {
      kind: 'queued_tombstoned';
      cancellationRequestId: string;
      ownerId: string;
      queueItemId: string;
    }
  | {
      kind: 'signal_delivered';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'handoff_pending';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'unsupported';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'executor_missing';
      cancellationRequestId: string;
    }
  | {
      kind: 'delivery_rejected';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'delivery_error';
      cancellationRequestId: string;
      ownerIds: readonly string[];
      safeErrorCategory: string;
    }
  | {
      kind: 'already_terminal';
      terminalStatus: 'partial' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
    };

export type JarvisCancellationAggregate =
  | { kind: 'delivery_pending'; ownerIds: readonly string[] }
  | { kind: 'queued_cancelled'; ownerId: string; queueItemId: string }
  | { kind: 'signal_delivered'; ownerIds: readonly string[] }
  | { kind: 'handoff_pending'; ownerIds: readonly string[] }
  | { kind: 'unsupported'; ownerIds: readonly string[] }
  | { kind: 'executor_missing' }
  | { kind: 'delivery_rejected'; ownerIds: readonly string[] }
  | {
      kind: 'delivery_error';
      ownerIds: readonly string[];
      safeErrorCategory: string;
    };

export type JarvisCancellationRequestResult =
  | {
      kind: 'authority_revoked_before_intent';
    }
  | {
      kind: 'already_terminal';
      terminalStatus: 'partial' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
    }
  | {
      kind: 'intent_committed';
      requestState: 'new' | 'already_pending';
      authorityState: 'current' | 'revoked_after_intent';
      cancellationRequestId: string;
      aggregate: JarvisCancellationAggregate;
    };

export type JarvisCancellationOwnerOutcome =
  | {
      kind: 'queued_tombstoned';
      ownerId: string;
      queueItemId: string;
    }
  | {
      kind: 'signal_delivered';
      ownerId: string;
      cancellationToken?: string;
    }
  | {
      kind: 'handoff_pending';
      ownerId: string;
    }
  | {
      kind: 'already_exited';
      ownerId: string;
    }
  | {
      kind: 'unsupported';
      ownerId: string;
    }
  | {
      kind: 'delivery_rejected';
      ownerId: string;
    };
```

Self-transitions are rejected. Canonical event identity is `(runId, seq)`.
Crash/retry delivery deduplication is a separate key,
`(runId, idempotencyKey)`. Reusing an idempotency key returns the existing
event only when the immutable event payload is identical; it never silently
accepts a duplicate state transition. Terminal states are immutable.

## Task 18 — Canonical execution journal, cancellation, and recovery

**Transport-attempt and live-evidence correction (normative):**

Keep the approved `JarvisRunStatus` union and terminal immutability exact.
Same-run scheduled transport retry is represented by durable attempt metadata
on a still-`running` run, never by reopening a terminal status or replaying
`queued -> compiling`. Task 18 also owns the durable journal-backed
live-evidence authority and its process-local active-node cache. A node is
visible only after the authority has committed and read back its exact
canonical event row. Completed/degraded evidence is reconstructed and
revalidated from that journal after restart; unmatched prior-process active
evidence is never revived. The cache remains observational and cannot write
lifecycle truth, approvals, or artifacts.

**Exact files**

- Modify: `app/src/lib/jarvis/contracts/execution.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.test.ts`
- Modify: `app/src/lib/jarvis/contracts/index.ts`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/jarvisMappers.ts`
- Modify: `app/src/lib/db/jarvisMappers.test.ts`
- Modify: `app/src/lib/db/jarvisRepositories.ts`
- Modify: `app/src/lib/db/jarvisRepositories.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/stateMachine.ts`
- Create: `app/src/lib/jarvis/executionJournal/stateMachine.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/journal.ts`
- Create: `app/src/lib/jarvis/executionJournal/journal.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/abortRegistry.ts`
- Create: `app/src/lib/jarvis/executionJournal/abortRegistry.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/recovery.ts`
- Create: `app/src/lib/jarvis/executionJournal/recovery.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/transportAttempts.ts`
- Create: `app/src/lib/jarvis/executionJournal/transportAttempts.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/liveEvidenceRegistry.ts`
- Create: `app/src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.ts`
- Create: `app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/index.ts`

**Interfaces to implement**

```ts
export type AllocateJarvisRunInput = Omit<
  JarvisRun,
  | 'id'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt'
  | 'scheduledRetrySnapshot'
  | 'transportAttempts'
> & {
  id?: string;
};

export type JarvisPreEffectTransportFailureEvidence = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  providerId: string;
  modelId: string;
  boundary: 'before_first_response_byte';
  responseStarted: false;
  chunkCount: 0;
  actionDispatchCount: 0;
  failureCategory: string;
  evidenceRef: string;
  verifiedAt: number;
}>;

export type JarvisZeroConsequentialEffectEvidenceV1 = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  attemptNumber: number;
  requestId: string;
  assessedAt: number;
  providerBoundary: JarvisPreEffectTransportFailureEvidence;
  effectBarrier: Readonly<{ state: 'open'; version: 0 }>;
  approvals: Readonly<{ count: 0; evidenceRef: string }>;
  artifacts: Readonly<{ count: 0; evidenceRef: string }>;
  executorClaims: Readonly<{ count: 0; throughSeq: number; evidenceRef: string }>;
}>;

export type JarvisTransportAttemptV1 = Readonly<{
  schemaVersion: 1;
  attemptNumber: number;
  kind: 'initial' | 'transport_retry';
  requestId: string;
  state: 'provider_in_flight' | 'retryable_failed' | 'completed' | 'effect_uncertain';
  startedEventSeq: number;
  effectBarrier: Readonly<{
    state: 'open' | 'dirty' | 'sealed_for_retry';
    version: number;
    updatedAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
  failureCategory?: string;
  zeroEffectEvidence?: JarvisZeroConsequentialEffectEvidenceV1;
}>;

export interface JarvisRun {
  // ...all Task 3 fields remain exact...
  transportAttempts?: readonly JarvisTransportAttemptV1[];
}

export type JarvisExecutionEvidenceV1 = Readonly<{
  schemaVersion: 1;
  requestId: string;
  attemptNumber: number;
  kind: 'consequential_effect_claimed' | 'consequential_effect_completed';
  ownerKind:
    | 'approval'
    | 'artifact'
    | 'action'
    | 'file'
    | 'terminal'
    | 'plugin'
    | 'mcp'
    | 'browser'
    | 'schedule';
  ownerId: string;
  evidenceRef: string;
  observedAt: number;
}>;

type JarvisProducerSourcePhaseV1 =
  | Readonly<{
      phase: 'start';
      state: 'started' | 'ready' | 'busy';
    }>
  | Readonly<{
      phase: 'result';
      state: 'completed' | 'degraded';
      /** Required for schedule/hive; must name a distinct earlier authority row. */
      resultAuthority?: Readonly<{
        runId: string;
        eventSeq: number;
        evidenceRef: `jresult_${string}`;
      }>;
    }>;

/** Immutable result truth committed before schedule/hive producer-source rows. */
export type JarvisCanonicalResultEvidenceV1 = Readonly<{
  schemaVersion: 1;
  kind: 'kernel_turn_committed' | 'scheduled_transport_settled' | 'hive_child_provider_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  parentRunId?: string;
  stepId?: string;
  state: 'completed' | 'degraded';
  resultRef: `jresult_${string}`;
  observedAt: number;
}>;

type JarvisProducerSourceEvidenceFor<K extends JarvisLiveProducerKind> = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  producerKind: K;
  producerIdentity: Extract<JarvisLiveProducerIdentity, { producerKind: K }>;
  resultRef: string;
  observedAt: number;
}> &
  JarvisProducerSourcePhaseV1;

/** Closed durable source truth re-read by the matching live-evidence verifier. */
export type JarvisProducerSourceEvidenceV1 =
  | JarvisProducerSourceEvidenceFor<'provider'>
  | JarvisProducerSourceEvidenceFor<'action'>
  | JarvisProducerSourceEvidenceFor<'file_action'>
  | JarvisProducerSourceEvidenceFor<'terminal'>
  | JarvisProducerSourceEvidenceFor<'plugin'>
  | JarvisProducerSourceEvidenceFor<'mcp'>
  | JarvisProducerSourceEvidenceFor<'schedule'>
  | JarvisProducerSourceEvidenceFor<'voice'>
  | JarvisProducerSourceEvidenceFor<'hive'>;

export interface JarvisEvent {
  // ...all Task 3 fields remain exact...
  executionEvidence?: JarvisExecutionEvidenceV1;
  canonicalResultEvidence?: JarvisCanonicalResultEvidenceV1;
  producerSourceEvidence?: JarvisProducerSourceEvidenceV1;
  liveEvidence?: JarvisDurableLiveEvidenceV1;
}

export type JarvisRunRow = {
  // ...all Task 7 fields remain exact...
  transport_attempts?: JarvisTransportAttemptV1[];
};

export type JarvisEventRow = {
  // ...all Task 7 fields remain exact...
  execution_evidence?: JarvisExecutionEvidenceV1;
  canonical_result_evidence?: JarvisCanonicalResultEvidenceV1;
  producer_source_evidence?: JarvisProducerSourceEvidenceV1;
  live_evidence?: JarvisDurableLiveEvidenceV1;
};

export type TransitionJarvisRunInput = {
  accountId: string;
  runId: string;
  expectedStatus: JarvisRunStatus;
  nextStatus: JarvisRunStatus;
  event: JarvisRunTransitionEventInput;
  completedAt?: number;
};

export interface JarvisExecutionJournal {
  allocateRun(input: AllocateJarvisRunInput): Promise<JarvisRun>;
  getRun(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  appendEvent(
    accountId: string,
    runId: string,
    event: Omit<JarvisEvent, 'runId' | 'seq'>,
  ): Promise<JarvisEvent>;
  transitionRun(input: TransitionJarvisRunInput): Promise<JarvisRun>;
}

const jarvisScheduledAttemptLeaseBrand: unique symbol = Symbol('jarvis.schedule-attempt-lease');

export type JarvisScheduledAttemptLease = Readonly<{
  accountId: string;
  runId: string;
  attemptNumber: number;
  requestId: string;
  kind: 'initial' | 'transport_retry';
  [jarvisScheduledAttemptLeaseBrand]: true;
}>;

export interface JarvisConsequentialEffectSafetyAuthority {
  proveZeroConsequentialEffect(input: {
    run: Readonly<JarvisRun>;
    attempt: Readonly<JarvisTransportAttemptV1>;
    providerFailure: JarvisPreEffectTransportFailureEvidence;
  }): Promise<JarvisZeroConsequentialEffectEvidenceV1 | null>;
  revalidateZeroConsequentialEffect(input: {
    run: Readonly<JarvisRun>;
    attempt: Readonly<JarvisTransportAttemptV1>;
    evidence: JarvisZeroConsequentialEffectEvidenceV1;
  }): Promise<JarvisZeroConsequentialEffectEvidenceV1 | null>;
}

export type JarvisAttemptEffectClaimInput = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  ownerKind: JarvisExecutionEvidenceV1['ownerKind'];
  ownerId: string;
  evidenceRef: string;
  claimedAt: number;
}>;

export type JarvisAttemptEffectClaimResult =
  | { applied: true; kind: 'barrier_claimed'; run: JarvisRun; event: JarvisEvent }
  | { applied: true; kind: 'not_applicable'; run: JarvisRun }
  | {
      applied: false;
      reason: 'status_conflict' | 'attempt_conflict' | 'attempt_sealed';
      current: JarvisRun;
    };

export interface JarvisAttemptEffectBarrierAuthority {
  claim(input: JarvisAttemptEffectClaimInput): Promise<JarvisAttemptEffectClaimResult>;
}

export interface JarvisTransportAttemptCoordinator {
  beginInitialScheduledAttempt(input: {
    accountId: string;
    runId: string;
    requestId: string;
    createdAt: number;
  }): Promise<JarvisScheduledAttemptLease>;
  beginScheduledTransportRetry(input: {
    accountId: string;
    runId: string;
    previousAttemptNumber: number;
    requestId: string;
    createdAt: number;
    revalidatedEvidence: JarvisZeroConsequentialEffectEvidenceV1;
  }): Promise<JarvisScheduledAttemptLease>;
  verifyLease(lease: JarvisScheduledAttemptLease): Promise<Readonly<JarvisRun>>;
  settleScheduledTransportFailure(input: {
    lease: JarvisScheduledAttemptLease;
    providerFailure: JarvisPreEffectTransportFailureEvidence;
    zeroEffectEvidence: JarvisZeroConsequentialEffectEvidenceV1 | null;
    settledAt: number;
  }): Promise<{ kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }>;
}

export type JarvisAbortKind =
  | 'provider_stream'
  | 'tts_generation'
  | 'audio_playback'
  | 'terminal'
  | 'native_process'
  | 'network'
  | 'child_run'
  | 'other';

export type JarvisAbortRegistration = {
  accountId: string;
  runId: string;
  registrationId: string;
  kind: JarvisAbortKind;
  parentRunId?: string;
  abort: () => JarvisCancellationOwnerOutcome | Promise<JarvisCancellationOwnerOutcome>;
};

export interface JarvisAbortRegistry {
  registerRunAborter(registration: JarvisAbortRegistration): () => void;
  requestRunCancellation(accountId: string, runId: string): Promise<CancellationDelivery>;
  clearRun(accountId: string, runId: string): void;
}

const jarvisPreparedCancellationBrand: unique symbol = Symbol(
  'jarvis.execution.prepared-cancellation',
);

/** @internal Process-local plan registered in the abort registry, never serialized. */
export type JarvisPreparedCancellation = Readonly<{
  accountId: string;
  runId: string;
  cancellationRequestId: string;
  [jarvisPreparedCancellationBrand]: true;
}>;

export type JarvisCancellationPreparation =
  | { kind: 'prepared'; plan: JarvisPreparedCancellation }
  | {
      kind: 'already_pending';
      cancellationRequestId: string;
      currentDelivery: Exclude<CancellationDelivery, { kind: 'already_terminal' }>;
    }
  | Extract<CancellationDelivery, { kind: 'already_terminal' }>;

/** @internal Kernel-only registration authority backed by the same registry. */
export interface JarvisAbortRegistrationAuthority {
  registerIssuedOwner(registration: JarvisAbortRegistration): () => void;
}

/** @internal Imported only by kernelRuntime.ts and focused abort-registry tests. */
export interface JarvisCancellationDeliveryAuthority {
  prepare(accountId: string, runId: string): Promise<JarvisCancellationPreparation>;
  deliver(prepared: JarvisPreparedCancellation): Promise<CancellationDelivery>;
  current(
    accountId: string,
    runId: string,
    cancellationRequestId: string,
  ): Promise<Exclude<CancellationDelivery, { kind: 'already_terminal' }>>;
  abandonBeforeDelivery(prepared: JarvisPreparedCancellation): void;
}

export type JarvisLiveCapabilityCategory =
  | 'tool'
  | 'plugin'
  | 'mcp'
  | 'terminal'
  | 'agent'
  | 'entitlement';

export type JarvisLiveProducerKind =
  | 'provider'
  | 'action'
  | 'file_action'
  | 'terminal'
  | 'plugin'
  | 'mcp'
  | 'schedule'
  | 'voice'
  | 'hive';

export type JarvisLiveProducerIdentity =
  | Readonly<{
      producerKind: 'provider';
      providerId: string;
      modelId: string;
      modelSnapshotRef: string;
    }>
  | Readonly<{
      producerKind: 'action';
      actionId: string;
      actionVersion: number;
      executionId: string;
    }>
  | Readonly<{
      producerKind: 'file_action';
      actionId: string;
      actionVersion: number;
      resultId: string;
    }>
  | Readonly<{ producerKind: 'terminal'; sessionId: string; executionId: string }>
  | Readonly<{ producerKind: 'plugin'; pluginId: string; invocationId: string }>
  | Readonly<{
      producerKind: 'mcp';
      serverId: string;
      toolName: string;
      invocationId: string;
    }>
  | Readonly<{ producerKind: 'schedule'; eventId: string; occurrenceId: string }>
  | Readonly<{
      producerKind: 'voice';
      sessionId: string;
      engineKind: 'tts' | 'playback';
      executionId: string;
    }>
  | Readonly<{ producerKind: 'hive'; stackId: string; stepId: string; workerId: string }>;

type JarvisDurableLiveEvidenceCommon = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  registrationId: string;
  producerKind: JarvisLiveProducerKind;
  producerIdentity: JarvisLiveProducerIdentity;
  transition: 'started' | 'ready' | 'busy' | 'completed' | 'degraded';
  operations: readonly string[];
  resultRef: string;
  resultEventSeq: number;
  observedAt: number;
  previousProofRef?: `jlive_${string}`;
}>;

export type JarvisDurableLiveEvidenceV1 =
  | (JarvisDurableLiveEvidenceCommon &
      Readonly<{
        kind: 'model';
        producerKind: 'provider';
        providerId: string;
        modelId: string;
        modelSnapshotRef: string;
      }>)
  | (JarvisDurableLiveEvidenceCommon &
      Readonly<{
        kind: 'capability';
        category: JarvisLiveCapabilityCategory;
        capabilityId: string;
      }>);

export type JarvisCanonicalLiveProducerEvidence<K extends JarvisLiveProducerKind> = Readonly<{
  schemaVersion: 1;
  producerKind: K;
  producerIdentity: Extract<JarvisLiveProducerIdentity, { producerKind: K }>;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  resultEventSeq: number;
  state: JarvisDurableLiveEvidenceV1['transition'];
  verifiedAt: number;
}>;

export interface JarvisCanonicalLiveProducerVerifier<K extends JarvisLiveProducerKind> {
  verify(
    evidence: JarvisCanonicalLiveProducerEvidence<K>,
  ): Promise<JarvisCanonicalLiveProducerEvidence<K> | null>;
}

export type JarvisLiveEvidenceVerifierSlot<K extends JarvisLiveProducerKind> =
  | Readonly<{
      state: 'ready';
      verifier: JarvisCanonicalLiveProducerVerifier<K>;
    }>
  | Readonly<{
      state: 'unavailable';
      producerKind: K;
      reason: 'producer_task_not_landed';
    }>;

const jarvisLiveEvidenceProofBrand: unique symbol = Symbol('jarvis.live-evidence-proof');

export type JarvisLiveEvidenceProof = Readonly<{
  proofRef: `jlive_${string}`;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  registrationId: string;
  producerKind: JarvisLiveProducerKind;
  resultRef: string;
  resultEventSeq: number;
  transition: JarvisDurableLiveEvidenceV1['transition'];
  eventSeq: number;
  [jarvisLiveEvidenceProofBrand]: true;
}>;

export type JarvisLiveSystemNode =
  | Readonly<{
      kind: 'model';
      id: `model:${string}`;
      accountId: string;
      runId: string;
      state: 'active' | 'completed' | 'degraded';
      operations: readonly ('generate' | 'stream' | 'embed')[];
      evidenceRef: `jlive_${string}`;
      verifiedAt: number;
      providerId: string;
      modelId: string;
      modelSnapshotRef: string;
    }>
  | Readonly<{
      kind: 'capability';
      id: `capability:${string}`;
      accountId: string;
      runId: string;
      state: 'ready' | 'busy' | 'completed' | 'degraded';
      operations: readonly ('execute' | 'cancel' | 'inspect')[];
      evidenceRef: `jlive_${string}`;
      verifiedAt: number;
      category: JarvisLiveCapabilityCategory;
      capabilityId: string;
    }>;

export type JarvisLiveEvidenceSnapshot = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  capturedAt: number;
  nodes: readonly JarvisLiveSystemNode[];
}>;

export interface JarvisLiveEvidenceRegistration<K extends JarvisLiveProducerKind> {
  readonly initialProof: JarvisLiveEvidenceProof;
  update(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<K>;
    state: 'started' | 'ready' | 'busy' | 'degraded';
  }): Promise<JarvisLiveEvidenceProof>;
  complete(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<K>;
    state: 'completed' | 'degraded';
  }): Promise<JarvisLiveEvidenceProof>;
  dispose(): void;
}

export interface JarvisProviderLiveEvidencePort {
  startProvider(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<'provider'>;
    registrationId: string;
    operations: readonly ('generate' | 'stream' | 'embed')[];
  }): Promise<JarvisLiveEvidenceRegistration<'provider'>>;
}

export type JarvisCapabilityLiveProducerKind = Exclude<JarvisLiveProducerKind, 'provider'>;

export interface JarvisCapabilityLiveEvidencePort<K extends JarvisCapabilityLiveProducerKind> {
  startCapability(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<K>;
    registrationId: string;
    category: JarvisLiveCapabilityCategory;
    capabilityId: string;
    operations: readonly ('execute' | 'cancel' | 'inspect')[];
    state: 'ready' | 'busy' | 'degraded';
  }): Promise<JarvisLiveEvidenceRegistration<K>>;
}

/** @internal Transaction ownership stays outside the verifier/proof core. */
export interface JarvisLiveEvidenceAppendCapability {
  append(input: { evidence: JarvisDurableLiveEvidenceV1 }): Promise<JarvisEvent>;
}

/** @internal Fixed owner operations; no caller selects a producer kind. */
export type JarvisLiveEvidenceKernelOwner = Readonly<{
  provider: JarvisProviderLiveEvidencePort;
  action: JarvisCapabilityLiveEvidencePort<'action'>;
  fileAction: JarvisCapabilityLiveEvidencePort<'file_action'>;
  terminal: JarvisCapabilityLiveEvidencePort<'terminal'>;
  plugin: JarvisCapabilityLiveEvidencePort<'plugin'>;
  mcp: JarvisCapabilityLiveEvidencePort<'mcp'>;
  voice: JarvisCapabilityLiveEvidencePort<'voice'>;
  schedule: JarvisCapabilityLiveEvidencePort<'schedule'>;
  hive: JarvisCapabilityLiveEvidencePort<'hive'>;
}>;

export interface JarvisLiveEvidenceReadPort {
  snapshot(accountId: string, runId: string): Promise<JarvisLiveEvidenceSnapshot | undefined>;
  subscribe(accountId: string, runId: string, listener: () => void): () => void;
}

/** Task-18-owned scope reused by every later kernel lifecycle. */
export type JarvisLiveEvidenceAttemptScope = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
}>;

/** Account-bound read surface returned only after reconstruction succeeds. */
export interface JarvisAccountLiveEvidenceReadPort {
  readonly accountId: string;
  snapshot(runId: string): Promise<JarvisLiveEvidenceSnapshot | undefined>;
  subscribe(runId: string, listener: () => void): () => void;
}

export interface JarvisLiveEvidencePrimaryHostAccountSession {
  readonly accountId: string;
  readonly read: JarvisAccountLiveEvidenceReadPort;
  /** Synchronously throws after disposal or replacement, including same-account replacement. */
  assertCurrent(): void;
  dispose(): void;
}

/** Primary-main-host lifecycle; it exposes no raw invalidation method. */
export interface JarvisLiveEvidencePrimaryHostLifecycle {
  openAccount(accountId: string): Promise<JarvisLiveEvidencePrimaryHostAccountSession>;
  dispose(): void;
}

/** @internal Held only inside kernelRuntime.ts. */
export type JarvisLiveEvidenceOwnerMaintenance = Readonly<{
  reconstructAccount(
    accountId: string,
    options?: { runLimit?: number; pageSize?: number; maxEventRowsPerRun?: number },
  ): Promise<void>;
  invalidateRun(accountId: string, runId: string): void;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
}>;

/**
 * @internal Deep composition result consumed lexically only by kernelRuntime.ts.
 * No application runtime, feature, public barrel, or secondary webview receives
 * the binder or owner maintenance authority.
 */
export type JarvisLiveEvidenceKernelComposition = Readonly<{
  /** @internal Called only by kernelRuntime.ts with one signal-bound append capability. */
  bindLifecycle(input: {
    scope: JarvisLiveEvidenceAttemptScope;
    append: JarvisLiveEvidenceAppendCapability;
  }): JarvisLiveEvidenceKernelOwner;
  read: JarvisLiveEvidenceReadPort;
  ownerMaintenance: JarvisLiveEvidenceOwnerMaintenance;
}>;

/** @internal Imported only by liveEvidenceAuthority.ts and focused tests. */
export interface JarvisLiveEvidenceRegistryInternals {
  applyVerified(proof: JarvisLiveEvidenceProof, row: Readonly<JarvisEvent>): void;
  snapshot(accountId: string, runId: string): JarvisLiveEvidenceSnapshot | undefined;
  subscribe(accountId: string, runId: string, listener: () => void): () => void;
  invalidateRun(accountId: string, runId: string): void;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
}

/** @internal Imported only by liveEvidenceAuthority.ts and focused tests. */
export function createJarvisLiveEvidenceRegistry(input: {
  now: () => number;
  maxCompletedPerRun: number;
}): JarvisLiveEvidenceRegistryInternals;

/** @internal Production import allowed only from kernelRuntime.ts. */
export function createJarvisLiveEvidenceKernelComposition(input: {
  runs: Pick<JarvisRunRepository, 'getById' | 'listByAccount'>;
  events: Pick<JarvisEventRepository, 'listByRun' | 'getBySeq'>;
  verifiers: Readonly<{
    provider: JarvisLiveEvidenceVerifierSlot<'provider'>;
    action: JarvisLiveEvidenceVerifierSlot<'action'>;
    fileAction: JarvisLiveEvidenceVerifierSlot<'file_action'>;
    terminal: JarvisLiveEvidenceVerifierSlot<'terminal'>;
    plugin: JarvisLiveEvidenceVerifierSlot<'plugin'>;
    mcp: JarvisLiveEvidenceVerifierSlot<'mcp'>;
    voice: JarvisLiveEvidenceVerifierSlot<'voice'>;
    schedule: JarvisLiveEvidenceVerifierSlot<'schedule'>;
    hive: JarvisLiveEvidenceVerifierSlot<'hive'>;
  }>;
  sha256Canonical(value: unknown): Promise<string>;
  now: () => number;
  maxCompletedPerRun?: number;
}): JarvisLiveEvidenceKernelComposition;

/** @internal Tests only; never imported by a production module. */
export function createJarvisLiveEvidenceTestHarness(input: {
  db: JarvisDexie;
  verifiers: Readonly<{
    [K in JarvisLiveProducerKind]: JarvisLiveEvidenceVerifierSlot<K>;
  }>;
  sha256Canonical(value: unknown): Promise<string>;
  now: () => number;
}): Readonly<{
  provider: JarvisProviderLiveEvidencePort;
  capabilities: Readonly<{
    [K in JarvisCapabilityLiveProducerKind]: JarvisCapabilityLiveEvidencePort<K>;
  }>;
  read: JarvisLiveEvidenceReadPort;
}>;

export type JarvisRecoveryDecision =
  | {
      kind: 'await_approval';
      run: JarvisRun;
      events: JarvisEvent[];
      approvalId: string;
    }
  | {
      kind: 'fail_closed';
      run: JarvisRun;
      reason:
        | 'manual_retry_required'
        | 'approval_missing'
        | 'approval_not_pending'
        | 'approval_consumed'
        | 'approval_expired'
        | 'approval_binding_mismatch'
        | 'scheduled_transport_retry_available'
        | 'ambiguous_executor_state';
    };

export interface JarvisRecoveryScanner {
  scanAccount(
    accountId: string,
    options?: { runLimit?: number; eventLimitPerRun?: number },
  ): Promise<JarvisRecoveryDecision[]>;
}

export interface JarvisRecoveryApprovalVerifier {
  verifyPendingApproval(input: {
    accountId: string;
    run: JarvisRun;
    events: readonly JarvisEvent[];
  }): Promise<
    | { valid: true; approvalId: string }
    | {
        valid: false;
        reason: Exclude<
          Extract<JarvisRecoveryDecision, { kind: 'fail_closed' }>['reason'],
          | 'manual_retry_required'
          | 'scheduled_transport_retry_available'
          | 'ambiguous_executor_state'
        >;
      }
  >;
}
```

`JarvisProducerSourceEvidenceV1` is the only durable source record a live
verifier may accept. Its nine explicitly enumerated members deliberately
repeat account, run, request, attempt, producer kind, the matching closed
producer identity, stable non-secret result reference, phase/state, and finite
`observedAt`. The validator rejects a blank identity/reference, a
producer-kind/identity mismatch, `phase: 'start'` with a terminal state,
`phase: 'result'` with an active state, non-positive attempt number, non-finite
time, foreign account/run repetition, unknown keys, and any event carrying
both `producerSourceEvidence` and `liveEvidence`. A live-evidence candidate can
therefore point to a distinct immutable source event only; it can never
certify itself.

`toJarvisEventRow()` and `fromJarvisEventRow()` map
`producerSourceEvidence <-> producer_source_evidence` as a detached validated
copy. Repository append/idempotency comparison includes the complete closed
record, and `getBySeq(accountId, runId, seq)` returns it only after parent
account ownership validation. Changed source evidence under a reused event
idempotency key is a conflict. Validator, mapper, and repository tests cover
all nine variants, every phase/state rule, unknown-field rejection, detached
round-trip, exact retry, changed retry, cross-account reads, and the
source/live mutual exclusion.

Source-observation owners are fixed by task and file; no model, UI, generic
callback, or live-evidence authority may synthesize a persisted source member:

- Task 16B `kernelRuntime.ts` receives a minimal provider pre-dispatch/result
  observation and derives provider attempt-start/result variants inside the
  issued signal-bound lifecycle;
- Task 19B `approvalEngine.ts` receives minimal registered-executor truth and
  invokes the issued execution handle, which derives `action`, `file_action`,
  `plugin`, `mcp`, or `terminal` source members inside the same canonical
  claim/result transaction; Task 19C `terminalExecutionStore.ts` supplies only
  matching native-exit truth to the transferred handle;
- Task 21A's runtime-issued voice handle derives fixed safe voice observations
  from its captured validated result and accepts no feature-supplied response or
  playback payload; and
- Task 17 `jarvisScheduleDispatch.ts` and `hiveFinalizer.ts` supply fixed safe
  occurrence/worker observations to their runtime-issued handles.

Only `kernelRuntime.ts` and its private signal-bound context core append these
events. It captures account/run/request/attempt and the complete producer
identity when issuing a handle, derives the literal kind, phase, fixed event
type/title/status/safe summary, appends the row, and injects the returned
sequence as `resultEventSeq`; no feature accepts or constructs a
`JarvisEvent`, `JarvisRunTransitionEventInput`,
`JarvisProducerSourceEvidenceV1`, or live-evidence candidate. Static source
tests allow source-member construction only in the context core and focused
fixtures and reject an ordinary journal writer dependency in every feature
owner. Task 18 lands the closed contract/validator/mapper/repository support
before those producer tasks; later manifests add their minimal-observation and
source-row RED/GREEN assertions before a verifier can become ready.

`createJarvisExecutionJournal` receives only the Task 9 repositories, a
monotonic clock, and a `newRunId` dependency whose production default prefixes
`crypto.randomUUID()` with `jrun_`; it receives no abort registry or
cancellation authority.
`allocateRun()` uses a supplied `input.id` when a trusted kernel composition
such as Task 17's private scheduled-allocation capability owns the logical
idempotency key; feature schedule code never supplies it. Otherwise it calls `newRunId()`. It
validates the `jrun_` ID, persists it in `queued` before the compiler/provider
receives it, and idempotently returns an existing run only when the complete
immutable allocation payload matches. A reused ID with different account,
lineage, source, agent, identity, profile, or model data is a typed conflict.

`transitionRun()` first validates the matrix and then calls Task 9's single
transactional
`JarvisRunRepository.compareAndAppendTransitionEvent(input)` primitive:

```ts
export type JarvisRunTransitionEventInput =
  Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;

compareAndAppendTransitionEvent(input: {
  accountId: string;
  runId: string;
  expectedStatus: JarvisRunStatus;
  nextStatus: JarvisRunStatus;
  updatedAt: number;
  completedAt?: number;
  event: JarvisRunTransitionEventInput;
}): Promise<
  | { applied: true; run: JarvisRun; event: JarvisEvent }
  | { applied: false; current: JarvisRun }
>;
```

The same repository exposes
`claimAttemptEffect(input: JarvisAttemptEffectClaimInput)`
using one `jarvis_runs`/`jarvis_events` transaction. It requires the exact
current run/request/attempt binding. A run with no transport-attempt ledger
returns `not_applicable` only after that exact verification and only when it
is not a scheduled run. A scheduled run requires `running`, the latest
`provider_in_flight` attempt, request ID, attempt number, and an unsealed
barrier. It increments the barrier version, changes
its state monotonically to `dirty`, and appends the exact structured
`consequential_effect_claimed` event in the same transaction. The external
effect or artifact materialization may start only after `{ applied: true }`.
A sealed, stale, retryable, completed, uncertain, or noncurrent attempt can
never claim.

That repository primitive performs the expected-status compare, updates the
run, allocates the next event sequence, and inserts a forced
`type: 'run_state'`, `status: nextStatus` event in one IndexedDB transaction.
A conflict returns the current run without either write and becomes a typed
`JarvisTransitionConflictError`; an event insert failure rolls back the run
update. There is no status-first/event-later recovery path. Standalone
`appendEvent()` remains only for non-transition events.

Task 18 extends the read repository and adds a separate closed commit
capability:

```ts
export interface JarvisEventRepository {
  // ...Task 9 methods remain exact...
  getBySeq(accountId: string, runId: string, seq: number): Promise<JarvisEvent | undefined>;
}

/** @internal Test harness only; rejected from every production module. */
export interface JarvisLiveEvidenceEventCommitAuthority {
  appendLiveEvidence(input: {
    accountId: string;
    runId: string;
    evidence: JarvisDurableLiveEvidenceV1;
  }): Promise<JarvisEvent>;
}

/** @internal Test harness only; rejected from every production module. */
export function createJarvisLiveEvidenceEventCommitAuthority(
  db: JarvisDexie,
): JarvisLiveEvidenceEventCommitAuthority;
```

`appendLiveEvidence()` uses one `jarvis_runs`/`jarvis_events` transaction. It
requires an account-owned parent, exact repeated account/run values, positive
attempt identity and `resultEventSeq`, a closed producer/category/operation
set, non-empty stable result reference, finite time, and a valid transition
link. It allocates the
sequence and forces a non-transition event with fixed safe title/summary and
empty source/artifact lists: model evidence uses `type: 'model'`, capability
evidence uses `type: 'tool'`, and `status` is the closed evidence transition.
Callers cannot choose lifecycle status or prose.
The authority alone sets `idempotencyKey` to `jlive-event:` plus the canonical
SHA-256 of all durable evidence fields (including `previousProofRef` and
`resultEventSeq`, excluding only the not-yet-allocated live event sequence).
An identical idempotency retry returns the same row, while any changed payload
fails closed. `getBySeq()` repeats parent-account ownership and returns a
detached exact row; it is the mandatory readback after every live-evidence
append. The ordinary `JarvisEventRepository` has no live-evidence append
method. Import-boundary tests allow the raw commit-authority factory only in
focused test-harness modules; `liveEvidenceAuthority.ts`, kernel, producer, and
UI production code cannot obtain it.

Task 18 extends the run repository with one attempt CAS. The implementation
uses one `jarvis_runs`/`jarvis_events` transaction and never delegates either
write to a separately committing repository call:

```ts
compareAndMutateTransportAttempt(input:
  | {
      kind: 'begin_initial';
      accountId: string;
      runId: string;
      expectedStatus: 'queued';
      attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>;
      updatedAt: number;
    }
  | {
      kind: 'begin_retry';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
      expectedLatestAttemptNumber: number;
      expectedBarrierVersion: 0;
      expectedEventTailSeq: number;
      revalidatedEvidence: JarvisZeroConsequentialEffectEvidenceV1;
      attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>;
      updatedAt: number;
    }
  | {
      kind: 'settle_retryable';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
      expectedAttemptNumber: number;
      expectedBarrierVersion: 0;
      expectedEventTailSeq: number;
      providerFailure: JarvisPreEffectTransportFailureEvidence;
      zeroEffectEvidence: JarvisZeroConsequentialEffectEvidenceV1;
      updatedAt: number;
    }
  | {
      kind: 'settle_uncertain_failed';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
      expectedAttemptNumber: number;
      providerFailure: JarvisPreEffectTransportFailureEvidence;
      updatedAt: number;
      completedAt: number;
    },
): Promise<
  | { applied: true; run: JarvisRun; event: JarvisEvent }
  | { applied: false; current: JarvisRun; reason: 'status_conflict' | 'attempt_conflict' }
>;
```

`begin_initial` requires `run.source === 'schedule'`, no prior attempt, a
strictly positive attempt number `1`, and a fresh request ID. It atomically
appends the `provider_in_flight` attempt, performs the already-legal
`queued -> running` queue-handoff transition, and inserts the forced
`run_state/running` event before any provider call, recording its allocated
sequence as `startedEventSeq`. Compilation and envelope
validation happen before this boundary and are non-consequential.
`begin_retry` requires the same still-`running` schedule run, the exact latest
`retryable_failed` attempt, a new request ID, `attemptNumber + 1`, and a fresh
authority revalidation of the stored zero-effect proof. Inside the same
transaction it also requires the old barrier to remain exactly
`open/version: 0` and the current maximum event sequence to equal both the
proof's `executorClaims.throughSeq` and `expectedEventTailSeq`; it then seals
the old barrier as `sealed_for_retry` before appending the new
`provider_in_flight` attempt and a non-transition
`warning/transport_retry_started` event, records its sequence, and does not
change run status. It never
replays `queued -> compiling`, `compiling -> running`, an approval, an
artifact adapter, or an executor claim.

`settle_retryable` is legal only for Task 13's closed, exact-bound
`before_first_response_byte` failure with `responseStarted: false`,
`chunkCount: 0`, `actionDispatchCount: 0`, and a matching Task 19B zero-effect
proof. Its transaction performs the same exact `open/version: 0` and
proof-tail-equals-current-tail checks, and requires the failure plus proof to
repeat the current account/run/request/attempt, before it changes only the
latest attempt to `retryable_failed`, persists the proof, appends
`warning/transport_retry_available`, and deliberately leaves the logical run
`running`. `settle_uncertain_failed` is used for a missing, stale, mismatched,
or denied proof; it atomically marks the attempt `effect_uncertain`, performs
`running -> failed`, and inserts the forced terminal event. There is no
public primitive for changing an arbitrary attempt or clearing evidence.

Attempt history is capped at `32`. Exceeding the cap rejects same-run retry
and requires a logical retry with a new run. Validators enforce increasing
attempt numbers, unique request IDs, exact state/evidence combinations,
finite numeric times, and deeply immutable detached values. Mappers persist
the array only as `transport_attempts`; it remains local-only with the run.
Task 16B's seven-table terminal commit later changes only the exact current
`provider_in_flight` attempt to `completed` in the same winning transaction as
the terminal run/event. A terminal status can never be retried in place.

This is the retry/effect linearization point. Approval creation in Task 19A
must include `jarvis_runs` in its approval transaction, require exact
request/attempt plus `provider_in_flight`, and dirty/increment the same barrier
atomically with the approval insert. Task 20B must call
`claimAttemptEffect(ownerKind: 'artifact')` before issuing a receipt or
materializing an artifact. Every Task 19 executor must call it before its
external effect. Therefore a late writer either dirties the barrier before
settlement/retry and makes that CAS fail, or loses after settlement/sealing
because its attempt is no longer current/claimable. A proof computed outside
the transaction never authorizes retry by itself.

`createJarvisTransportAttemptCoordinator()` is the only issuer of the
process-private branded lease. It closes over the attempt CAS and re-reads the
persisted run for `verifyLease()`. The lease is not serialized or re-exported
from a public barrel. A crash discards it; an explicit retry obtains a new
lease only after the durable prior attempt and proof pass the retry CAS.

**Zero-consequential-effect authority**

Task 18 defines the read-only authority port and uses a deny-all fake by
default. Task 19B supplies the production implementation after approvals and
executors exist. For the exact run/attempt/request it must prove all of:

- the Task 13 provider boundary is a real transport failure before the first
  response byte/chunk and before any action/tool dispatch, bound to the exact
  account/run/request/attempt/provider/model;
- the exact latest attempt remains `provider_in_flight` with an
  `open/version: 0` effect barrier;
- the canonical approval repository contains zero rows for the run from this
  attempt;
- the canonical artifact repository contains zero rows for the run from this
  attempt; and
- the bounded journal contains zero
  `executionEvidence.kind === 'consequential_effect_claimed'` records through
  the recorded sequence.

Every effect-capable Task 19 adapter commits its structured
`consequential_effect_claimed` event before invoking the external effect and
commits `consequential_effect_completed` only after canonical result truth.
The zero-count proof stores non-secret authority evidence references and the
exact bounded journal sequence, not params, paths, command text, output,
credentials, or secret handles. After restart, retry re-runs the account/run
approval, artifact, and journal checks from the recorded sequence through the
current tail. Both settlement and retry then recheck that sequence and the
barrier inside their CAS transaction. Absence from a process-local registry is
never accepted as proof. An authority error, an unbounded/trimmed evidence
gap, nonzero barrier, any approval, artifact, executor claim, or uncertain
provider boundary returns `null`.

**Durable live-evidence authority**

`createJarvisLiveEvidenceKernelComposition()` is the only production
authority and is imported/called only inside `kernelRuntime.ts`, not by
`app/src/lib/ai/runtime.ts`. The outer `ai/runtime.ts` composition constructs
the named independent verifiers and passes their nine explicit slots into the
kernel constructor, but never receives the returned owner or maintenance
authority. The factory is transaction-agnostic: it accepts only read-side
run/event repository picks for reconstruction plus verifiers/hash/clock; it
accepts no database, writer, or raw commit authority. `kernelRuntime.ts`
constructs the core once and, for each verified lifecycle, creates a narrow
append capability that closes over the exact account/run/request/attempt,
revocation signal, and its own signal-bound transaction core. It passes that
capability only to `bindLifecycle()` and captures the resulting fixed
owner in runtime-issued handles. The raw read and owner-maintenance ports remain
lexical to `kernelRuntime.ts`. That host wraps them as one
`JarvisLiveEvidencePrimaryHostLifecycle`: `openAccount(accountId)` first
performs bounded reconstruction and only then returns an account-bound session
whose `read` rejects every other account and whose synchronous
`assertCurrent()` rejects a disposed or replaced epoch even when the replacement
uses the same account ID; disposing that session invalidates only its captured
account, and disposing the boot lifecycle invalidates all cached state. There is
one active session at a time, stale sessions are epoch-revoked, and no caller receives `reconstructAccount()`,
`invalidateAccount()`, or `invalidateAll()` directly. The deep runtime
composition gives this host lifecycle only to `app/src/lib/ai/runtime.ts`,
which routes it only to the exact primary `App.tsx` boot owner. Task 21B later
uses that already-owned current session to construct the account-bound Command
Center host port after Task 17's retry ports exist. No
raw producer port exists in a production feature return type or is passed to
Tasks 19B, 21A, or 17. Task 18's explicit
test harness is the only factory that exposes test producer ports, and static
tests reject any production import of that harness. Every one of the nine
required verifier slots is explicit. While a later producer task has not
landed, only that exact slot may carry the closed
`{ state: 'unavailable', producerKind,
reason: 'producer_task_not_landed' }` value; its writer throws the typed safe
`live_evidence_verifier_unavailable` error with zero event or cache mutation.
That is staged feature absence, not a verifier and not a silent default. The
owning task must replace it with its named `{ state: 'ready', verifier }`
factory output, and Task 17's final integration rejects any remaining
unavailable slot. There is no production allow-all/deny-all factory. Focused
Task 18 tests may inject explicit deny-all fakes. No UI, selector, model,
catalog, request envelope, or generic callback receives a writer or verifier.
Import-boundary tests reject inline/custom production verifiers, any production
import of the test harness, any second composition-factory call, a
`producers` property on a production runtime, or any public-barrel export of
the composition factory, owner/maintenance authority, registry internals,
proof brand, verifier interface, or concrete verifier factory. Compile-time
negative tests prove a provider port has no `startCapability()` and every
capability port has no `startProvider()`.

`liveEvidenceAuthority.ts` returns only the transaction-agnostic composition
with nine statically named slots and no producer-kind selector, binder, generic
producer port, database, or write repository. Only `kernelRuntime.ts` can call its
private `bindLifecycle()`, and only the same issued lifecycle's
signal-bound context core can mint the scope-captured append capability. The
resulting fixed owner never escapes its host-owned handle. There is no ordinary
production live-evidence append authority. The narrowly named
`createJarvisLiveEvidenceEventCommitAuthority(db)` exists only inside the test
harness for Task 18 authority tests and is rejected by production import
boundaries. Feature modules construct minimal observations and invoke issued
lifecycle closures; they never call a journal or live-evidence writer.

Every canonical producer evidence object includes `resultEventSeq`. A concrete
verifier must read that exact account/run-scoped event through
`JarvisEventRepository.getBySeq()` and require its
`producerSourceEvidence` to be the exact
`Extract<JarvisProducerSourceEvidenceV1, { producerKind: K }>` member for that
verifier, not ordinary status/prose, `executionEvidence` alone, or the
candidate live-evidence event itself. Start evidence requires `phase: 'start'`
on the already-committed attempt/effect/session/worker-start row. A
`completed | degraded` candidate requires `phase: 'result'` on a separately
committed immutable provider/executor/voice/schedule/worker result row. The
verifier repeats exact account/run/request/attempt, producer kind and full
producer identity, stable `resultRef`, state, and numeric `observedAt` from
that source. A schedule or Hive result additionally requires a non-optional
`resultAuthority` naming a distinct, earlier event. The verifier reads that
event from the named account-owned run and requires its
`canonicalResultEvidence` to repeat the exact `jresult_` reference, state,
time, request/attempt, and schedule run or Hive child/parent/step lineage. The
source row cannot name itself, a later row, an ordinary status event, or
another account. This source-row and authority-row read is mandatory both at issuance and after
restart; no prose inference, catalog/store availability, or process memory
can substitute for it. Process memory may authorize only a current-process
active start, and that active-only chain is never reconstructed.

For every `startProvider()`/`startCapability()`/`update()`/`complete()` call,
the scoped port performs this exact sequence:

1. invoke only its matching canonical producer verifier and require exact
   account/run/request/attempt/producer-kind/producer-identity/result/
   result-event/state equality against the persisted closed source member;
2. build `JarvisDurableLiveEvidenceV1`; for every update or terminal record,
   require `previousProofRef` to name the registration's current proof;
3. await the producer port's captured signal-bound context-core append
   capability and its committed event sequence;
4. call `getBySeq()` and require the read-back event and embedded record to
   repeat every input field, the parent run ownership, and the allocated
   sequence;
5. compute an opaque `jlive_` reference as the SHA-256 of canonical
   account/run/request/attempt/registration/producer-kind/producer-identity/
   result/result-event/
   transition/live-event-sequence/live-evidence fields, brand it only inside
   the authority, then
   read the same row once more by `(accountId, runId, eventSeq)` and revalidate
   it; and
6. after every await, recheck the registration's captured global, account, and
   run generation epochs plus object identity; only after both exact readbacks
   and a final synchronous epoch check apply that proof/row to the private
   registry and notify subscribers.

The digest is an opaque stable lookup/reference, not authorization by itself.
The brand is process-private, but the registry never trusts a brand, digest,
caller object, or free-form `evidenceRef` alone: every mutation receives the
exact canonical row from the closed authority and rejects a forged/cast,
unknown sequence, changed row, foreign account/run, mismatched result,
out-of-order time, stale prior proof, or disposed/replaced registration. Node
`evidenceRef` is only the serialized verified `proofRef`; producers cannot
supply it.

Initial active/ready/busy visibility therefore always has a durable `started`
or `ready` event committed first. Completion/degradation commits a second
canonical row linked by `previousProofRef`; after exact readback it replaces
the active node under the same registration rather than appending an
unrelated node. Disposing a current-process handle removes only its active
cache entry and cannot delete durable evidence. Re-registration may replace
only the same exact registration after the authority has rejected stale
handles. Completed/degraded nodes are capped at `500` per run; eviction is a
display-cache bound and never deletes journal rows.

`reconstructAccount()` runs during canonical account boot before the Command
Center can subscribe. It clamps `runLimit` and `pageSize` to `1..500`, defaults
`maxEventRowsPerRun` to `10_000`, reads at most the newest `500` account-owned
runs, and paginates each exact `(accountId, runId)` event stream with
`afterSeq` and pages of at most `500`. It never performs an unbounded read. If
the row budget is reached before an empty/short final page, a sequence gap is
found, a producer verifier cannot revalidate a terminal result, or any proof
link/digest/account/run/request/attempt/producer/result field fails, the
entire run contributes zero reconstructed nodes. Only a complete chain ending
in `completed | degraded` is reconstructed and applied after its exact event
row is read back; a prior-process `started | ready | busy` tail is treated as
stale and omitted, never shown active. Account switch invalidates the old
cache before reconstructing the new account; same run IDs across accounts
cannot collide.

The read port is asynchronous because it re-invokes the matching named
producer verifier for every returned completed/degraded node and then
revalidates its exact live-evidence event row before snapshotting; active nodes
repeat their current-process verifier check plus their already-committed row
read. A missing/changed source or live row drops the node and fails closed.
`invalidateRun`, `invalidateAccount`, and `invalidateAll` synchronously bump
the corresponding generation epoch before removing cache entries and
subscriptions; they never rewrite journal history. Every registration and
reconstruction captures all three epochs and rechecks them after verifier,
first-readback, digest, second-readback, and immediately before apply/notify.
An invalidated in-flight publication therefore cannot repopulate an old
account/run cache. Request-time capabilities, provider configuration, ordinary
events without `liveEvidence`, and render state cannot create a node.

Concrete producer ownership is exact:

- Task 16B's provider-evidence module owns
  `createJarvisProviderLiveEvidenceVerifier({ runs, events,
providerAttempts, providerResults })`, and `app/src/lib/ai/runtime.ts` is its only
  production importer/constructor. For start it requires Task 18's exact persisted
  attempt-start event carrying the `provider`/`start` source member plus Task
  13's live tracker binding; for terminal reconstruction it requires the
  canonical terminal provider result event carrying the same identity's
  `provider`/`result` member.
  The protected dispatcher receives only the current issued lifecycle's bound
  provider closures, awaits durable signal-bound live-evidence commit/readback
  before exposing activity, and links final evidence to the same registration.
- Task 19B's `approvalEngine.ts` owns
  `createJarvisActionLiveEvidenceVerifiers({ runs, events })`, with
  `app/src/lib/ai/runtime.ts` as its only production importer/constructor, returning exactly
  `action | fileAction | terminal | plugin | mcp`. Busy starts require the
  corresponding durable `consequential_effect_claimed` event with its exact
  producer `start` member; completion/degradation requires the matching
  `consequential_effect_completed` event with that identity's `result` member,
  written by the private registered executor for action/file/plugin/MCP and by
  Task 19C's native-exit owner for terminal. Owner kind/ID and action version
  select the one lifecycle-bound execution handle; catalog availability creates
  no node. The engine supplies verifiers to composition but receives no producer
  port itself.
- Task 21A's `voiceTurnCommit.ts` owns
  `createJarvisVoiceLiveEvidenceVerifier({ runs, events })`, with
  `app/src/lib/ai/runtime.ts` as its only production importer/constructor. TTS/playback start
  first appends a fixed safe voice-executor-start event with a `voice`/`start`
  member, and final playback/degradation first appends or uses the canonical
  voice result/terminal event with the matching `voice`/`result` member.
  The verifier reads those rows; the voice seam receives only its runtime-issued
  handle's bound record closures.
- Task 17's `jarvisScheduleDispatch.ts` owns
  `createJarvisScheduleLiveEvidenceVerifier({ runs, events })`, constructed only
  by `app/src/lib/ai/runtime.ts`, tied to the
  persisted occurrence/attempt-start `schedule`/`start` and canonical
  schedule-result `schedule`/`result` events. Every result source row must point
  backward to the distinct canonical kernel-turn or transport-settlement
  authority event returned by the private commit core; the runner supplies no
  result state, reference, sequence, or time.
  `hiveFinalizer.ts` owns
  `createJarvisHiveLiveEvidenceVerifier({ runs, events })`, also constructed only
  by `app/src/lib/ai/runtime.ts`, tied to fixed safe
  worker-start and worker-result events carrying the matching `hive` source
  member. Every result row points backward to a separately committed canonical
  child/provider result on the deterministic child run. Schedule/Hive seams
  receive only runtime-issued handles over the binding authority. Only actual
  occurrences/workers are registered, never planned work.
- Task 21B's deep `app/src/lib/ai/runtime.ts` host factory alone receives the
  active primary-host account session so it can bind the session epoch to effect
  closures. Command Center data/UI code receives only that session's
  `JarvisAccountLiveEvidenceReadPort` and cannot assert/open/close host sessions,
  commit, reconstruct, verify, invalidate, or mutate evidence.

The five named factory groups are `@internal`, omitted from every barrel, and
may be imported in production only by `app/src/lib/ai/runtime.ts`. That module
passes only their fixed ready/unavailable slots into `kernelRuntime.ts`; it
never receives the live core, owner, append capability, or raw maintenance.
It retains only the exact host lifecycle wrapper returned by the kernel
composition and routes that wrapper to primary `App.tsx`. Task 16B wires
provider plus Task 19B action verifiers; Task 21A adds voice; Task 17 adds
schedule/Hive. At each intermediate slice, an as-yet-unimplemented producer
slot is explicitly unavailable and its port fails closed. After Task 17,
import-boundary/integration tests require all nine slots to be `ready` exactly
once and reject any unavailable slot. No factory accepts a generic `verify`
function, and no producer can use another producer kind's source row.

**Cancellation aggregation and terminality**

- Registrations are keyed by `(accountId, runId, registrationId)`.
  Re-registering replaces only that ID. The returned disposer is idempotent
  and removes only the same function instance. Every executor owner must
  register **before** its work becomes enqueueable, visible, or otherwise
  externally cancellable.
- A cancellation request receives a stable internal request ID. The journal
  appends exactly one closed-contract `JarvisEvent` with that request ID as
  `idempotencyKey`, `type: 'warning'`,
  `status: 'cancellation_requested'`, title `Cancellation requested`,
  `safeSummary: 'Cancellation delivery is pending.'`, empty `sourceRefs`, and
  empty `artifactIds`. There is no new
  durable cancellation payload or table. The in-memory registry retains owner
  delivery state for the exact account/run, snapshots current owners for the
  run and registered descendants, and invokes each registration at most once
  for that request. A registration added or replaced while that in-memory
  request remains pending is invoked immediately; the caller does not need to
  press Cancel a second time. On process restart the event is evidence of
  intent only: owner delivery is not reconstructed or replayed, and Task 18
  recovery returns `fail_closed`. This closes the live-process
  drained/claimed-before-session gap without inventing durable abort state.
- Task 18 implements that ordering by splitting registry delivery from journal
  persistence. `JarvisCancellationDeliveryAuthority.prepare()` returns exactly
  `prepared | already_pending | already_terminal`. `prepared` creates one
  WeakSet-registered process-local plan but invokes no owner;
  `already_pending` returns the existing request ID and current aggregate
  without a second plan/event/fanout. The caller must commit the fixed warning
  event before `deliver(plan)`; owners registered between those steps are
  queued and invoked only after the event exists. `deliver()` activates one
  exact plan once; repeated public requests use `current()` rather than a
  second activation. `abandonBeforeDelivery()` removes only an unactivated
  prepared request after an event-write failure. A cast, clone, foreign
  registry plan, abandoned plan, or second activation fails closed. Focused
  Task 18 tests may use a non-barreled `createTestJarvisCancellationFacade()`
  declared in `abortRegistry.ts`; static imports reject that symbol from every
  production module. The production path is owned by Task 16B's signal-bound
  lifecycle and never calls an ordinary writer.
- The same private abort registry supplies
  `JarvisAbortRegistrationAuthority` to `kernelRuntime.ts`. The kernel never
  exposes it directly: provider, action, voice, terminal, schedule, and Hive
  handles receive scope-captured registration closures and register before work
  becomes enqueueable/visible. Account teardown revokes every closure and
  removes its registrations. Secondary webviews invoke cancellation through
  Task 16W's authenticated native client bridge; they never construct a second
  registry.
- Repeated cancellation calls while that same in-memory request is pending
  reuse its request ID and existing event and do not invoke the same
  registration twice. They return the current aggregate delivery state rather
  than append another warning event or create another fan-out.
- A canonical terminal transition or `clearRun()` clears the in-memory pending
  request and all per-request delivery bookkeeping. A late owner is never
  invoked for a run that has become terminal.
- There is no unconditional `queued -> cancelled` transition. Under the queue
  owner's exclusive exact-item lock, it validates the exact unclaimed queued
  item and atomically replaces it with a durable non-runnable cancellation
  tombstone retaining item/run/execution identity. It then performs the same
  issued account/run signal-bound `jarvis_runs`/`jarvis_events` CAS from
  `queued -> cancelled`. Only after both the tombstone and terminal CAS commit
  may it mint internal `queued_tombstoned` and public `queued_cancelled` truth.
  Post-terminal physical tombstone cleanup is optional/idempotent and never
  affects the receipt. A missing lock, false exact match, claimed/drained item,
  tombstone conflict, status-CAS conflict, or revocation before the CAS commits
  returns `handoff_pending` only if the original runnable item was restored
  under the same lock. If exact rollback cannot be proven, return
  `delivery_error`, retain the fail-closed tombstone for repair, and do not
  route it to a later owner. Once the terminal CAS commits, cancellation is
  final, the pending request is cleared, and later-owner routing is forbidden.
- A queue/claim owner that knows work has transferred but cannot yet deliver a
  native/provider abort returns `{ kind: 'handoff_pending', ownerId }`, which
  maps to the same truthful public `handoff_pending` result. This is distinct
  from an executor that actually rejects delivery.
- `{ kind: 'signal_delivered', ... }` yields a public
  `{ kind: 'signal_delivered', cancellationRequestId, ownerIds }`. The event
  remains nonterminal and the journal does **not** change the run status.
  Only the owning provider/native/executor truth callback may verify that
  matching work stopped and call
  `transitionRun(... nextStatus: 'cancelled' ...)`.
- `already_exited` never fabricates cancellation: the canonical exit/result
  callback wins and the request returns `delivery_rejected` unless the run is
  already terminal. All owners `unsupported` yields `unsupported`; no owner
  yields `executor_missing`; owner rejection yields `delivery_rejected`; an
  owner throw yields `delivery_error` when no signal was accepted.
- An already-terminal run yields
  `{ kind: 'already_terminal', terminalStatus: run.status }`.
- Authority revocation before the warning-event transaction returns
  `authority_revoked_before_intent` and zero intent/event/delivery. Once the
  fixed intent event commits, the result can never say cancellation was not
  requested: the kernel continues delivery to the exact owners captured by
  that committed request even if account authority subsequently revokes, and
  returns `intent_committed` with `authorityState: 'revoked_after_intent'`, the
  stable request ID, and the truthful current aggregate. A stable path returns
  the same discriminant with `authorityState: 'current'`; repeated calls use
  `requestState: 'already_pending'` and never redeliver. Every UI surface maps
  the outer discriminant and every aggregate exhaustively.
- A completion that wins the race after `signal_delivered` but before executor cancellation confirmation may truthfully transition the still-running run to `completed` or `failed`; the later cancellation confirmation then loses its expected-status compare. Once an executor has atomically transitioned the run to `cancelled`, every late completion/failure is rejected by the terminal matrix.
- Parent cancellation includes children registered with `parentRunId`. Child failure does not cancel the parent unless the owning runtime explicitly requests that transition.

**Recovery rules**

- The scanner receives the read-only `JarvisRecoveryApprovalVerifier`; it has
  no execute/consume method. Task 18 tests use a fake, and Task 19B wires the
  canonical approval-engine verifier after Task 19A exists. A missing verifier
  fails closed, so Task 18 does not create an approval dependency cycle.
- Query only nonterminal statuses.
- Clamp `runLimit` and `eventLimitPerRun` to `1..500`; defaults are `500`.
- Read at most the newest `500` events per run. Task 9's
  `listByRun(accountId, runId, { afterSeq?, limit? })` contract is exact: with
  `afterSeq`, return ascending events strictly after it; without `afterSeq`,
  reverse-scan `[run_id+seq]` for the newest bounded `limit`, then reverse only
  that tail into ascending sequence order. Never load an unbounded history.
- Recovery v1 has only `await_approval | fail_closed`; it has no `resume`
  branch and never calls an executor.
- `awaiting_approval` returns `await_approval` only when there is exactly one
  canonical v1 approval that is pending, unconsumed, unexpired, and whose
  ID equals the latest closed-contract approval event's `idempotencyKey`
  (`type: 'approval'`, `status: 'pending'`, fixed safe title/summary, empty
  refs/artifacts). Load that ID through the account-scoped repository, require
  exact `runId`, then re-resolve the registered action/current target/current
  capability/current entitlement authority and recompute the canonical
  binding. The stored action/version/canonical params/target/capability/
  entitlement values and hashes must all match. The event never stores those
  values. Missing, duplicate, stale, denied, expired, consumed, legacy, or
  mismatched approval data returns typed `fail_closed`.
- `queued | compiling | running` found after restart still returns only
  `fail_closed` and makes zero provider/action/native calls. A `running`
  schedule whose exact latest attempt is `retryable_failed` with a
  well-formed durable zero-effect proof returns
  `scheduled_transport_retry_available`; the scanner records no transition
  and does not terminalize that safely retryable run. The explicit Task 17
  trusted retry port must revalidate the proof and win the attempt CAS before
  dispatch. A `provider_in_flight` attempt at crash time is
  `ambiguous_executor_state`, and a queued/unbound or otherwise unsupported
  case is `manual_retry_required`. Neither case is eligible for same-run
  retry.
- Recovery never deletes rows, synthesizes completion, repeats a consumed
  approval, invokes an executor, or resumes a terminal run.
- A terminal scheduled run always rejects transport retry. Its retry action is
  logical: increment `logicalAttempt`, allocate a new run/request, and bind the
  previous run as `parentRunId`. An ambiguous nonterminal run must first be
  explicitly failed through Task 18's legal transition authority before that
  logical retry; normal boot scanning does not do this automatically.

**Checkbox TDD steps**

- [ ] Add state-machine tests for every legal edge, every illegal edge, self-transition rejection, and terminal immutability; run `npm --prefix app test -- src/lib/jarvis/executionJournal/stateMachine.test.ts` and confirm the new tests fail because the module is absent.
- [ ] Implement only the transition table and typed validator; rerun the test and expect `PASS`.
- [ ] Add journal tests for preallocated `jrun_` IDs, account scoping, atomic
      status-plus-event commit, compare-and-set conflict with neither write
      applied, `(runId, seq)` identity, identical retry dedupe by
      `(runId, idempotencyKey)`, changed-payload idempotency conflict, and late
      completion after a verified `cancelled` transition; run the journal test
      and confirm red.
- [ ] Implement the repository-backed journal and rerun state-machine plus journal tests to green.
- [ ] Add transport-attempt tests for atomic initial
      `queued -> running`, durable new request/attempt identity before provider
      dispatch, same-run retry without replayed transitions, stale proof/CAS
      conflict, exact zero-effect proof, monotonic barrier versions, effect
      claim/run/event atomicity, proof-tail equality, approval/artifact/
      executor-claim racing both settlement and retry in both commit orders,
      sealed-old-attempt denial, bounded history, crash-time in-flight ambiguity, retryable
      recovery without terminalization, terminal immutability, and logical
      retry requirement; run
      `npm --prefix app test -- src/lib/jarvis/executionJournal/transportAttempts.test.ts src/lib/db/jarvisRepositories.test.ts`
      and confirm red.
- [ ] Implement the attempt CAS/coordinator, structured execution-evidence
      mapping, and deny-all default safety port; rerun the focused tests to
      green.
- [ ] Add abort-registry tests for owner-before-exposure registration, exact
      durable non-runnable tombstone before terminal CAS, false tombstone,
      tombstone/status CAS conflict,
      truthful `handoff_pending` for claimed/drained work, late owner registration
      receiving the pending request without a second click, repeated UI calls
      returning `already_pending`/the current aggregate while reusing one
      request/event and not redelivering to the same owner; distinct
      `prepared`, `already_pending`, and `already_terminal`; second-plan
      activation rejection; revocation before intent, after intent, during
      fanout, and after tombstone/before terminal CAS with exact rollback;
      rollback failure remaining fail-closed with no later-owner routing; multiple
      labelled owners, reject, throw, unsupported, missing executor, already
      exited, already terminal, parent/child fan-out, disposer cleanup,
      `signal_delivered` leaving the run nonterminal, completion winning before
      executor confirmation, and executor-confirmed cancellation rejecting later
      completion; statically prove `JarvisExecutionJournal` and its constructor
      have no cancellation/abort surface and no production feature imports the
      raw registry, delivery authority, or test facade; run the test and confirm
      red.
- [ ] Implement abort registration and cancellation aggregation; rerun and expect green.
- [ ] Add recovery tests for exact pending/unconsumed/unexpired v1 approval
      matching across account/run/action/version/params/target/capability/
      entitlement, every mismatch and duplicate candidate, every nonterminal
      status, exact `scheduled_transport_retry_available` versus
      `ambiguous_executor_state`, zero executor calls, no `resume` result, no
      replay, no terminal scan, newest-event cap, caller limits `0`, `501`, and
      a very large integer, and no durable deletion; run and confirm red.
- [ ] Implement the bounded recovery scanner; rerun all Task 18 tests and expect green.
- [ ] Add live-authority/registry/repository tests for stable derived IDs;
      opaque branded proof binding to exact account/run/request/attempt/
      registration/producer/result/event sequence; commit plus two exact row
      readbacks before first visibility; previous-proof-linked replacement;
      forged/cast proof, missing/changed row, idempotency conflict,
      cross-account/same-run-ID, stale handle, and out-of-order rejection;
      required explicit verifier slots, typed unavailable-slot denial with
      zero writes, test-only deny-all fakes, and rejection of a live-evidence
      row as its own producer-result source; all nine closed
      `producerSourceEvidence` variants and snake-case row mappings; exact
      `canonicalResultEvidence` mapping and optional result-authority shape;
      Task-18-owned attempt-scope compilation without any future-task type;
      exact start/result phase-state validation; unknown-field, ordinary-status,
      execution-evidence-only, and producer-identity mismatch denial;
      provider and every closed capability category; active/completed/degraded
      lifecycle; provider-port/capability-port compile-time and runtime misuse
      rejection; no production `producers` property or test-harness import;
      bounded completed retention; subscription cleanup; and run/account/
      process invalidation during verifier, first readback, digest, second
      readback, apply, and notification. Run
      `npm --prefix app test -- src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts src/lib/db/jarvisRepositories.test.ts`
      and confirm red.
- [ ] Add boot-reconstruction tests for bounded account/run pagination,
      complete terminal proof chains, terminal producer revalidation, durable
      completed/degraded visibility after restart, omission of orphaned active
      chains, budget/sequence-gap fail-closed behavior, detached async
      snapshots, zero nodes from request-time capabilities alone, and account
      switch invalidation before new-account reconstruction; then implement the
      authority and registry and rerun green.
- [ ] Run `npm --prefix app run typecheck`.
- [ ] Run `npm --prefix app test -- src/lib/jarvis/executionJournal`.
- [ ] Stage only the twenty-four literal Task 18 paths listed in the command
      below; verify `git diff --cached --name-only` contains no other path and
      `git diff --cached --check` is empty.
- [ ] Run the added-line secret scan against the staged diff; commit only after it returns no match.

**Task 18 commit**

```powershell
git add -- `
  app/src/lib/jarvis/contracts/execution.ts `
  app/src/lib/jarvis/contracts/validators.ts `
  app/src/lib/jarvis/contracts/validators.test.ts `
  app/src/lib/jarvis/contracts/index.ts `
  app/src/lib/db/schema.ts `
  app/src/lib/db/jarvisMappers.ts `
  app/src/lib/db/jarvisMappers.test.ts `
  app/src/lib/db/jarvisRepositories.ts `
  app/src/lib/db/jarvisRepositories.test.ts `
  app/src/lib/jarvis/executionJournal/stateMachine.ts `
  app/src/lib/jarvis/executionJournal/stateMachine.test.ts `
  app/src/lib/jarvis/executionJournal/journal.ts `
  app/src/lib/jarvis/executionJournal/journal.test.ts `
  app/src/lib/jarvis/executionJournal/abortRegistry.ts `
  app/src/lib/jarvis/executionJournal/abortRegistry.test.ts `
  app/src/lib/jarvis/executionJournal/recovery.ts `
  app/src/lib/jarvis/executionJournal/recovery.test.ts `
  app/src/lib/jarvis/executionJournal/transportAttempts.ts `
  app/src/lib/jarvis/executionJournal/transportAttempts.test.ts `
  app/src/lib/jarvis/executionJournal/liveEvidenceRegistry.ts `
  app/src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts `
  app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.ts `
  app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts `
  app/src/lib/jarvis/executionJournal/index.ts
git commit -m "feat(jarvis): add canonical execution journal"
```

## Task 11: Context, Capability, Immutable Envelope, and Retry Identity

**Files:**

- Create: `app/src/lib/jarvis/contextPack.ts`
- Create: `app/src/lib/jarvis/contextPack.test.ts`
- Create: `app/src/lib/jarvis/capabilitySnapshot.ts`
- Create: `app/src/lib/jarvis/capabilitySnapshot.test.ts`
- Create: `app/src/lib/jarvis/requestEnvelope.ts`
- Create: `app/src/lib/jarvis/requestEnvelope.test.ts`
- Modify: `app/src/lib/ai/context.ts`
- Modify: `app/src/lib/ai/context.test.ts`

**Interfaces:**

- Consumes Task 2's `JarvisIdentitySnapshot`,
  `JarvisProfileSnapshot`, and frozen profile factories.
- Consumes Task 3's `JarvisRequestEnvelope`, `JarvisContextPack`,
  `JarvisCapabilitySnapshot`, `JarvisModelSnapshot`,
  `JarvisOutputContract`, and validators.
- Consumes Task 4's two-stage `classifyJarvisSource()` path/content
  admission.
- Consumes Task 5's verified `JarvisEntitlementSnapshot`.
- Consumes Task 9's account-scoped repositories and local-only enforcement.
- Consumes Task 18's already-persisted `runId`, parent-run ownership, and
  journal transition primitives layered over Task 9's
  `compareAndAppendTransitionEvent()`. Task 11 never allocates a run ID.
- Produces `validateJarvisRequestAttempt()`, `buildJarvisContextPack()`,
  `createJarvisCapabilitySnapshot()`, and
  `createJarvisRequestEnvelope()` for Tasks 12, 16A, 16B, 21A, and 17.

**Exact contracts:**

```ts
export type JarvisRequestAttempt =
  | {
      kind: 'initial';
      requestId: string;
      runId: string;
      attemptNumber: 1;
    }
  | {
      kind: 'transport_retry';
      requestId: string;
      runId: string;
      attemptNumber: number;
      previousRequestId: string;
      previousRunId: string;
      previousAttemptNumber: number;
    }
  | {
      kind: 'logical_retry';
      requestId: string;
      runId: string;
      attemptNumber: 1;
      previousRequestId: string;
      previousRunId: string;
      previousAttemptNumber: number;
    };

export interface JarvisContextCandidate {
  source: JarvisSourceRef;
  purpose: JarvisContextItem['purpose'];
  excerpt?: string;
  score?: number;
  explicitlyAttached: boolean;
  authorizedBody: boolean;
}

export interface JarvisContextPackInput {
  accountId: string;
  candidates: readonly JarvisContextCandidate[];
  maxChars: number;
}

export interface CapabilitySnapshotInput {
  capturedAt: number;
  tools: readonly JarvisCapabilityRef[];
  plugins: readonly JarvisCapabilityRef[];
  mcps: readonly JarvisCapabilityRef[];
  terminals: readonly JarvisCapabilityRef[];
  agents: readonly JarvisCapabilityRef[];
  entitlements: JarvisEntitlementSnapshot;
}

export interface JarvisRequestInput {
  attempt: JarvisRequestAttempt;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  agent: JarvisRequestEnvelope['agent'];
  surface: JarvisRequestEnvelope['surface'];
  interactionMode: JarvisRequestEnvelope['interactionMode'];
  responseModeHint?: JarvisResponseMode;
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  model: JarvisModelSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  userText: string;
  messageHistory: readonly LLMMessage[];
  createdAt: number;
}

export function validateJarvisRequestAttempt(
  attempt: JarvisRequestAttempt,
): Readonly<{ requestId: string; runId: string; attemptNumber: number }>;

export async function buildJarvisContextPack(
  input: JarvisContextPackInput,
): Promise<Readonly<JarvisContextPack>>;

export function createJarvisCapabilitySnapshot(
  input: CapabilitySnapshotInput,
): Readonly<JarvisCapabilitySnapshot>;

export interface JarvisCapabilitySnapshotProvider {
  getForAccount(accountId: string): Promise<Readonly<JarvisCapabilitySnapshot>>;
}

export function createJarvisCapabilitySnapshotProvider(input: {
  getActiveAccountId(): string | undefined;
  resolveInputForActiveAccount(accountId: string): Promise<CapabilitySnapshotInput>;
}): JarvisCapabilitySnapshotProvider;

export async function createJarvisRequestEnvelope(
  input: JarvisRequestInput,
): Promise<Readonly<JarvisRequestEnvelope>>;
```

**Request-attempt rules:**

- `requestId`, `runId`, and all previous IDs are non-empty.
- `initial` accepts Task 18's persisted run, a fresh request ID, and exact
  `attemptNumber: 1`.
- A transport retry requires a new request ID and the same run ID:

```ts
attempt.requestId !== attempt.previousRequestId;
attempt.runId === attempt.previousRunId;
attempt.attemptNumber === attempt.previousAttemptNumber + 1;
```

- A logical retry requires both a new request ID and a new run ID:

```ts
attempt.requestId !== attempt.previousRequestId;
attempt.runId !== attempt.previousRunId;
attempt.attemptNumber === 1;
```

- Invalid combinations throw a typed local `JarvisRequestAttemptError` before
  provider dispatch.
- The envelope contains only the current attempt's request/run IDs. Attempt
  number remains trusted runtime/journal metadata used to bind approvals,
  artifacts, and effect barriers; previous IDs/numbers are journal relations,
  not hidden prompt fields.
- Task 18 must return the persisted run before
  `createJarvisRequestEnvelope()` is called. The builder has no run-ID
  generator import.

**Context and capability rules:**

- Explicit user attachments sort ahead of retrieved candidates.
- Within the same class, sort by descending finite score, then
  `source.observedAt` descending, then `source.id` ascending.
- Every candidate account must match `input.accountId`.
- Re-run Task 4 source admission before including an excerpt.
- `authorizedBody: false` retains only the source reference and adds no body.
- Secret/restricted exclusions contain the source ref plus a safe category,
  never the rejected body.
- External/retrieved context stays `trust: 'external_untrusted'` and cannot
  become a preference or authority layer.
- Truncation is deterministic, never splits a UTF-16 surrogate pair, and
  records the source in `exclusions` when no excerpt character fits.
- Capability arrays are copied, sorted by stable ID, and frozen.
- Capability state uses only
  `available | connected | authenticated | degraded | unavailable | planned`.
- A catalog entry alone cannot become `connected` or `authenticated`.
- Entitlements are copied from Task 5's verified snapshot without inference.
- `createJarvisCapabilitySnapshotProvider()` is the non-React production
  source used by Task 19A. It resolves current connector/executor state only
  for the exact canonical active account, creates a fresh frozen snapshot,
  and rechecks the account before return. Signed-out, changed, or mismatched
  account state throws the typed safe `capability_account_unavailable` error;
  it never returns a cached snapshot belonging to another account.

**Deep-freeze rule:**

Use one cycle-safe recursive freezer owned by `requestEnvelope.ts`. Do not
freeze caller-owned objects in place. Build detached copies, then freeze:

- the envelope and `agent`;
- identity, profile, model, capability, entitlement, and output snapshots;
- capability arrays and every capability object;
- context, items, exclusions, budget, every source ref, and every item;
- `messageHistory`, every message, content-part array, and every content part;
- every nested plain array/object reachable from model capabilities.

A strict-mode mutation attempt must throw or leave the value unchanged.

- [ ] **Step 1: Write the focused failing tests**

In `requestEnvelope.test.ts`, table-test initial IDs; transport retry with a
new request and same run; logical retry with a new request and new run; reused
request IDs; transport retry with a different run; logical retry with the same
run; exact initial/logical attempt number `1`; transport `previous + 1`;
zero/negative/skipped/reused attempt numbers; missing IDs; the Task 18 run
supplied exactly once; every nested
`Object.isFrozen()` assertion; caller inputs remaining unfrozen and unchanged;
mutation attempts against arrays, message parts, capabilities, source refs,
profile text, and model flags; and validator failure preventing return.

In `contextPack.test.ts`, cover explicit-first ordering, deterministic ties,
account mismatch, body-not-authorized behavior, stale refs, secret path and
content exclusion, stable truncation, and untrusted-authority isolation.

In `capabilitySnapshot.test.ts`, cover every capability state, catalog-only
`planned/available`, signed-out/unavailable connectors, exact model/provider
state, entitlement provenance, detached copies, deep freezing, and the
non-React provider's allow/exact-account/recheck/cross-account failure paths.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/contextPack.test.ts src/lib/jarvis/capabilitySnapshot.test.ts src/lib/jarvis/requestEnvelope.test.ts src/lib/ai/context.test.ts
```

Expected: FAIL because the three new modules cannot be resolved.

- [ ] **Step 3: Implement the minimal complete boundary**

Implement the exact contracts, attempt validation, deterministic context
ranking/budgeting, verified capability copy, detached deep-freeze behavior,
and the existing AI-context adapter. Preserve the non-JARVIS context path.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/contextPack.test.ts src/lib/jarvis/capabilitySnapshot.test.ts src/lib/jarvis/requestEnvelope.test.ts src/lib/ai/context.test.ts
npm run typecheck
```

Expected: the focused suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/contextPack.ts' 'app/src/lib/jarvis/contextPack.test.ts' 'app/src/lib/jarvis/capabilitySnapshot.ts' 'app/src/lib/jarvis/capabilitySnapshot.test.ts' 'app/src/lib/jarvis/requestEnvelope.ts' 'app/src/lib/jarvis/requestEnvelope.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/contextPack.ts' 'app/src/lib/jarvis/contextPack.test.ts' 'app/src/lib/jarvis/capabilitySnapshot.ts' 'app/src/lib/jarvis/capabilitySnapshot.test.ts' 'app/src/lib/jarvis/requestEnvelope.ts' 'app/src/lib/jarvis/requestEnvelope.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): build immutable request envelopes"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eight files above. The
installer and whitespace queries produce no output.

## Task 12: Pure Protected Prompt Compiler with Defense in Depth

**Files:**

- Create: `app/src/lib/jarvis/promptCompiler.ts`
- Create: `app/src/lib/jarvis/promptCompiler.test.ts`
- Create: `app/src/lib/jarvis/promptCompiler.performance.test.ts`
- Modify: `app/src/lib/jarvis/promptLayers.ts`
- Modify: `app/src/lib/jarvis/promptLayers.test.ts`

**Interfaces:**

- Consumes only the frozen Task 11 `JarvisRequestEnvelope`, Task 3 domain
  contracts, Task 2 protected-agent predicate and immutable policy exports,
  and Task 4 pure source-classification function.
- Produces one deterministic `CompiledJarvisPrompt` for Task 13 transport and
  Tasks 16A/16B/21A/17 runtime consumers.
- Imports no Zustand store, repository, router, provider, UI, browser, auth,
  agent getter, or All About Me getter.

**Exact compiler surface and errors:**

```ts
export const JARVIS_ALL_ABOUT_ME_SOURCE_ID = 'jarvis:all-about-me';

export type JarvisPromptCompilationErrorCode =
  | 'not_protected_jarvis'
  | 'secret_source'
  | 'duplicate_immutable_layer'
  | 'invalid_envelope'
  | 'prompt_budget_exceeded';

export class JarvisPromptCompilationError extends Error {
  readonly code: JarvisPromptCompilationErrorCode;

  constructor(code: JarvisPromptCompilationErrorCode, message: string) {
    super(message);
    this.name = 'JarvisPromptCompilationError';
    this.code = code;
  }
}

export function compileJarvisPrompt(
  envelope: Readonly<JarvisRequestEnvelope>,
): Readonly<CompiledJarvisPrompt>;
```

**Protected-agent gate:**

Compilation begins with:

```ts
if (!isProtectedJarvisAgent(envelope.agent)) {
  throw new JarvisPromptCompilationError(
    'not_protected_jarvis',
    'The protected JARVIS compiler is unavailable for this agent.',
  );
}
```

The predicate remains exactly:

```ts
agent.builtin === true && agent.slug === 'jarvis';
```

A user-created agent whose slug is `jarvis` fails before layer construction,
hashing, diagnostics, or provider dispatch.

**Compiler-owned secret defense:**

Before rendering context:

1. reject every source with `sensitivity === 'secret'`;
2. re-run `classifyJarvisSource()` on every included excerpt using its safe
   URI/label, `kind: 'text'`, the appropriate context channel, and
   `contentSample: item.excerpt`;
3. reject a denied `secret_filename`, `credential_path`, or `secret_content`;
4. never put the rejected excerpt, path, token fragment, or source body in the
   thrown error or diagnostics.

Restricted sources remain excluded unless a later explicit-consent contract
has already converted them to an allowed private context item. This task does
not invent that consent flow.

**Exact layer order and duplicate rules:**

Build exactly these seven layer IDs in order:

```ts
[
  'immutable-security',
  'immutable-identity',
  'capability-policy',
  'user-approved-preference',
  'turn-policy',
  'untrusted-context',
  'output-contract',
];
```

Map them to Task 3's `PromptAuthority` values in the same order.

- Immutable security appears once.
- Immutable identity/response contract appears once.
- `profile.customInstructions` appears once in
  `user-approved-preference`.
- Context items whose source ID is `JARVIS_ALL_ABOUT_ME_SOURCE_ID` are
  deduplicated by source ID and content hash, then injected exactly once in
  the same preference layer.
- Duplicate All About Me candidates are recorded in
  `diagnostics.omittedSourceRefs`; their text is not repeated.
- A second immutable security or identity layer throws
  `duplicate_immutable_layer`.
- Untrusted source text is fenced and labelled as data. It cannot emit a new
  authority-layer header.
- Budgeting and hash input are deterministic.
- `systemText` is produced from frozen layer copies.
- Diagnostics contain only layer IDs, character counts, truncation flags,
  source IDs, and hashes.

**No-global-read gate:**

`promptCompiler.ts` and its transitive production imports may not import:

```text
@/stores/*
@/lib/db/*
@/features/*
@/lib/ai/router
@/lib/ai/providers/*
```

Tests replace auth, agent, All About Me, and repository getters with functions
that throw. Compilation must still succeed from the supplied envelope.

`assembleJarvisPromptLayers()` becomes a compatibility wrapper over
`compileJarvisPrompt()` only for callers that already supply a complete
envelope. It cannot retain a second universal core or read user state.

- [ ] **Step 1: Write the focused failing tests**

Cover protected built-in acceptance; user-created slug collision and missing
built-in rejection; all seven layers in exact order; stable hashes across
detached equal inputs; model changes not altering immutable identity text;
secret sensitivity and secret-shaped ordinary text rejection; safe errors and
diagnostics; duplicate immutable-layer rejection; All About Me absent, once,
and duplicated; profile custom instructions exactly once; context unable to
add authority; no global getter called; and the compatibility wrapper using
the canonical compiler text.

In `promptCompiler.performance.test.ts`, build a representative detached
ordinary-chat input with 24 context items and 20 history messages. Warm the
path, then measure at least 200 iterations of:

```ts
await createJarvisRequestEnvelope(input);
compileJarvisPrompt(envelope);
```

Exclude context retrieval and provider I/O. Sort durations, assert p95 below
`25` milliseconds, and print only iteration count, sanitized character
counts, and p95.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.test.ts src/lib/jarvis/promptCompiler.performance.test.ts src/lib/jarvis/promptLayers.test.ts
```

Expected: FAIL because `promptCompiler.ts` does not exist.

- [ ] **Step 3: Implement the pure compiler and compatibility wrapper**

Implement the protected gate, compiler-owned secret admission, exact seven
layers, deterministic budgets/hashes, exactly-once profile and All About Me
context, frozen safe diagnostics, and wrapper. Do not add a store/repository/
router/provider/UI/browser read.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.test.ts src/lib/jarvis/promptCompiler.performance.test.ts src/lib/jarvis/promptLayers.test.ts
npm run typecheck
```

Expected: the focused correctness/performance suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/promptCompiler.ts' 'app/src/lib/jarvis/promptCompiler.test.ts' 'app/src/lib/jarvis/promptCompiler.performance.test.ts' 'app/src/lib/jarvis/promptLayers.ts' 'app/src/lib/jarvis/promptLayers.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/promptCompiler.ts' 'app/src/lib/jarvis/promptCompiler.test.ts' 'app/src/lib/jarvis/promptCompiler.performance.test.ts' 'app/src/lib/jarvis/promptLayers.ts' 'app/src/lib/jarvis/promptLayers.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): compile one protected prompt contract"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the five files above. The
installer and whitespace queries produce no output.

## Task 13: Exact Provider Prompt Transport for Every Adapter

**Files:**

- Create: `app/src/lib/ai/providerPromptTransport.ts`
- Create: `app/src/lib/ai/providerPromptTransport.test.ts`
- Create: `app/src/lib/ai/providerAttemptEvidence.ts`
- Create: `app/src/lib/ai/providerAttemptEvidence.test.ts`
- Modify: `app/src/lib/ai/types.ts`
- Modify: `app/src/lib/ai/router.ts`
- Modify: `app/src/lib/ai/router.test.ts`
- Modify: `app/src/lib/ai/router.connection.test.ts`
- Modify: `app/src/lib/ai/adapters/types.ts`
- Modify: `app/src/lib/ai/adapters/catalog.ts`
- Modify: `app/src/lib/ai/adapters/catalog.test.ts`
- Modify: `app/src/lib/ai/adapters/nativeCatalog.ts`
- Modify: `app/src/lib/ai/adapters/registry.test.ts`
- Modify: `app/src/lib/ai/adapters/cliBridge.ts`
- Modify: `app/src/lib/ai/adapters/cliParsers.test.ts`
- Modify: `app/src/lib/ai/adapters/claude.ts`
- Modify: `app/src/lib/ai/adapters/codex.ts`
- Modify: `app/src/lib/ai/adapters/copilot.ts`
- Modify: `app/src/lib/ai/adapters/gemini.ts`
- Modify: `app/src/lib/ai/adapters/opencode.ts`
- Modify: `app/src/lib/ai/adapters/qwen.ts`
- Modify: `app/src/lib/ai/providers/anthropic.ts`
- Modify: `app/src/lib/ai/providers/google.ts`
- Modify: `app/src/lib/ai/providers/groq.ts`
- Modify: `app/src/lib/ai/providers/mock.ts`
- Modify: `app/src/lib/ai/providers/mock.test.ts`
- Modify: `app/src/lib/ai/providers/ollama.ts`
- Modify: `app/src/lib/ai/providers/ollama.test.ts`
- Modify: `app/src/lib/ai/providers/openai.ts`
- Modify: `app/src/lib/ai/providers/openai-compatible.ts`
- Modify: `app/src/lib/ai/providers/openai-compatible.test.ts`
- Modify: `app/src/lib/db/repositories.connection.test.ts`

Do not stage `app/src/lib/ai/adapters`, `app/src/lib/ai/providers`, or another
directory pathspec.

**Interfaces:**

- Consumes Task 12's frozen `CompiledJarvisPrompt`.
- Consumes Task 18's exact account/run/request/attempt-bound
  `JarvisPreEffectTransportFailureEvidence` data contract.
- Extends every registered provider connection and CLI definition with one
  explicit strategy.
- Produces `buildProviderPromptTransport()`, one closed provider-attempt
  evidence authority/classifier, and protected-router inputs for Tasks 16A,
  16B, 19B, 21A, and 17.

**Exact provider-attempt evidence authority:**

`providerAttemptEvidence.ts` owns the only classifier that may issue or
revalidate same-run transport-retry evidence:

```ts
const providerAttemptTrackerBrand: unique symbol = Symbol('jarvis.provider-attempt-tracker');

type JarvisProviderAttemptTracker = Readonly<{
  [providerAttemptTrackerBrand]: true;
}>;

export type JarvisProviderAttemptFailureClassification =
  | {
      kind: 'pre_effect_transport_failure';
      evidence: JarvisPreEffectTransportFailureEvidence;
    }
  | {
      kind: 'response_started_transport_failure';
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
      responseStarted: true;
      chunkCount: number;
      actionDispatchCount: number;
      failureCategory: string;
      failedAt: number;
    }
  | {
      kind: 'action_dispatch_started_transport_failure';
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
      responseStarted: boolean;
      chunkCount: number;
      actionDispatchCount: number;
      failureCategory: string;
      failedAt: number;
    };

/** @internal Deep-module authority; omitted from every public barrel. */
export interface JarvisProviderAttemptEvidenceAuthority {
  begin(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    providerId: string;
    modelId: string;
  }): JarvisProviderAttemptTracker;
  noteResponseObservation(
    tracker: JarvisProviderAttemptTracker,
    input:
      | { kind: 'bytes'; byteLength: number; observedAt: number }
      | { kind: 'sdk_chunk'; observedAt: number },
  ): void;
  noteActionDispatch(tracker: JarvisProviderAttemptTracker, input: { observedAt: number }): void;
  verifyActiveEvidence(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    providerId: string;
    modelId: string;
  }): boolean;
  classifyFailure(
    tracker: JarvisProviderAttemptTracker,
    input: { failureCategory: string; failedAt: number },
  ): Promise<JarvisProviderAttemptFailureClassification>;
  revalidateFailure(input: {
    evidence: JarvisPreEffectTransportFailureEvidence;
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    providerId: string;
    modelId: string;
  }): Promise<JarvisPreEffectTransportFailureEvidence | null>;
  complete(tracker: JarvisProviderAttemptTracker): void;
  invalidateAll(): void;
}

export class JarvisProviderAttemptFailureError extends Error {
  readonly code = 'jarvis_provider_attempt_failure';
  readonly classification: JarvisProviderAttemptFailureClassification;

  constructor(classification: JarvisProviderAttemptFailureClassification) {
    super('The provider attempt ended before canonical completion.');
    this.name = 'JarvisProviderAttemptFailureError';
    this.classification = classification;
  }
}

/** @internal Deep import for the trusted router/kernel composition only. */
export function createJarvisProviderAttemptEvidenceAuthority(input: {
  sha256(canonical: string): Promise<string>;
}): JarvisProviderAttemptEvidenceAuthority;
```

The authority stores counters only behind the branded tracker. It issues
`JarvisPreEffectTransportFailureEvidence` only when the exact tracker still
has `responseStarted: false`, `chunkCount: 0`, and
`actionDispatchCount: 0`. The issued value repeats exact
account/run/request/attempt/provider/model binding, uses
`boundary: 'before_first_response_byte'`, and carries a content-addressed
`evidenceRef` equal to `sha256:` plus the lowercase SHA-256 of the
fixed-order schema-1 fields other than `evidenceRef`. `failureCategory` is a
non-empty safe category, never a raw error or response body.

The same fields are persisted inside Task 18's attempt proof.
`revalidateFailure()` needs no live tracker after restart: it verifies exact
expected binding, literal zero counters/boundary, finite numeric values, and
the canonical digest. It returns `null` for any mismatch. The content digest
provides durable integrity and exact binding; production issuance remains
closed by the branded tracker and deep-import boundary. No public barrel,
provider callback, action caller, boolean, or caller-constructed object can
mint an eligible failure.

`verifyActiveEvidence()` is the process-local start half of Task 16B's named
provider live-evidence verifier. `begin()` registers the branded tracker in a
private exact account/run/request/attempt/provider/model index;
`verifyActiveEvidence()` accepts only those scope fields, looks up the still-open
tracker privately, and returns true only for one exact active binding. No caller
receives or supplies the tracker. Ambiguous duplicate active keys fail closed.
It cannot validate terminal/restart evidence; that half must use Task 20B's
canonical provider-result authority plus its durable result event.

Every native provider marks the first received body byte or SDK delta
synchronously before parsing or forwarding it. Every CLI adapter marks the
first positive-length stdout chunk before its parser or consumer sees it.
`noteResponseObservation()` requires a positive integer byte length for a raw
byte observation or the exact `sdk_chunk` discriminant, sets
`responseStarted`, and increments `chunkCount`; an invalid observation fails
closed. Even an SDK chunk with no visible text is a response observation. An
action/tool dispatcher marks the tracker before dispatch and also uses Task
18's durable effect barrier. Failure classification happens once, then the
tracker is closed.

Any failure after even one response byte/chunk returns
`response_started_transport_failure`; any failure after an action-dispatch
observation returns `action_dispatch_started_transport_failure`. Neither
classification contains eligible evidence. Task 16B may preserve validated
accumulated output through Task 14 and terminalize the run as
`partial | failed | cancelled`, but Task 17 may offer only a manual logical
retry with a new run. A started or interrupted stream can never settle as
`retryable_failed` or authorize a same-run retry. A caller abort before the
first byte remains cancellation intent, not retry eligibility.

**Exact strategy vocabulary:**

```ts
export type JarvisPromptTransportStrategy = 'native-system' | 'prefixed-preamble' | 'unsupported';
```

Add this required field to catalog/registry connection descriptors:

```ts
export interface ProviderConnection {
  // existing fields remain
  promptTransport: JarvisPromptTransportStrategy;
}
```

Add the same required declaration to every external CLI definition:

```ts
export interface CliProviderDefinition {
  // existing fields remain
  promptTransport: 'prefixed-preamble' | 'unsupported';
}
```

The catalog rejects registration when an external connection and its adapter
definition disagree.

**Current connection matrix:**

Pin this table in `providerPromptTransport.test.ts`:

| Connection ID           | Strategy            |
| ----------------------- | ------------------- |
| `openai-codex`          | `prefixed-preamble` |
| `openai-api`            | `native-system`     |
| `anthropic-claude-code` | `prefixed-preamble` |
| `anthropic-api`         | `native-system`     |
| `google-gemini-cli`     | `prefixed-preamble` |
| `google-gemini-api`     | `native-system`     |
| `google-vertex`         | `native-system`     |
| `github-copilot-cli`    | `prefixed-preamble` |
| `xai-api`               | `native-system`     |
| `deepseek-api`          | `native-system`     |
| `zai-api`               | `native-system`     |
| `qwen-code`             | `prefixed-preamble` |
| `qwen-api`              | `native-system`     |
| `ollama-local`          | `native-system`     |
| `opencode-cli`          | `prefixed-preamble` |

Synthetic unknown/custom connections use `unsupported` until an explicit
strategy is registered.

**Exact construction contract:**

```ts
export type ProviderPromptTransport =
  | {
      strategy: 'native-system';
      systemPrompt: string;
      messages: readonly LLMMessage[];
      compiledHash: string;
    }
  | {
      strategy: 'prefixed-preamble';
      prompt: string;
      compiledHash: string;
    };

export class UnsupportedPromptTransportError extends Error {
  readonly code = 'unsupported_prompt_transport';
  readonly connectionId: string;

  constructor(connectionId: string) {
    super(`The selected connection cannot preserve the protected prompt contract.`);
    this.name = 'UnsupportedPromptTransportError';
    this.connectionId = connectionId;
  }
}

export function buildProviderPromptTransport(input: {
  compiled: Readonly<CompiledJarvisPrompt>;
  connection: Readonly<ProviderConnection>;
  messages: readonly LLMMessage[];
}): Readonly<ProviderPromptTransport>;
```

For `native-system`:

- `systemPrompt` equals `compiled.systemText` exactly;
- message roles/content stay semantically unchanged;
- providers use their real system/developer field;
- no system text is duplicated into a user message.

For `prefixed-preamble`, create one deterministic string:

```text
<VIBESPACE_SYSTEM_CONTRACT schema="1" sha256="<compiled.promptHash>">
<compiled.systemText>
</VIBESPACE_SYSTEM_CONTRACT>
<VIBESPACE_MESSAGES>
<deterministically serialized messages>
</VIBESPACE_MESSAGES>
```

- Preserve Unicode and line endings after compiler normalization.
- Pass the complete string as one prompt through stdin when the CLI supports
  stdin.
- Gemini, Copilot, and Qwen keep the complete prompt as one literal argv
  element where their CLI contract requires `-p`.
- Never concatenate a shell command.
- Never put secrets, API keys, auth state, or connection credentials in the
  preamble.

For `unsupported`, throw `UnsupportedPromptTransportError` before provider
detection, authentication probe, process spawn, network fetch, or usage
mutation.

**Router and cancellation rules:**

`runAgent()` accepts canonical compiled input only for protected JARVIS kernel
dispatch:

```ts
compiledPrompt?: Readonly<CompiledJarvisPrompt>;
requestId?: string;
protectedAttempt?: Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
}>;
```

- If `compiledPrompt` exists, `requestId` and `protectedAttempt` are required,
  their request IDs must match, and the selected connection's declared
  strategy is used.
- The protected router begins one Task 13 attempt tracker before provider
  dispatch. Native body bytes/SDK deltas and CLI stdout chunks update that
  tracker before any downstream callback. Unexpected transport failure is
  converted to `JarvisProviderAttemptFailureError` with the exact closed
  classification; raw errors never become evidence.
- Preserve the exact connection ID, provider ID, model ID, temperature, output
  token limit, working directory, and message history.
- Forward the exact caller `AbortSignal` to native fetch/provider code and the
  Tauri CLI bridge.
- Abort before send causes no provider/adapter call.
- Mid-stream abort remains an `AbortError`; it is never wrapped as a provider
  failure or retried as another logical execution.
- A connection advertising cancellation proves the signal reaches its
  provider/bridge. A connection without cancellation reports that truthfully
  in its capability snapshot.
- Non-JARVIS calls without `compiledPrompt` retain existing behavior.

- [ ] **Step 1: Write the table-driven failing construction tests**

For every row in `PROVIDER_CONNECTIONS`, assert exact strategy; connection,
provider, model, and mode preservation; compiled hash preservation; protected
contract transmission; user-message preservation; unsupported fail-closed
behavior; and advertised cancellation forwarding.

Also cover quotes, Unicode, multiline text, option-looking values, PowerShell
syntax, shell metacharacters, and prompt-injection-like text; no raw command
construction; exact stdin/argv behavior for all six external adapters; native
request construction for OpenAI, Anthropic, Google/Vertex, OpenAI-compatible,
Ollama, Groq, and mock; updated persisted connection fixtures; an abort racing
CLI registration; and no unsupported fallback to mutable
`Agent.system_prompt`.

Add table-driven evidence cases for every native and CLI transport: failure
before the first byte/chunk issues an exact-bound zero-counter durable
evidence value; one byte/chunk, multiple chunks, or any action-dispatch
observation denies it; digest or account/run/request/attempt/provider/model
tampering fails revalidation; started-stream interruption yields only the
non-retry classification; and abort never mints retry evidence.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/ai/providerPromptTransport.test.ts src/lib/ai/providerAttemptEvidence.test.ts src/lib/ai/router.test.ts src/lib/ai/router.connection.test.ts src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/registry.test.ts src/lib/ai/adapters/cliParsers.test.ts src/lib/ai/providers/mock.test.ts src/lib/ai/providers/ollama.test.ts src/lib/ai/providers/openai-compatible.test.ts src/lib/db/repositories.connection.test.ts
```

Expected: FAIL because the transport module is missing and current external
CLI construction drops `systemPrompt`.

- [ ] **Step 3: Implement every declared transport and cancellation path**

Add the required strategy to every connection/adapter, reject mismatches and
unsupported routes before side effects, construct exact native or preamble
requests, preserve selection/options/history, and propagate the same abort
signal without changing non-JARVIS calls. Add the private attempt tracker,
mark observations at each native/CLI byte boundary, issue/revalidate only
canonical zero-observation evidence, and return a non-retry classification
after a response or action observation.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/ai/providerPromptTransport.test.ts src/lib/ai/providerAttemptEvidence.test.ts src/lib/ai/router.test.ts src/lib/ai/router.connection.test.ts src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/registry.test.ts src/lib/ai/adapters/cliParsers.test.ts src/lib/ai/providers/mock.test.ts src/lib/ai/providers/ollama.test.ts src/lib/ai/providers/openai-compatible.test.ts src/lib/db/repositories.connection.test.ts
npm run typecheck
```

Expected: the full construction matrix and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/ai/providerPromptTransport.ts' 'app/src/lib/ai/providerPromptTransport.test.ts' 'app/src/lib/ai/providerAttemptEvidence.ts' 'app/src/lib/ai/providerAttemptEvidence.test.ts' 'app/src/lib/ai/types.ts' 'app/src/lib/ai/router.ts' 'app/src/lib/ai/router.test.ts' 'app/src/lib/ai/router.connection.test.ts' 'app/src/lib/ai/adapters/types.ts' 'app/src/lib/ai/adapters/catalog.ts' 'app/src/lib/ai/adapters/catalog.test.ts' 'app/src/lib/ai/adapters/nativeCatalog.ts' 'app/src/lib/ai/adapters/registry.test.ts' 'app/src/lib/ai/adapters/cliBridge.ts' 'app/src/lib/ai/adapters/cliParsers.test.ts' 'app/src/lib/ai/adapters/claude.ts' 'app/src/lib/ai/adapters/codex.ts' 'app/src/lib/ai/adapters/copilot.ts' 'app/src/lib/ai/adapters/gemini.ts' 'app/src/lib/ai/adapters/opencode.ts' 'app/src/lib/ai/adapters/qwen.ts' 'app/src/lib/ai/providers/anthropic.ts' 'app/src/lib/ai/providers/google.ts' 'app/src/lib/ai/providers/groq.ts' 'app/src/lib/ai/providers/mock.ts' 'app/src/lib/ai/providers/mock.test.ts' 'app/src/lib/ai/providers/ollama.ts' 'app/src/lib/ai/providers/ollama.test.ts' 'app/src/lib/ai/providers/openai.ts' 'app/src/lib/ai/providers/openai-compatible.ts' 'app/src/lib/ai/providers/openai-compatible.test.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/ai/providerPromptTransport.ts' 'app/src/lib/ai/providerPromptTransport.test.ts' 'app/src/lib/ai/providerAttemptEvidence.ts' 'app/src/lib/ai/providerAttemptEvidence.test.ts' 'app/src/lib/ai/types.ts' 'app/src/lib/ai/router.ts' 'app/src/lib/ai/router.test.ts' 'app/src/lib/ai/router.connection.test.ts' 'app/src/lib/ai/adapters/types.ts' 'app/src/lib/ai/adapters/catalog.ts' 'app/src/lib/ai/adapters/catalog.test.ts' 'app/src/lib/ai/adapters/nativeCatalog.ts' 'app/src/lib/ai/adapters/registry.test.ts' 'app/src/lib/ai/adapters/cliBridge.ts' 'app/src/lib/ai/adapters/cliParsers.test.ts' 'app/src/lib/ai/adapters/claude.ts' 'app/src/lib/ai/adapters/codex.ts' 'app/src/lib/ai/adapters/copilot.ts' 'app/src/lib/ai/adapters/gemini.ts' 'app/src/lib/ai/adapters/opencode.ts' 'app/src/lib/ai/adapters/qwen.ts' 'app/src/lib/ai/providers/anthropic.ts' 'app/src/lib/ai/providers/google.ts' 'app/src/lib/ai/providers/groq.ts' 'app/src/lib/ai/providers/mock.ts' 'app/src/lib/ai/providers/mock.test.ts' 'app/src/lib/ai/providers/ollama.ts' 'app/src/lib/ai/providers/ollama.test.ts' 'app/src/lib/ai/providers/openai.ts' 'app/src/lib/ai/providers/openai-compatible.ts' 'app/src/lib/ai/providers/openai-compatible.test.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(ai): preserve protected prompts across transports"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirty-two files above. The
installer and whitespace queries produce no output.

## Task 13P: Mount Account Persistence and Protected-Agent Resolution

**Files:**

- Modify: `app/src/App.tsx`
- Modify: `app/src/App.accountIdentity.test.tsx`
- Create: `app/src/App.jarvisPersistenceCoordinator.test.tsx`
- Modify: `app/src/lib/jarvis/persistenceCoordinator.ts`
- Modify: `app/src/lib/jarvis/persistenceCoordinator.test.ts`
- Modify: `app/src/lib/jarvis/identity.ts`
- Modify: `app/src/lib/jarvis/identity.test.ts`

**Contract:**

- `App.tsx` constructs exactly one Task 8 persistence coordinator after the
  database opens, subscribes it to canonical `AccountIdentity`, and disposes it
  on unmount. Sign-out or account switch revokes/stops the old generation,
  clears its ready state, waits for teardown, and only then activates the new
  account. Late completion from an old generation cannot publish readiness.
- Kernel recovery and every account-scoped JARVIS listener wait for the exact
  coordinator `{ accountId, generation, state: 'ready' }` receipt. A degraded
  coordinator keeps existing V2 UI usable but starts no kernel recovery/write
  path; retry is explicit and generation-bound.
- `identity.ts` adds `findProtectedJarvisAgent()` over the one
  `isProtectedJarvisAgent()` predicate. App default-agent selection uses that
  helper and contains no slug-only protected branch. A user agent with
  `{ slug: 'jarvis', builtin: false }` is never selected or granted protected
  boot/profile behavior.
- This slice owns the previously deferred App lock handoff. Task 16A consumes
  the mounted ready gate; Task 16B later converts the remaining explicitly
  listed UI/runtime call sites.

- [ ] Write RED App tests for initial ready gating, database/migration degraded
      state, retry, sign-out, A-to-B switch teardown-before-start, stale async
      completion, unmount, and the user-created slug collision.
- [ ] Implement the mount/generation barrier and helper without changing
      non-JARVIS boot behavior; run:

```powershell
npm --prefix app test -- src/App.jarvisPersistenceCoordinator.test.tsx src/App.accountIdentity.test.tsx src/lib/jarvis/persistenceCoordinator.test.ts src/lib/jarvis/identity.test.ts
npm run typecheck
```

- [ ] Stage exactly the seven files and commit:

```powershell
git add -- 'app/src/App.tsx' 'app/src/App.accountIdentity.test.tsx' 'app/src/App.jarvisPersistenceCoordinator.test.tsx' 'app/src/lib/jarvis/persistenceCoordinator.ts' 'app/src/lib/jarvis/persistenceCoordinator.test.ts' 'app/src/lib/jarvis/identity.ts' 'app/src/lib/jarvis/identity.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/App.tsx' 'app/src/App.accountIdentity.test.tsx' 'app/src/App.jarvisPersistenceCoordinator.test.tsx' 'app/src/lib/jarvis/persistenceCoordinator.ts' 'app/src/lib/jarvis/persistenceCoordinator.test.ts' 'app/src/lib/jarvis/identity.ts' 'app/src/lib/jarvis/identity.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): mount account persistence coordinator"
```

Expected staged and committed names: exactly the seven files above; installer
and whitespace queries produce no output.

## Task 16A: Shadow Compilation and the Three-State Runtime Gate

**Prerequisites:**

- Task 1B is independently accepted at
  `e2fdfa0a208186b2a6afe3709c25c4600e68100b` after formal `app/src/App.tsx`
  lock handoff; Task 16A is therefore unblocked by Task 1B after plan
  acceptance.
- Tasks 2-13, Task 18, and Task 13P are complete.
- Secret-source, entitlement, Browser Operator, private-sync, and unsafe
  prompt-transport interlocks are active.

**Files:**

- Create: `app/src/lib/jarvis/kernelMode.ts`
- Create: `app/src/lib/jarvis/kernelMode.test.ts`
- Create: `app/src/lib/jarvis/shadowCompilation.ts`
- Create: `app/src/lib/jarvis/shadowCompilation.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/ai/runtimeSafety.test.ts`

**Interfaces:**

- Consumes Task 18's persisted-run creation and Task 9's atomic
  `compareAndAppendTransitionEvent()` primitive.
- Consumes Task 11's immutable envelope builder, Task 12's pure compiler, and
  Task 13's prompt-transport support check.
- Produces the gate and observational shadow path that Task 16B later converts
  to canonical kernel dispatch.
- Does not own canonical assistant messages, response envelopes, approvals,
  artifacts, or the default switch to `kernel`.

**Exact gate:**

```ts
export type JarvisKernelMode = 'legacy' | 'shadow' | 'kernel';

export const DEFAULT_JARVIS_KERNEL_MODE: JarvisKernelMode = 'shadow';

export class JarvisKernelModeError extends Error {
  readonly code: 'invalid_kernel_mode' | 'kernel_mode_not_ready';

  constructor(code: 'invalid_kernel_mode' | 'kernel_mode_not_ready', message: string) {
    super(message);
    this.name = 'JarvisKernelModeError';
    this.code = code;
  }
}

export function resolveJarvisKernelMode(override?: JarvisKernelMode): JarvisKernelMode;
```

The mode override is an internal `RuntimeOptions.jarvisKernelMode` test and
rollback input. It is not accepted from a `jarvis:send` event, model output,
chat message, URL, or local prompt.

**Shadow contracts and safe diagnostics:**

```ts
export interface JarvisShadowLayerDiagnostic {
  id: string;
  authority: PromptAuthority;
  charCount: number;
  truncated: boolean;
  contentHash: string;
}

export interface JarvisShadowDiagnostic {
  mode: 'shadow';
  requestId: string;
  runId: string;
  promptHash?: string;
  layers: readonly JarvisShadowLayerDiagnostic[];
  errorCategory?: string;
  durationMs: number;
}

export interface JarvisShadowCompilationDeps {
  createPersistedRun(input: JarvisRunCreateInput): Promise<JarvisRun>;
  buildEnvelope(input: JarvisRequestInput): Promise<Readonly<JarvisRequestEnvelope>>;
  compilePrompt(envelope: Readonly<JarvisRequestEnvelope>): Readonly<CompiledJarvisPrompt>;
  recordDiagnostic(diagnostic: JarvisShadowDiagnostic): void;
  now(): number;
}

export interface JarvisShadowTurnInput {
  run: JarvisRunCreateInput;
  attempt: Extract<JarvisRequestAttempt, { kind: 'initial' }>;
  request: Omit<JarvisRequestInput, 'attempt'>;
}

export async function compileJarvisShadowTurn(
  input: JarvisShadowTurnInput,
  deps: JarvisShadowCompilationDeps,
): Promise<
  | {
      ok: true;
      envelope: Readonly<JarvisRequestEnvelope>;
      compiled: Readonly<CompiledJarvisPrompt>;
    }
  | {
      ok: false;
      requestId: string;
      runId: string;
      errorCategory: string;
    }
>;
```

Task 18 creates the run first. Shadow compilation never allocates an
unpersisted run ID.

Diagnostics may contain only request/run IDs; identity/profile revision IDs;
layer IDs; character counts; truncation flags; content/prompt hashes;
sanitized duration; and a safe error category. They may not contain prompt
text, user text, custom instructions, source excerpts, file paths, provider
credentials, approval parameters, or model reasoning.

**Mode behavior:**

`legacy`:

- run the current non-kernel request/response path;
- do not build a shadow envelope;
- still enforce Task 4 source admission, Task 5 entitlements, Task 6 Browser
  Operator quarantine, Task 9 private-sync guard, and Task 13 prompt-transport
  support.

`shadow`:

- only for protected built-in JARVIS, create the canonical run, build/validate
  the envelope, compile the prompt, and record safe diagnostics;
- dispatch the current legacy request and use the current legacy response;
- do not send the compiled prompt to the provider;
- do not write a canonical kernel assistant response or artifact;
- after successful shadow compilation, mirror the real legacy provider
  running/completed/failed/cancelled outcome through Task 18 and Task 9's
  `compareAndAppendTransitionEvent()` primitive so no nonterminal shadow run
  is orphaned;
- a compiler/shape defect transitions the shadow run to `failed`, records a
  safe category, and still lets the separate legacy dispatch continue;
- an independent safety-interlock denial fails closed and does not continue;
- cancellation signal delivery alone remains nonterminal until an owning
  executor verifies the terminal state.

`kernel` in Task 16A:

- resolve as a valid mode;
- fail with `kernel_mode_not_ready` before provider dispatch because Task 16B
  has not installed the canonical dispatcher.

Non-JARVIS agents skip shadow compilation and preserve their existing path in
all modes.

**Interlocks stay outside the gate:**

```ts
export interface JarvisRuntimeInterlockPort {
  assertCanonicalAccountIdentity(): void;
  assertSourcesAdmitted(): void;
  assertEntitlementAllowsRequestedCapability(): void;
  assertBrowserOperatorAvailableOrQuarantined(): void;
  assertPrivateSyncBoundary(): void;
  assertSelectedPromptTransportSupported(): void;
}

export interface RuntimeOptions {
  // existing options remain
  jarvisKernelMode?: JarvisKernelMode;
  jarvisInterlocks?: JarvisRuntimeInterlockPort;
  jarvisShadow?: JarvisShadowCompilationDeps;
}
```

Call every port method before the mode branch. Production boot supplies the
real interlock port; focused tests inject spies/failures. Rollback changes
dispatch ownership only and cannot disable or short-circuit these checks.

- [ ] **Step 1: Write the focused failing tests**

Cover the `shadow` default; explicit `legacy`, `shadow`, and `kernel`;
invalid-mode rejection; legacy dispatch once with no shadow build; shadow
compile once plus legacy dispatch once; allowlisted diagnostics only; shadow
failure recording a safe category while legacy still dispatches; every
interlock denial preventing dispatch in `legacy` and `shadow`; unsupported
transport and private-sync denial in every mode; `kernel_mode_not_ready` with
zero provider calls; non-JARVIS and user-created slug collisions skipping
shadow; canonical App identity; no `local-unassigned`; atomic shadow terminal
mirroring; and delivered-but-unverified cancellation remaining nonterminal.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/kernelMode.test.ts src/lib/jarvis/shadowCompilation.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts
```

Expected: FAIL because the gate and shadow modules do not exist.

- [ ] **Step 3: Implement observational shadow compilation**

Implement the exact gate, persisted-run-first shadow builder, safe diagnostic
allowlist, independent interlock port, legacy/shadow/kernel behavior, and
atomic terminal mirroring. Keep the default `shadow`; do not persist canonical
assistant output or dispatch a compiled prompt.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/kernelMode.test.ts src/lib/jarvis/shadowCompilation.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts
npm run typecheck
```

Expected: the gate/shadow/runtime safety suite and root typecheck pass, with
the production default still `shadow`.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/shadowCompilation.ts' 'app/src/lib/jarvis/shadowCompilation.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/shadowCompilation.ts' 'app/src/lib/jarvis/shadowCompilation.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): add safe shadow compilation"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the seven files above. The
installer and whitespace queries produce no output, and the default remains
`shadow`.

## Task 14: Conditional Prose Repair and Verified Response Truth

**Files:**

- Create: `app/src/lib/jarvis/response/tokenizer.ts`
- Create: `app/src/lib/jarvis/response/tokenizer.test.ts`
- Create: `app/src/lib/jarvis/response/modeClassifier.ts`
- Create: `app/src/lib/jarvis/response/modeClassifier.test.ts`
- Create: `app/src/lib/jarvis/response/linter.ts`
- Create: `app/src/lib/jarvis/response/linter.test.ts`
- Create: `app/src/lib/jarvis/response/repair.ts`
- Create: `app/src/lib/jarvis/response/repair.test.ts`
- Create: `app/src/lib/jarvis/response/templates.ts`
- Create: `app/src/lib/jarvis/response/templates.test.ts`
- Create: `app/src/lib/jarvis/response/pipeline.ts`
- Create: `app/src/lib/jarvis/response/pipeline.test.ts`
- Create: `app/src/lib/jarvis/response/pipeline.performance.test.ts`
- Create: `app/src/lib/jarvis/response/index.ts`
- Modify: `app/src/lib/jarvis/responsePolicy.ts`
- Modify: `app/src/lib/jarvis/responsePolicy.test.ts`
- Modify: `app/src/lib/jarvis/responseListener.ts`
- Modify: `app/src/lib/jarvis/responseListener.test.ts`

Do not stage `app/src/lib/jarvis/response` as a directory.

**Interfaces:**

- Consumes Task 3 request/response/execution contracts, Task 11's immutable
  envelope, Task 18's verified run state, and Task 2's protected predicate.
- Produces the canonical response processor used by Tasks 16B, 21A, and 17.
- Owns prose-only repair and deterministic truth narration; it never changes
  verified lifecycle state.

**Exact pipeline contracts:**

```ts
export type JarvisStructuredRegionKind =
  | 'code_fence'
  | 'action'
  | 'plan'
  | 'question'
  | 'permission'
  | 'table'
  | 'diff'
  | 'citation'
  | 'url'
  | 'quoted_text';

export interface JarvisStructuredRegion {
  index: number;
  kind: JarvisStructuredRegionKind;
  bytes: string;
  valid: boolean;
  errorCode?: 'unclosed_fence' | 'invalid_json' | 'invalid_shape';
}

export interface TokenizedJarvisResponse {
  proseWithPlaceholders: string;
  regions: readonly JarvisStructuredRegion[];
}

export type JarvisLintViolationDisposition = 'repairable' | 'deterministic' | 'quarantine';

export interface JarvisLintViolation {
  code: string;
  disposition: JarvisLintViolationDisposition;
  safeSummary: string;
}

export interface JarvisVerifiedFacts {
  executionState?: JarvisExecutionState;
  modelState: 'available' | 'connected' | 'authenticated' | 'degraded' | 'unavailable';
  plugins: readonly JarvisCapabilityRef[];
  mcps: readonly JarvisCapabilityRef[];
  terminalState?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
}

export interface RawProviderResponse {
  text: string;
  provider: JarvisModelSnapshot;
  verifiedFacts: JarvisVerifiedFacts;
  completedAt: number;
}

export interface JarvisRepairRequest {
  prose: string;
  immutablePlaceholders: readonly string[];
  mode: JarvisResponseMode;
  verifiedFacts: JarvisVerifiedFacts;
  violations: readonly JarvisLintViolation[];
}

export interface JarvisRepairPort {
  repair(request: Readonly<JarvisRepairRequest>): Promise<string>;
}

export async function processJarvisResponse(
  raw: Readonly<RawProviderResponse>,
  request: Readonly<JarvisRequestEnvelope>,
  repair: JarvisRepairPort,
): Promise<Readonly<JarvisResponseEnvelope>>;
```

**Exact processing order:**

1. tokenize immutable structured regions;
2. classify mode from the request plus verified facts;
3. sanitize secret requests, hidden-prompt leakage, and unsupported action
   macros in prose only;
4. lint prose only;
5. if and only if one or more `repairable` violations exist and no
   `quarantine` violation exists, make at most one repair call;
6. for `deterministic` violations or failed repair, apply local deterministic
   transformations/templates;
7. for `quarantine`, make zero repair calls and replace prose with the safe
   retry template;
8. restore every valid structured region byte-for-byte;
9. never turn an invalid structured region into an executable `Part`;
10. derive `displayText` and `spokenText` from the same mode and verified
    facts;
11. validate the final envelope.

When lint passes, `repair.repair` is called zero times. Style compliance cannot
add provider latency.

**Malformed structured-region behavior:**

- Preserve the exact malformed region in `JarvisStructuredRegion.bytes` for
  the in-memory diagnostic result.
- Do not parse, execute, or convert it to an action, plan, permission,
  question, tool, or terminal part.
- Return a safe text part stating that structured output could not be
  validated.
- Put only the safe code and region index in `enforcement.violations`.
- Do not put raw malformed bytes in logs, events, spoken text, approval copy,
  or repair input.

**Truth fixtures:**

| Verified fact                        | Required narration behavior                                    |
| ------------------------------------ | -------------------------------------------------------------- |
| run `awaiting_approval`              | mode `approval_required`; never says running/completed         |
| run `running`                        | mode `action_running`; never says completed                    |
| run `completed` and journal verified | mode `action_success`                                          |
| run `partial`                        | mode `action_partial`; names incomplete state                  |
| run `failed`                         | mode `action_failure`; never says completed                    |
| run `cancelled`                      | mode `status` or `warning`; states cancelled before completion |
| run `timed_out`                      | mode `warning` or `action_failure`; states timed out           |
| model `unavailable`                  | mode `warning`; no silent model switch                         |
| plugin/MCP `available`               | says available, not connected                                  |
| plugin/MCP `connected`               | says connected, not authenticated unless the snapshot says so  |
| plugin/MCP `authenticated`           | says authenticated                                             |
| terminal `queued`                    | says queued, not running                                       |
| terminal `running`                   | says running, not completed                                    |
| terminal `completed`                 | says completed only with executor/journal verification         |

Model prose cannot override these templates. Delivered-but-unverified
cancellation is not a `cancelled` truth fixture.

**Protected local-response listener:**

`responseListener.ts` may intercept a greeting only after resolving the exact
agent and calling `isProtectedJarvisAgent()`. Extend its binding:

```ts
resolveAgent(detail: LocalSendDetail): Agent | null | Promise<Agent | null>;
```

A user-created slug collision, unresolved agent, non-JARVIS chat, or
context-bearing turn is not intercepted. Task 16B later removes direct
canonical message writes from this listener.

- [ ] **Step 1: Write the focused failing tests**

Cover every required response mode, structured block round trips, prompt leak,
credential leak, “Sir” cadence, dry humor, generic fallback replacement,
submission vs completion, approval/running/success/failure/partial states,
citations, artifacts, model switch, frustrated-user tone, sensitive topics,
and deterministic idempotence.

Also cover zero repair calls when lint passes; exactly one repair call for one
or many repairable violations; no second call when repaired output still
fails; zero calls for deterministic-only or quarantine violations; repair
rejection fallback; malformed action/plan/question/permission blocks remaining
non-executable; cancellation, timeout, unavailable model, plugin/MCP states,
and terminal queued/running/completed truth; provider completion unable to
override journal state; display/spoken severity agreement; no prose rewrite of
code, URLs, citations, tables, diffs, terminal output, or artifacts; protected
greeting interception; and user-created collision rejection.

In `pipeline.performance.test.ts`, build a representative ordinary response
and a repair port that throws if called. Warm the path, measure at least 500
iterations of deterministic classification plus prose linting, sort
durations, assert p95 below `15` milliseconds, and record only iteration
count, sanitized length, violation count, and p95.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/response/tokenizer.test.ts src/lib/jarvis/response/modeClassifier.test.ts src/lib/jarvis/response/linter.test.ts src/lib/jarvis/response/repair.test.ts src/lib/jarvis/response/templates.test.ts src/lib/jarvis/response/pipeline.test.ts src/lib/jarvis/response/pipeline.performance.test.ts src/lib/jarvis/responsePolicy.test.ts src/lib/jarvis/responseListener.test.ts
```

Expected: FAIL because the response modules do not exist.

- [ ] **Step 3: Implement conditional repair and verified templates**

Implement the exact processing order, prose-only sanitizer/linter, conditional
single repair, deterministic/quarantine fallbacks, immutable structured
restoration, verified display/spoken derivation, response-policy wrappers, and
protected greeting resolution.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/response/tokenizer.test.ts src/lib/jarvis/response/modeClassifier.test.ts src/lib/jarvis/response/linter.test.ts src/lib/jarvis/response/repair.test.ts src/lib/jarvis/response/templates.test.ts src/lib/jarvis/response/pipeline.test.ts src/lib/jarvis/response/pipeline.performance.test.ts src/lib/jarvis/responsePolicy.test.ts src/lib/jarvis/responseListener.test.ts
npm run typecheck
```

Expected: the response correctness/performance suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/response/tokenizer.ts' 'app/src/lib/jarvis/response/tokenizer.test.ts' 'app/src/lib/jarvis/response/modeClassifier.ts' 'app/src/lib/jarvis/response/modeClassifier.test.ts' 'app/src/lib/jarvis/response/linter.ts' 'app/src/lib/jarvis/response/linter.test.ts' 'app/src/lib/jarvis/response/repair.ts' 'app/src/lib/jarvis/response/repair.test.ts' 'app/src/lib/jarvis/response/templates.ts' 'app/src/lib/jarvis/response/templates.test.ts' 'app/src/lib/jarvis/response/pipeline.ts' 'app/src/lib/jarvis/response/pipeline.test.ts' 'app/src/lib/jarvis/response/pipeline.performance.test.ts' 'app/src/lib/jarvis/response/index.ts' 'app/src/lib/jarvis/responsePolicy.ts' 'app/src/lib/jarvis/responsePolicy.test.ts' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/response/tokenizer.ts' 'app/src/lib/jarvis/response/tokenizer.test.ts' 'app/src/lib/jarvis/response/modeClassifier.ts' 'app/src/lib/jarvis/response/modeClassifier.test.ts' 'app/src/lib/jarvis/response/linter.ts' 'app/src/lib/jarvis/response/linter.test.ts' 'app/src/lib/jarvis/response/repair.ts' 'app/src/lib/jarvis/response/repair.test.ts' 'app/src/lib/jarvis/response/templates.ts' 'app/src/lib/jarvis/response/templates.test.ts' 'app/src/lib/jarvis/response/pipeline.ts' 'app/src/lib/jarvis/response/pipeline.test.ts' 'app/src/lib/jarvis/response/pipeline.performance.test.ts' 'app/src/lib/jarvis/response/index.ts' 'app/src/lib/jarvis/responsePolicy.ts' 'app/src/lib/jarvis/responsePolicy.test.ts' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): enforce verified response truth"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eighteen files above. The
installer and whitespace queries produce no output.

## Task 15: Preview and Speech Gate Preparation Only

**Files:**

- Create: `app/src/lib/jarvis/response/streamingPreviewGate.ts`
- Create: `app/src/lib/jarvis/response/streamingPreviewGate.test.ts`
- Create: `app/src/features/chat/streamingPreviewStore.ts`
- Create: `app/src/features/chat/streamingPreviewStore.test.ts`
- Create: `app/src/features/voice/speechGate.ts`
- Create: `app/src/features/voice/speechGate.test.ts`
- Modify: `app/src/features/voice/streamingVoice.ts`
- Modify: `app/src/features/voice/streamingVoice.test.ts`
- Modify: `app/src/features/voice/textCleanup.ts`
- Modify: `app/src/features/voice/textCleanup.test.ts`
- Modify: `app/src/features/voice/VoiceModal.tsx`
- Modify: `app/src/features/voice/VoiceModal.turn.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.stop.test.tsx`

**Interfaces:**

- Consumes Task 14's response mode, linter violation, execution-state, and
  final response contracts.
- Produces ephemeral preview and branded validated-speech inputs for Task 16B
  and Task 21A.
- Does not modify `app/src/lib/ai/runtime.ts` and does not claim the current
  raw runtime writes or accumulated-text TTS calls are removed.

Task 16B owns replacing raw assistant placeholders with ephemeral preview,
removing direct accumulated raw text from TTS, and persisting only a final
validated response or final validated cancellation/partial response.

**Exact preview contracts:**

```ts
export interface StreamingPreviewState {
  buffered: string;
  visible: string;
  insideFence: boolean;
}

export type StreamingPreviewDecision =
  | {
      allowed: true;
      state: Readonly<StreamingPreviewState>;
      visibleText: string;
    }
  | {
      allowed: false;
      state: Readonly<StreamingPreviewState>;
      reason:
        | 'incomplete_sentence'
        | 'inside_structured_fence'
        | 'secret_signal'
        | 'prompt_leak_signal'
        | 'invalid_structure';
    };

export function createStreamingPreviewState(): Readonly<StreamingPreviewState>;

export function pushStreamingPreviewChunk(
  state: Readonly<StreamingPreviewState>,
  delta: string,
): StreamingPreviewDecision;

export interface JarvisStreamingPreview {
  accountId: string;
  runId: string;
  requestId: string;
  chatId: string;
  text: string;
  updatedAt: number;
}
```

`streamingPreviewStore` exposes only:

```ts
setPreview(preview: JarvisStreamingPreview): void;
getPreview(accountId: string, runId: string): JarvisStreamingPreview | null;
clearPreview(accountId: string, runId: string): void;
clearAccountPreviews(accountId: string): void;
```

It has no Dexie, message-repository, journal-mutation, local-storage, or sync
import. Preview state is replaceable and process-local.

**Exact speech-gate contract:**

```ts
const validatedSpeechChunkBrand: unique symbol = Symbol('jarvis.validated-speech-chunk');

export type ValidatedSpeechChunk = string & {
  readonly [validatedSpeechChunkBrand]: true;
};

export interface SpeechGateInput {
  text: string;
  completeSentence: boolean;
  insideFence: boolean;
  mode: JarvisResponseMode;
  executionState?: JarvisExecutionState;
  lintViolations: readonly JarvisLintViolation[];
}

export type SpeechGateDecision =
  | { allowed: true; chunk: ValidatedSpeechChunk }
  | {
      allowed: false;
      reason:
        | 'incomplete_sentence'
        | 'inside_fence'
        | 'secret_signal'
        | 'prompt_leak_signal'
        | 'mode_mismatch'
        | 'execution_state_mismatch'
        | 'lint_failure';
    };

export function validateSpeechChunk(input: Readonly<SpeechGateInput>): SpeechGateDecision;
```

A spoken streaming chunk must pass all six independent checks:

1. complete sentence;
2. outside code/structured fences;
3. no secret or hidden-prompt signal;
4. response-mode compatibility;
5. verified execution-state compatibility;
6. deterministic linter acceptance.

`streamingVoice.ts` adds:

```ts
enqueueValidatedChunk(chunk: ValidatedSpeechChunk): void;
completeValidated(
  response: Readonly<
    Pick<JarvisResponseEnvelope, 'spokenText' | 'mode' | 'executionState'>
  >,
): Promise<void>;
```

The legacy raw `onDelta(string)` compatibility entry may remain only until
Task 16B removes its final caller. Label it as a temporary legacy boundary and
do not use it from new Task 15 code or tests.

**Stop and playback rules:**

- Stop/cancel clears queued sentence buffers.
- Stop/cancel aborts current synthesis and playback.
- Late synthesis completion cannot restart playback.
- Mic state after stop follows existing hands-free/push-to-talk behavior.
- `VoiceModal.stop.test.tsx` is mandatory in RED and GREEN commands.
- Code, JSON, URLs, citations, raw paths, action macros, and hidden metadata
  are not spoken unless a deterministic accessibility template supplies the
  text.

- [ ] **Step 1: Write the focused failing tests**

Cover chunk boundaries inside secrets and prompt-leak phrases; Markdown,
action, plan, question, and permission fence boundaries; Unicode sentence
boundaries; incomplete sentences withheld; preview store never calling
message/Dexie/local-storage APIs; preview replace/clear by run; every
speech-gate rejection reason; validated brand creation only by the gate; final
spoken severity for warning/failure/cancellation; queued synthesis/playback
stop; late completion not resuming audio; and existing VoiceModal stop/mic
state.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/response/streamingPreviewGate.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/voice/textCleanup.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx
```

Expected: FAIL because the preview and speech-gate modules do not exist.

- [ ] **Step 3: Implement the preview/speech libraries and stop contract**

Implement the exact pure preview gate/store, six-check speech gate, branded
streaming-voice entry points, cleanup behavior, and VoiceModal stop
regressions. Do not edit runtime or claim canonical cutover.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/response/streamingPreviewGate.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/voice/textCleanup.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx
npm run typecheck
```

Expected: the focused preview/voice suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/response/streamingPreviewGate.ts' 'app/src/lib/jarvis/response/streamingPreviewGate.test.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/voice/textCleanup.ts' 'app/src/features/voice/textCleanup.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/response/streamingPreviewGate.ts' 'app/src/lib/jarvis/response/streamingPreviewGate.test.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/voice/textCleanup.ts' 'app/src/features/voice/textCleanup.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(voice): prepare validated preview and speech gates"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirteen files above. The
installer and whitespace queries produce no output.

## Task 16W: One Trusted Kernel Host Across Webviews

This slice closes the multi-webview ownership gap before Task 19 constructs a
security runtime. The Tauri window whose native label is exactly `main` is the
sole kernel/security host for one native host epoch. Detached Workbench,
secondary/tool windows, and Pixel Pet are typed clients and can never construct
credential, approval, cancellation, live-evidence, or kernel authorities.

**Exact files:**

- Create: `app/src/lib/jarvis/kernelBridgeProtocol.ts`
- Create: `app/src/lib/jarvis/kernelBridgeProtocol.test.ts`
- Create: `app/src/lib/jarvis/kernelHost.ts`
- Create: `app/src/lib/jarvis/kernelHost.test.ts`
- Create: `app/src/lib/jarvis/kernelClient.ts`
- Create: `app/src/lib/jarvis/kernelClient.test.ts`
- Modify: `app/src/features/workbench/window.ts`
- Modify: `app/src/features/workbench/window.test.ts`
- Modify: `app/src/App.tsx`
- Create: `app/src/App.kernelHost.test.tsx`
- Create: `app/src-tauri/src/kernel_host.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Native broker contract:**

- `register_kernel_host` derives the caller label from Tauri's injected
  `WebviewWindow`, accepts only exact label `main`, allocates a monotonically
  changing host epoch and cryptographically random owner token, stores both in
  native managed state, and returns the token only to that window. A second or
  stale registration is rejected until native teardown/re-election.
- `kernel_client_request` derives the requester label natively, accepts only a
  closed versioned request union, allocates the request ID, stores the exact
  requester/epoch/deadline, and emits it only to the registered main window.
  V1 requests are typed turn dispatch, approval create/decide/execute,
  cancellation, scheduled retry, and read-only Command Center snapshot calls.
  Approval/action requests carry only the same canonical non-secret client DTOs
  accepted by the primary UI and still pass the host's durable approval,
  capability, entitlement, and account checks. No client request can resolve a
  secret, mutate credentials, select an arbitrary target label, carry raw
  journal/evidence structures, or invoke a generic method.
- `kernel_host_respond` accepts only the current main label plus exact owner
  token/epoch/request ID, consumes one pending request, validates the response
  union against the request kind, and emits only to the recorded requester.
  Stale, duplicate, cross-kind, timed-out, or arbitrary-target responses fail
  closed.
- `release_kernel_host` validates the same owner identity, increments the
  epoch, rejects/clears pending requests with a safe unavailable response, and
  removes the owner. Native shutdown performs the same cleanup.
- Registration installs a native window-destroy observer that captures the
  exact native label plus window identity, native process/creation identity,
  allocated token, and epoch. Abrupt main
  destruction atomically increments the epoch, conditionally clears only that
  captured owner, rejects every pending request for that epoch, and invalidates
  the associated runtime authority. A stale destroy callback whose token/epoch
  no longer matches cannot clear a newer host. Only a newly created window with
  exact native label `main` may re-register after cleanup; an auxiliary window
  never elects itself. Browser-host teardown releases the exact Web Lock, and
  every native/browser listener is removed once.
- The owner token stays in the primary host's closure and never enters React,
  Zustand, persistence, events, logs, or a client payload. Rust error strings
  contain only safe categories.

**Frontend contract:**

- `kernelHost.ts` is the only module that can register a host and install the
  native responder. It constructs one host runtime through a supplied closure
  only after registration succeeds and releases runtime authority before the
  native epoch on account/process teardown.
- `kernelClient.ts` exposes the closed turn/approval/cancel/retry/read client with timeout,
  request/response correlation, listener cleanup, and host-unavailable truth.
  It has no authority handle, credential mutator/resolver, writer, verifier,
  binder, raw event, receipt/lease, or generic RPC method.
- `App.tsx` chooses host vs client from the native attestation, not a query
  parameter or caller boolean. `/?workbench=1` and every non-main label are
  clients. Pixel Pet remains outside both. Browser-only development requires a
  non-stealable exclusive Web Lock for the explicit primary host; if the lock
  API is absent or another tab owns it, kernel authority is unavailable.
  Auxiliary browser clients cannot perform consequential operations, and web
  preview is never evidence of native ownership.
- Credential management UI remains primary-host-only. A secondary window may
  display a safe unavailable/"Open in main window" state but cannot enqueue a
  mutation.

- [ ] Write RED Rust and TypeScript tests for two simultaneous webviews, exact
      label enforcement, one epoch/token, secondary-construction rejection,
      client cancellation/read routing, active evidence visibility, account
      teardown ordering, serialized credential mutation, arbitrary target and
      generic method rejection, stale owner response, request timeout, owner
      abrupt crash and pending-request failure, captured stale-destroy callback
      isolation, newly created exact-main re-election, auxiliary non-election,
      browser Web Lock release, listener cleanup, pet exclusion, and
      browser-preview fail-closed behavior.
- [ ] Implement the native broker and typed host/client boundaries with no
      product kernel implementation yet. Run focused Vitest plus
      `cargo test --manifest-path app/src-tauri/Cargo.toml kernel_host` and root
      typecheck.
- [ ] Run an isolated two-window native smoke proving one host construction and
      client-routed cancellation/read state. If Windows Smart App Control blocks
      the generated Rust test executable, record the exact OS error while still
      running every JS/protocol test; do not weaken the native gate.
- [ ] Stage exactly the twelve paths above, inspect the cached diff/check, and
      commit `feat(jarvis): enforce one trusted kernel host`.

## Task 19 — Versioned approvals and canonical consequential execution

Task 19 lands as four locked TDD slices. The task is incomplete until all four
slices pass together. No slice may execute from `approvalBridge`,
`autoApprove`, browser UI state, a message-part status, or a legacy task-store
boolean.

### Task 19A — Durable approval v1 and the single-use engine

**Account-scoped plugin runtime and literal action-catalog correction
(normative):**

Task 19A closes the existing plugin bypass before any approval engine consumes
plugin credentials. The current device-global connection map, raw credential
exports, generic `plugin.call`/`plugin.invoke` registrations, and model-chosen
`pluginId`/`toolName` pair are not authorization. This slice removes both
generic invocation IDs from every model-facing registry, prompt/context block,
intent route, and public plugin barrel. Direct human plugin setup remains, but
there is no model-executable plugin action in the v1 default catalog. A future
plugin action is eligible only through one reviewed literal catalog
registration whose executor fixes plugin ID, tool name, credential locators,
target derivation, risk, capability, and version; none of those values may
come from model parameters.

Make plugin connection state account-scoped at its type and persistence
boundary:

```ts
export type PluginConnection = {
  accountId: string;
  pluginId: string;
  // ...the existing connection fields remain exact...
};

export type PluginConnectionsByAccount = Readonly<
  Record<string, Readonly<Record<string, PluginConnection>>>
>;

export interface PluginStore {
  connectionsByAccount: PluginConnectionsByAccount;
  upsertConnection(connection: PluginConnection): void;
  removeConnection(accountId: string, pluginId: string): void;
  setEnabled(accountId: string, pluginId: string, enabled: boolean): void;
}

export function selectPluginConnectionsForAccount(
  state: Pick<PluginStore, 'connectionsByAccount'>,
  accountId: string,
): Readonly<Record<string, PluginConnection>>;

export function pluginConnectionSyncRowId(accountId: string, pluginId: string): string;
```

The persisted Zustand key becomes `jarvis-plugin-connections-v2`. Migration
accepts only already-accounted V2 rows; legacy `connections[pluginId]` entries
are left unclaimed and render disconnected until the active user explicitly
reconnects. They are never assigned to whichever account boots first.
`pluginConnectionSyncRowId()` is the exact reversible
`v2:<encodeURIComponent(accountId)>:<encodeURIComponent(pluginId)>` form.
Every queued payload repeats both IDs. Pull requires the cloud record's user,
decoded row ID, payload account ID, canonical active account, and
`PluginConnection.accountId` all to match before updating that account's
nested map; legacy or cross-account records are ignored and never delete or
overwrite another account's entry.

`listActivePlugins()`, `isPluginActive()`, `getPluginContextBlock()`,
`getPluginStatusContextBlock()`, `getPluginRuntimeContract()`, the Plugins UI,
and Composer plugin picker all require the canonical `accountId` and read only
`selectPluginConnectionsForAccount()`. A missing identity returns no plugins
and performs no mutation. Context text labels connected plugins as
descriptors only and never advertises `plugin.call`, `plugin.invoke`, or a
model-selected tool. Fixed future plugin registrations are advertised only by
the canonical action catalog.

The runtime exposes one closed human-management capability and keeps its
registered-tool executor private:

```ts
export interface PluginManagementCapability {
  saveCredential(input: {
    accountId: string;
    pluginId: string;
    fieldId: string;
    value: string;
  }): Promise<void>;
  testConnection(input: { accountId: string; pluginId: string }): Promise<PluginTestResult>;
  disconnect(input: { accountId: string; pluginId: string }): Promise<void>;
}

/** @internal Closed inside jarvisSecurityRuntime.ts; absent from public barrels. */
export interface RegisteredPluginToolExecutor {
  execute(input: {
    accountId: string;
    registration: Extract<JarvisRegisteredActionExecutor, { kind: 'plugin_tool' }>;
    params: Readonly<Record<string, unknown>>;
    context: RegisteredActionExecutionContext;
  }): Promise<ActionResult>;
}

export function createAccountScopedPluginRuntime(input: {
  activeAccountId(): string | undefined;
  grants: PluginCredentialAccountGrantRepository;
  credentialAuthorization: JarvisExistingCredentialAuthorizationAuthority;
  credentialAdapter: ExistingPluginCredentialAdapter;
  connections: Pick<PluginStore, 'upsertConnection' | 'removeConnection'>;
  randomUUID: () => string;
  now: () => number;
}): Readonly<{
  management: PluginManagementCapability;
  /** @internal */ registeredTools: RegisteredPluginToolExecutor;
}>;
```

Every management or fixed-tool call first requires a nonblank input account
equal to the canonical active account. `saveCredential()` is the only
human-authorized grant-minting path and therefore does **not** require a
pre-existing grant: it first resolves and validates the exact manifest-owned
plugin/field locator, rejects an unknown/undeclared field, and enters the same
repository's stable lock set for that one locator. Inside the lock it rechecks
the active account, reads the exact current grant, conditionally removes only
that observed grant, writes the device-global credential, rechecks the active
account, and then uses the injected `randomUUID()`/`now()` to insert one fresh
`explicit_account_save` grant. A first save, deliberate same-account re-entry,
or deliberate account-B overwrite of account A is allowed only through this
explicit path; failure or an account switch after the keychain write leaves
the value unbound and mints no grant.

`testConnection()` and every fixed registered-tool call resolve only their
manifest/catalog-owned credential locators, call `authorize()`, require the
exact account/locator/grant/revision proof, and revalidate that proof inside
the held locator lock immediately before and after each device-global
credential read. Connection testing cannot use a credential merely because a
manifest field is configured.
The private registered-tool executor additionally requires the immutable
catalog registration object by identity, rejects `pluginId` or `toolName` in
model parameters, and performs no lookup by caller strings. The default v1
catalog supplies zero plugin-tool registrations.

`disconnect()` first resolves and authorizes every configured locator for that
exact account, then acquires their deduplicated stable lock set in canonical
order. While all locks remain held it rechecks the active account and
revalidates every exact account/grant/revision proof before any mutation. Only
then may it conditionally remove each exact grant, delete the matching
device-global keychain entry, and finally remove only
`(accountId, pluginId)` connection state. A foreign, legacy-unbound, stale,
partially authorized, concurrently replaced, or account-switched credential
makes the locked preflight fail before any delete. No save can interleave
between that revalidation and deletion. A manifest with zero credential
locators performs the active-account recheck and exact connection removal
without calling the lock helper, grant repository, or keychain adapter. The
closed capability is provided through App's trusted composition;
`Plugins.tsx` never imports raw keychain helpers or grant mutation authority.
`testPluginConnection()`, `callPluginTool()`, and the old dependency-defaulting
`disconnectPlugin(manifest, deps = {})` cease to be public APIs. Static tests
reject their export and reject any generic plugin invocation registration.

**Secret-handle authority correction (normative):**

The existing source contract is
`getPluginCredential(pluginId, fieldId)`. Its private TypeScript
`credentialKey()` normalizes `` `${pluginId}-${fieldId}` `` and prefixes
`plugin-`; Rust then stores that provider key under service
`ai.jarvis.desktop` and account `llm-api-key:<normalized-provider>`. The
result is device-global and is not currently account-namespaced. Preserve that
storage contract in this slice and put the account boundary in the
authorization/handle layer. Do not export the private derived key or silently
rename, copy, delete, or reinterpret existing keyring entries.

`features/plugins/credentials.ts` keeps the device-global keychain adapter,
but every production write passes through an account-aware wrapper. The
durable authorization record is separate and contains no credential value,
hash, fingerprint, prefix, length, keyring account, or derived key:

```ts
export interface ExistingPluginCredentialAdapter {
  readExistingCredential(locator: ExistingPluginCredentialLocator): Promise<string | undefined>;
  writeExistingCredential(locator: ExistingPluginCredentialLocator, value: string): Promise<void>;
  deleteExistingCredential(locator: ExistingPluginCredentialLocator): Promise<void>;
}

/** @internal Imported only by jarvisSecurityRuntime.ts and focused tests. */
export function createExistingPluginCredentialAdapter(input?: {
  readRaw?: (pluginId: string, fieldId: string) => Promise<string | undefined>;
  writeRaw?: (pluginId: string, fieldId: string, value: string) => Promise<void>;
  deleteRaw?: (pluginId: string, fieldId: string) => Promise<void>;
}): ExistingPluginCredentialAdapter;
```

The Tauri/keyring implementations corresponding to `readRaw`, `writeRaw`, and
`deleteRaw` are module-private functions. They are neither named exports nor
barrel exports. Production code can obtain only the internal adapter through
the trusted security composition and the public closed
`PluginManagementCapability`; tests may inject fakes into the factory.

`credentialAuthorization.ts` owns the exact local-only grant repository and
the production authorization authority. `credentials.ts` imports and
type-re-exports the locator to preserve its adapter surface without a runtime
cycle:

```ts
export type ExistingPluginCredentialLocator = Readonly<{
  pluginId: string;
  fieldId: string;
}>;

export const PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY = 'jarvis.pluginCredentialAccountGrants.v1';

export type PluginCredentialAccountGrantV1 = Readonly<{
  schemaVersion: 1;
  accountId: string;
  pluginId: string;
  fieldId: string;
  grantId: string;
  revision: number;
  grantedAt: number;
  source: 'explicit_account_save';
}>;

export type PluginCredentialGrantIdentityV1 = Readonly<
  Pick<
    PluginCredentialAccountGrantV1,
    'accountId' | 'pluginId' | 'fieldId' | 'grantId' | 'revision'
  >
>;

export type PluginCredentialGrantExpectedStateV1 =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'present'; grant: PluginCredentialGrantIdentityV1 }>;

const pluginCredentialLocatorLockSetBrand: unique symbol = Symbol(
  'jarvis.plugin-credential-locator-lock-set',
);

/** @internal Constructed only by withPluginCredentialLocatorLocks(). */
export type PluginCredentialLocatorLockSet = Readonly<{
  locators: readonly ExistingPluginCredentialLocator[];
  [pluginCredentialLocatorLockSetBrand]: true;
}>;

export interface PluginCredentialAccountGrantRepository {
  get(
    locator: ExistingPluginCredentialLocator,
  ): Promise<PluginCredentialAccountGrantV1 | undefined>;
  getLocked(input: {
    locks: PluginCredentialLocatorLockSet;
    locator: ExistingPluginCredentialLocator;
  }): Promise<PluginCredentialAccountGrantV1 | undefined>;
  replaceExact(input: {
    locks: PluginCredentialLocatorLockSet;
    expected: PluginCredentialGrantExpectedStateV1;
    grant: PluginCredentialAccountGrantV1;
  }): Promise<void>;
  removeExact(input: {
    locks: PluginCredentialLocatorLockSet;
    locator: ExistingPluginCredentialLocator;
    expected: PluginCredentialGrantIdentityV1;
  }): Promise<void>;
}

export interface StrictPluginCredentialGrantStorage {
  readRaw(): string | null;
  compareAndSetRaw(input: { expectedRaw: string | null; nextRaw: string | null }): void;
}

export class PluginCredentialGrantStorageError extends Error {
  readonly code: 'credential_grant_storage_conflict' | 'credential_grant_storage_failed';
}

export function createStrictPluginCredentialGrantStorage(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): StrictPluginCredentialGrantStorage;

const jarvisExistingCredentialAuthorizationBrand: unique symbol = Symbol(
  'jarvis.existing-credential-authorization',
);

export type JarvisExistingCredentialAuthorization = Readonly<{
  accountId: string;
  locator: ExistingPluginCredentialLocator;
  grantId: string;
  revision: number;
  [jarvisExistingCredentialAuthorizationBrand]: true;
}>;

export type JarvisExistingCredentialAuthorizationDecision =
  | { authorized: true; authorization: JarvisExistingCredentialAuthorization }
  | {
      authorized: false;
      reason:
        | 'credential_account_unbound'
        | 'credential_account_mismatch'
        | 'credential_grant_stale'
        | 'credential_grant_unavailable'
        | 'credential_grant_storage_failed';
    };

export interface JarvisExistingCredentialAuthorizationAuthority {
  authorize(input: {
    accountId: string;
    locator: ExistingPluginCredentialLocator;
  }): Promise<JarvisExistingCredentialAuthorizationDecision>;
  revalidate(
    authorization: JarvisExistingCredentialAuthorization,
  ): Promise<JarvisExistingCredentialAuthorizationDecision>;
  /** @internal The lock set must contain the authorization's exact locator. */
  revalidateLocked(input: {
    authorization: JarvisExistingCredentialAuthorization;
    locks: PluginCredentialLocatorLockSet;
  }): Promise<JarvisExistingCredentialAuthorizationDecision>;
}

export function createPluginCredentialAccountGrantRepository(input: {
  storage: StrictPluginCredentialGrantStorage;
}): PluginCredentialAccountGrantRepository;

export function createJarvisExistingCredentialAuthorization(input: {
  grants: PluginCredentialAccountGrantRepository;
  getActiveAccountId(): string | undefined;
}): JarvisExistingCredentialAuthorizationAuthority;

/** @internal Used only by trusted plugin/security runtime code and focused tests. */
export function withPluginCredentialLocatorLocks<T>(
  locators: readonly ExistingPluginCredentialLocator[],
  body: (locks: PluginCredentialLocatorLockSet) => Promise<T>,
): Promise<T>;
```

`withPluginCredentialLocatorLocks()` rejects an empty set, canonicalizes each
locator as `` `${pluginId}\u0000${fieldId}` ``, rejects duplicates, acquires the
module-owned queues in ascending canonical order, and releases them in reverse
order. The branded lock set is valid only for the awaited callback and every
locked repository operation rejects a locator not present in it. Public
`get()` acquires the same one-locator queue internally; trusted multi-locator
code uses `getLocked()` to avoid nested/re-entrant acquisition.

`replaceExact()` and `removeExact()` compare the complete expected state,
including exact account, plugin, field, grant ID, and revision when present,
against the map read under the supplied lock set before invoking the strict raw
storage CAS. `removeExact()` can never remove an absent, foreign, or newer
grant. `revalidateLocked()` uses `getLocked()` plus the same authorization
decision function as `authorize()`/`revalidate()`; it does not acquire a
second lock or accept a caller-supplied grant object as truth.

`actions/catalog.ts` adds the immutable security catalog; the existing
human-facing action documentation projection is not authorization:

```ts
export type JarvisCanonicalActionTarget =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'app_resource'; namespace: string; resourceId: string }>
  | Readonly<{ kind: 'external_resource'; service: string; resourceId: string }>
  | Readonly<{
      kind: 'plugin_tool';
      accountId: string;
      pluginId: string;
      toolName: string;
      resourceId: string;
    }>;

export type JarvisActionCredentialBinding = Readonly<{
  field: string;
  locator: ExistingPluginCredentialLocator;
}>;

export type JarvisRegisteredActionExecutor =
  | Readonly<{ kind: 'builtin'; registryActionId: string }>
  | Readonly<{ kind: 'plugin_tool'; pluginId: string; toolName: string }>;

export interface JarvisRegisteredActionDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<JsonSchema>;
  readonly outputSchema: Readonly<JsonSchema>;
  readonly requiredCapabilities: readonly [string];
  readonly requiredEntitlements: readonly string[];
  readonly risk: JarvisActionRisk;
  readonly approval: JarvisActionApproval;
  readonly expectedEffect: string;
  readonly exposeToAI: boolean;
  readonly executor: JarvisRegisteredActionExecutor;
  readonly credentialBindings: readonly JarvisActionCredentialBinding[];
  validateParameters(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  deriveTarget(input: {
    accountId: string;
    params: Readonly<Record<string, unknown>>;
  }): JarvisCanonicalActionTarget;
}

export interface JarvisActionCatalog {
  resolve(actionId: string): Readonly<JarvisRegisteredActionDefinition> | undefined;
  listExposed(): readonly Readonly<JarvisRegisteredActionDefinition>[];
}

export function createJarvisActionCatalog(
  registrations: readonly JarvisRegisteredActionDefinition[],
): JarvisActionCatalog;
```

The factory clones and deep-freezes schemas, arrays, executor locators, and
credential locators; rejects duplicate action IDs outright even when their
versions differ, mutable/unknown fields, empty IDs/effects/targets, anything
other than exactly one primary capability, duplicate credential
fields/locators, credential-shaped model fields, and a target that does not
match its executor. A `plugin_tool`
registration must contain literal nonblank `pluginId` and `toolName`, derive a
matching `plugin_tool` target, and may not expose `pluginId`, `toolName`, a
credential locator, or a credential field in `inputSchema`. The factory also
rejects the IDs `plugin.call` and `plugin.invoke` outright.

Exactly one active registration may exist for an action ID in v1, so
`resolve(actionId)` is unambiguous. Approval creation and consumption both
require the requested/stored `actionVersion` to equal that one resolved
registration's version; a prior, future, or otherwise different version is
unavailable and requires a fresh registration and approval rather than an
arbitrary first/last-version choice.

`DEFAULT_JARVIS_ACTION_REGISTRATIONS` is a reviewed literal tuple in
`catalog.ts`; it is never generated by mapping `getAllActions()`, regex risk
inference, runtime Custom Tools, plugin manifests, MCP discovery, or model
input. Every built-in included for v1 names its fixed registry executor,
target derivation, capability, entitlement, risk, effect, and version. The
default tuple contains no `plugin_tool` executor. The legacy
`buildJarvisActionCatalog(ActionDef[])` function remains temporarily for
prompt/documentation compatibility but returns only the non-authoritative
`JarvisActionDefinition[]` projection; no approval/execution path may consume
it. Catalog tests assert literal registration parity, deep
immutability, default zero plugin registrations, generic-ID rejection, and
that an unregistered action remains unavailable even when it exists in the
legacy registry.

The repository stores one validated JSON map under the exact grant key above,
but it must **not** use `safeLocalStorage`: that adapter intentionally catches
and swallows final `setItem()` and `removeItem()` failures, so its return is not
durability evidence. App constructs
`createStrictPluginCredentialGrantStorage(window.localStorage)` directly.
`compareAndSetRaw()` reads the exact current raw string, rejects when it differs
from `expectedRaw`, performs the raw `setItem` or `removeItem`, then immediately
reads the key again and requires byte-for-byte equality with `nextRaw` (or
exact absence). A thrown storage operation, swallowed/no-op adapter behavior,
post-write mismatch, or post-remove residue throws the typed storage error;
the repository reports no successful grant mutation or authorization.

This is not a new Dexie table: Task 7's six-store schema and indexes remain
unchanged, Task 9 has no mapper/repository for this metadata, and neither the
plugin Zustand store nor `sync_queue` may contain it. The grant key is
statically denied from every generic cloud-sync/export path. Tests scan Task
7/9 indexes, mappers, sync allowlists, and plugin persistence to prove no grant
or credential material enters them. A characterization test uses a throwing
fake backing store with the real `safeLocalStorage` adapter and proves its
`setItem`/`removeItem` calls return without throwing while readback stays
unchanged; the same backing behavior through the strict adapter must reject
and leave authorization unavailable. Static imports allow grant mutation and
the locator lock-set capability only inside the trusted plugin/security runtime
and focused tests. `Plugins.tsx` receives only `PluginManagementCapability`; model,
action, approval, message, event, artifact, sync, and public-barrel modules
cannot obtain grant mutation authority.

All credential reads/writes/deletes and grant operations for a locator share
one module-owned per-locator async serialization queue. Human
`saveCredential()` is the only grant-minting exception to pre-existing
authorization. After active-account and manifest-locator validation, its exact
fail-closed sequence is:

1. acquire the one-locator stable lock set, recheck the active account, read the
   exact current grant, and, when present, call `removeExact()` with that full
   account/plugin/field/grant/revision identity;
2. await the existing device-global keychain write while retaining the lock;
3. recheck the same active account after the await; and
4. call `replaceExact()` with `expected: { state: 'absent' }` and a fresh
   `explicit_account_save` grant whose nonblank `grantId`, finite `grantedAt`,
   and positive revision come from the runtime's injected
   `randomUUID()`/`now()` and the previously observed grant.

The newly generated `grantId` is the durable anti-replay identity. Revision
equality is an additional stale-proof check, but authorization never assumes a
counter survived removal after a crash; a later explicit re-entry may start a
new revision sequence only with a different `grantId`. The fresh revision is
`current.accountId === accountId ? current.revision + 1 : 1` when a current
grant was observed, otherwise `1`; it must remain a positive safe integer.
`grantedAt` is exactly the post-write `now()` value, and the fresh nonblank
`grantId` must differ from every observed prior grant ID.

A crash/failure before step 1 changes nothing; after the conditional removal
but before step 4 it leaves a credential with no grant and therefore no JARVIS
authority. Grant write failure or an account switch after the keychain write
also remains unbound. Delete removes
the grant before the keychain delete, so a failed delete cannot leave an
authorized stale credential. The legacy raw
`setPluginCredential()`/`getPluginCredential()`/`deletePluginCredential()`
exports are removed; their module-private Tauri calls are reachable only
through the internal adapter. The Plugins UI calls only the closed
`PluginManagementCapability` with the exact canonical active account after
explicit re-entry.

An existing device-global keychain value with no V1 grant is deliberately
legacy-unbound. It is never auto-claimed, copied, renamed, deleted, or assigned
to the first account that signs in. JARVIS returns
`credential_account_unbound`; the UI requires the active user to reconnect or
re-enter it, which executes the reviewed save sequence. Saving the same
locator for account B first removes account A's grant, and no A handle may
survive or resolve that replacement.

`secretHandlePort.ts` owns only process-local handles:

```ts
export type JarvisSecretHandleScope = {
  accountId: string;
  actionId: string;
  actionVersion: number;
  field: string;
  handleId: string;
};

export type JarvisSecretHandleValidation =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'not_found'
        | 'consumed'
        | 'invalidated'
        | 'boot_mismatch'
        | 'account_mismatch'
        | 'action_mismatch'
        | 'version_mismatch'
        | 'field_mismatch'
        | 'credential_account_unbound'
        | 'credential_account_mismatch'
        | 'credential_grant_stale'
        | 'credential_grant_unavailable'
        | 'credential_grant_storage_failed';
    };

export interface JarvisSecretHandlePort {
  validate(scope: JarvisSecretHandleScope): Promise<JarvisSecretHandleValidation>;
  resolveOnce(scope: JarvisSecretHandleScope): Promise<string>;
}

type ExistingCredentialBinding = {
  field: string;
  handleId: string;
  authorization: JarvisExistingCredentialAuthorization;
};

/** @internal Imported only by jarvisSecurityRuntime.ts and focused tests. */
export function createJarvisSecretHandleAuthority(input: {
  credentials: ExistingPluginCredentialAdapter;
  credentialAuthorization: JarvisExistingCredentialAuthorizationAuthority;
  bootId: string;
  randomUUID: () => string;
}): {
  port: JarvisSecretHandlePort;
  bindExistingCredential(binding: {
    accountId: string;
    actionId: string;
    actionVersion: number;
    field: string;
    locator: ExistingPluginCredentialLocator;
  }): Promise<ExistingCredentialBinding>;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
};
```

`jarvisSecurityRuntime.ts` is the named trusted deep-module composition
boundary. It is the only production module allowed to import the internal
secret authority factory, the existing credential adapter, catalog credential
locators, and the approval-engine factory together:

Task 19A adds the safe generic `JarvisAuthorityBoundResult<T>` type to
`app/src/lib/jarvis/contracts/execution.ts` and its type-only contracts barrel;
it carries no authority or constructor. The remaining internal types in this
block live in `approvalEngine.ts`/`jarvisSecurityRuntime.ts` and are omitted from
public barrels.

```ts
/** @internal Defined in approvalEngine.ts; never exported from a public barrel. */
export interface JarvisApprovalBindingSelectors {
  loadCapabilitySnapshot(accountId: string): Promise<Readonly<JarvisCapabilitySnapshot>>;
  loadEntitlementSnapshot(accountId: string): Promise<Readonly<JarvisEntitlementSnapshot>>;
  deriveTargetSnapshot(input: {
    accountId: string;
    actionId: string;
    actionVersion: number;
    params: Readonly<Record<string, unknown>>;
  }): Promise<JarvisCanonicalActionTarget>;
}

/** @internal Imported only by jarvisSecurityRuntime.ts and focused tests. */
export function createJarvisApprovalBindingSelectors(input: {
  catalog: JarvisActionCatalog;
  capabilitySnapshots: JarvisCapabilitySnapshotProvider;
  entitlementSnapshots: JarvisEntitlementSnapshotProvider;
}): JarvisApprovalBindingSelectors;

export type JarvisAuthorityBoundResult<T> =
  | { kind: 'committed'; value: T }
  | { kind: 'account_authority_revoked' };

/** Added to app/src/lib/actions/types.ts in Task 19A, before any consumer. */
export interface ActionRunContext {
  source: 'user' | 'ai';
  chatId?: string;
  messageId?: string;
  callId?: string;
  accountId?: string;
  runId?: string;
  approvalId?: string;
  requestId?: string;
  attemptNumber?: number;
  signal?: AbortSignal;
}

/** Private registered-executor correlation; never carries a secret resolver. */
export interface RegisteredActionExecutionContext extends ActionRunContext {
  accountId: string;
  runId: string;
  approvalId: string;
  requestId: string;
  attemptNumber: number;
}

export type JarvisCanonicalActionExecutionResult =
  | { kind: 'settled'; result: ActionResult }
  | {
      kind: 'handoff_pending';
      executorKind: 'terminal';
      ownerId: string;
      result: Extract<ActionResult, { ok: true }>;
    };

export interface JarvisApprovalActionCapability {
  create(input: CreateJarvisApprovalInput): Promise<JarvisApprovalV1>;
  decide(input: {
    parentRun: JarvisRun;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<JarvisApprovalV1>;
  execute(input: ExecuteJarvisApprovalInput): Promise<JarvisCanonicalActionExecutionResult>;
  executeAutoApprovedSafe(
    input: CreateJarvisApprovalInput & { context: ActionRunContext },
  ): Promise<JarvisCanonicalActionExecutionResult>;
}

/**
 * @internal Supplied only by one issued kernel account lifecycle. The approval
 * engine receives domain operations, never a repository, journal writer,
 * attempt-effect authority, live-evidence producer port, or account selector.
 */
export const jarvisIssuedApprovalLifecycleBrand: unique symbol = Symbol(
  'jarvis.approval-issued-lifecycle',
);

export interface JarvisIssuedApprovalLifecycle {
  readonly accountId: string;
  readonly runId: string;
  readonly requestId: string;
  readonly attemptNumber: number;
  readonly [jarvisIssuedApprovalLifecycleBrand]: true;
  putPreparedApproval(
    input: CreateJarvisApprovalEngineInput,
  ): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>>;
  decidePreparedApproval(input: {
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>>;
  claimApprovedExecution(input: {
    approvalId: string;
    producerKind: 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp';
    ownerId: string;
    evidenceRef: string;
    startedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisIssuedActionExecution>>;
  claimAutoApprovedExecution(input: {
    approval: CreateJarvisApprovalEngineInput;
    producerKind: 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp';
    ownerId: string;
    evidenceRef: string;
    startedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisIssuedActionExecution>>;
  dispose(): void;
}

/** @internal One claimed execution retaining the same issued account binding. */
export const jarvisIssuedActionExecutionBrand: unique symbol = Symbol(
  'jarvis.approval-issued-execution',
);

/** @internal Exact terminal ownership receipt, registered by object identity. */
export const jarvisTerminalHandoffReceiptBrand: unique symbol = Symbol(
  'jarvis.approval-terminal-handoff-receipt',
);

export interface JarvisTerminalHandoffReceipt {
  readonly executionId: string;
  readonly ownerId: string;
  readonly [jarvisTerminalHandoffReceiptBrand]: true;
}

/** @internal Child lease stored only by terminalExecutionStore.ts. */
export interface JarvisTerminalOwnedExecution {
  recordResult(input: {
    state: 'completed' | 'degraded';
    resultRef: string;
    completedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  recordCancellationVerified(input: {
    cancellationRequestId: string;
    resultRef: string;
    verifiedAt: number;
  }): Promise<JarvisAuthorityBoundResult<Readonly<{ run: JarvisRun; event: JarvisEvent }>>>;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
}

/** @internal Deep terminal store acceptor; never exposed to a feature/UI. */
export interface JarvisTerminalExecutionAcceptor {
  acceptIssuedExecution(input: {
    executionId: string;
    ownerId: string;
    execution: JarvisTerminalOwnedExecution;
  }): JarvisTerminalHandoffReceipt;
}

export type JarvisStartedExternalEffect<T> = Readonly<{
  completion: Promise<T>;
}>;

export interface JarvisIssuedActionExecution {
  readonly approval: JarvisApprovalV1;
  readonly producerKind: 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp';
  readonly ownerId: string;
  readonly startEvent: JarvisEvent;
  readonly initialLiveProof: JarvisLiveEvidenceProof;
  readonly [jarvisIssuedActionExecutionBrand]: true;
  beginExternalEffect<T>(
    begin: (signal: AbortSignal) => JarvisStartedExternalEffect<T>,
  ): JarvisAuthorityBoundResult<JarvisStartedExternalEffect<T>>;
  transferTerminalOwnership(input: {
    executionId: string;
    acceptor: JarvisTerminalExecutionAcceptor;
  }): JarvisAuthorityBoundResult<JarvisTerminalHandoffReceipt>;
  recordResult(input: {
    state: 'completed' | 'degraded';
    resultRef: string;
    completedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  recordCancellationVerified(input: {
    cancellationRequestId: string;
    resultRef: string;
    verifiedAt: number;
  }): Promise<
    JarvisAuthorityBoundResult<
      Readonly<{ run: JarvisRun; event: JarvisEvent; proof: JarvisLiveEvidenceProof }>
    >
  >;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
}

/** @internal Passed directly from jarvisSecurityRuntime.ts to kernelRuntime.ts. */
export type JarvisApprovalActionBinder = (
  lifecycle: JarvisIssuedApprovalLifecycle,
) => JarvisApprovalActionCapability;

/** @internal Returned only by the closed registered-action dispatcher. */
export type JarvisRegisteredActionDispatchOutcome =
  | { kind: 'executor_returned'; result: ActionResult }
  | {
      kind: 'terminal_handoff_accepted';
      executorKind: 'terminal';
      result: Extract<ActionResult, { ok: true }>;
      ownerId: string;
      receipt: JarvisTerminalHandoffReceipt;
    };

export type JarvisSecurityRuntime = Readonly<{
  readonly recoveryVerifier: JarvisRecoveryApprovalVerifier;
  bindKernelActions: JarvisApprovalActionBinder;
  pluginManagement: PluginManagementCapability;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
}>;

export function createJarvisSecurityRuntime(input: {
  repositories: JarvisRepositories;
  catalog: JarvisActionCatalog;
  capabilitySnapshots: JarvisCapabilitySnapshotProvider;
  entitlementSnapshots: JarvisEntitlementSnapshotProvider;
  credentialGrants: PluginCredentialAccountGrantRepository;
  credentialAuthorization: JarvisExistingCredentialAuthorizationAuthority;
  pluginConnections: Pick<PluginStore, 'upsertConnection' | 'removeConnection'>;
  activeAccountId(): string | undefined;
  executeRegisteredAction(input: {
    registration: Readonly<JarvisRegisteredActionDefinition>;
    params: Readonly<Record<string, unknown>>;
    context: RegisteredActionExecutionContext;
    execution: JarvisIssuedActionExecution;
  }): Promise<JarvisRegisteredActionDispatchOutcome>;
  bootId: string;
  randomUUID: () => string;
  now: () => number;
}): JarvisSecurityRuntime;
```

The runtime creates `createExistingPluginCredentialAdapter()`, constructs the
only `JarvisApprovalBindingSelectors` from Task 5's entitlement provider, Task
11's capability provider, and the catalog's registered canonical target
deriver, injects the exact durable credential-authorization authority into the
private handle authority, and passes the exact same `credentialGrants`,
authorization authority, adapter, `pluginConnections`, `randomUUID`, and `now`
dependencies into `createAccountScopedPluginRuntime()`. It closes all of them inside the
catalog-owned action/version/field mapping. `deriveTargetSnapshot()` first resolves the
registered action/version, derives only its declared canonical target from
validated non-secret parameters, and rechecks the exact active account through
both snapshot providers; arbitrary caller target objects are never authority.
The runtime returns only the read-only recovery verifier, the deep-module
kernel action binder, the closed human plugin-management capability, and
lifecycle invalidators. It does **not** return a boot-scoped executable approval
capability. `app/src/lib/ai/runtime.ts` passes `bindKernelActions` directly to
Task 16B's kernel composition without storing it in React, Zustand, a public
barrel, or feature state. App places only `pluginManagement` in the Plugins
management context; the private registered-tool executor remains captured by
the catalog executor and engine. A lifecycle-bound
`JarvisApprovalActionCapability.create()` accepts no selector,
locator, handle reference, binder, resolver, key, authorization proof, grant,
or raw secret. It resolves the registered definition internally, binds exactly
its catalog-declared credential fields, and passes generated opaque references
only to the private engine call.

`secretHandlePort.ts`, `createJarvisSecretHandleAuthority()`, the
approval-engine constructor, and their internal types are deep-module exports
solely so this composition file can construct them. They are omitted from
every public contracts/actions/plugins/JARVIS barrel. The runtime test scans
static imports and fails if any production module other than
`jarvisSecurityRuntime.ts` imports those constructors or if any barrel exports
them.

The action catalog owns a closed action-version-and-field to
`ExistingPluginCredentialLocator` mapping. Trusted composition reads that
mapping and calls
`bindExistingCredential()` before the lifecycle-bound approval capability's
`create()`; untrusted action
input cannot choose a plugin ID, field ID, generated keyring account, resolver,
or raw value. `bindExistingCredential()` calls
`credentialAuthorization.authorize()` and stores the returned branded
account/locator/grant/revision proof privately; any missing, legacy-unbound,
foreign, stale, or unavailable grant rejects handle minting with its exact safe
reason. Storage remains device-global, but authorization is durable and
account-scoped: a handle bound for account A can never be used by account B,
and account teardown calls `invalidateAccount(accountId)`. A later
account-namespaced keyring migration is allowed only as a separately reviewed
migration that preserves old entries and proves rollback; Task 19A performs no
silent migration.

`resolveOnce()` performs its full scope/boot/account/action/version/field check,
then enters the exact locator's lock set and calls `revalidateLocked()` for the
current grant and active account. It synchronously marks the binding consumed
and removes it from the private handle registry before the keychain read, awaits exactly
one `readExistingCredential(locator)`, and calls `revalidateLocked()` for the
same grant/revision again before returning the value to the private executor.
Because an account
overwrite removes its grant before its keychain write, either revalidation
loses and discards the read value; it never reaches action code. Missing
credentials, changed grants, and adapter failures throw safe typed categories
without including the locator-derived key or raw value. A second or concurrent
resolution always fails as `consumed`.

`invalidateAccount()` runs on account teardown/switch and `invalidateAll()`
runs on trusted process teardown. Handles are process-local and carry the
authority boot identity, so restart invalidates every prior handle; recovery
must request fresh approval rather than reconstruct or replay one. No raw
secret, resolver, generic registrar, generated credential key, adapter,
binder, authorization proof, or private authority is exported through public
action input, approvals, messages, events, artifacts, snapshots, logs, UI, or
persisted rows. The one explicit exception is the non-secret locator plus
account/grant/revision metadata in
`PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY`; it appears nowhere else.

Task 16W's trusted primary-host bootstrap, invoked from `App.tsx` only after
the native broker proves that this webview owns the current `main` host epoch,
constructs one strict raw-storage adapter, grant repository, and
`JarvisExistingCredentialAuthorizationAuthority`. It injects that exact
repository and authority, stable delegates for only the plugin store's
`upsertConnection`/`removeConnection` methods, plus one shared
`randomUUID`/clock pair, into one `JarvisSecurityRuntime`. Detached Workbench,
secondary VibeSpace/tool windows, the pet overlay, stale main epochs, and web
preview clients cannot construct it; they receive only Task 16W's typed client
or a closed unavailable result. `stopAccountScopedListeners()` captures the old canonical
account ID and synchronously calls `invalidateAccount(oldAccountId)` before
starting any new account-scoped listener. The boot-effect cleanup and its
`pagehide` process-teardown handler call `invalidateAll()`; both operations
are idempotent, and the handler is removed during cleanup. The trusted-host AI
composition passes `runtime.bindKernelActions` directly into Task 16B's closed
kernel factory and exposes only that kernel's authority-result action methods
to Task 19B adapters and Task 16W's native client responder. App passes only
`runtime.pluginManagement` through the
Plugins management React context and the read-only `recoveryVerifier` to the
recovery reader. It never stores the whole security runtime, registered-tool
executor, selector, binder, issued lifecycle, locator, adapter, handle port,
authorization proof, or resolver in React, Zustand, a message, or persistence.
Two-webview tests prove one owner epoch, client-routed cancellation and read
state, owner-first account teardown, active-evidence visibility, serialized
credential mutation, stale-owner response rejection, and zero secondary
runtime construction.

Use the same focused command for RED before implementation and GREEN after
implementation, followed by root typecheck before staging:

```powershell
npm --prefix app test -- src/lib/jarvis/contracts/validators.test.ts src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/jarvis/actions/catalog.test.ts src/lib/jarvis/secretHandlePort.test.ts src/lib/jarvis/approvalEngine.test.ts src/lib/jarvis/jarvisSecurityRuntime.test.ts src/lib/actions/promptAddendum.test.ts src/lib/actions/registryJarvisCore.test.ts src/lib/jarvis/intentInterpreter.test.ts src/features/plugins/credentialAuthorization.test.ts src/features/plugins/credentials.test.ts src/features/plugins/store.test.ts src/features/plugins/runtime.test.ts src/features/plugins/contract.test.ts src/features/plugins/activation.test.ts src/features/plugins/context.test.ts src/features/plugins/action.test.ts src/features/plugins/managementContext.test.tsx src/features/plugins/Plugins.test.tsx src/lib/sync.test.ts src/features/chat/Composer.pluginAccountScope.test.tsx src/App.jarvisSecurityRuntime.test.tsx
npm run typecheck
```

**Exact files**

- Modify: `app/src/lib/jarvis/contracts/execution.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.test.ts`
- Modify: `app/src/lib/jarvis/contracts/index.ts`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/jarvisMappers.ts`
- Modify: `app/src/lib/db/jarvisMappers.test.ts`
- Modify: `app/src/lib/db/jarvisRepositories.ts`
- Modify: `app/src/lib/db/jarvisRepositories.test.ts`
- Modify: `app/src/lib/jarvis/actions/catalog.ts`
- Modify: `app/src/lib/jarvis/actions/catalog.test.ts`
- Modify: `app/src/lib/actions/types.ts`
- Modify: `app/src/lib/actions/registry.ts`
- Modify: `app/src/lib/actions/promptAddendum.ts`
- Modify: `app/src/lib/actions/promptAddendum.test.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.test.ts`
- Modify: `app/src/lib/jarvis/intentInterpreter.ts`
- Modify: `app/src/lib/jarvis/intentInterpreter.test.ts`
- Create: `app/src/lib/jarvis/secretHandlePort.ts`
- Create: `app/src/lib/jarvis/secretHandlePort.test.ts`
- Create: `app/src/lib/jarvis/approvalEngine.ts`
- Create: `app/src/lib/jarvis/approvalEngine.test.ts`
- Create: `app/src/lib/jarvis/jarvisSecurityRuntime.ts`
- Create: `app/src/lib/jarvis/jarvisSecurityRuntime.test.ts`
- Modify: `app/src/features/plugins/credentials.ts`
- Create: `app/src/features/plugins/credentials.test.ts`
- Create: `app/src/features/plugins/credentialAuthorization.ts`
- Create: `app/src/features/plugins/credentialAuthorization.test.ts`
- Modify: `app/src/features/plugins/types.ts`
- Modify: `app/src/features/plugins/store.ts`
- Modify: `app/src/features/plugins/store.test.ts`
- Modify: `app/src/features/plugins/runtime.ts`
- Modify: `app/src/features/plugins/runtime.test.ts`
- Modify: `app/src/features/plugins/contract.ts`
- Modify: `app/src/features/plugins/contract.test.ts`
- Modify: `app/src/features/plugins/activation.ts`
- Modify: `app/src/features/plugins/activation.test.ts`
- Modify: `app/src/features/plugins/context.ts`
- Modify: `app/src/features/plugins/context.test.ts`
- Modify: `app/src/features/plugins/index.ts`
- Modify: `app/src/features/plugins/action.test.ts`
- Create: `app/src/features/plugins/managementContext.tsx`
- Create: `app/src/features/plugins/managementContext.test.tsx`
- Modify: `app/src/features/plugins/Plugins.tsx`
- Modify: `app/src/features/plugins/Plugins.test.tsx`
- Modify: `app/src/lib/sync.ts`
- Modify: `app/src/lib/sync.test.ts`
- Modify: `app/src/features/chat/Composer.tsx`
- Create: `app/src/features/chat/Composer.pluginAccountScope.test.tsx`
- Modify: `app/src/features/whats-new/releases.ts`
- Modify: `app/src/App.tsx`
- Create: `app/src/App.jarvisSecurityRuntime.test.tsx`

```ts
export interface JarvisApprovalV1 extends JarvisApproval {
  schemaVersion: 1;
  requestId: string;
  attemptNumber: number;
  capabilityId: string;
  capabilitySnapshotHash: string;
  expectedEffect: string;
  expiresAt: number;
}
```

Extend `JarvisApprovalRow` with the exact snake-case fields
`schema_version`, `request_id`, `attempt_number`, `capability_id`,
`capability_snapshot_hash`, `expected_effect`, and `expires_at`; do not change
`STORES_V3.jarvis_approvals`.

Task 19 changes the approval repository to return `JarvisApprovalV1` and adds
an atomic status primitive:

```ts
export interface JarvisApprovalRepository {
  getById(accountId: string, approvalId: string): Promise<JarvisApprovalV1 | undefined>;
  listByRun(
    accountId: string,
    runId: string,
    options?: {
      requestId?: string;
      attemptNumber?: number;
      createdAtOrAfter?: number;
      limit?: number;
    },
  ): Promise<JarvisApprovalV1[]>;
}
```

The production approval repository is read-only. No ordinary two-table insert
or status mutator exists. Task 16B's private issued context owns the only four
write operations: `createPendingApprovalInContext`,
`decideApprovalInContext`, `claimApprovedExecutionInContext`, and
`claimSafeAutoExecutionInContext`. Each uses exactly the bound
`[jarvis_runs, jarvis_events, jarvis_approvals]` tuple and cannot be called
without the current host/account/run/request/attempt lifecycle.
`requestId` and `attemptNumber` remain immutable exact authorization binding.
For a scheduled attempt, creation/claim additionally requires the exact latest
open attempt and atomically dirties the effect barrier. A late approval cannot
land against `retryable_failed`, cancellation intent, a sealed old attempt, a
terminal run, or a different request. An exact idempotent operation returns the
already-committed detached row/event set only when every immutable field and
idempotency key match; changed reuse fails closed. `listByRun()` verifies the
account-owned parent, clamps `limit` to `1..500`, and is the bounded approval
evidence read used by Task 19B's transport-safety authority; an incomplete
bounded read can never prove zero approvals.

Use RFC 8785-style canonical JSON bytes, not Task 2's text-normalizing hash:

```ts
export function canonicalizeJarvisApprovalJson(value: unknown): string;

export async function hashCanonicalJarvisApprovalJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeJarvisApprovalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

The canonicalizer recursively sorts object keys, preserves array order, uses
ECMAScript JSON number/string serialization, normalizes `-0` as JSON `0`, and
rejects `undefined`, functions, symbols, bigint, non-finite numbers, class
instances, sparse arrays, and cycles. It never includes a rejected payload in
an error.

```ts
export type JarvisApprovalErrorCode =
  | 'run_scope_mismatch'
  | 'action_unavailable'
  | 'action_version_changed'
  | 'invalid_parameters'
  | 'secret_value_rejected'
  | 'params_changed'
  | 'target_changed'
  | 'risk_changed'
  | 'capability_changed'
  | 'entitlement_changed'
  | 'expired'
  | 'not_pending'
  | 'not_approved'
  | 'already_consumed'
  | 'secret_handle_invalid'
  | 'secret_handle_scope_mismatch'
  | 'secret_handle_duplicate_field'
  | 'credential_account_unbound'
  | 'credential_account_mismatch'
  | 'credential_grant_stale'
  | 'credential_grant_unavailable'
  | 'credential_grant_storage_conflict'
  | 'credential_grant_storage_failed'
  | 'caller_secret_resolver_rejected';

export class JarvisApprovalError extends Error {
  readonly code: JarvisApprovalErrorCode;
}

export type CreateJarvisApprovalInput = {
  parentRun: JarvisRun;
  attempt: JarvisRequestAttempt;
  actionId: string;
  actionVersion: number;
  params: Record<string, unknown>;
  expiresAt: number;
};

type CreateJarvisApprovalEngineInput = CreateJarvisApprovalInput & {
  secretHandleRefs: readonly { field: string; handleId: string }[];
};

export type ExecuteJarvisApprovalInput = {
  parentRun: JarvisRun;
  approvalId: string;
  context: ActionRunContext;
};

export interface JarvisApprovalEngine {
  readonly recoveryVerifier: JarvisRecoveryApprovalVerifier;
  bindIssuedLifecycle(lifecycle: JarvisIssuedApprovalLifecycle): JarvisApprovalActionCapability;
}

export type JarvisApprovalEngineDependencies = Readonly<{
  runs: Pick<JarvisRunRepository, 'getById'>;
  approvals: Pick<JarvisApprovalRepository, 'getById' | 'listByRun'>;
  catalog: JarvisActionCatalog;
  bindingSelectors: JarvisApprovalBindingSelectors;
  secretHandles: JarvisSecretHandlePort;
  executeRegisteredAction(input: {
    registration: Readonly<JarvisRegisteredActionDefinition>;
    params: Readonly<Record<string, unknown>>;
    context: RegisteredActionExecutionContext;
    execution: JarvisIssuedActionExecution;
  }): Promise<JarvisRegisteredActionDispatchOutcome>;
  newApprovalId(): `jappr_${string}`;
  now(): number;
  canonicalizeJson(value: unknown): string;
  hashCanonicalJson(value: unknown): Promise<string>;
}>;

/** @internal Imported only by jarvisSecurityRuntime.ts and focused tests. */
export function createJarvisApprovalEngine(
  input: JarvisApprovalEngineDependencies,
): JarvisApprovalEngine;
```

`JarvisApprovalEngineDependencies` above is the complete constructor contract;
there is no undeclared service locator, optional default, generic repository
bag, target callback, plugin/tool string, credential locator, or caller
authorization boolean. The read-only `recoveryVerifier` uses those same exact
selectors/repositories but has no consumption/execution method.
`bindIssuedLifecycle()` is the only executable path. It validates that every
create/decision/execution input repeats the captured account/run/request/attempt
exactly, closes the private executor and secret resolver over that lifecycle,
and returns a capability whose methods become unusable immediately after
`lifecycle.dispose()`. The engine has no journal dependency and cannot commit
an approval, effect claim, source event, live-evidence row, cancellation event,
or result event outside the issued lifecycle.
For an issued execution-handle method, the engine accepts only the outer
`committed` case before returning a `settled` canonical result; an outer revoked
result raises the one private authority-revoked error that Task 16B maps at its
public runtime boundary. A terminal store handoff returns only the distinct
`handoff_pending` state. Executor `ok: true` without committed immutable result
evidence is never returned or rendered as settled action success.
The two emitted brand symbols above are deep-module values, omitted from every
barrel, and may be imported in production only by `kernelRuntime.ts`. That
runtime also keeps private `WeakSet` registries for lifecycle and execution
object identity; every method verifies membership and the retained account
binding before reading fields. A cast or copied brand therefore grants no
authority. Import-boundary tests reject any other production import of either
brand symbol beyond `kernelRuntime.ts`, and reject
`JarvisApprovalActionBinder` imports outside its defining `approvalEngine.ts`,
`jarvisSecurityRuntime.ts`, and `kernelRuntime.ts`.
`secretHandlePort.ts` is intentionally not re-exported from the public
contracts/actions barrel, and no UI module receives the port or private
executor. The immutable catalog registration declares the exact target,
executor, and credential fields an action may consume; undeclared fields and
duplicate declarations fail catalog construction.

Creation rules:

1. Load the canonical parent by `parentRun.accountId` and `parentRun.id` and
   compare its immutable identity fields. Validate
   `attempt.runId === parentRun.id`, its fresh request relation, and exact
   positive `attemptNumber`; persist those values on the approval.
   `accountId` is never a model field.
2. Resolve the immutable literal registration through `JarvisActionCatalog`
   and require the requested version to equal the registered version. A
   legacy `ActionDef`, runtime custom tool, plugin manifest, or documentation
   projection is unavailable unless that exact action has its own literal
   security registration.
3. Validate/coerce parameters through the registered schema, reject unknown
   fields, then recursively reject credential-shaped keys or values supplied
   by the model. Legitimate credentials arrive only as trusted
   `secretHandleRefs`. Require one unique handle reference per declared
   credential field, reject undeclared/duplicate/missing fields, and call
   `JarvisSecretHandlePort.validate()` with the exact account/action/version/
   field/handle scope before persisting the opaque reference.
4. Derive approval risk only from the registered definition:
   `read-only -> safe`, `safe-write -> confirm`, and
   `external-side-effect | destructive | credential-sensitive -> dangerous`.
   Caller/model risk is ignored.
5. Set `capabilityId` to the definition's primary
   `requiredCapabilities[0]`; catalog validation rejects a JARVIS-exposed
   definition without exactly one primary capability.
6. Use only `bindingSelectors` to load the current capability/entitlement
   snapshots and derive the canonical target from the validated parameters and
   parent account. Public create/execute inputs carry none of those authority
   objects. Hash a canonical authorization slice containing the primary
   capability, every required capability's current
   ref/state/operations/evidence, the canonical target, and the sorted
   entitlement snapshot. Reject unavailable/planned capability state, missing
   required operations/entitlements, unverified entitlement authority, or
   expired entitlements.
7. Derive `expectedEffect` from the registered action definition and canonical
   target, never from rationale, caller target data, or model prose.
8. Persist exact request/attempt binding, canonical non-secret parameters,
   target, hashes, expiry, and opaque handle references with
   `status: 'pending'` only through
   `lifecycle.putPreparedApproval()`. Task 16B's signal-bound three-table
   operation atomically performs `running -> awaiting_approval`, inserts the
   row, appends the fixed transition and pending-approval events, and, for a
   scheduled transport attempt, dirties its effect barrier. No pending row can
   exist without the canonical event/recovery truth.

Consumption repeats every check against the current definition, target,
capability snapshot, entitlement snapshot, time, stored canonical parameters,
and every secret handle's exact account/action/version/field scope. Any
action/version/params/target/risk/capability/entitlement/handle drift fails
before consumption. `RegisteredActionExecutionContext` has no secret resolver;
the engine also rejects any unknown/cast caller resolver, atomically changes
`approved -> consumed`, and only
through `lifecycle.claimApprovedExecution()`. That operation performs the
approved-to-consumed CAS, `awaiting_approval -> running`, effect claim, and
internally derived source/live-ready append in one signal-bound transaction;
only after it and its exact readback
succeed does the engine build the **only** resolver passed to the private
executor from the stored handle references. No keychain read or other
secret-resolution await occurs before the committed claim/readback. That closure
calls `resolveOnce()` just in time for the one declared field; the port
revalidates the full binding and consumes the handle before awaiting the
existing credential adapter. A deleted, invalidated, rebound, missing, or
already-consumed handle fails closed and no other field can be queried. A
concurrent approval consumer loses the compare-and-set, and concurrent field
resolution loses the single-use handle race. Execution failure remains a
consumed attempt and is recorded truthfully in the run journal; neither
approval nor handle is rewound.

After the final awaited selector, keychain, or setup operation and immediately
before an irreversible call, the private dispatcher must call
`execution.beginExternalEffect(start)`. That method synchronously rechecks the
trusted host epoch, account lifecycle, execution WeakSet identity, cancellation
state, approval/execution binding, and current abort signal, registers the
owner, and invokes the non-async `start(signal)` callback in the same JavaScript
stack. `start` must initiate the actual fetch/native/browser/file/plugin/MCP
operation before returning `JarvisStartedExternalEffect`; it may not perform an
await first. Every capable adapter passes the supplied signal or exact native
cancellation token through to the real operation. Revocation before this gate
makes zero external call. Revocation after start is recorded as an explicit
uncertain/aborted execution outcome and is never used as zero-effect retry
evidence. Tests place revocation after live readback, after secret resolution,
inside the synchronous start boundary, and immediately before terminal/native
handoff for every executor kind.

The executor dependency receives the exact frozen registration object returned
by the catalog plus validated parameters and the issued execution handle; it
never receives a model-selected registry ID, plugin ID, tool name, target, or
credential locator. The private dispatcher checks the registration is still the
catalog's current object/version before resolving its fixed built-in or
plugin-tool locator. It retains the handle itself and never passes it to a
plugin, model, generic action handler, or caller context. Normal actions must
start through `beginExternalEffect()` and return
`{ kind: 'executor_returned', result }`; only after the engine records
immutable result truth through the handle and disposes it does the public port
return `{ kind: 'settled', result }`.
`{ kind: 'terminal_handoff_accepted', executorKind: 'terminal' }` is accepted
only for the literal registered terminal executor and only with the exact
object-identity `JarvisTerminalHandoffReceipt` returned by
`execution.transferTerminalOwnership()`. That method performs one synchronous
WeakMap state transition `engine_owned -> offered -> terminal_owned`, gives
`terminalExecutionStore.ts` only the narrow child controller, invokes the
acceptor before native spawn/queue visibility, and registers the receipt.
Acceptance failure rolls ownership back to the engine; once accepted, a later
dispatcher throw cannot cause engine disposal and is recovered as the same
handoff. The store then owns result/cancellation/disposal, and the public port returns only
`{ kind: 'handoff_pending', executorKind: 'terminal', ... }`. A handoff outcome
for any other registration,
failed result, forged/spread/cloned receipt, mismatched owner, foreign runtime,
replay, or unaccepted controller fails closed and the engine disposes it when
it still owns it. No generic `runAction(actionId)` or
`callPluginTool(pluginId, toolName)` fallback exists.

`secretHandleRefs` are local opaque pointers. They may exist only in the local
approval row and a private just-in-time resolver closure. The concrete factory
in `secretHandlePort.ts` receives
`createExistingPluginCredentialAdapter()` at trusted composition time. Its
private binder accepts only an exact account/action/version/field scope plus
the catalog-owned locator, mints the opaque handle ID internally, and stores
only that scope/locator/boot binding. It never accepts a caller-supplied
resolver function, generated credential key, or raw secret value, and neither
the binder nor the adapter is exported through public barrels/UI/model code.
`validate()` checks the binding without reading the secret; `resolveOnce()`
performs the one keychain read after synchronous single-use consumption.

The port stores no resolved value.
Handle IDs and resolved values are forbidden from message parts, model input,
copy text, toasts, DevConsole, events, artifacts, errors, snapshots, and test
evidence. Synthetic opaque handles and synthetic secret values may exist only
inside private unit-test setup/mocks; tests must prove they never reach
snapshots, rendered copy, logs, errors, events, artifacts, messages, or
evidence. The engine rejects model-provided raw secret values instead of
replacing them.

**TDD and commit**

- [ ] Add validator/mapper/repository tests for every v1 field, detached
      mapping, exact request/attempt binding, immutable exact retry,
      changed-payload conflict, read-only production repository, and bounded
      reads; reserve create/decide/claim transaction tests for Task 16B; run
      the focused tests and confirm red.
- [ ] Add approval-engine tests for canonical key ordering and number rules,
      raw-secret rejection, parent-account inheritance, action/version/params/
      target/risk/capability/entitlement/expiry drift, deny/expire/replay, and
      executor failure after consumption; binding only to an issued lifecycle;
      no write-capable repository/journal/effect/live dependency; claim/live
      readback before secret resolution/executor; immediate pre-effect host/
      account recheck after every final await; signal propagation to every
      executor; revocation in the post-readback/pre-dispatch and
      post-secret/pre-dispatch gaps; disposed/foreign lifecycle failure; outer
      revoked action-handle results; normal-handle disposal versus terminal
      WeakMap transfer/rejected-transfer cleanup; forged, spread, cloned,
      cross-runtime, replayed, accepted-then-dispatcher-throw, and
      store-rejected handoff receipts; terminal-handoff outcome accepted only
      from the literal terminal dispatcher after exact store acceptance and
      rejected for plugin/generic/mismatched owners; and no
      boot-scoped executable capability from `JarvisSecurityRuntime`; confirm
      red.
- [ ] Add catalog/plugin boundary tests for immutable literal registrations,
      same-ID/same-version and same-ID/different-version rejection, exact target
      and credential-locator derivation, unregistered-action denial, generic
      `plugin.call`/`plugin.invoke` absence from both action registries, prompts,
      contexts, intents, and barrels, fixed plugin/tool registration rules,
      default zero plugin-tool registrations, canonical account required by
      test/call/disconnect, cross-account connection-store isolation, V1
      metadata non-claim, account-scoped Composer/activation/context reads,
      exact sync row encoding/payload/pull matching, and foreign-record
      rejection. Confirm red.
- [ ] Add credential-grant/secret-port/engine tests for explicit account save
      with no pre-existing grant and no authorization call, wrong-account deny,
      undeclared manifest locator denial, missing grant, legacy device-global
      value denial, re-entry binding, account-B overwrite invalidating account
      A, signed-out/active-account mismatch, process restart, account switch,
      stale revision, revision reuse under a fresh grant ID still invalidating
      every old proof, forged authorization/handle, deleted credential,
      cross-action, cross-version, duplicate/undeclared/missing field, and field
      mismatch. Inject failures/crashes after grant removal, keychain write,
      post-write account recheck, and grant put; prove exact locked
      remove-write-recheck-put ordering, injected UUID/clock use, fail-closed
      recovery, per-locator serialization, stable sorted multi-locator locking,
      conditional remove conflict, disconnect-versus-account-B-save and
      disconnect-versus-account-switch races with zero foreign deletes, and
      credentialless disconnect with zero grant/keychain calls, plus locked
      pre/post-read revalidation; use the real `safeLocalStorage` with a
      throwing backing store to characterize its swallowed set/remove failures,
      then prove the strict raw-storage CAS and immediate readback reject the
      same no-op/failure and mint no grant; and prove no
      secret/fingerprint/derived-key material in the grant map, Dexie,
      `sync_queue`, plugin persistence, messages/events/artifacts/errors/log/
      render/evidence spies. Confirm red.
- [ ] Add security-runtime/import-boundary/App tests proving the named factory
      alone constructs the binding selectors and closes over the adapter,
      locator, binder, port, exact injected grant-repository identity,
      authorization authority, stable plugin-connection mutators, shared
      UUID/clock, Task 5/11 providers, plugin management/fixed-tool runtime, and
      exact engine dependency object;
      selector allow/deny/missing/stale/
      cross-account behavior; callers receiving only the approval/action
      capability; account switch invalidating the old scope before new
      startup; `pagehide` and boot cleanup invalidating all; duplicate cleanup
      safety; and no private constructor/type re-export from a public barrel.
- [ ] Implement the contract, mapper, repository CAS, and engine; rerun the
      focused tests and `npm --prefix app run typecheck`.
- [ ] Stage only these fifty-three literal files, run cached-name/whitespace/
      installer/secret checks, and commit.

```powershell
git add -- `
  app/src/lib/jarvis/contracts/execution.ts `
  app/src/lib/jarvis/contracts/validators.ts `
  app/src/lib/jarvis/contracts/validators.test.ts `
  app/src/lib/jarvis/contracts/index.ts `
  app/src/lib/db/schema.ts `
  app/src/lib/db/jarvisMappers.ts `
  app/src/lib/db/jarvisMappers.test.ts `
  app/src/lib/db/jarvisRepositories.ts `
  app/src/lib/db/jarvisRepositories.test.ts `
  app/src/lib/jarvis/actions/catalog.ts `
  app/src/lib/jarvis/actions/catalog.test.ts `
  app/src/lib/actions/types.ts `
  app/src/lib/actions/registry.ts `
  app/src/lib/actions/promptAddendum.ts `
  app/src/lib/actions/promptAddendum.test.ts `
  app/src/lib/actions/registryJarvisCore.ts `
  app/src/lib/actions/registryJarvisCore.test.ts `
  app/src/lib/jarvis/intentInterpreter.ts `
  app/src/lib/jarvis/intentInterpreter.test.ts `
  app/src/lib/jarvis/secretHandlePort.ts `
  app/src/lib/jarvis/secretHandlePort.test.ts `
  app/src/lib/jarvis/approvalEngine.ts `
  app/src/lib/jarvis/approvalEngine.test.ts `
  app/src/lib/jarvis/jarvisSecurityRuntime.ts `
  app/src/lib/jarvis/jarvisSecurityRuntime.test.ts `
  app/src/features/plugins/credentials.ts `
  app/src/features/plugins/credentials.test.ts `
  app/src/features/plugins/credentialAuthorization.ts `
  app/src/features/plugins/credentialAuthorization.test.ts `
  app/src/features/plugins/types.ts `
  app/src/features/plugins/store.ts `
  app/src/features/plugins/store.test.ts `
  app/src/features/plugins/runtime.ts `
  app/src/features/plugins/runtime.test.ts `
  app/src/features/plugins/contract.ts `
  app/src/features/plugins/contract.test.ts `
  app/src/features/plugins/activation.ts `
  app/src/features/plugins/activation.test.ts `
  app/src/features/plugins/context.ts `
  app/src/features/plugins/context.test.ts `
  app/src/features/plugins/index.ts `
  app/src/features/plugins/action.test.ts `
  app/src/features/plugins/managementContext.tsx `
  app/src/features/plugins/managementContext.test.tsx `
  app/src/features/plugins/Plugins.tsx `
  app/src/features/plugins/Plugins.test.tsx `
  app/src/lib/sync.ts `
  app/src/lib/sync.test.ts `
  app/src/features/chat/Composer.tsx `
  app/src/features/chat/Composer.pluginAccountScope.test.tsx `
  app/src/features/whats-new/releases.ts `
  app/src/App.tsx `
  app/src/App.jarvisSecurityRuntime.test.tsx
git commit -m "feat(jarvis): add versioned approval engine"
```

### Task 19B — Canonical action, legacy-card, recovery, and auto-approve adapters

**Exact files**

- Modify: `app/src/features/jarvis-runs/approvalBridge.ts`
- Modify: `app/src/features/jarvis-runs/approvalBridge.test.ts`
- Modify: `app/src/features/jarvis-runs/taskRunStore.ts`
- Modify: `app/src/features/jarvis-runs/taskRunStore.test.ts`
- Modify: `app/src/features/jarvis-runs/recoveryExecutor.ts`
- Modify: `app/src/features/jarvis-runs/recoveryExecutor.test.ts`
- Modify: `app/src/lib/jarvis/approvalEngine.ts`
- Modify: `app/src/lib/jarvis/approvalEngine.test.ts`
- Modify: `app/src/lib/jarvis/actions/catalog.ts`
- Modify: `app/src/lib/jarvis/actions/catalog.test.ts`
- Modify: `app/src/lib/jarvis/actions/planner.ts`
- Modify: `app/src/lib/jarvis/actions/planner.test.ts`
- Modify: `app/src/lib/actions/types.ts`
- Modify: `app/src/lib/actions/runner.ts`
- Modify: `app/src/lib/actions/runner.test.ts`
- Modify: `app/src/lib/actions/autoApprove.ts`
- Modify: `app/src/lib/actions/autoApprove.test.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.test.ts`
- Modify: `app/src/lib/jarvis/operatorListener.ts`
- Modify: `app/src/lib/jarvis/operatorListener.test.ts`
- Modify: `app/src/features/chat/ActionApprovalCard.tsx`
- Modify: `app/src/features/chat/ActionApprovalCard.test.tsx`

`approvalBridge` becomes an ID/presentation adapter only:

```ts
const APPROVAL_CALL_PREFIX = 'jarvisapproval:';

export function createTaskApprovalCallId(approvalId: string): string;
export function parseTaskApprovalCallId(callId: string): { approvalId: string } | null;
export function presentJarvisApproval(approval: JarvisApprovalV1): {
  actionId: string;
  expectedEffect: string;
  risk: JarvisApprovalV1['risk'];
  parameters: readonly { field: string; safeValue: string }[];
};
```

It has no `begin`, `finish`, `patchRun`, or local `cancelRun` authority.
Historical `jarvisrun:` IDs remain renderable but return a truthful
non-executable legacy state; no canonical run is fabricated for them.

Task 19A already landed the optional trusted kernel correlation on
`ActionRunContext` and its stricter `RegisteredActionExecutionContext` before
this slice typechecks. Task 19B adds only the narrow feature-facing port:

```ts
/** Narrow feature-facing contract. Task 16B supplies the sole production implementation. */
export interface JarvisKernelActionPort {
  create(
    input: Readonly<CreateJarvisApprovalInput>,
  ): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>>;
  decide(input: {
    parentRun: JarvisRun;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>>;
  execute(
    input: Readonly<ExecuteJarvisApprovalInput>,
  ): Promise<JarvisAuthorityBoundResult<JarvisCanonicalActionExecutionResult>>;
  executeAutoApprovedSafe(
    input: Readonly<CreateJarvisApprovalInput & { context: ActionRunContext }>,
  ): Promise<JarvisAuthorityBoundResult<JarvisCanonicalActionExecutionResult>>;
}
```

Task 19B lands pure adapter factories that require an injected
`JarvisKernelActionPort` and tests them with a deterministic fake, but it does
not change existing production entrypoint signatures or call sites while
kernel mode remains `shadow`. Existing production callers remain on their
current compatibility path until Task 16B atomically injects the real port and
removes that path. No Task 19B production module may instantiate an unavailable
or permissive port, and no new adapter is exported from a public barrel before
cutover. Task 16B owns all call-site changes together, including `App.tsx`,
`app/src/lib/ai/runtime.ts`, `MessagePart.tsx`, operator listener,
auto-approve, and approval-card wiring; its integration tests prove no
compatibility execution path remains after the switch.

This is the buildable `19B-core` commit: adding factories/types does not make a
production parameter mandatory and does not remove any current call path.
Task 16B is the separate `19B-wiring` commit. It modifies the real host,
runtime, runner, operator, auto-approve, message, and approval-card callers in
one atomic buildable slice, injects the actual host-owned action port, and then
removes compatibility execution. There is no committed revision where tests
provide a required port that production cannot construct.

After Task 16B, every canonical operator, auto-approve, card, planner, and
action adapter calls the narrow `JarvisKernelActionPort`; recovery receives only
`JarvisRecoveryApprovalVerifier`. No feature receives
`JarvisApprovalActionCapability` or `JarvisApprovalActionBinder`, and none
imports `JarvisApprovalEngine`, `secretHandlePort.ts`, the credential adapter,
or a locator. The registered executor remains reachable only through a
capability bound to one issued kernel lifecycle. Direct user palette actions
keep their existing non-JARVIS path and receive no secret or kernel-action
capability.

Task 19B also constructs Task 18's production transport-safety authority in
the deep approval module:

```ts
/** @internal Imported only by the trusted schedule/kernel runtime. */
export function createJarvisConsequentialEffectSafetyAuthority(input: {
  approvals: JarvisApprovalRepository;
  artifacts: JarvisArtifactRepository;
  events: JarvisEventRepository;
  providerAttemptEvidence: Pick<JarvisProviderAttemptEvidenceAuthority, 'revalidateFailure'>;
  now: () => number;
}): JarvisConsequentialEffectSafetyAuthority;
```

For a scheduled attempt, the authority first verifies exact
run/request/attempt/provider/model binding by invoking Task 13's
`revalidateFailure()` with the persisted run/attempt/snapshot values. It
requires literal `before_first_response_byte`, `responseStarted: false`,
`chunkCount: 0`, and `actionDispatchCount: 0`; a caller cannot substitute a
boolean or generic error. It then performs bounded account-scoped reads for
approvals and artifacts and scans events strictly after `startedEventSeq`.
It returns a proof only for exact zero counts,
`effectBarrier: open/version: 0`, and a complete journal tail, records the
inspected tail sequence, and rejects a limit boundary as inconclusive.
Revalidation repeats those reads from the stored `throughSeq` through the
current tail. The proof is advisory until Task 18's settlement or retry
transaction verifies the same barrier and exact current tail. The constructor
is not in a public barrel and the schedule runtime receives only the closed
authority interface.

**Exact approval/run/event lifecycle:**

All IDs, execution IDs, evidence references, timestamps, event sequences, and
repeated scope fields below are minted or derived inside the trusted host.
Every operation validates the expected event tail and performs exact readback
before returning.

| Operation                                  | Required state                                                                                     | One atomic three-table result                                                                                                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPendingApprovalInContext`           | run `running`; no open approval; current request/attempt; no cancellation intent; barrier open     | insert `pending`; dirty barrier when applicable; transition `running -> awaiting_approval`; append a fixed transition event followed by the fixed `type: 'approval'`, `status: 'pending'` event whose idempotency key is the approval ID |
| `decideApprovalInContext(...approve)`      | run `awaiting_approval`; exact `pending` approval; current authority                               | change `pending -> approved`; keep run awaiting; append a fixed approval-approved event                                                                                                                                                  |
| `decideApprovalInContext(...deny\|expire)` | run `awaiting_approval`; exact `pending` approval                                                  | change to `denied` or `expired`; transition `awaiting_approval -> running`; append the fixed decision event followed by the fixed run-transition event so the kernel can produce a truthful final response                               |
| `claimApprovedExecutionInContext`          | run `awaiting_approval`; exact `approved`, unexpired, unconsumed approval; current request/attempt | change `approved -> consumed`; transition `awaiting_approval -> running`; claim/increment the effect barrier; append the fixed consumed/claim event carrying internally derived producer-source start and live-ready truth               |
| `claimSafeAutoExecutionInContext`          | run `running`; literal safe auto-approved registration; current request/attempt                    | insert a `consumed` audit approval, claim/increment the effect barrier, and append internally derived claim/source/live-ready truth while the run remains `running`                                                                      |

The table's event ordering is exact and monotonic. A transaction may append
more than one event but never splits its run/approval changes across commits.
Cancellation, completion/failure/timeout, retry sealing, account/host
revocation, duplicate open approval, stale tail, or any table failure rolls
back all rows and calls no secret resolver/executor. Recovery's pending event
therefore exists if and only if its pending row and `awaiting_approval`
transition committed. Tests race every operation against cancellation and each
terminal transition in both commit orders.

Before any external side effect, the lifecycle-bound approval capability calls
`JarvisIssuedApprovalLifecycle.claimApprovedExecution()` (or the exact
auto-approved variant). Task 16B implements that operation in one signal-bound
`jarvis_runs`/`jarvis_events`/`jarvis_approvals` transaction: it revalidates and
atomically consumes the exact approval, dirty/increments the exact current
request/attempt barrier, and appends a `tool` event with
`executionEvidence.kind: 'consequential_effect_claimed'`, the exact
`requestId`/`attemptNumber`, closed owner kind/ID, a non-secret evidence
reference, numeric time, and the matching closed
`producerSourceEvidence`/`phase: 'start'` member. If that atomic claim cannot
commit, approval consumption rolls back and execution does not start. The
returned `JarvisIssuedActionExecution` retains that same account binding through
external execution. Its `recordResult()` appends the matching completed
execution evidence and the same producer identity's `phase: 'result'` member
after result truth; for `terminal`, the private executor transfers only this
issued handle to Task 19C's native-exit owner, which writes the result member;
failure after a claim remains unsafe for same-run retry. All canonical file,
terminal, plugin, MCP, browser, and schedule actions enter through this claim
boundary. Neither the approval engine nor any executor sees
`JarvisAttemptEffectBarrierAuthority`, an event repository, a transaction
authority, or a raw journal writer.

The issued execution handle's complete private surface is exact: immutable
`approval`, `producerKind`, `ownerId`, `startEvent`, and `initialLiveProof`
fields; `beginExternalEffect()`; one-shot `transferTerminalOwnership()`;
`recordResult()`; `recordCancellationVerified()`; `requestCancellation()`; and
`dispose()`. It exposes no Task 18 live-evidence owner, fixed port, append
closure, raw source/event, repository, transaction authority, or other method.
The transferred `JarvisTerminalOwnedExecution` is strictly narrower: only
`recordResult()`, `recordCancellationVerified()`, `requestCancellation()`, and
`dispose()`. Structural and runtime tests assert the terminal store never
receives `beginExternalEffect`, transfer, approval, start-event, initial-proof,
producer, or owner fields.
After the atomic effect/source claim
commits and immediately before a registered action becomes externally active,
Task 16B's handle implementation verifies, commits, reads back, and brands the
exact durable live-evidence row through the same retained binding before the
`busy` node becomes visible. Canonical immutable result truth then commits a
`completed | degraded` row linked to the current proof; a pre-claim rejection
produces no live event/node, and a rejection after a committed start disposes
current-process active visibility without fabricating completion. Task 19C's
terminal store receives only the narrow controller produced by the host-owned
one-shot terminal ownership transfer, never the issued execution;
Task 19D's programmatic browser actions use only `action` with the closed
`tool` category. Availability, request capability, or an approval row alone
never registers a live node. Tests cover forged/foreign/disposed execution
handles, revocation before claim and during settlement, approval-consumption
rollback, forged proof/result, cross-account, stale-row, commit/readback
failure, linked completion, and restart reconstruction through Task 18's read
authority.

`approvalEngine.ts` owns the exact restart-capable verifier group:

```ts
/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisActionLiveEvidenceVerifiers(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
}): Readonly<{
  action: JarvisCanonicalLiveProducerVerifier<'action'>;
  fileAction: JarvisCanonicalLiveProducerVerifier<'file_action'>;
  terminal: JarvisCanonicalLiveProducerVerifier<'terminal'>;
  plugin: JarvisCanonicalLiveProducerVerifier<'plugin'>;
  mcp: JarvisCanonicalLiveProducerVerifier<'mcp'>;
}>;
```

Each verifier reads `resultEventSeq` and accepts only the exact closed owner
kind/identity: the start row must be that attempt's durable effect claim with
the matching closed producer-source start member, and the terminal row must be
the matching immutable `consequential_effect_completed` record with the
matching producer-source result member. The latter contains safe result
identity/reference/state only, never params/output/credentials. It is the
restart authority; no process-local executor registry or catalog availability
can substitute for it.

Direct user palette actions keep their existing path. Built-in JARVIS AI
execution with a `runId` must also carry an approval ID and is routed through
the approval engine. Caller-facing `ActionRunContext` has no secret resolver;
the engine creates `RegisteredActionExecutionContext` only after Task 19A
consumes the canonical approval. Runtime guards still reject an untyped caller
that injects a `resolveSecret` property. The private executor validates exact
declared parameters, rejects unknown keys, redacts all diagnostic values by
default, and logs only action ID, safe error category, duration, run ID, and
approval ID hash prefix. It never logs params, result payloads, handles, raw
errors, paths, command text, or stacks containing user data.

`executeJarvisPlan()` no longer calls `definition.handler` directly. It
requires an injected `executeApprovedStep(step)` callback. `operatorListener`
allocates the canonical run through Task 18, creates canonical approval rows
for approval-required steps before writing cards, and records lifecycle only
through journal events/transitions. `recoveryExecutor` consumes Task 18's
bounded recovery decisions; `await_approval` may only re-present the exact
canonical pending approval, while every `fail_closed` result exposes safe
manual-retry copy and makes zero executor calls. It never resumes
queued/compiling/running work, replays a consumed approval, scans
`JarvisTaskRun`, or mutates legacy lifecycle truth.

`taskRunStore` remains temporarily for UI compatibility through Task 20C, but
Task 19 removes its authority methods from approval and recovery call sites.
Its raw `cancelRun()` writer is removed. Canonical cancellation UI is absent
until Task 16B injects the closed kernel cancellation operation; no legacy
store, feature, or compatibility projection imports the abort registry or
marks a run cancelled from UI intent or signal delivery.

`autoApprovePendingActions()` recognizes only canonical approval call IDs.
The account setting is merely a request to auto-run; it can call
`executeAutoApprovedSafe()` only when the registered action derives `safe`,
has approval policy `never`, the current capability/entitlement binding is
valid, and the engine creates, approves, consumes, and executes the canonical
record. `confirm` and `dangerous` remain pending regardless of the setting.
Unknown/legacy IDs are skipped, never sent directly to `runAction()`.

`ActionApprovalCard` renders the engine's bounded safe presentation. Approve
performs `pending -> approved`, then engine execution; Cancel performs
`pending -> denied`. “Approve all” calls each approval independently and
stops at the first stale/denied/failed item. Card dismissal never cancels a
run, approval never claims success, and message-part status mirrors canonical
state only after repository readback. A canonical `handoff_pending` terminal
outcome renders “Execution handed off”/running state and cannot enter the
settled-success branch until the issued native owner records immutable result
truth.

**TDD and commit**

- [ ] Write red tests proving bridge/store/message state cannot authorize
      execution, historical cards cannot run, direct JARVIS runner calls without
      canonical approval fail closed, planner cannot call a handler directly,
      recovery reads only canonical decisions, and `autoApprove` never executes
      confirm/dangerous/legacy proposals.
- [ ] Add red safety/live tests proving only Task 13's exact-bound verified
      failure before the first response byte/chunk plus zero bounded
      approvals/artifacts/effect claims mints a zero-effect proof; any response
      chunk, action observation, binding/digest mismatch, claim, incomplete
      tail, provider mismatch, or authority error denies retry; every effect
      claim/approval consumption is requested through the issued lifecycle and
      commits before secret resolution or the executor call; no raw
      journal/effect/live port is a dependency; revoked/failed claims make zero
      executor calls; and action capabilities
      append the exact closed producer-source start/result member, verify only
      that member at its committed `resultEventSeq`, commit/read back start and
      previous-proof-linked completion rows before node mutation, reject
      forged/stale/cross-account proofs, reconstruct completed nodes after
      restart, omit orphaned active nodes, and derive nothing from
      availability.
- [ ] Add operator/card tests for canonical run allocation, approval IDs in
      message parts, safe presentation with no handle ID, approve/deny/replay,
      stale capability error, truthful terminal `handoff_pending`, and no settled
      success until verified executor result.
- [ ] Implement and run:
      `npm --prefix app test -- src/lib/jarvis/approvalEngine.test.ts src/lib/jarvis/executionJournal/transportAttempts.test.ts src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts src/features/jarvis-runs/approvalBridge.test.ts src/features/jarvis-runs/taskRunStore.test.ts src/features/jarvis-runs/recoveryExecutor.test.ts src/lib/jarvis/actions src/lib/actions/runner.test.ts src/lib/actions/autoApprove.test.ts src/lib/actions/registryJarvisCore.test.ts src/lib/jarvis/operatorListener.test.ts src/features/chat/ActionApprovalCard.test.tsx`.
- [ ] Run typecheck and stage exactly the twenty-three literal paths below;
      run cached-name, whitespace, secret, and installer gates.

```powershell
git add -- `
  app/src/features/jarvis-runs/approvalBridge.ts `
  app/src/features/jarvis-runs/approvalBridge.test.ts `
  app/src/features/jarvis-runs/taskRunStore.ts `
  app/src/features/jarvis-runs/taskRunStore.test.ts `
  app/src/features/jarvis-runs/recoveryExecutor.ts `
  app/src/features/jarvis-runs/recoveryExecutor.test.ts `
  app/src/lib/jarvis/approvalEngine.ts `
  app/src/lib/jarvis/approvalEngine.test.ts `
  app/src/lib/jarvis/actions/catalog.ts `
  app/src/lib/jarvis/actions/catalog.test.ts `
  app/src/lib/jarvis/actions/planner.ts `
  app/src/lib/jarvis/actions/planner.test.ts `
  app/src/lib/actions/types.ts `
  app/src/lib/actions/runner.ts `
  app/src/lib/actions/runner.test.ts `
  app/src/lib/actions/autoApprove.ts `
  app/src/lib/actions/autoApprove.test.ts `
  app/src/lib/actions/registryJarvisCore.ts `
  app/src/lib/actions/registryJarvisCore.test.ts `
  app/src/lib/jarvis/operatorListener.ts `
  app/src/lib/jarvis/operatorListener.test.ts `
  app/src/features/chat/ActionApprovalCard.tsx `
  app/src/features/chat/ActionApprovalCard.test.tsx
git commit -m "feat(jarvis): route actions through canonical approvals"
```

### Task 19C — Verified terminal cancellation

**Exact files**

- Modify: `app/src/features/terminals/terminalExecutionStore.ts`
- Modify: `app/src/features/terminals/terminalExecutionStore.test.ts`
- Modify: `app/src/features/terminals/terminalCommandQueue.ts`
- Modify: `app/src/features/terminals/terminalCommandQueue.stress.test.ts`
- Modify: `app/src/features/terminals/TerminalsPage.tsx`
- Modify: `app/src/features/terminals/TerminalsPage.command.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Create: `app/src/features/terminals/TerminalView.execution.test.tsx`
- Modify: `app/src/features/terminals/TileGrid.tsx`
- Modify: `app/src/features/terminals/TileGrid.refit.test.tsx`
- Modify: `app/src/lib/actions/registryJarvisCore.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.test.ts`
- Modify: `app/src/features/chat/ActionApprovalCard.tsx`
- Modify: `app/src/features/chat/ActionApprovalCard.test.tsx`
- Modify: `app/src-tauri/src/terminal.rs`

Queue items carry canonical `runId`, a stable `executionId`, and one stable
opaque `cancellationToken`; they never carry an authority handle. Task 19B
never passes `JarvisIssuedActionExecution` to a store. The approval engine calls
`execution.transferTerminalOwnership()` once; that host-owned WeakMap
transition gives `terminalExecutionStore.ts` only a narrow
`JarvisTerminalOwnedExecution` controller and returns the exact acceptance
receipt to the engine. The store keys that controller by `executionId`, verifies
the transferred identity, and registers the queue owner with Task 18 before
inserting or exposing the serializable item; if transfer, registration, or
insert fails, enqueue fails with no visible item and ownership rolls back.
Neither the issued execution nor controller is placed in React, Zustand, queue
storage, IndexedDB, IPC, or a public barrel. `TerminalsPage` owns the next
handoff. Claiming an item is an exclusive exact-item operation that marks it
claimed and transfers/replaces the same queue-owner registration before the
item disappears from queue storage. Cancel-before-claim holds that same lock,
atomically replaces the exact item with a durable non-runnable cancellation
tombstone, then commits the bound `queued -> cancelled` run/event CAS;
`queued_tombstoned` is minted only after both commits. Claim-before-cancel or
bulk drain uses normal handoff. Tombstone/CAS conflict restores the exact
original runnable item before returning `handoff_pending`; an unprovable
rollback stays fail-closed as `delivery_error` and cannot route to a later
owner. After terminal CAS, no late owner receives the request. No code infers
queued cancellation from a missing item, queue length, or local status.

The canonical spawn passes the stable token to `terminal_spawn`. Native
`PtyHandle` owns a testable lifecycle arbiter shared by the reader and killer.
The IPC request keeps `cancellationToken?: string` optional for existing
manual/legacy cleanup callers. A matching token is mandatory only for
canonical JARVIS cancellation verification. `terminal_kill` returns a typed
result:

```ts
export type NativeTerminalKillRequest = {
  sessionId: string;
  cancellationToken?: string;
};

export type NativeTerminalKillResult = {
  kind: 'missing' | 'already_exited' | 'delivery_rejected' | 'signal_delivered';
  requestKind: 'canonical_cancellation' | 'manual_termination';
  cancellationToken?: string;
};

export type NativeTerminalExitPayload = {
  sessionId: string;
  code: number | null;
  reason: 'natural_exit' | 'accepted_cancellation' | 'manual_termination';
  cancellationToken?: string;
};
```

`terminal_kill` never removes the handle or aborts the reader task before
lifecycle truth is emitted. The arbiter holds an exit observed during kill
delivery until the delivery result is known, emits exactly one exit payload,
and removes the session only after finalization. A kill error returns
`delivery_rejected`; a missing session is `missing`; an exit that already won
is `already_exited`; only a successful native signal delivery returns
`signal_delivered`. A tokenless request remains supported and is labelled
`manual_termination`; it can stop the PTY but can never verify canonical
`cancelled`. The exit payload uses
`accepted_cancellation` only when the accepted native token exactly matches
the run's stored token. Wrong/stale tokens are `delivery_rejected`; missing
tokens use the distinct manual path. Local UI intent, timeout intent, manual
termination, and signal delivery alone cannot verify `cancelled`.

`TerminalView`, `TileGrid`, the card, the timeout path, and
`registryJarvisCore` never call
`markTerminalExecution(..., 'cancelled')` locally. The matching native
`terminal://exit` callback is the sole cancellation verifier and calls only the
registered handle's `recordCancellationVerified()`; it never imports or invokes
a raw transition/event repository. That bound method owns the canonical CAS.
`natural_exit` maps `0 -> completed`, `nonzero/null -> failed` through the same
handle's `recordResult()` path. `manual_termination` is non-verifying and maps a
still-nonterminal canonical run to truthful failure/manual-stop handling, never
`cancelled`. Any close/
stop control attached to a canonical run routes through Task 18 and supplies
the stored token only through the registered native owner. Existing
tokenless/manual callers may remain source-compatible, but they cannot enter
the canonical cancellation verifier.
If natural exit wins before cancellation acceptance, that result remains and
the later cancellation CAS loses. The reader remains alive long enough to
emit this truth in every race.

For a canonical JARVIS terminal execution, Task 19B's issued lifecycle has
already committed the
`terminal`/`phase: 'start'` producer source member. Before publishing terminal
live completion, `terminalExecutionStore.ts` asks the retained handle to append
exactly one idempotent safe terminal-result event carrying the matching identity's
`producerSourceEvidence` with `phase: 'result'`, stable result reference,
`completed | degraded` state, and numeric native-exit observation time. It
contains no command, transcript, path, environment, or raw error. The Task 19B
terminal verifier re-reads only that exact row/sequence; local execution-store
status, a kill result, or the run transition alone cannot substitute. A source
append/readback failure preserves truthful lifecycle handling but produces no
completed/degraded live node. Every committed, conflict, revoked, native-error,
and thrown outcome exhaustively handles the outer authority result and disposes
the private handle exactly once after settlement. If the process restarts or
the account binding revokes before native exit, there is no reconstructable
handle; recovery reports ambiguous/manual-review truth and makes no raw fallback
write or fabricated live node.

Tests cover cancel-before-claim, claim-before-cancel, drained-before-session
with late-owner delivery, exact durable tombstone before terminal CAS,
tombstone/status CAS conflict, exact rollback and rollback failure,
post-terminal late-owner denial, adjacent-item isolation, wrong/stale token, `missing`,
`already_exited`, `delivery_rejected`, `signal_delivered` remaining
nonterminal, exit-confirmed matching-token cancellation, natural completion
winning, tokenless manual termination preserving compatibility without
canonical cancellation, canonical-run UI close using Task 18,
exit-during-kill arbitration, duplicate exit events, late completion after
`cancelled`, timeout delivery without a local terminal claim, exact terminal
source-result idempotency/readback, outer authority-revoked result mapping,
exactly-once issued-handle transfer/disposal, restart with no handle failing
closed, wrong/missing source-member denial, and no
terminal output in source evidence.
`terminal.rs` owns focused Rust reducer/arbiter tests for every kill result,
exit-during-delivery ordering, exact-once exit emission, token matching, and
reader/session-map finalization.

Run
`npm --prefix app test -- src/features/terminals/terminalCommandQueue.stress.test.ts src/features/terminals/TerminalsPage.command.test.ts src/features/terminals/terminalExecutionStore.test.ts src/features/terminals/TerminalView.execution.test.tsx src/features/terminals/TileGrid.refit.test.tsx src/lib/actions/registryJarvisCore.test.ts src/features/chat/ActionApprovalCard.test.tsx`,
`npm --prefix app run typecheck`,
`cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`, and
`cargo test --manifest-path app/src-tauri/Cargo.toml terminal`.

```powershell
git add -- `
  app/src/features/terminals/terminalExecutionStore.ts `
  app/src/features/terminals/terminalExecutionStore.test.ts `
  app/src/features/terminals/terminalCommandQueue.ts `
  app/src/features/terminals/terminalCommandQueue.stress.test.ts `
  app/src/features/terminals/TerminalsPage.tsx `
  app/src/features/terminals/TerminalsPage.command.test.ts `
  app/src/features/terminals/TerminalView.tsx `
  app/src/features/terminals/TerminalView.execution.test.tsx `
  app/src/features/terminals/TileGrid.tsx `
  app/src/features/terminals/TileGrid.refit.test.tsx `
  app/src/lib/actions/registryJarvisCore.ts `
  app/src/lib/actions/registryJarvisCore.test.ts `
  app/src/features/chat/ActionApprovalCard.tsx `
  app/src/features/chat/ActionApprovalCard.test.tsx `
  app/src-tauri/src/terminal.rs
git commit -m "fix(jarvis): verify native terminal cancellation"
```

### Task 19D — Browser Operator canonical adapter

This is a pure, independently testable adapter slice. It defines the mapping
from Task 6's immutable reviewed browser request record to Task 19B's injected
narrow action port, but it does not mount UI/store wiring or execute CDP.

**Exact files**

- Create: `app/src/features/browser/browserApprovalAdapter.ts`
- Create: `app/src/features/browser/browserApprovalAdapter.test.ts`

The adapter accepts only an immutable Task 6 record plus a canonical parent-run
reference and returns calls to the injected `JarvisKernelActionPort`. It derives
the literal action version, canonical parameters, target, risk, and capability
from the record; it cannot accept a journal writer, approval repository, raw
engine, CDP client, entitlement boolean, credential, or generic executor. Safe
definitions route to `executeAutoApprovedSafe()`; `confirm`/`dangerous` create
the persisted approval flow; `user_only` always rejects programmatic use. The
adapter is not mounted in Task 19D, so this slice performs no browser action.

Use this exact focused command for RED and GREEN, then run root typecheck:

```powershell
npm --prefix app test -- src/features/browser/browserApprovalAdapter.test.ts src/lib/jarvis/approvalEngine.test.ts
npm run typecheck
```

Tests prove exact record-to-v1 mapping, safe versus approval routing, parent
account/run inheritance, canonical params/target/version preservation,
`user_only` rejection, secret-shaped typing rejection, no raw engine/CDP/
repository dependency, and zero execution during adapter construction.
Task 16B owns all seven browser UI/store/action files, mounts this adapter, and
removes the temporary Task 6 programmatic compatibility path.

```powershell
git add -- `
  app/src/features/browser/browserApprovalAdapter.ts `
  app/src/features/browser/browserApprovalAdapter.test.ts
git commit -m "feat(browser): define canonical Jarvis approval adapter"
```

## Task 20 — Versioned artifacts and legacy compatibility shutdown

Task 20 lands as an artifact contract slice, a concrete producer-adapter
slice, and then the compatibility shutdown slice.

### Task 20A — Artifact v1 contract, backing verification, and persistence

**Private receipt-authority correction (normative):**

Task 20A compiles and tests independently of Task 20B. The public contract
contains closed artifact drafts and `JarvisArtifactV1`; it contains no receipt,
issuer, `verified` boolean, generic executor string, or constructible verified
binding.

Keep these signatures private to `artifactReceipts.ts` and its trusted
composition tests. Do not re-export them from any barrel:

```ts
/** @internal Deep-module composition type; never in a public barrel. */
export type CanonicalArtifactProducerId =
  | 'provider_response'
  | 'file_action_result'
  | 'terminal_exit'
  | 'plugin_result'
  | 'mcp_result'
  | 'schedule_result';

/** @internal Deep-module composition type; never in a public barrel. */
export type ArtifactReceiptBinding = {
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  artifactId: string;
  producerId: CanonicalArtifactProducerId;
  resultRef: string;
  artifactDigest: string;
  verifiedAt: number;
};

/** @internal Producer metadata before canonical artifact bytes are known. */
export type ArtifactPreDigestBinding = Omit<ArtifactReceiptBinding, 'artifactDigest'>;

const artifactVerificationReceiptBrand: unique symbol = Symbol(
  'jarvis.artifact-verification-receipt',
);
const verifiedArtifactBindingBrand: unique symbol = Symbol('jarvis.verified-artifact-binding');

/** @internal Deep-module composition type; never in a public barrel. */
export type ArtifactVerificationReceipt = Readonly<{
  receiptId: string;
  issuedAt: number;
  [artifactVerificationReceiptBrand]: true;
}>;

/** @internal Deep-module composition type; never in a public barrel. */
export type VerifiedArtifactBinding = Readonly<
  ArtifactReceiptBinding & {
    receiptId: string;
    issuedAt: number;
    [verifiedArtifactBindingBrand]: true;
  }
>;

/** @internal Deep-module composition type; never in a public barrel. */
export type VerifyAndBindReceiptInput = {
  receipt: ArtifactVerificationReceipt;
  binding: ArtifactReceiptBinding;
};

/** @internal Deep-module composition type; never in a public barrel. */
export type PrivateArtifactReceiptIssuer = {
  issueReceipt(binding: ArtifactReceiptBinding): ArtifactVerificationReceipt;
  verifyAndBindReceipt(input: VerifyAndBindReceiptInput): VerifiedArtifactBinding | null;
};

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export function createArtifactReceiptAuthority(input: {
  randomUUID: () => string;
  now: () => number;
}): PrivateArtifactReceiptIssuer;
```

Task 20A adds one constructible deep-module boundary rather than leaving two
non-exported functions in unrelated modules:

```ts
/** @internal Imported only by artifactRuntime.ts and focused tests. */
export type JarvisArtifactRuntimeInternals = Readonly<{
  materializeVerified(input: {
    binding: Omit<ArtifactPreDigestBinding, 'artifactId'>;
    draft: JarvisArtifactDraft;
  }): Promise<JarvisArtifactV1>;
  consumePendingForCommit(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    artifacts: readonly JarvisArtifactV1[];
  }): void;
}>;

/** @internal Imported only by artifactRuntime.ts and focused tests. */
export function createJarvisArtifactRuntimeInternals(input: {
  randomUUID: () => string;
  now: () => number;
}): JarvisArtifactRuntimeInternals;
```

`artifactRuntimeInternals.ts` alone closes over
`createArtifactReceiptAuthority()`, the internal canonicalizer/material brand,
the internal verified normalizer, and the pending object-identity registry. To
make this constructible,
`artifactReceipts.ts` and `artifactNormalizer.ts` export their constructors
only as `@internal` deep-module symbols; no public barrel exports them.
`artifactRuntimeInternals.test.ts` scans static imports with a strict ladder:
`artifactNormalizer.ts` may use exactly one `import type` from
`artifactReceipts.ts` naming only `ArtifactPreDigestBinding` and
`VerifiedArtifactBinding`, because its exact internal signatures consume those
receipt-owned types. It may not import the receipt issuer, receipt value/brand,
binding brand, registry, or any runtime value from `artifactReceipts.ts`.
Only `artifactRuntimeInternals.ts` may import the raw receipt issuer together
with those binding types, the canonical-material brand/canonicalizer, internal
verified normalizer, and pending-identity primitives. Later
`artifactRuntime.ts` may import only
`createJarvisArtifactRuntimeInternals()` and its one internal return type; and
later `kernelRuntime.ts` may import only Task 20B's
`createJarvisArtifactKernelComposition()` plus Task 16B's internal
kernel-commit factory.
It may not import any Task 20A raw artifact internal. No other production
module or public barrel may import any constructor/type on this ladder, and an
`import()` type query, re-export, or runtime import cannot bypass the one
explicit type-only exception. Task 20A compiles and tests this boundary
independently with no Task 20B or Task 16B module present.
The static test parses the `artifactNormalizer.ts` import declaration, requires
`importClause.isTypeOnly === true`, and requires its sorted named imports to be
exactly `ArtifactPreDigestBinding,VerifiedArtifactBinding`; adding any third
name or value import fails.

`materializeVerified()` is the single authority operation that breaks the
former ID/digest/receipt cycle. It accepts pre-digest producer metadata without
an artifact ID plus the draft and runs under a private per-producer-result
serialization lock:

1. mint an account-scoped `jart_${randomUUID()}` ID inside the trusted runtime,
   construct `ArtifactPreDigestBinding`, then call
   `canonicalizeArtifactDraftInternal()` once and obtain the branded material
   plus its digest;
2. construct the full `ArtifactReceiptBinding` internally by adding exactly
   that digest to the pre-digest binding;
3. issue a fresh receipt and consume/bind it against that full binding;
4. synchronously call `normalizeVerifiedArtifactInternal()` with the same
   branded material and verified binding; and
5. only after every check succeeds insert that returned object identity in the
   private pending-commit registry and return its detached value.

No draft, feature, model, UI, or producer adapter supplies an artifact ID or
digest, imports either normalizer entry, or sees an intermediate
receipt/binding/material. Once the
canonicalization await completes, steps 2–5 contain no await, callback, or
untrusted re-entry. Any failure removes/revokes an issued-but-uncommitted
receipt and leaves no pending identity or artifact row. A concurrent call for
the same account/run/producer-result is serialized and must create its own material,
digest, receipt, and returned object. Tests inject failure after each step and
prove all-or-nothing authority state.

`ArtifactVerificationReceipt` is an opaque runtime-issued value backed by a
private receipt registry. `verifyAndBindReceipt()` succeeds exactly once and
only when account ID, run ID, artifact ID, closed producer ID, stable result
reference, request ID, attempt number, artifact digest, and numeric
`verifiedAt` all match the issued binding. It returns a branded
`VerifiedArtifactBinding`; callers cannot
construct one with a boolean, deserialize one, substitute an artifact ID or
digest, rebind one across runs/results, or replay it. `issuedAt` and
`verifiedAt` are Unix milliseconds. Neither receipt nor verified binding is
serialized, persisted, logged, placed in a message/event, or returned through
any artifact producer adapter or kernel result.

Run this exact command once for RED and again for GREEN, followed by root
typecheck before staging:

```powershell
npm --prefix app test -- src/lib/jarvis/contracts/validators.test.ts src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/jarvis/artifactReceipts.test.ts src/lib/jarvis/artifactNormalizer.test.ts src/lib/jarvis/artifactRuntimeInternals.test.ts
npm run typecheck
```

**Exact files**

- Modify: `app/src/lib/jarvis/contracts/execution.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.test.ts`
- Modify: `app/src/lib/jarvis/contracts/index.ts`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/jarvisMappers.ts`
- Modify: `app/src/lib/db/jarvisMappers.test.ts`
- Modify: `app/src/lib/db/jarvisRepositories.ts`
- Modify: `app/src/lib/db/jarvisRepositories.test.ts`
- Create: `app/src/lib/jarvis/artifactReceipts.ts`
- Create: `app/src/lib/jarvis/artifactReceipts.test.ts`
- Create: `app/src/lib/jarvis/artifactNormalizer.ts`
- Create: `app/src/lib/jarvis/artifactNormalizer.test.ts`
- Create: `app/src/lib/jarvis/artifactRuntimeInternals.ts`
- Create: `app/src/lib/jarvis/artifactRuntimeInternals.test.ts`

```ts
export type JarvisArtifactState = 'ready' | 'partial' | 'quarantined';

export interface JarvisArtifactV1 extends JarvisArtifact {
  schemaVersion: 1;
  requestId: string;
  attemptNumber: number;
  state: JarvisArtifactState;
  contentHash?: string;
  sizeBytes?: number;
  preview?: {
    kind: 'text' | 'image' | 'none';
    text?: string;
    truncated: boolean;
    sizeBytes: number;
  };
  localReference?: {
    kind: 'path' | 'blob_key' | 'message_part';
    value: string;
  };
}

export type JarvisArtifactDraftBacking =
  | { kind: 'uri'; uri: string }
  | {
      kind: 'local_reference';
      localReference: NonNullable<JarvisArtifactV1['localReference']>;
      content?: string | Uint8Array;
    }
  | {
      kind: 'producer_result';
      content?: string | Uint8Array;
    };

export type JarvisArtifactDraft = Readonly<{
  artifact: Omit<
    JarvisArtifactV1,
    | 'id'
    | 'schemaVersion'
    | 'runId'
    | 'requestId'
    | 'attemptNumber'
    | 'state'
    | 'contentHash'
    | 'sizeBytes'
    | 'preview'
    | 'localReference'
    | 'uri'
  > & {
    state?: JarvisArtifactState;
  };
  backing: JarvisArtifactDraftBacking;
}>;

const canonicalArtifactMaterialBrand: unique symbol = Symbol('jarvis.canonical-artifact-material');

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export type CanonicalArtifactMaterial = Readonly<{
  artifact: JarvisArtifactV1;
  artifactDigest: string;
  [canonicalArtifactMaterialBrand]: true;
}>;

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export function canonicalizeArtifactDraftInternal(input: {
  binding: ArtifactPreDigestBinding;
  draft: JarvisArtifactDraft;
}): Promise<CanonicalArtifactMaterial>;

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export function normalizeVerifiedArtifactInternal(input: {
  binding: VerifiedArtifactBinding;
  material: CanonicalArtifactMaterial;
}): JarvisArtifactV1;
```

`artifactNormalizer.ts` exports the closed draft and v1 artifact contracts,
but both canonical-material entries are internal-only. The canonicalizer takes
only `ArtifactPreDigestBinding` plus the draft, applies every backing/secret/
preview rule once, constructs the detached candidate, hashes the exact
canonical candidate bytes, and returns branded `CanonicalArtifactMaterial`.
The verified normalizer then requires both the branded material and branded
receipt binding, checks the material digest against
`VerifiedArtifactBinding.artifactDigest`, repeats exact
account/run/request/attempt/artifact/producer/result binding, clones the
artifact, and returns it synchronously. It never accepts a draft at the
receipt-binding step and never recomputes a different representation. A public
caller cannot supply a receipt, canonical material, `VerifiedArtifactBinding`,
`verified: true`, or a generic producer identity.

`artifactReceipts.ts` owns a private runtime receipt registry in addition to
the compile-time brands. Task 20A's `artifactRuntimeInternals.ts` alone closes
over the issuer, canonical-material/normalizer entries, and private
pending-commit identity registry. Task 20B receives only the bound
`materializeVerified()`/`consumePendingForCommit()` internals capability and
returns only six named producer adapters. A forged literal/cast, unknown
receipt, cross-account/run/producer use, changed result reference, changed
artifact ID/digest, second binding, or other replay fails before a candidate
becomes commit-eligible.

Extend `JarvisArtifactRow` with `schema_version`, `request_id`,
`attempt_number`, `state`, `content_hash`, `size_bytes`, `preview`, and
`local_reference`; do not change the V3 object store declaration. Change the
artifact repository to accept/return
`JarvisArtifactV1`, verify parent-account ownership, and make `putForRun()`
immutable/idempotent. Its write authority is internal: mutation requires the
private commit verifier created by the artifact composition. UI, model,
message, source, and arbitrary repository callers receive read-only artifact
access only.

Backing rules:

- `uri` must be a parseable allowlisted `https:`, `asset:`, or trusted local
  application URI. A bare label is not backing.
- A local reference must be non-empty and point to a path/blob/message part
  produced by the verified producer evidence. The normalizer does not read
  arbitrary paths to “prove” them.
- A `producer_result` takes its closed producer identity and stable non-secret
  `resultRef` only from Task 20B evidence; normalize that reference to
  `{ kind: 'message_part', value: resultRef }` unless a stronger local
  reference is supplied.
- A valid runtime-issued private binding is mandatory. Public
  `verified: true`, source attachments, retrieval hits, planned capability
  acknowledgements, missing targets, “queued” submissions, and unverified
  provider prose are rejected with safe typed categories.
- Hash exact content bytes with SHA-256 when content exists. `sizeBytes` is
  exact byte length. Text preview is UTF-8, at most `16_384` bytes, and sets
  `truncated`; image preview stores metadata/reference only, never inline raw
  image bytes.
- `partial` requires real partial backing. `quarantined` is allowed only for a
  verified metadata-only executor result whose bytes were withheld upstream;
  it uses `preview.kind: 'none'` and stores neither rejected bytes, preview
  text, content hash, nor secret-shaped summary.
- Any inline secret-bearing content or summary rejects the candidate and
  persists no artifact. Do not “redact and save” rejected bytes.
- `sourceRefs` preserve provenance, but an input source is never promoted to
  an output without verified backing.

**TDD and commit**

- [ ] Add red receipt tests for runtime object identity, forged casts,
      exact account/run/artifact ID/digest matching, numeric timestamps,
      cross-account/run/producer/result mismatch, and no rebinding; confirm
      red.
- [ ] Add red internal-composition and import-boundary tests proving one
      constructible authority alone accepts pre-digest metadata and closes
      canonicalization/digest, receipt issue/verification, normalization, and
      pending identity; failure after every internal step leaves no receipt or
      pending identity; no public barrel or unauthorized production module
      imports a raw issuer, binding, canonical material/normalizer, or commit consumer; the later
      artifact runtime imports only the internals factory; the later kernel
      runtime imports no Task 20A raw internal and only the Task 20B runtime
      factory plus Task 16B commit factory; and Task 20A compiles without Task
      20B.
- [ ] Add red normalizer tests for all eight kinds; URI/local/producer backing; exact
      hashes and byte sizes; UTF-8 truncation; partial/quarantined metadata;
      source-only/capability-only/queued rejection; secret content; account
      isolation; immutable retry; and detached mapping.
- [ ] Implement and run:
      `npm --prefix app test -- src/lib/jarvis/artifactNormalizer.test.ts src/lib/jarvis/contracts/validators.test.ts src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts`.
- [ ] Run typecheck, stage exactly fifteen paths, and run cached-name,
      whitespace, secret, and installer checks.

```powershell
git add -- `
  app/src/lib/jarvis/contracts/execution.ts `
  app/src/lib/jarvis/contracts/validators.ts `
  app/src/lib/jarvis/contracts/validators.test.ts `
  app/src/lib/jarvis/contracts/index.ts `
  app/src/lib/db/schema.ts `
  app/src/lib/db/jarvisMappers.ts `
  app/src/lib/db/jarvisMappers.test.ts `
  app/src/lib/db/jarvisRepositories.ts `
  app/src/lib/db/jarvisRepositories.test.ts `
  app/src/lib/jarvis/artifactReceipts.ts `
  app/src/lib/jarvis/artifactReceipts.test.ts `
  app/src/lib/jarvis/artifactNormalizer.ts `
  app/src/lib/jarvis/artifactNormalizer.test.ts `
  app/src/lib/jarvis/artifactRuntimeInternals.ts `
  app/src/lib/jarvis/artifactRuntimeInternals.test.ts
git commit -m "feat(jarvis): normalize verified artifacts"
```

### Task 20B — Bind receipts to real executor producer adapters

**Closed producer-evidence correction (normative):**

Define these six exported, closed evidence records in
`artifactProducerAdapters.ts`. They contain only non-secret canonical
producer evidence and numeric timestamps. They are the only evidence shapes
accepted by the six named adapters:

```ts
export type CanonicalProviderEvidence = Readonly<{
  producerId: 'provider_response';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'completed' | 'partial';
  verifiedAt: number;
  providerId: string;
  modelId: string;
  modelSnapshotRef: string;
}>;

export type CanonicalFileActionEvidence = Readonly<{
  producerId: 'file_action_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'succeeded' | 'partial';
  verifiedAt: number;
  actionId: string;
  actionVersion: number;
}>;

export type CanonicalTerminalEvidence = Readonly<{
  producerId: 'terminal_exit';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'exited' | 'partial';
  verifiedAt: number;
  sessionId: string;
  executionId: string;
}>;

export type CanonicalPluginEvidence = Readonly<{
  producerId: 'plugin_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'succeeded' | 'partial';
  verifiedAt: number;
  pluginId: string;
  invocationId: string;
}>;

export type CanonicalMcpEvidence = Readonly<{
  producerId: 'mcp_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'succeeded' | 'partial';
  verifiedAt: number;
  serverId: string;
  toolName: string;
  invocationId: string;
}>;

export type CanonicalScheduleEvidence = Readonly<{
  producerId: 'schedule_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'completed' | 'partial';
  verifiedAt: number;
  scheduleId: string;
  occurrenceId: string;
}>;

export type CanonicalArtifactEvidence =
  | CanonicalProviderEvidence
  | CanonicalFileActionEvidence
  | CanonicalTerminalEvidence
  | CanonicalPluginEvidence
  | CanonicalMcpEvidence
  | CanonicalScheduleEvidence;
```

Each adapter receives its producer's real terminal/partial result and preserves
that producer-issued stable `resultRef`; it never generates or rebinds the
reference. `partial` is accepted only after that producer has emitted a real
persistable partial result. Reject pending, queued, proposed, availability,
planned, synthetic, or cross-account/run evidence. Do not accept a generic
executor string or caller-supplied producer identity.

Each producer also supplies one private verification authority at trusted
composition. The authority re-reads or validates the producer's canonical
result and returns the same closed evidence only when the account, run,
producer-specific identity, stable result reference, terminal/partial state,
and numeric verification time are genuine:

```ts
export interface CanonicalProviderEvidenceAuthority {
  verify(evidence: CanonicalProviderEvidence): Promise<CanonicalProviderEvidence | null>;
}
export interface CanonicalFileActionEvidenceAuthority {
  verify(evidence: CanonicalFileActionEvidence): Promise<CanonicalFileActionEvidence | null>;
}
export interface CanonicalTerminalEvidenceAuthority {
  verify(evidence: CanonicalTerminalEvidence): Promise<CanonicalTerminalEvidence | null>;
}
export interface CanonicalPluginEvidenceAuthority {
  verify(evidence: CanonicalPluginEvidence): Promise<CanonicalPluginEvidence | null>;
}
export interface CanonicalMcpEvidenceAuthority {
  verify(evidence: CanonicalMcpEvidence): Promise<CanonicalMcpEvidence | null>;
}
export interface CanonicalScheduleEvidenceAuthority {
  verify(evidence: CanonicalScheduleEvidence): Promise<CanonicalScheduleEvidence | null>;
}

export type CanonicalArtifactEvidenceAuthoritySlot<
  P extends CanonicalArtifactEvidence['producerId'],
  A,
> =
  | Readonly<{ state: 'ready'; producerId: P; authority: A }>
  | Readonly<{
      state: 'unavailable';
      producerId: P;
      reason: 'producer_task_not_landed';
    }>;

export type CanonicalArtifactEvidenceAuthorities = Readonly<{
  provider: CanonicalArtifactEvidenceAuthoritySlot<
    'provider_response',
    CanonicalProviderEvidenceAuthority
  >;
  fileAction: CanonicalArtifactEvidenceAuthoritySlot<
    'file_action_result',
    CanonicalFileActionEvidenceAuthority
  >;
  terminal: CanonicalArtifactEvidenceAuthoritySlot<
    'terminal_exit',
    CanonicalTerminalEvidenceAuthority
  >;
  plugin: CanonicalArtifactEvidenceAuthoritySlot<'plugin_result', CanonicalPluginEvidenceAuthority>;
  mcp: CanonicalArtifactEvidenceAuthoritySlot<'mcp_result', CanonicalMcpEvidenceAuthority>;
  schedule: CanonicalArtifactEvidenceAuthoritySlot<
    'schedule_result',
    CanonicalScheduleEvidenceAuthority
  >;
}>;

export interface CanonicalArtifactEvidenceAdapter<E extends CanonicalArtifactEvidence> {
  materialize(input: { evidence: E; draft: JarvisArtifactDraft }): Promise<JarvisArtifactV1>;
}

export type JarvisArtifactPipeline = Readonly<{
  provider: CanonicalArtifactEvidenceAdapter<CanonicalProviderEvidence>;
  fileAction: CanonicalArtifactEvidenceAdapter<CanonicalFileActionEvidence>;
  terminal: CanonicalArtifactEvidenceAdapter<CanonicalTerminalEvidence>;
  plugin: CanonicalArtifactEvidenceAdapter<CanonicalPluginEvidence>;
  mcp: CanonicalArtifactEvidenceAdapter<CanonicalMcpEvidence>;
  schedule: CanonicalArtifactEvidenceAdapter<CanonicalScheduleEvidence>;
}>;

/** @internal Supplied only by one issued kernel lifecycle. */
export interface JarvisArtifactEffectClaimCapability {
  claim(input: JarvisAttemptEffectClaimInput): Promise<JarvisAttemptEffectClaimResult>;
}

/** @internal Captured only inside the trusted kernel composition. */
export type JarvisBoundArtifactPipelineIssuer = (
  effectClaims: JarvisArtifactEffectClaimCapability,
) => JarvisArtifactPipeline;

type PrivateArtifactCommitVerifier = {
  consumeForCommit(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    artifacts: readonly JarvisArtifactV1[];
  }): void;
};

type JarvisArtifactCommitBinder<TCommit> = (input: {
  consumeArtifactsForCommit: PrivateArtifactCommitVerifier['consumeForCommit'];
}) => TCommit;

export type JarvisArtifactKernelComposition<TCommit> = Readonly<{
  issueBoundArtifactPipeline: JarvisBoundArtifactPipelineIssuer;
  commitKernelTurn: TCommit;
}>;

/**
 * Deep-module composition factory. Omitted from every public barrel and
 * called in production only by Task 16B's kernelRuntime.ts.
 */
export function createJarvisArtifactKernelComposition<TCommit>(input: {
  randomUUID: () => string;
  now: () => number;
  authorities: CanonicalArtifactEvidenceAuthorities;
  bindKernelCommit: JarvisArtifactCommitBinder<TCommit>;
}): JarvisArtifactKernelComposition<TCommit>;
```

`artifactRuntime.ts` is the named Task 20B composition root. It creates the
Task 20A internals, constructs the private six-adapter issuer, and
invokes `bindKernelCommit()` synchronously while the private consume closure
is still inside the factory. It returns exactly
`issueBoundArtifactPipeline` plus the already-bound `commitKernelTurn` to Task
16B's closed runtime; no second artifact factory or binder exists. Both values
remain lexical inside the kernel host and are never properties of its public
runtime/client surface. Task 20B tests construct the composition with a fake
commit binder so this slice compiles independently; Task 16B's
`kernelRuntime.ts` is the sole production caller and supplies the real atomic
commit factory. Schedule/Hive code, UI, model, feature callers, and public
barrels never receive the pipeline issuer, effect-claim port, verifier, receipt registry, receipt, verified
binding, normalizer entry, or pending identity registry.

Task 20B composes five `ready` slots and the exact schedule slot
`{ state: 'unavailable', producerId: 'schedule_result', reason:
'producer_task_not_landed' }`. The schedule adapter exists in the closed
pipeline but an unavailable slot rejects before effect claim, receipt issue,
materialization, or pending-identity mutation. Task 17 replaces only that slot
with its real `ready` schedule authority through the same composition; it does
not create a second adapter, issuer, or receipt path.

For every `materialize()` call the named adapter is first bound by
`kernelRuntime.ts` to the exact issued lifecycle's effect-claim capability; it:

1. requires its matching slot to be `ready` and invokes only that authority;
2. rejects a null/mismatched result;
3. calls that bound Task 18 attempt-effect capability with the verified evidence's exact
   account/run/request/attempt and `ownerKind: 'artifact'`; for a scheduled run
   the barrier claim and event must commit before any receipt is issued, while
   a verified non-scheduled run returns the explicit `not_applicable` result;
4. constructs only the ID-less producer binding basis from the verified
   evidence; and
5. calls Task 20A `materializeVerified({ binding, draft })` exactly once, which
   privately mints the account-scoped `jart_` ID, canonicalizes, computes the
   digest, issues/consumes the receipt, normalizes, records the exact pending
   object identity, and returns the detached `JarvisArtifactV1`.

The adapter cannot import a normalizer/receipt symbol, cannot pre-normalize the
draft, cannot supply a digest, and cannot split or reorder Task 20A's authority
operation. A barrier failure occurs before `materializeVerified()` and leaves
zero receipt/material/pending state.

`consumeForCommit()` accepts each pending identity once for the same
account/run and then removes it. If the IndexedDB transaction subsequently
rolls back, those identities remain consumed: the caller must re-read the
canonical producer result and rerun the named adapter, which mints a **fresh
receipt**. Reusing the old `JarvisArtifactV1` after a database failure is
rejected. An exact database retry may return the already-persisted immutable
row only after this fresh evidence/receipt path succeeds again.

Use this exact focused command for RED and GREEN, then run root typecheck
before staging:

```powershell
npm --prefix app test -- src/lib/jarvis/artifactRuntime.test.ts src/lib/jarvis/artifactRuntimeInternals.test.ts src/lib/jarvis/artifactProducerAdapters.test.ts src/lib/jarvis/artifactReceipts.test.ts src/lib/ai/runtime.test.ts src/lib/actions/runner.test.ts src/lib/actions/registryFiles.test.ts src/features/terminals/terminalExecutionStore.test.ts src/features/plugins/runtime.test.ts src/lib/mcp/registry.test.ts
npm run typecheck
```

**Exact files**

- Modify: `app/src/lib/jarvis/artifactReceipts.ts`
- Modify: `app/src/lib/jarvis/artifactReceipts.test.ts`
- Create: `app/src/lib/jarvis/artifactRuntime.ts`
- Create: `app/src/lib/jarvis/artifactRuntime.test.ts`
- Create: `app/src/lib/jarvis/artifactProducerAdapters.ts`
- Create: `app/src/lib/jarvis/artifactProducerAdapters.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/actions/runner.ts`
- Modify: `app/src/lib/actions/runner.test.ts`
- Modify: `app/src/lib/actions/registryFiles.ts`
- Modify: `app/src/lib/actions/registryFiles.test.ts`
- Modify: `app/src/features/terminals/terminalExecutionStore.ts`
- Modify: `app/src/features/terminals/terminalExecutionStore.test.ts`
- Modify: `app/src/features/plugins/runtime.ts`
- Modify: `app/src/features/plugins/runtime.test.ts`
- Modify: `app/src/lib/mcp/registry.ts`
- Modify: `app/src/lib/mcp/registry.test.ts`

Expected staged and committed names: exactly the eighteen files above.

`artifactRuntime.ts` is the only product module allowed to receive all six
evidence authorities and Task 20A's private internals.
`artifactProducerAdapters.ts` exposes the named `materialize()` adapters
inside that runtime, never a generic
`issueReceipt(executor)` or `normalize(evidenceUnion)` escape hatch. Each
authority validates that the canonical run exists for that account, that the
request ID/attempt number and producer identity match the adapter, and that
the result is final enough to back an output:

- provider: an observed canonical provider completion or real partial output
  bound to the immutable provider/model snapshot; never unverified prose or a
  request acknowledgment;
- file/action: a successful registered action result plus the exact
  file/blob/message-part reference actually created; never approval,
  submission, or a path proposed before the write;
- terminal: the matching Task 19C native terminal result or an explicitly
  persisted transcript/file output; never queue claim, kill intent, or signal
  delivery;
- plugin and MCP: an observed successful typed invocation from the exact
  fixed literal catalog registration or server/tool identity; plugin evidence
  must come from Task 19A's private account/grant-bound
  `RegisteredPluginToolExecutor`, never a public `callPluginTool`, connector
  availability, model-chosen plugin/tool pair, or proposed call;
- schedule: unavailable in Task 20B before any claim/receipt/materialization;
  after Task 17 replaces the slot, only the observed canonical dispatch result,
  never schedule creation, next-run calculation, or queued trigger.

Receipts and verified bindings remain process-private evidence objects.
Producer modules receive only the resulting `JarvisArtifactV1`; they never
serialize receipts/bindings into rows, messages, events, logs, UI state, or
provider input. Task 16B's later canonical provider kernel and Task 17's later
schedule/Hive dispatcher must call these same named adapters; they may not add
another receipt issuer or reuse a materialized artifact after transaction
failure.

Tests must prove each of the five ready adapters accepts its own exact result,
rejects pending/queued/proposed/availability-only evidence, rejects
cross-account/run/request/attempt/producer/result reuse, requires numeric
timestamps, and cannot mint a receipt through a public boolean or generic
executor string. The sixth schedule adapter must prove the unavailable slot
fails before claim/receipt/materialization; Task 17 owns its real-result GREEN
case.
The plugin case additionally proves account/grant revalidation and immutable
literal registration identity, and statically proves no generic plugin call is
exported or reintroduced.
Integration tests assert object-identity consumption once, producer A cannot
bind producer B evidence, a database rollback makes the old artifact
ineligible, and a fresh authority read plus fresh receipt permits the exact
immutable retry. Barrier race tests prove artifact claim versus
settle/retry in both commit orders: a winning artifact claim atomically
dirties the prior attempt and denies retry, while a winning settlement/seal
rejects late materialization before receipt issue. Composition tests
additionally prove the real runtime returns exactly
`issueBoundArtifactPipeline` plus `commitKernelTurn`, invokes the binder once,
never exposes its private consumer, and is the only authorized import of Task
20A internals.

```powershell
git add -- `
  app/src/lib/jarvis/artifactReceipts.ts `
  app/src/lib/jarvis/artifactReceipts.test.ts `
  app/src/lib/jarvis/artifactRuntime.ts `
  app/src/lib/jarvis/artifactRuntime.test.ts `
  app/src/lib/jarvis/artifactProducerAdapters.ts `
  app/src/lib/jarvis/artifactProducerAdapters.test.ts `
  app/src/lib/ai/runtime.ts `
  app/src/lib/ai/runtime.test.ts `
  app/src/lib/actions/runner.ts `
  app/src/lib/actions/runner.test.ts `
  app/src/lib/actions/registryFiles.ts `
  app/src/lib/actions/registryFiles.test.ts `
  app/src/features/terminals/terminalExecutionStore.ts `
  app/src/features/terminals/terminalExecutionStore.test.ts `
  app/src/features/plugins/runtime.ts `
  app/src/features/plugins/runtime.test.ts `
  app/src/lib/mcp/registry.ts `
  app/src/lib/mcp/registry.test.ts
git commit -m "feat(jarvis): bind artifacts to executor receipts"
```

### Task 20C — Stop legacy lifecycle writers and expose read-only projections

**Exact files**

- Create: `app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyActivityProjection.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts`
- Modify: `app/src/features/jarvis-runs/taskRunStore.ts`
- Modify: `app/src/features/jarvis-runs/taskRunStore.test.ts`
- Modify: `app/src/features/jarvis-runs/taskRunPersistence.ts`
- Modify: `app/src/features/jarvis-runs/taskRunPersistence.test.ts`
- Modify: `app/src/features/jarvis-runs/taskRunNotifications.ts`
- Modify: `app/src/features/jarvis-runs/taskRunNotifications.test.ts`
- Modify: `app/src/features/jarvis-runs/JarvisTaskProgressCard.tsx`
- Modify: `app/src/features/jarvis-runs/JarvisTaskProgressCard.test.tsx`
- Modify: `app/src/features/chat/activity/ChatActivityTimeline.tsx`
- Modify: `app/src/features/chat/activity/ChatActivityTimeline.test.tsx`
- Modify: `app/src/features/inspector/InspectorMilestonesPanel.tsx`
- Create: `app/src/features/inspector/InspectorMilestonesPanel.test.tsx`
- Modify: `app/src/App.tsx`
- Create: `app/src/App.jarvisLegacyLifecycle.test.tsx`

```ts
export type JarvisTaskRunProjection = {
  canonical: boolean;
  runId: string;
  chatId?: string;
  status: JarvisTaskRunStatus;
  goal: string;
  userVisibleSummary: string;
  progress: number;
  activeAgents: readonly string[];
  activeTerminals: readonly string[];
  updatedAt: string;
  cancellable: boolean;
  transportRetryAvailable: boolean;
  transportRetryAttemptNumber?: number;
};

export function projectJarvisRunForLegacyUi(input: {
  run: JarvisRun;
  events: readonly JarvisEvent[];
  artifacts: readonly JarvisArtifactV1[];
}): JarvisTaskRunProjection;

export function projectJarvisEventsForLegacyActivity(input: {
  run: JarvisRun;
  events: readonly JarvisEvent[];
  limit?: number;
}): readonly ChatActivityEvent[];
```

Status mapping is exact:

- `queued | compiling -> planning`;
- `running` with no latest `retryable_failed` attempt `-> running`;
- `running` with latest `retryable_failed -> waiting-for-input`, with
  `transportRetryAvailable: true`, that attempt number, safe retry-available
  summary, and `cancellable: false`;
- `awaiting_approval -> waiting-for-approval`;
- `partial -> waiting-for-input`;
- `completed -> completed`;
- `failed | timed_out -> failed`;
- `cancelled -> cancelled`.

Both projections clamp limits to `1..500`, preserve canonical run/artifact/
source IDs in internal keys, use only safe summaries, and never expose row
types. Progress is derived from ordered canonical events and never invented
from elapsed time. Historical chats without a canonical run remain historical;
the adapter does not fabricate a run.

The composite retryable state is not a new canonical run status and does not
rewrite the row. It is a truthful projection of `run.status === 'running'`
plus the exact latest durable attempt state. `provider_in_flight`,
`effect_uncertain`, stale/nonlatest attempts, and every non-schedule run never
set the flag.

`taskRunStore` becomes a view store with only account-scope replacement,
canonical/legacy projection replacement, and test clearing. Remove
`addRun`, `patchRun`, `updateStep`, `recoverInterruptedRuns`, local
`cancelRun`, and any code path that can write lifecycle truth. Canonical rows
win an ID collision; legacy rows are visibly non-canonical and never expose a
cancel handler.

Replace continuous persistence with a one-time read:

```ts
export async function readLegacyJarvisTaskRunsOnce(input: {
  accountId: string;
}): Promise<readonly JarvisTaskRun[]>;
```

It requires a nonblank canonical account ID, derives the existing hashed
scope, reads at most `100` rows from the account-scoped V2 key and then the V1
fallback only when needed, sanitizes them, and returns detached historical
views. It subscribes to nothing, writes nothing, removes nothing, creates no
migration marker, does not use `local-unassigned`, and never rewrites old
status into canonical rows.

`startJarvisTaskRunNotifications()` subscribes to canonical journal transition
events, deduplicates by `(runId, seq)`, and emits generic copy for
`awaiting_approval`, `partial`, `completed`, `failed`, `timed_out`, and
verified `cancelled`. Signal delivery alone sends no “cancelled” notification.
`handoff_pending` also sends no terminal notification. Legacy hydration emits
no notifications.

`JarvisTaskProgressCard`, `ChatActivityTimeline`, and the Inspector timeline
consume the bounded projections. Progress-card Cancel renders only for a
canonical nonterminal run with a real injected handler returning
`JarvisCancellationRequestResult`; Task 16B's exact
`kernelRuntime.requestCancellation({ accountId, runId })` adapter is the sole
production canonical implementation, and before that wiring Cancel is absent.
It displays outer revocation, delivery, and verified state truthfully. The exact
retryable scheduled transport
projection has `cancellable: false`, no active owner to abort, and therefore
suppresses Cancel even when the handler exists. It shows quiet “Transport
retry available” copy and no generic Retry button; Task 21B owns the explicit
trusted handler. It does not treat cancellation intent as an abandon or
terminalization operation. Inspector's manual milestones remain editable and
separate, while its timeline reads the canonical activity projection rather
than `eventsByChat` lifecycle writes.

After Task 1B has released `App.tsx`, replace the boot pair:

```ts
startJarvisTaskRunPersistence(...)
startJarvisTaskRunNotifications()
```

with account-scoped startup that:

1. synchronously clears the prior projection on account change;
2. reads legacy history once;
3. starts the canonical run/event/artifact projection and canonical
   notifications;
4. invokes Task 19 recovery only after the V3 persistence coordinator is
   `ready`;
5. stops every subscription before switching accounts or unmounting.

There is no legacy `onHydrated -> resume` path and no automatic deletion of
old localStorage data.

**TDD and commit**

- [ ] Add red adapter tests for every status, including `running` with latest
      `retryable_failed` projecting `waiting-for-input`/retry-available versus
      ordinary running and stale/nonlatest attempts; ordered/bounded events,
      source/artifact distinction, no fabricated run, account isolation, and
      no canonical writes.
- [ ] Rewrite persistence tests to prove one read, zero writes/removals/
      subscriptions, no fallback account, max 100, and detached history.
- [ ] Rewrite notification tests around canonical `(runId, seq)` events and
      prove no signal-only or legacy-hydration notification.
- [ ] Add component/App tests for bounded projections, real-handler-only
      cancel, forced Cancel suppression for the retryable scheduled transport
      composite even when a handler exists, no cancellation-as-abandon path,
      Inspector boundary, account-switch cleanup, coordinator-ready recovery,
      and absence of both legacy startup functions.
- [ ] Run:
      `npm --prefix app test -- src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts src/features/jarvis-runs/taskRunStore.test.ts src/features/jarvis-runs/taskRunPersistence.test.ts src/features/jarvis-runs/taskRunNotifications.test.ts src/features/jarvis-runs/JarvisTaskProgressCard.test.tsx src/features/chat/activity/ChatActivityTimeline.test.tsx src/features/inspector/InspectorMilestonesPanel.test.tsx src/App.jarvisLegacyLifecycle.test.tsx`.
- [ ] Run typecheck and literal staging/security gates.

```powershell
git add -- `
  app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.ts `
  app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts `
  app/src/lib/jarvis/executionJournal/legacyActivityProjection.ts `
  app/src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts `
  app/src/features/jarvis-runs/taskRunStore.ts `
  app/src/features/jarvis-runs/taskRunStore.test.ts `
  app/src/features/jarvis-runs/taskRunPersistence.ts `
  app/src/features/jarvis-runs/taskRunPersistence.test.ts `
  app/src/features/jarvis-runs/taskRunNotifications.ts `
  app/src/features/jarvis-runs/taskRunNotifications.test.ts `
  app/src/features/jarvis-runs/JarvisTaskProgressCard.tsx `
  app/src/features/jarvis-runs/JarvisTaskProgressCard.test.tsx `
  app/src/features/chat/activity/ChatActivityTimeline.tsx `
  app/src/features/chat/activity/ChatActivityTimeline.test.tsx `
  app/src/features/inspector/InspectorMilestonesPanel.tsx `
  app/src/features/inspector/InspectorMilestonesPanel.test.tsx `
  app/src/App.tsx `
  app/src/App.jarvisLegacyLifecycle.test.tsx
git commit -m "refactor(jarvis): make legacy lifecycle read only"
```

## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch

**Atomic kernel-turn commit correction (normative):**

Task 16B consumes Tasks 20A-20B's private artifact-kernel composition and Task
19A's private approval-action binder. It must not persist a successful turn
through separate journal, message, action, approval, or artifact writes. Add
these closed dependencies to `JarvisKernelDeps`:

```ts
export type KernelTurnTerminalStatus = Extract<
  JarvisRunStatus,
  'completed' | 'partial' | 'failed' | 'cancelled' | 'timed_out'
>;

/** Module-private runtime brand; never exported or serialized. */
const jarvisKernelAccountBindingBrand: unique symbol = Symbol('jarvis.kernel.account-binding');

/** @internal Issued only by the closed kernel runtime binding authority. */
export interface JarvisKernelAccountBinding {
  readonly identity: Readonly<AccountIdentity>;
  readonly syncOwnerSnapshot: SyncQueueOwnerSnapshot;
  readonly revocationSignal: AbortSignal;
  readonly [jarvisKernelAccountBindingBrand]: true;
  assertCurrent(): void;
  dispose(): void;
}

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export type KernelTurnCommitInput = {
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  expectedStatus: JarvisRunStatus;
  /** Start-bound before provider dispatch and retained through transaction settlement. */
  accountBinding: JarvisKernelAccountBinding;
  terminal: {
    status: KernelTurnTerminalStatus;
    event: JarvisRunTransitionEventInput;
  };
  assistantMessage: Message;
  artifacts: readonly JarvisArtifactV1[];
  transportAttemptCompletion?: Readonly<{
    attemptNumber: number;
    requestId: string;
  }>;
};

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export type KernelTurnCommitResult =
  | {
      committed: true;
      run: JarvisRun;
      event: JarvisEvent;
      message: Message;
      artifacts: readonly JarvisArtifactV1[];
    }
  | {
      committed: false;
      reason: 'status_conflict';
      actualStatus: JarvisRunStatus;
    }
  | {
      committed: false;
      reason: 'attempt_conflict';
      actualStatus: JarvisRunStatus;
    }
  | {
      committed: false;
      reason: 'account_authority_revoked';
    };

/** @internal Imported only by kernelTurnCommit.ts and focused tests. */
export type KernelTurnTransactionContext = Readonly<{
  messages: EntityTable<Message, 'id'>;
  chats: EntityTable<Chat, 'id'>;
  sync_queue: EntityTable<SyncQueueRow, 'id'>;
  settings: EntityTable<SettingsRow, 'key'>;
  jarvis_runs: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events: Table<JarvisEventRow, [string, number]>;
  jarvis_artifacts: EntityTable<JarvisArtifactRow, 'id'>;
}>;

/** @internal Exact two-table context for every post-binding lifecycle CAS. */
export type KernelLifecycleTransactionContext = Readonly<{
  jarvis_runs: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events: Table<JarvisEventRow, [string, number]>;
}>;

/** @internal Exact context for signal-bound approval and action-claim writes. */
export type KernelApprovalTransactionContext = Readonly<{
  jarvis_runs: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events: Table<JarvisEventRow, [string, number]>;
  jarvis_approvals: EntityTable<JarvisApprovalRow, 'id'>;
}>;

/** @internal Imported only by kernelTurnCommit.ts and focused tests. */
export interface KernelTurnTransactionAuthority {
  transaction<T>(
    tables: readonly [
      'messages',
      'chats',
      'sync_queue',
      'settings',
      'jarvis_runs',
      'jarvis_events',
      'jarvis_artifacts',
    ],
    authoritySignal: AbortSignal,
    body: (context: KernelTurnTransactionContext) => T | Promise<T>,
  ): Promise<SignalBoundTransactionResult<T>>;
  lifecycleTransaction<T>(
    tables: readonly ['jarvis_runs', 'jarvis_events'],
    authoritySignal: AbortSignal,
    body: (context: KernelLifecycleTransactionContext) => T | Promise<T>,
  ): Promise<SignalBoundTransactionResult<T>>;
  approvalTransaction<T>(
    tables: readonly ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
    authoritySignal: AbortSignal,
    body: (context: KernelApprovalTransactionContext) => T | Promise<T>,
  ): Promise<SignalBoundTransactionResult<T>>;
}

export class KernelTurnTransactionConfigurationError extends Error {
  readonly code:
    | 'kernel_table_set_mismatch'
    | 'kernel_lifecycle_table_set_mismatch'
    | 'kernel_approval_table_set_mismatch';
}

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export function createKernelTurnTransactionAuthority(
  db: JarvisDexie,
): KernelTurnTransactionAuthority;

/**
 * @internal Deep import from repositories.ts, kernelTurnCommit.ts, and focused tests only.
 * This symbol is never exported from repositories.ts or a public barrel.
 */
export function enqueueLocalSyncInTransaction(
  context: Readonly<{
    sync_queue: EntityTable<SyncQueueRow, 'id'>;
    settings: EntityTable<SettingsRow, 'key'>;
  }>,
  input:
    | {
        op: 'insert';
        table: 'messages';
        row: Message;
        createdAt: number;
        ownerSnapshot: SyncQueueOwnerSnapshot;
      }
    | {
        op: 'update';
        table: 'chats';
        row: Chat;
        createdAt: number;
        ownerSnapshot: SyncQueueOwnerSnapshot;
      },
): Promise<void>;

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export type JarvisKernelCommitPort = {
  commitKernelTurn(input: KernelTurnCommitInput): Promise<KernelTurnCommitResult>;
};

/** @internal Imported only by kernelRuntime.ts and focused tests. */
export function createKernelTurnCommit(input: {
  transactionAuthority: KernelTurnTransactionAuthority;
  assertIssuedAccountBinding(binding: JarvisKernelAccountBinding): void;
  consumeArtifactsForCommit(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    artifacts: readonly JarvisArtifactV1[];
  }): void;
}): JarvisKernelCommitPort;

export type JarvisProviderStartedReceipt = Readonly<{
  providerId: string;
  modelId: string;
  modelSnapshotRef: string;
  operations: readonly ('generate' | 'stream' | 'embed')[];
  startedAt: number;
}>;

export type JarvisStartedProviderDispatch = Readonly<{
  receipt: JarvisProviderStartedReceipt;
  response: Promise<Readonly<RawProviderResponse>>;
  abortAfterStart(reason: 'authority_revoked' | 'evidence_commit_failed'): void;
}>;

export type JarvisResolvedProviderDispatch = Readonly<{
  /** Synchronous external-effect boundary. It must not await before invocation. */
  start(signal: AbortSignal): JarvisStartedProviderDispatch;
  dispose(): void;
}>;

export type JarvisPreparedProviderDispatch = Readonly<{
  /** Resolves configuration/secrets but performs no network, CLI, or model effect. */
  resolveConfiguration(): Promise<JarvisResolvedProviderDispatch>;
  dispose(): void;
}>;

export type JarvisKernelPrepareProvider = (input: {
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  compiledPrompt: Readonly<CompiledJarvisPrompt>;
  agent: Agent;
  model: Readonly<JarvisModelSnapshot>;
  messages: readonly LLMMessage[];
  workingDirectory?: string;
}) => Promise<JarvisPreparedProviderDispatch>;

export type JarvisKernelProcessResponse = (
  raw: Readonly<RawProviderResponse>,
  request: Readonly<JarvisRequestEnvelope>,
) => Promise<Readonly<JarvisResponseEnvelope>>;

/** @internal Never crosses the kernel-runtime boundary. */
interface JarvisBoundLiveEvidenceRegistration<K extends JarvisLiveProducerKind> {
  readonly initialProof: JarvisLiveEvidenceProof;
  update(
    input: Parameters<JarvisLiveEvidenceRegistration<K>['update']>[0],
  ): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  complete(
    input: Parameters<JarvisLiveEvidenceRegistration<K>['complete']>[0],
  ): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  dispose(): void;
}

/** @internal Exact Task 18 contract; Task 16B does not redefine it. */
type JarvisKernelAttemptScope = JarvisLiveEvidenceAttemptScope;

type JarvisScopeFree<T> = Omit<T, keyof JarvisKernelAttemptScope>;

/** @internal Per-attempt capability; every method derives this exact scope. */
interface JarvisBoundKernelLifecycle {
  readonly revocationSignal: AbortSignal;
  recordProviderStarted(
    receipt: JarvisProviderStartedReceipt,
  ): Promise<JarvisAuthorityBoundResult<JarvisBoundLiveEvidenceRegistration<'provider'>>>;
  recordProviderResult(
    observation: Readonly<{
      state: 'completed' | 'degraded';
      resultRef: string;
      observedAt: number;
    }>,
  ): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  registerAbortOwner(
    input: Readonly<{
      registrationId: string;
      kind: JarvisAbortKind;
      abort: JarvisAbortRegistration['abort'];
    }>,
  ): () => void;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  beginInitialScheduledAttempt(
    input: JarvisScopeFree<
      Parameters<JarvisTransportAttemptCoordinator['beginInitialScheduledAttempt']>[0]
    >,
  ): Promise<JarvisAuthorityBoundResult<JarvisScheduledAttemptLease>>;
  beginScheduledTransportRetry(
    input: JarvisScopeFree<
      Parameters<JarvisTransportAttemptCoordinator['beginScheduledTransportRetry']>[0]
    >,
  ): Promise<JarvisAuthorityBoundResult<JarvisScheduledAttemptLease>>;
  verifyLease(
    lease: JarvisScheduledAttemptLease,
  ): Promise<JarvisAuthorityBoundResult<Readonly<JarvisRun>>>;
  settleScheduledTransportFailure(
    input: Parameters<JarvisTransportAttemptCoordinator['settleScheduledTransportFailure']>[0],
  ): Promise<
    JarvisAuthorityBoundResult<
      { kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }
    >
  >;
}

type JarvisKernelDeps = {
  journal: Pick<JarvisExecutionJournal, 'allocateRun' | 'getRun'>;
  issueBoundLifecycle(scope: JarvisKernelAttemptScope): JarvisBoundKernelLifecycle;
  bindKernelActions: JarvisApprovalActionBinder;
  issueBoundArtifactPipeline: JarvisArtifactKernelComposition<JarvisKernelCommitPort>['issueBoundArtifactPipeline'];
  commitKernelTurn: JarvisKernelCommitPort['commitKernelTurn'];
  prepareProvider: JarvisKernelPrepareProvider;
  processResponse: JarvisKernelProcessResponse;
  now: () => number;
};
```

`SyncQueueOwnerSnapshot`, `SettingsRow`, `cloudSyncQueueOwnerKey()`,
`cloudSyncQueueClaimKey()`, `legacyCloudSyncQueueAuthorityKey()`,
`materializeSyncQueueOwner()`, `parseSyncQueueOwner()`, `ownersMayCoalesce()`,
`getCurrentSyncQueueAuthorityScope()`, `subscribeSyncQueueAuthorityScope()`,
and `runSignalBoundWrite()` are the already-landed Task 1B R8 contracts; Task
16B must consume them rather than create another queue ownership or revocation
model.

`kernelRuntime.ts` owns a module-private binding authority with a runtime
`WeakSet<JarvisKernelAccountBinding>` registry. Its issuer, verifier, and
disposer are captured lexically by `createJarvisKernelRuntime()` and
`createKernelTurnCommit()`; none is returned, injected by a feature caller, or
exported from a public barrel. The issuer alone installs the private symbol
brand and registers the exact frozen object. Every low-level commit and
lifecycle method calls the captured verifier before reading any binding field;
a cast, structural clone, replay after disposal, foreign-runtime binding, or
caller-created object is rejected before a read, identity consumption, or
write. Production feature code receives only bound methods/opaque operation
handles that close over the registered object, never the raw binding.

The trusted host constructs `JarvisKernelAttemptScope` only after reading back
the canonical persisted run and verifying the registered transport attempt for
the same account/run/request/attempt tuple. `issueBoundLifecycle(scope)`
captures that frozen tuple; callers cannot supply or later change any scope
field. Every transition, abort registration, cancellation, live-evidence
operation, lease operation, and settlement derives and revalidates the tuple
internally. A mismatched run, request, attempt, or account fails before state or
effect access.

Before the first post-allocation lifecycle write and before provider dispatch,
the closed runtime subscribes to both canonical auth identity changes and
sync-authority scope changes, then synchronously captures one canonical
`AccountIdentity` and one frozen `SyncQueueOwnerSnapshot`. It
accepts the binding only when `input.accountId` equals the identity, a
`source: 'supabase'` identity has an exact cloud owner for that account, and a
`source: 'local'` identity has an unbound owner. The frozen binding and owner
snapshot are retained unchanged for the entire provider/artifact/commit
lifetime; terminal code never recaptures or reclassifies authority. Any auth
identity or sync-authority transition aborts its one-way revocation signal,
including cloud A to signed-out/local, A to B, A to signed-out and back to A,
or local to cloud. The provider observes the same revocation, and the
subscription is disposed only after the last lifecycle/terminal Dexie operation
for that attempt has settled.

`assertCurrent()` re-resolves the canonical identity and authority scope,
requires exact equality with the start-bound identity/source/owner, requires
the binding to remain registered, and requires the revocation signal to remain
unaborted. Every commit invokes it before opening its transaction, at callback
entry, and again after all awaited status/attempt/artifact guards immediately
before the synchronous private artifact-identity consumption. No await occurs
between that last assertion and consumption. `commitKernelTurn()` passes the
same signal into the transaction authority, which uses accepted
`runSignalBoundWrite()` to close the race through IndexedDB settlement.
Revocation before or during settlement returns `account_authority_revoked`,
consumes no new work after detection, and leaves zero partial database writes.
Stable local-only turns retain the same frozen unbound owner for both message
and chat queue rows.

`enqueueLocalSyncInTransaction()` is implemented in the non-barreled
`app/src/lib/db/kernelTurnTransactionAuthority.ts`, whose dependency graph does
not import `repositories.ts`. Exactly `repositories.ts` and
`kernelTurnCommit.ts` may deep-import it in production; focused tests may import
it directly. The generic repository's existing message-insert and chat-update
branches substantively delegate to the same narrow helper while every other
generic operation retains its accepted R8 behavior. Task 21A reuses it only
through the closed voice commit port. Static tests reject export from
`app/src/lib/db/index.ts` or any public barrel and reject every other production
import.

`JarvisKernelDeps`, the account binding, the transaction context/authority, the
enqueue helper, the commit port, and their concrete constructors are `@internal`
deep-module implementation symbols. Callers do not assemble them. Task 16B
adds the named composition root:

```ts
const jarvisScheduledPreparationSeedBrand: unique symbol = Symbol(
  'jarvis.kernel.schedule-preparation-seed',
);

/** Opaque runtime-issued allocation/retry seed; all fields stay in a WeakMap. */
export type JarvisScheduledPreparationSeed = Readonly<{
  [jarvisScheduledPreparationSeedBrand]: true;
}>;

const jarvisScheduledKernelHandleBrand: unique symbol = Symbol('jarvis.kernel.schedule-handle');

export type JarvisScheduledKernelAttemptHandle = Readonly<{
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
  [jarvisScheduledKernelHandleBrand]: true;
}>;

export type JarvisScheduledAttemptDescriptor = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
}>;

export interface JarvisKernelRuntime {
  readonly actions: JarvisKernelActionPort;
  runInitialTurn(
    input: Readonly<JarvisKernelTurnInput>,
  ): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>>;
  requestCancellation(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisCancellationRequestResult>;
  prepareScheduledAttempt(input: {
    allocation: JarvisScheduledPreparationSeed;
  }): Promise<PreparedJarvisScheduledKernelAttempt>;
  beginPreparedScheduledAttempt(input: {
    prepared: PreparedJarvisScheduledKernelAttempt;
  }): Promise<JarvisAuthorityBoundResult<JarvisScheduledKernelAttemptHandle>>;
  dispatchPreparedScheduledAttempt(input: {
    prepared: PreparedJarvisScheduledKernelAttempt;
    handle: JarvisScheduledKernelAttemptHandle;
  }): Promise<JarvisAuthorityBoundResult<JarvisScheduledKernelAttemptOutcome>>;
  settleScheduledTransportFailure(input: {
    handle: JarvisScheduledKernelAttemptHandle;
  }): Promise<
    JarvisAuthorityBoundResult<
      { kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }
    >
  >;
  disposeScheduledAttempt(handle: JarvisScheduledKernelAttemptHandle): void;
}

/** @internal Full composition received only by app/src/lib/ai/runtime.ts. */
export type JarvisKernelRuntimeComposition = Readonly<{
  kernel: JarvisKernelRuntime;
  liveEvidenceHost: JarvisLiveEvidencePrimaryHostLifecycle;
}>;

export function createJarvisKernelRuntime(input: {
  db: JarvisDexie;
  artifactEvidenceAuthorities: CanonicalArtifactEvidenceAuthorities;
  journal: Pick<JarvisExecutionJournal, 'allocateRun' | 'getRun'>;
  cancellationDeliveryAuthority: JarvisCancellationDeliveryAuthority;
  abortRegistrationAuthority: JarvisAbortRegistrationAuthority;
  bindKernelActions: JarvisApprovalActionBinder;
  liveEvidenceVerifiers: Readonly<{
    provider: JarvisLiveEvidenceVerifierSlot<'provider'>;
    action: JarvisLiveEvidenceVerifierSlot<'action'>;
    fileAction: JarvisLiveEvidenceVerifierSlot<'file_action'>;
    terminal: JarvisLiveEvidenceVerifierSlot<'terminal'>;
    plugin: JarvisLiveEvidenceVerifierSlot<'plugin'>;
    mcp: JarvisLiveEvidenceVerifierSlot<'mcp'>;
    voice: JarvisLiveEvidenceVerifierSlot<'voice'>;
    schedule: JarvisLiveEvidenceVerifierSlot<'schedule'>;
    hive: JarvisLiveEvidenceVerifierSlot<'hive'>;
  }>;
  prepareProvider: JarvisKernelPrepareProvider;
  processResponse: JarvisKernelProcessResponse;
  randomUUID: () => string;
  now: () => number;
}): JarvisKernelRuntimeComposition;
```

The public scheduled handle exposes no identity fields, lease, producer kind,
source structure, registration identity, or authority. `kernelRuntime.ts`
stores all live state, including the private `JarvisScheduledAttemptLease`, in
a host-owned `WeakMap<JarvisScheduledKernelAttemptHandle, InternalState>`.
Only inert `JarvisScheduledAttemptDescriptor` values may cross a read/UI
boundary; descriptors cannot dispatch, settle, retry, cancel, or prove
ownership. The runtime constructs `JarvisLiveEvidenceKernelComposition`
internally from the fixed verifier set. It returns the deep-module-only
`JarvisKernelRuntimeComposition` to exactly `app/src/lib/ai/runtime.ts`:
feature adapters receive only `.kernel`, while the primary `App.tsx` host
receives only `.liveEvidenceHost`. Neither the owner, raw read port, nor raw
maintenance authority appears on `JarvisKernelRuntime` or the native client
protocol.

`liveEvidenceHost.openAccount(accountId)` is the only reconstruction entrypoint
outside `kernelRuntime.ts`. It serializes account replacement, invalidates the
old session before reconstruction, and returns a session only after the bounded
Task 18 reconstruction succeeds. Its `JarvisAccountLiveEvidenceReadPort`
captures that account and rejects a snapshot/subscription for any other
account by construction. Session and host disposal are idempotent and
epoch-revoke in-flight reads before cache removal. Static tests permit the host
lifecycle type/calls only in `app/src/lib/ai/runtime.ts` and primary `App.tsx`.
Only primary `App.tsx` and the deep `app/src/lib/ai/runtime.ts` host factory may
hold the full account session. Command Center data/UI receives only the active
session's read port, and secondary webviews/native clients receive neither
surface. The session's synchronous `assertCurrent()` fails after disposal or
replacement, including replacement by another session for the same account.

`actions.create()`/`decide()`/`execute()`/`executeAutoApprovedSafe()` first
load the canonical parent and derive—not accept—the exact account, request, and
attempt binding. Each external call issues a fresh account lifecycle before its
first write, binds `bindKernelActions` only inside `kernelRuntime.ts`, and
disposes the issued lifecycle in `finally` after the last approval/event/live
evidence operation settles. The planner path inside `runInitialTurn()` instead
uses that turn's already-issued lifecycle and cannot issue or substitute a
second binding. No bound `JarvisApprovalActionCapability` escapes either path.

Each claimed `JarvisIssuedActionExecution` is a private child lease on the same
binding. The runtime tracks the parent lifecycle and exact child identities in a
closed ownership set: `lifecycle.dispose()` releases only the parent lease, and
the auth/scope subscriptions plus binding remain live until every accepted child
handle has settled and disposed. The engine owns and disposes normal
action/file/plugin/MCP handles after immutable result recording. A terminal
handoff succeeds only after `terminalExecutionStore.ts` atomically accepts the
exact child handle; that store then owns its eventual result/cancellation write
and disposal. Enqueue/handoff failure leaves ownership with the engine, which
disposes before returning failure. Revocation aborts all parent/child work but
removes registry entries only after active transactions settle. Every
non-terminal success, denial, conflict, revocation, executor failure, rejected
handoff, terminal exit, and throw reaches zero retained leases exactly once.
Forged, cloned, disposed, or foreign-runtime handles fail before a repository
read or executor call. The kernel wrapper catches only the module-private
authority-revoked error and maps it to
`{ kind: 'account_authority_revoked' }`; approval conflicts and executor results
retain their existing typed meanings and every other error propagates.

The runtime keeps a second private `WeakSet` for scheduled handles. Each
`beginPreparedScheduledAttempt()` verifies the prepared object's private
`initial | transport_retry` mode, issues the account binding before the matching attempt CAS,
performs that CAS through the bound two-table lifecycle capability, and returns
only an opaque registered handle whose methods/runtime lookups close over the
binding. `dispatchPreparedScheduledAttempt()` accepts that handle rather than a
raw lease. A committed terminal result disposes it only after settlement. A
`pre_effect_transport_failure` deliberately leaves it live with the exact
failure stored in its private state. Task 17 receives no failure/proof/time and
can call only `settleScheduledTransportFailure({ handle })`; that method obtains
and revalidates the zero-effect proof and clock internally, performs the
signal-bound settlement, and then disposes the handle. Same-account relogin
or any other authority transition aborts the handle throughout proof and CAS
settlement. Exceptional caller abandonment must call `disposeScheduledAttempt()`;
disposed/forged/foreign-runtime handles fail closed and can never be resumed.
The handle has no result-recording method. On a successful scheduled turn,
`dispatchPreparedScheduledAttempt()` first commits and reads back the kernel
turn's immutable `canonicalResultEvidence`; on a settled pre-effect failure,
the private settlement core first commits and reads back the matching
`scheduled_transport_settled` evidence. Only then may the runtime append the
distinct schedule `phase: 'result'` source row whose `resultAuthority` points
back to that earlier row, verify/read back live evidence, and return. State,
`jresult_` reference, source run/sequence, and time are copied from the private
commit result, never accepted from the runner or scheduled handle.

`app/src/lib/ai/runtime.ts` is the sole production caller of Task 13's
`createJarvisProviderAttemptEvidenceAuthority()`. It creates one boot-scoped
authority, closes it inside the protected `dispatchProvider` adapter so every
native/CLI observation reaches the same tracker inside the prepared/started
provider transport before downstream callbacks,
and passes only its `revalidateFailure` capability into Task 19B's
consequential-effect safety composition. Task 17 receives that already-closed
safety authority, never the tracker factory or issuer. Account/runtime
teardown calls `invalidateAll()`. Import-boundary tests reject any other
production factory import or any untracked protected provider dispatcher.

`providerAttemptEvidence.ts` owns the exact provider live verifier constructor;
`app/src/lib/ai/runtime.ts` is its sole production importer, constructs it from
the boot-scoped authorities, and passes only the fixed verifier slot into
`kernelRuntime.ts`:

```ts
/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisProviderLiveEvidenceVerifier(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
  providerAttempts: Pick<JarvisProviderAttemptEvidenceAuthority, 'verifyActiveEvidence'>;
  providerResults: CanonicalProviderEvidenceAuthority;
}): JarvisCanonicalLiveProducerVerifier<'provider'>;
```

The protected dispatch writes the Task 18 `provider` source member only after
the prepared transport's synchronous `start(signal)` returns a runtime-issued
`JarvisProviderStartedReceipt`: `phase: 'start'` is embedded in the committed
provider-start event, and the matching `phase: 'result'` member is embedded in
the immutable terminal provider-result event before live completion. `busy`
requires that exact source member at `resultEventSeq` plus
`providerAttempts.verifyActiveEvidence()` for the exact private
account/run/request/attempt/provider/model index. No caller supplies a tracker.
`completed | degraded` requires
`CanonicalProviderEvidenceAuthority.verify()` plus the exact durable result
source member, so it is restart-revalidatable without a tracker. Ordinary
event status/prose or provider availability cannot verify any state.

`prepareProvider()` and `resolveConfiguration()` perform no network, CLI, or
model effect. The kernel creates exactly one `AbortController` and exactly one
scope-captured provider registration before configuration resolution; its
single disposer owns that registration. `prepareProvider()`,
`resolveConfiguration()`, and synchronous `resolved.start(signal)` reuse the
identical signal and never register a second owner. Unsupported cancellation is
reported only by the owner's typed `abort` outcome, never a registration flag.
The kernel rechecks host/account/run/request/attempt authority after the final
await and calls `resolved.start(signal)` synchronously with no intervening await
or callback. The started dispatch buffers response chunks from all downstream
consumers until the fixed provider source row, live-evidence row, exact
readback, and proof application have committed. If that publication fails or
authority revokes after start, the kernel invokes `abortAfterStart()` and
returns an explicit uncertain/non-retryable started-effect failure; it never
classifies that attempt as `pre_effect_transport_failure`.

At the Task 16B staging point, `app/src/lib/ai/runtime.ts` fills provider and
all five Task 19B action slots only from their named factory outputs. The not-
yet-landed voice/schedule/Hive slots are explicit closed unavailable states;
their calls fail with `live_evidence_verifier_unavailable` and cannot write.
No inline/custom verifier is permitted. Task 21A and Task 17 own the mandatory
later replacements described in Task 18.

`app/src/lib/ai/runtime.ts` is the sole production caller of
`createJarvisKernelRuntime()` and passes the one boot-scoped `JarvisDexie`
instance. Task 16W's main-webview host gate dynamically imports that module
only after the native broker proves label `main` and issues the current host
epoch/token. Auxiliary webviews and browser tabs receive `JarvisKernelClient`
only and cannot import or evaluate the factory module. `kernelRuntime.ts` is
the sole production caller of both
`createKernelTurnTransactionAuthority(db)` and
`createJarvisArtifactKernelComposition()`. It receives Task 19A's
`bindKernelActions` directly from the one security composition and constructs
Task 18's attempt
coordinator internally over the context-bound CAS adapter; callers cannot pass
an already-built coordinator that bypasses the lifecycle signal. Its binder constructs the exported
`@internal` `createKernelTurnCommit()` while the private artifact consumer and
the concrete Dexie authority are in lexical scope, then closes the resulting
commit operation inside the runtime. There is no production signature that
accepts an externally paired transaction authority, executable approval
capability, artifact pipeline, artifact consumer, or commit port. The returned
deep composition contains exactly feature-facing `.kernel` plus the
primary-host `.liveEvidenceHost` wrapper described above. The kernel member
exposes only `JarvisKernelActionPort` plus bound turn, cancellation, and
scheduled-attempt methods, while the host wrapper exposes only serialized
account-session open, issued-session currentness assertion, and disposal.
Provider/action/artifact adapters and raw
live-evidence maintenance remain lexical implementation details. No caller can obtain an action binder,
issued approval lifecycle, receipt
issuer, normalizer, pending identity registry, raw commit verifier, artifact
consumer, or independently pair an artifact pipeline with a different commit
port. Import-boundary tests fail if any production module other than
`kernelRuntime.ts` imports the Dexie adapter, artifact runtime factory, or raw
commit factory, if any production module outside `approvalEngine.ts`,
`jarvisSecurityRuntime.ts`, and `kernelRuntime.ts` imports
`JarvisApprovalActionBinder`, and if any production module other than
`app/src/lib/ai/runtime.ts` calls `createJarvisKernelRuntime()`.

`createKernelTurnTransactionAuthority(db)` is implemented in
`kernelTurnTransactionAuthority.ts`. It accepts the real `JarvisDexie`, not a
repository collection or caller-supplied table map. Its `transaction()` first
compares the requested literal tuple by length, order, and value to exactly:

```ts
[
  'messages',
  'chats',
  'sync_queue',
  'settings',
  'jarvis_runs',
  'jarvis_events',
  'jarvis_artifacts',
] as const;
```

Any alternate, duplicate, missing, reordered, or cast tuple throws
`KernelTurnTransactionConfigurationError` with
`code: 'kernel_table_set_mismatch'` before entering Dexie. The valid path
passes the exact authority signal and real table array through the accepted
top-level transaction owner exactly as follows:

```ts
runSignalBoundWrite(
  db,
  authoritySignal,
  [
    db.messages,
    db.chats,
    db.sync_queue,
    db.settings,
    db.jarvis_runs,
    db.jarvis_events,
    db.jarvis_artifacts,
  ] as const,
  () =>
    body(
      Object.freeze({
        messages: db.messages,
        chats: db.chats,
        sync_queue: db.sync_queue,
        settings: db.settings,
        jarvis_runs: db.jarvis_runs,
        jarvis_events: db.jarvis_events,
        jarvis_artifacts: db.jarvis_artifacts,
      }),
    ),
);
```

The array overload above is mandatory: the installed Dexie declarations accept
an array of tables or at most four separate table arguments, so seven separate
table arguments do not typecheck. `runSignalBoundWrite()` owns the top-level
`rw!` transaction, subscribes before it opens, checks the signal at entry and
after the body, aborts an active transaction on revocation, and removes its
listener only after settlement. Tests spy on its real Dexie array overload and
require the exact seven table object identities in the exact order above after
the symbolic tuple validation; a cast alternate fails before
`runSignalBoundWrite()` or the body is called.

The same authority's separate `lifecycleTransaction()` validates only the
literal tuple `['jarvis_runs', 'jarvis_events']` and rejects every alternate
with `kernel_lifecycle_table_set_mismatch`. Its valid path is exactly:

```ts
runSignalBoundWrite(db, authoritySignal, [db.jarvis_runs, db.jarvis_events] as const, () =>
  body(
    Object.freeze({
      jarvis_runs: db.jarvis_runs,
      jarvis_events: db.jarvis_events,
    }),
  ),
);
```

The callback deliberately ignores `runSignalBoundWrite()`'s Dexie
`Transaction` argument and supplies a separately frozen
`KernelLifecycleTransactionContext`; passing `body` directly does not typecheck.
It never widens to the seven-table context, and `transaction()` never accepts
the two-table tuple.

The authority's third method, `approvalTransaction()`, validates only the
literal tuple `['jarvis_runs', 'jarvis_events', 'jarvis_approvals']` and rejects
every alternate before opening Dexie. Its valid path is exactly:

```ts
runSignalBoundWrite(
  db,
  authoritySignal,
  [db.jarvis_runs, db.jarvis_events, db.jarvis_approvals] as const,
  () =>
    body(
      Object.freeze({
        jarvis_runs: db.jarvis_runs,
        jarvis_events: db.jarvis_events,
        jarvis_approvals: db.jarvis_approvals,
      }),
    ),
);
```

Task 16B refactors Task 19A's approval insert/status CAS operations into private
context-bound cores. Ordinary non-kernel repository methods keep their own
accepted transactions; the issued action lifecycle calls those cores only
inside `approvalTransaction()`. Approval creation and decision are therefore
signal-bound, and `claimApprovedExecution()` atomically verifies/consumes the
approval, claims the attempt-effect barrier, and appends the producer-source
start event in this exact transaction. No await follows the final authority
assertion before those synchronous table mutations. A revocation or any write
failure rolls back all three tables, leaves the approval unconsumed, and invokes
no external executor or live-evidence publication.

The lifecycle and approval methods exist in Task 16B before Task 21A. Together
they are the sole signal-bound authorities for post-binding run/event
transitions, provider/action source events, approval writes and action claims,
scheduled begin/retry/settlement CAS writes, and voice phase 2.

It has no repository callbacks, fallback tables, nested transaction, retry, or
lossy error translation. A synchronous body throw, asynchronous rejection,
Dexie constraint error, or injected table failure propagates and Dexie rolls
back every table in the selected exact boundary; a stable success returns the body's exact value inside
`{ kind: 'committed' }`; revocation returns `{ kind: 'cancelled' }` only after
rollback. The context is frozen and contains only those real table objects.
`KernelTurnTransactionAuthority`, its context, the adapter factory, the enqueue
helper, the account binding, the commit port, and `createKernelTurnCommit()` are
lawful `@internal` deep-module exports omitted from every public barrel. This
makes the cross-module call compile without making the authority a public
injection seam.

Task 16B refactors the existing Task 9/18 run/event CAS implementations in
`jarvisRepositories.ts` into private context-bound cores for transition/event
append, validated live-evidence append, cancellation-intent append,
attempt-effect claim, and transport-attempt begin/retry/settle. Existing
repository methods delegate to those cores inside
their ordinary exact transaction; the closed kernel lifecycle capability
invokes the same cores only inside `lifecycleTransaction()`. The cores cannot
open a transaction, import `db`, or escape a public barrel.

It also refactors Task 19A's approval put/status CAS into context-bound cores
that accept `KernelApprovalTransactionContext`. The ordinary approval repository
delegates to them in its existing transaction, while the issued approval
lifecycle invokes them only through `approvalTransaction()`. The private
`claimApprovedExecutionInContext()` core combines exact approved-to-consumed CAS,
attempt-effect claim, and source-start append; it is not exposed as a repository
method and cannot be called without the issued account signal.

Task 16B also modifies Task 18's `liveEvidenceAuthority.ts` so verification,
proof chaining, readback, hashing, and registry publication are separated from
transaction ownership. The trusted host creates one
`JarvisLiveEvidenceKernelComposition`; its host-owned `WeakMap` handle state
selects the producer kind, verifier, fixed event shape, and append path. There
is no production generic producer port, caller-supplied append capability, or
feature-visible binding authority. The Task 18 test-only harness may exercise
the closed verifier matrix but cannot be imported by production code.
`kernelRuntime.ts` invokes only fixed `recordProviderStarted`,
`recordProviderResult`, action, voice, schedule, and Hive operations. Each
operation calls the private `appendLiveEvidenceInContext()` core inside the
exact two-table `lifecycleTransaction()` with the retained account-binding
signal. A cancelled transaction raises one module-private
`JarvisAccountAuthorityRevokedError`; the bound wrapper catches only that named
error and maps it to `account_authority_revoked`. Every other verifier,
readback, idempotency, or database error propagates unchanged.

`appendProducerSourceEvent()` follows the same path through the private
context-bound event core and requires a closed `producerSourceEvidence` member;
it cannot accept caller prose as authority. Provider dispatch and bound Task 19
actions receive only lifecycle-closed fixed observations. Task 21A voice
handles expose narrower receipt-verifying playback methods; Task 17 schedule
results are derived inside dispatch/settlement, and Hive handles expose only a
one-shot `execute()` operation whose scope, canonical persisted plan, and
producer identity live in host-owned `WeakMap`s. None accepts a raw `JarvisEvent`,
`JarvisProducerSourceEvidenceV1`, producer kind, registration ID, capability
ID, account/run/request identity, result reference/time/state, or append
capability. A live-evidence append may
commit only after its source event commits, and the node remains invisible until
Task 18's exact readbacks finish.

The bound `claimAttemptEffect()` invokes the private effect-claim core only
inside `lifecycleTransaction()`. `kernelRuntime.ts` passes that exact closure
only to Task 20B's private `issueBoundArtifactPipeline()` through a lexical adapter: a
committed bound result unwraps to the existing claim result, while the revoked
result throws the one module-private `JarvisAccountAuthorityRevokedError` before
artifact code continues. Task 19 actions do not receive this generic closure;
their issued lifecycle uses `claimApprovedExecutionInContext()` inside the
three-table approval transaction so approval consumption, effect claim, and
source-start event are atomic. Neither artifact nor action code receives the raw
`JarvisAttemptEffectBarrierAuthority`. Every claim is covered by the same issued
account binding from before transaction open through settlement. Revocation
returns `account_authority_revoked`, issues no artifact receipt, consumes no
approval, calls no consequential executor, and cannot be reclassified as an
ordinary status conflict.

The bound `requestCancellation()` calls
`JarvisCancellationDeliveryAuthority.prepare()`, commits the fixed
`cancellation_requested` event through the context-bound event core, and only
then activates registry delivery. If authority revokes or event persistence
fails before activation, it calls `abandonBeforeDelivery()` and invokes no
owner and returns `authority_revoked_before_intent` only when the event did not
commit. Once the event commits, subsequent authority revocation cannot retract
the request: delivery continues to the exact prepared owners and returns
`intent_committed` with `authorityState: 'revoked_after_intent'` plus the
truthful aggregate. It writes no stale terminal state. The active handle/binding
remains retained through event settlement and delivery completion;
executor-confirmed terminal truth still uses that handle's bound transition.
No ordinary `journal.requestCancellation()` path exists. Production
cancellation is reachable only through this private
`JarvisCancellationDeliveryAuthority` behind an issued bound lifecycle.

After a binding is issued, typed, voice, scheduled, and Hive kernel code may
perform no direct `journal.transitionRun()`, standalone run/event repository
write, raw `JarvisTransportAttemptCoordinator` mutation, or raw live-evidence
producer call. All such writes use the bound lifecycle capability and map a
cancelled transaction to `account_authority_revoked`. Static call-site tests
enforce that rule across provider, action, voice, schedule, and Hive code.
Allocation that precedes binding remains the sole pre-binding run write.

`commitKernelTurn()` is the only typed-chat terminal write boundary for
`completed | partial | failed | cancelled | timed_out`. Its authority-backed
implementation calls only:

```ts
transactionAuthority.transaction(
  [
    'messages',
    'chats',
    'sync_queue',
    'settings',
    'jarvis_runs',
    'jarvis_events',
    'jarvis_artifacts',
  ],
  input.accountBinding.revocationSignal,
  async (context) => {
    /* exact commit body */
  },
);
```

The commit body uses only the seven frozen table objects in `context`; it never
captures `db` or opens another transaction. The concrete adapter shown above
is the sole layer that translates this exact tuple into the real
seven-table Dexie transaction call.

`enqueueLocalSyncInTransaction()` uses only `context.sync_queue` and
`context.settings`. For each message/chat mutation it preserves the R8 durable
queue invariant inside this same transaction:

1. It accepts the caller-supplied frozen `ownerSnapshot`; it never calls
   `captureSyncQueueOwner()` itself.
2. A pending coalescing candidate is eligible only when its owner sidecar
   parses for that exact queue-row ID, `ownersMayCoalesce()` accepts the exact
   snapshot, `cloudSyncQueueClaimKey(candidate.id)` is absent, and
   `legacyCloudSyncQueueAuthorityKey(candidate.id)` is absent. A claimed,
   missing-owner, malformed-owner, legacy-marked, foreign-owner, non-pending,
   or otherwise ambiguous row is never adopted or overwritten. In particular,
   an otherwise coalescible V2 owner carrying any legacy V1 authority evidence
   remains byte-for-byte untouched.
3. Updating a surviving pending row leaves its immutable owner sidecar
   byte-for-byte unchanged. Removing an exact coalesced duplicate removes its
   queue row and owner sidecar together; a claim sidecar must already be absent.
4. When no exact candidate exists, the helper allocates a fresh queue ID,
   verifies its owner, claim, and legacy V1 authority sidecar keys are all
   absent, inserts the `status: 'pending'` queue row, and inserts
   `materializeSyncQueueOwner(queueId, ownerSnapshot)` under
   `cloudSyncQueueOwnerKey(queueId)`.
5. Every pending row created or retained by this helper therefore has exactly
   one valid immutable owner sidecar and no claim or legacy V1 authority
   sidecar. The helper never deletes or rewrites ambiguous legacy evidence.
   Claim materialization remains solely the R8 drain transition from `pending`
   to `in_progress`.

Any queue-row, owner-sidecar, claim-invariant, or duplicate-cleanup failure
throws and rolls back the whole seven-table kernel commit. The helper does not
call the independently committing generic repository/enqueue API and cannot
degrade to a queue-only write.

Immediately before opening the transaction and again as the first callback
operation, the commit calls `input.accountBinding.assertCurrent()`; a failed
check maps to `account_authority_revoked` before artifact consumption. Inside
that transaction it loads and account-checks the run, returns
`status_conflict` before consuming artifact identities when the expected
status lost, and, when `transportAttemptCompletion` is present, requires the
completion binding to equal top-level `requestId`/`attemptNumber` and the
exact latest attempt to be `provider_in_flight` with those same values before
consuming artifact identities. After every awaited run/attempt/artifact guard
has succeeded, the callback calls the captured runtime verifier and
`assertCurrent()` a third time immediately before the synchronous private
identity-consumption loop; there is no await until all identities are consumed.
A run-status mismatch returns
`status_conflict`; a missing, stale, state, request, or attempt mismatch
returns `attempt_conflict`. Either result performs zero writes and consumes
zero identities. The winning transaction passes exact
account/run/request/attempt to Task 20's private pending-artifact consumer,
changes that attempt to `completed` while it updates the run,
allocates/inserts the forced terminal journal event, inserts the assistant
message, updates `chats.updated_at`, coalesces the exact
`messages` insert and sanitized `chats` update into `sync_queue`, atomically
writes or preserves each matching immutable R8 owner sidecar in `settings`
with no pending-row claim sidecar, and inserts all artifact rows. Both queue
operations use `input.accountBinding.syncOwnerSnapshot`. Kernel tables remain
blocked by Task 9's local-only sync interlock; only the existing generic message/chat
projections enter the local sync queue. The chat sync payload continues to
omit its local-only `connection` field exactly as `messageRepo.create()` does
today.

Every artifact passed to the commit must repeat top-level `requestId` and
`attemptNumber`; the private pending-identity consumer verifies the same
binding. For a scheduled attempt, the commit also requires the latest barrier
not to be `sealed_for_retry`; a previously claimed artifact has already
dirtied it. No artifact from an earlier request/attempt can ride a later
terminal transaction.

Artifacts are materialized and receipt-verified in memory before commit, but
their private identities are consumed only inside the winning transaction
callback. A status/attempt conflict or account-authority revocation writes
nothing and does not consume them after detection. Any
event, message, chat, sync-queue, owner-sidecar/settings, claim-invariant,
artifact, or IndexedDB failure rolls back all seven tables, so an unjournaled
message/artifact or ownerless pending queue row cannot exist. The private
artifact identities are process-memory evidence and are not rolled back; after
a database failure the caller must rerun the matching Task 20B adapter and get
a fresh receipt before retrying.

Rollback is explicitly **database-only**. It cannot undo a provider request,
native process, file write, TTS operation, or other external side effect that
already occurred. Retry eligibility therefore follows Task 19/20 producer
evidence and never assumes IndexedDB rollback reversed external execution.
`createKernelTurnCommit()` must not call an independently committing message,
journal, sync, or artifact repository inside or outside this boundary.

This replaces the later numbered steps 10-13 wherever they describe separate
writes: step 10 normalizes and verifies artifact drafts in memory, step 11
projects the assistant message in memory, step 12 builds the terminal event
and transition in memory, and step 13 calls `commitKernelTurn()` exactly once.
Delete/ignore any later instruction to persist the message, artifacts, event,
or terminal transition separately.

RED tests must prove rollback after each database write point; distinct
`status_conflict`, `attempt_conflict`, and `account_authority_revoked` results
with zero DB side effects and unconsumed artifact identities after detection;
signal-bound approval creation and decision; exact approved-to-consumed action
claim with run/event/approval atomicity; zero approval consumption, effect
claim, live publication, secret resolution, or executor call when authority
revokes before/during the three-table transaction; no executor call before the
committed source event and live-evidence readback; retained-binding result
recording and cancellation; explicit revoked-result mapping without transport
or status-conflict reclassification; and exactly-once lifecycle/execution-handle
disposal for success, denial, conflict, revocation, executor failure, terminal
handoff, rejected handoff, terminal exit, and throw, including parent-release
with one retained child followed by exact zero-lease cleanup;
rejection when the completion binding,
current attempt, or any artifact request/attempt differs; journal, message,
chat, sync-queue, settings/owner-sidecar, claim-invariant, and artifact failure
with no partial rows; exact same-owner message/chat sync coalescing; rejection
of claimed, ownerless, malformed, legacy-marked, or foreign pending candidates;
an otherwise coalescible V2 owner plus legacy V1 marker remaining byte-for-byte
untouched; orphaned legacy-key collision on fresh-ID allocation; exact owner
sidecar preservation; absence of claim and legacy V1 authority sidecars for
every newly retained pending row; one frozen start-bound owner snapshot used by
both queue writes; non-frozen, malformed, extra-field, source/account/owner
mismatch rejection before artifact consumption; cloud A to signed-out/local, A
to B, A to signed-out and same-A relogin, local to cloud, revocation during each
transaction settlement point, and stable local-only success with the identical
frozen unbound owner; kernel-table sync rejection; fresh receipt required after
DB rollback; all five terminal statuses; and successful
single-transaction persistence of the terminal transition/event, assistant
message, chat recency, owner-bound sync rows, and all artifacts. Tests must not
claim a provider or
other external effect was rolled back. The GREEN integration test must also
prove that the kernel calls no legacy standalone message/artifact persistence
method. The adapter suite uses `fake-indexeddb` with a real `JarvisDexie` and
proves the exact seven-table, separate run/event two-table, and
run/event/approval three-table identities/order, tuple-mismatch codes, exact
body return, independently frozen contexts,
synchronous throw and asynchronous/Dexie failure rollback, signal
subscription before open, revocation abort before settlement, listener cleanup,
and zero partial rows after injected failure at every write boundary. It also
checks that the queue row and owner sidecar appear or disappear atomically and
that a pending row never carries a claim or legacy V1 authority sidecar.
Generic-repository parity tests prove its exact message-insert/chat-update
branches use the same helper without changing delete or other table/operation
semantics. Compile/import tests prove the cross-module `@internal` exports are
lawful; every public barrel omits the helper/binding/authority; exactly
`repositories.ts` and `kernelTurnCommit.ts` deep-import the enqueue helper in
production; `app/src/lib/ai/runtime.ts` constructs one kernel runtime per boot;
`kernelRuntime.ts` constructs exactly one action/artifact/transaction/commit
composition; and production cannot inject or alternate-pair an account binding,
lifecycle or issued-action handle, action binder, transaction authority,
artifact consumer/pipeline, or commit port. A
cast alternate table tuple fails before the body runs; tests also place
revocation after every awaited guard and before artifact consumption for typed,
scheduled, and voice paths.

```powershell
npm --prefix app test -- src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/kernelTurnCommit.test.ts src/lib/db/kernelTurnTransactionAuthority.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/db/repositories.kernelTurn.test.ts src/lib/jarvis/approvalEngine.test.ts src/lib/jarvis/jarvisSecurityRuntime.test.ts src/lib/jarvis/artifactRuntime.test.ts src/lib/jarvis/artifactNormalizer.test.ts src/lib/jarvis/artifactReceipts.test.ts src/lib/jarvis/executionJournal/transportAttempts.test.ts src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts src/lib/jarvis/executionJournal/abortRegistry.test.ts src/lib/actions/runner.test.ts src/lib/actions/autoApprove.test.ts src/lib/jarvis/operatorListener.test.ts
npm run typecheck
```

**Prerequisites:**

- Tasks 1B, 11-15, 16A, 18, 19A-19D, and 20A-20C are complete.
- The production default in `kernelMode.ts` is still `shadow`.
- Tasks 20A/20B expose backed canonical artifact lookup, and Task 20C exposes
  read-only legacy projections with legacy lifecycle writers stopped.

**Files:**

- Create: `app/src/lib/jarvis/kernelTurnCommit.ts`
- Create: `app/src/lib/jarvis/kernelTurnCommit.test.ts`
- Create: `app/src/lib/db/kernelTurnTransactionAuthority.ts`
- Create: `app/src/lib/db/kernelTurnTransactionAuthority.test.ts`
- Create: `app/src/lib/jarvis/kernelRuntime.ts`
- Create: `app/src/lib/jarvis/kernelRuntime.test.ts`
- Modify: `app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.ts`
- Modify: `app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts`
- Modify: `app/src/lib/jarvis/executionJournal/abortRegistry.ts`
- Modify: `app/src/lib/jarvis/executionJournal/abortRegistry.test.ts`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/repositories.ts`
- Create: `app/src/lib/db/repositories.kernelTurn.test.ts`
- Modify: `app/src/lib/db/jarvisRepositories.ts`
- Modify: `app/src/lib/db/jarvisRepositories.test.ts`
- Create: `app/src/lib/jarvis/kernel.ts`
- Create: `app/src/lib/jarvis/kernel.integration.test.ts`
- Create: `app/src/lib/jarvis/kernelMessageProjection.ts`
- Create: `app/src/lib/jarvis/kernelMessageProjection.test.ts`
- Modify: `app/src/lib/jarvis/kernelMode.ts`
- Modify: `app/src/lib/jarvis/kernelMode.test.ts`
- Modify: `app/src/lib/jarvis/identity.ts`
- Modify: `app/src/lib/jarvis/identity.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/ai/runtimeSafety.test.ts`
- Modify: `app/src/types/chat.ts`
- Modify: `app/src/features/chat/streamingPreviewStore.ts`
- Modify: `app/src/features/chat/streamingPreviewStore.test.ts`
- Modify: `app/src/features/voice/speechGate.ts`
- Modify: `app/src/features/voice/speechGate.test.ts`
- Modify: `app/src/features/voice/streamingVoice.ts`
- Modify: `app/src/features/voice/streamingVoice.test.ts`
- Modify: `app/src/features/chat/ChatView.tsx`
- Modify: `app/src/features/chat/ChatThread.tsx`
- Modify: `app/src/features/chat/ChatThread.agentPanel.test.tsx`
- Modify: `app/src/features/chat/MessagePart.tsx`
- Modify: `app/src/features/chat/MessagePart.jarvisCreator.test.tsx`
- Modify: `app/src/lib/jarvis/responseListener.ts`
- Modify: `app/src/lib/jarvis/responseListener.test.ts`
- Modify: `app/src/components/layout/Inspector.tsx`
- Modify: `app/src/features/chat/Composer.tsx`
- Modify: `app/src/features/files/FilesPage.tsx`
- Modify: `app/src/features/files/FileExplorerDialog.tsx`
- Modify: `app/src/lib/ai/modelSelection.ts`
- Modify: `app/src/lib/ai/modelSelection.test.ts`

`app/src/types/common.ts` is intentionally not modified. Legacy `ContextRef`
continues to represent legacy file/chat references. Kernel provenance and
artifact references use explicit new message-part variants.

**Interfaces:**

- Consumes Tasks 11-15, Task 18's state machine/abort registry, Tasks 19A-19D's
  canonical approval/execution path, Tasks 20A/20B's backed artifacts, and Task
  20C's read-only legacy projections.
- Produces canonical protected typed-chat dispatch and source/artifact message
  projection for Task 21A and Task 17.
- Owns the only production-default change from `shadow` to `kernel`.

**Canonical dispatcher:**

```ts
export interface JarvisKernelTurnInput {
  run: Readonly<JarvisRun>;
  attempt: JarvisRequestAttempt;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId: string;
  parentRunId?: string;
  userMessageId: string;
  agent: Agent;
  surface: JarvisRequestEnvelope['surface'];
  interactionMode: JarvisRequestEnvelope['interactionMode'];
  userText: string;
  messageHistory: readonly LLMMessage[];
  model: JarvisModelSnapshot;
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  workingDirectory?: string;
}

export interface JarvisKernelTurnResult {
  request: Readonly<JarvisRequestEnvelope>;
  compiled: Readonly<CompiledJarvisPrompt>;
  response: Readonly<JarvisResponseEnvelope>;
  messageParts: readonly Part[];
}

export async function runJarvisKernelTurn(
  input: Readonly<JarvisKernelTurnInput>,
  deps: JarvisKernelDeps,
): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>>;

const preparedJarvisScheduledAttemptBrand: unique symbol = Symbol(
  'jarvis.prepared-scheduled-attempt',
);

/** @internal Materialized only after kernelRuntime verifies an issued seed. */
interface JarvisResolvedScheduledKernelAttempt {
  run: Readonly<JarvisRun>;
  attempt: JarvisRequestAttempt;
  request: Readonly<JarvisRequestEnvelope>;
  agent: Agent;
  workingDirectory?: string;
}

export type PreparedJarvisScheduledKernelAttempt = Readonly<{
  [preparedJarvisScheduledAttemptBrand]: true;
}>;

export type JarvisScheduledKernelAttemptOutcome =
  | { kind: 'committed'; result: JarvisKernelTurnResult }
  | { kind: 'pre_effect_transport_failure' };

/** @internal Exposed only as JarvisKernelRuntime methods. */
export async function prepareJarvisScheduledKernelAttempt(
  input: Readonly<JarvisResolvedScheduledKernelAttempt>,
  deps: JarvisKernelDeps,
): Promise<PreparedJarvisScheduledKernelAttempt>;

/** @internal Exposed only as JarvisKernelRuntime methods. */
export async function dispatchPreparedJarvisScheduledKernelAttempt(
  input: {
    prepared: PreparedJarvisScheduledKernelAttempt;
    handle: JarvisScheduledKernelAttemptHandle;
  },
  deps: JarvisKernelDeps,
): Promise<JarvisAuthorityBoundResult<JarvisScheduledKernelAttemptOutcome>>;
```

`runJarvisKernelTurn()` remains the initial typed-chat/Hive path and always
owns its initial `queued -> compiling -> running` sequence. Voice does not use
this public wrapper after Task 21A; it uses the single-handle entrypoint defined
there. This function is not a transport-retry API and production consumers call
it only through `runtime.runInitialTurn()`. Every lifecycle call propagates
`{ kind: 'account_authority_revoked' }` unchanged. Only a fully committed
terminal result returns `{ kind: 'committed', value }`; revocation is never
reported as provider failure, partial output, or success. The runtime disposes
the hidden binding in `finally`, after any active lifecycle/terminal transaction
has settled. Typed-chat and Hive callers must exhaustively map the two cases.

Scheduled preparation and dispatch are deliberately distinct. The public
runtime `prepareScheduledAttempt()` accepts only a registered opaque seed and
looks up all state in its host-owned WeakMap. Its internal `prepare...` helper
is pure with respect to lifecycle/external effects: it verifies the persisted
run and Task 11 attempt, requires exact run/request/attempt identity, and fully
validates/builds/compiles the runtime-reconstructed schedule request, but
performs no provider, approval, artifact, executor, message, run, or event
write. The returned prepared object is also fieldless and WeakMap-registered.
Task 17 then calls `beginPreparedScheduledAttempt({ prepared })`; the runtime
checks the seed's private `initial | transport_retry` mode, issues the binding,
obtains the corresponding Task 18 lease through the bound two-table CAS, and
durably stores the internally derived request/attempt/snapshot/time before
provider dispatch.
`dispatchPrepared...` requires an exact registered
prepared/handle/lease/run/request/attempt identity, re-reads that attempt as
`provider_in_flight` through the same bound lifecycle, passes the same
account/run/request/attempt binding into Task 13's protected router, and starts
at provider registration/dispatch. It never invokes or simulates the initial
`queued -> compiling -> running` sequence and never replays an earlier
approval, artifact adapter, message projection, or consequential effect.
The runtime's scheduled begin, retry, dispatch, and settlement methods all use
the same outer `JarvisAuthorityBoundResult<T>` contract. Revocation before a
handle exists disposes the hidden binding after the attempted transaction
settles and returns the revoked case. Revocation after a handle exists returns
the revoked case and disposes that exact handle only after every active
signal-bound write settles. It is never caught by the provider-transport
failure branch. A `pre_effect_transport_failure` remains nested only inside a
committed authority result and is the sole result that deliberately retains the
handle for proof plus settlement.

Only Task 13's closed failure before the first response byte/chunk, exact-bound
to the prepared account/run/request/attempt and carrying
`responseStarted: false`, `chunkCount: 0`, and `actionDispatchCount: 0`, may
return `pre_effect_transport_failure`; that result performs no terminal commit
and does not dispose the handle. The runtime stores the exact failure privately
on that handle. Task 17 can call only
`settleScheduledTransportFailure({ handle })`; the runtime obtains and
revalidates Task 19B proof and its numeric clock internally while the binding
remains live, then invokes the private signal-bound coordinator. Any started
or interrupted response stream is processed through Task 14 into truthful
safe accumulated output and a terminal `partial | failed | cancelled` result;
it offers only a later logical retry with a new run. Response-processing,
approval, executor, artifact, database, or other post-response failure is not
this outcome and cannot authorize same-run transport retry.

**Canonical execution order:**

For protected typed JARVIS:

1. verify canonical account, `input.run.id === input.attempt.runId`, and the
   already-persisted Task 18 run; subscribe before capture, create the frozen
   start-bound account/owner binding, and synchronously recheck it before any
   post-allocation lifecycle write or provider dispatch;
2. transition `queued -> compiling` through the bound two-table lifecycle
   capability; revocation returns without a stale transition;
3. build and validate one envelope;
4. compile one prompt;
5. transition `compiling -> running` through that same bound capability;
6. create one provider controller, register it exactly once through the bound
   lifecycle, retain its one disposer, and make authority revocation abort the
   same controller. The lifecycle derives account/run/request/attempt scope, so
   the input is exactly:

```ts
{
  registrationId: `${runId}:provider`,
  kind: 'provider_stream',
  abort: () => {
    controller.abort();
    return {
      kind: 'signal_delivered',
      ownerId: `${runId}:provider`,
    } satisfies JarvisCancellationOwnerOutcome;
  },
}
```

7. call `prepareProvider()` exactly once (no external effect), then await
   `prepared.resolveConfiguration()` without replacing or registering another
   abort owner; after that final await, recheck the same
   host/account/run/request/attempt authority and synchronously invoke
   `resolved.start(signal)` with no intervening await or untrusted callback;
8. use only the returned runtime-issued start receipt to append the fixed Task
   18 `provider`/`phase: 'start'` source event and canonical live row through
   `recordProviderStarted()`; await verifier acceptance, exact row readback,
   and proof application before exposing a provider node or releasing buffered
   chunks; if this post-start publication fails, abort the started transport
   and report explicit uncertain/non-retryable truth;
9. pass deltas only through Task 15's preview gate/store;
10. process the final/terminal response through Task 14;
11. materialize verified `JarvisArtifactV1` values through the matching Task
    20B named producer adapter;
12. project response/source/artifact refs into typed message parts;
13. build the complete assistant `Message` and terminal event input in memory;
14. call `commitKernelTurn()` exactly once for the terminal run/event carrying
    the matching `provider`/`phase: 'result'` source member, assistant message,
    chat recency/sync rows, and all artifact rows;
15. complete/degrade the provider live node only by re-reading that exact
    terminal source row, verifying canonical final provider evidence, then
    committing live evidence linked to the active proof through the still-bound
    lifecycle capability and reading it back;
    otherwise dispose only current-process active visibility; clear preview,
    dispose the exact provider abort registration, and dispose the account
    binding only after any signal-bound terminal transaction settles in
    `finally`.

Approval creation/consumption and consequential action execution use Task 19.
Kernel mode never invokes legacy auto-approval directly.

**Preview, partial, and persistence rules:**

- Do not create an empty assistant placeholder in kernel mode.
- Provider deltas update only `streamingPreviewStore`.
- No preview chunk is a canonical message, terminal activity state, artifact,
  approval, or event body.
- On normal completion, persist only final validated projected parts.
- On cancellation or provider interruption, run the safe accumulated preview
  through Task 14 with verified `cancelled`, `failed`, or `timed_out` facts.
  Persist it only as a final validated partial/cancellation envelope.
- If no safe partial exists, persist the deterministic terminal-state
  template.
- Never persist the raw accumulator on an error path.
- Remove `streamingVoice.onDelta(rawString)`. Only
  `enqueueValidatedChunk()` or final `spokenText` may reach TTS.
- Abort signal delivery remains nonterminal; only the owning provider/executor
  confirmation may transition the run to `cancelled`.

**Safe failures:**

Envelope validation failure:

- zero provider calls;
- build the deterministic safe local error message plus failed transition
  event in memory and call `commitKernelTurn()` once;
- persist no fabricated assistant output beyond that atomic safe error
  envelope.

Journal create/transition failure before provider dispatch:

- zero provider calls;
- retain the already-persisted user message;
- persist no assistant placeholder;
- surface a recovery error with a safe category.

Journal failure after provider output:

- do not write an unjournaled success message;
- retain the user message and canonical run evidence already committed;
- surface a recovery error;
- never fall back to legacy in the same logical execution.

Task 13 unsupported transport:

- zero provider calls;
- build the safe failed message/event in memory and call
  `commitKernelTurn()` once;
- no mutable legacy prompt fallback.

**Typed source and artifact projection:**

Add these variants to `Part` in `types/chat.ts`:

```ts
export type JarvisSourceMessageRef = {
  id: string;
  kind: JarvisSourceKind;
  label: string;
  uri?: string;
  trust: JarvisSourceRef['trust'];
  sensitivity: JarvisSourceRef['sensitivity'];
  observedAt?: number;
};

export type JarvisArtifactMessageRef = {
  id: string;
  kind: JarvisArtifact['kind'];
  title: string;
  state: JarvisArtifactState;
  uri?: string;
  safeSummary?: string;
};

export type Part =
  | /* existing variants unchanged */
  | { kind: 'jarvis_source_ref'; source: JarvisSourceMessageRef }
  | { kind: 'jarvis_artifact_ref'; artifact: JarvisArtifactMessageRef };
```

Projection surface:

```ts
export function projectJarvisEnvelopeToMessageParts(input: {
  response: Readonly<JarvisResponseEnvelope>;
  artifacts: readonly JarvisArtifactV1[];
}): readonly Part[];
```

Rules:

- preserve every existing structured `response.parts` item;
- append each unique source ID once;
- append each unique artifact ID once;
- every `response.artifactIds` value resolves to a real Task 20A row with
  backing; a missing row is a typed projection error, not a fake card;
- keep source `accountId` in the canonical envelope/journal but not in visible
  projection copy;
- omit restricted/secret source URIs;
- never copy artifact inline content into a part;
- `MessagePart.tsx` renders safe labels, state, and real links only;
- old `file_ref` and every historical part render unchanged.

**Protected-agent helper and slug-only call sites:**

Consume Task 13P's identity helper:

```ts
export function findProtectedJarvisAgent<T extends Pick<Agent, 'builtin' | 'slug'>>(
  agents: Iterable<T>,
): T | undefined;
```

It already returns the first agent satisfying `isProtectedJarvisAgent()`; Task
16B may add call-site coverage but does not define a second helper.

Replace slug-only protected behavior in:

```text
app/src/components/layout/Inspector.tsx
app/src/features/chat/Composer.tsx
app/src/features/files/FilesPage.tsx
app/src/features/files/FileExplorerDialog.tsx
app/src/lib/ai/modelSelection.ts
app/src/lib/ai/runtime.ts
```

`app/src/App.tsx` remains owned/tested by Task 1B and must already use the same
predicate/helper before Task 16A.

Collision rules:

- `builtin: false, slug: 'jarvis'` remains a normal user agent;
- it is not selected as the protected default;
- it receives no JARVIS model override, prompt compiler, response enforcer,
  profile storage, greeting interception, hidden-editor behavior, or
  auto-approval treatment;
- the protected built-in retains those exact paths.

After changes:

```powershell
rg -n --fixed-strings ".slug === 'jarvis'" app/src/App.tsx app/src/components/layout/Inspector.tsx app/src/features/chat/Composer.tsx app/src/features/files/FilesPage.tsx app/src/features/files/FileExplorerDialog.tsx app/src/lib/ai/modelSelection.ts app/src/lib/ai/runtime.ts
```

Expected: no output. Explicit user-facing slug parsing in unrelated routing
utilities is not redefined as protected identity.

**Activation and rollback:**

1. Leave `DEFAULT_JARVIS_KERNEL_MODE = 'shadow'`.
2. Implement the kernel and run focused integration tests with an explicit
   internal `kernel` override.
3. Prove non-JARVIS, rollback, safety, persistence, cancellation, source, and
   artifact cases pass.
4. Change only:

```ts
export const DEFAULT_JARVIS_KERNEL_MODE: JarvisKernelMode = 'kernel';
```

5. Rerun the same tests without an override.
6. Rerun runtime safety and Task 13 transport tests.

Do not switch the default before the explicit override suite passes.

An internal `legacy` override routes protected chat through compatibility
runtime while still enforcing Task 4 source admission, Task 5 entitlements,
Task 6 browser quarantine, Task 9 private-sync guard, and Task 13 unsupported
transport denial. Rollback leaves Dexie v3 intact and cannot delete or
downgrade it.

**19B/19D wiring files added to this commit boundary:**

- Modify: `app/src/App.tsx`
- Modify: `app/src/App.kernelHost.test.tsx`
- Modify: `app/src/lib/jarvis/kernelHost.ts`
- Modify: `app/src/lib/jarvis/kernelHost.test.ts`
- Modify: `app/src/lib/actions/runner.ts`
- Modify: `app/src/lib/actions/runner.test.ts`
- Modify: `app/src/lib/actions/autoApprove.ts`
- Modify: `app/src/lib/actions/autoApprove.test.ts`
- Modify: `app/src/lib/jarvis/operatorListener.ts`
- Modify: `app/src/lib/jarvis/operatorListener.test.ts`
- Modify: `app/src/features/chat/ActionApprovalCard.tsx`
- Modify: `app/src/features/chat/ActionApprovalCard.test.tsx`
- Modify: `app/src/features/browser/browserTypes.ts`
- Modify: `app/src/features/browser/browserStore.ts`
- Modify: `app/src/features/browser/browserStore.test.ts`
- Modify: `app/src/features/browser/browserActions.ts`
- Modify: `app/src/features/browser/browserActions.test.ts`
- Modify: `app/src/features/browser/BrowserPage.tsx`
- Modify: `app/src/features/browser/BrowserPage.approval.test.tsx`

These join the already listed runtime, `MessagePart`, Composer, and kernel
files. The host constructs the real port before any consumer is mounted;
operator, runner, auto-approve, card, and MessagePart paths exhaustively map
authority results and have no optional compatibility fallback after the
default switch.

This slice also mounts Task 19D's pure `browserApprovalAdapter`. The browser
store remains a bounded, session-local view and persists neither reviewed
records nor approvals. It projects only `runId` and `approvalId`; Approve sends
only that approval ID plus the current origin/tab/frame context to the closed
kernel action port. The engine reloads the authoritative immutable reviewed
record and canonical approval, then revalidates action version, parameters,
target, risk, capability, entitlement, expiry, account, and single-use state
before CDP execution. Origin/tab/frame are comparison context only; target and
capability are never accepted from UI and are reloaded solely by the engine.
Every programmatic safe operation uses
`executeAutoApprovedSafe()`; consequential operations use the persisted flow;
`user_only` rejects programmatic use. Human direct browser gestures remain the
only non-programmatic path. `browser.stop` routes through canonical Task 18
cancellation and reports current CDP cancellation as `unsupported` unless an
actual per-command abort owner proves delivery; local queue clearing never
claims terminal cancellation.

- [ ] **Step 1: Write the focused failing integration tests**

Cover explicit kernel currently returning `kernel_mode_not_ready`; one
envelope/compiler/provider/pipeline for protected chat; user-created slug
collision and non-JARVIS staying legacy; request/run continuity; transport
versus logical retry IDs; named artifact/kernel composition with no raw
verifier exposure; lawful cross-module commit/transaction exports; real-Dexie
seven-table adapter/owner-sidecar order and rollback; singleton boot composition; alternate
transaction/artifact pair rejection; scheduled prepare with zero writes/effects
and only a runtime-issued fieldless seed; fieldless prepared object; no public
request/attempt/snapshot/failure/proof/time input; explicit scheduled dispatch
from a valid persisted lease without replaying initial
transitions; pre-effect transport failure left for the safety coordinator;
Task 18's `JarvisLiveEvidenceAttemptScope` compiling independently and Task
16B aliasing rather than redefining it; the exact two-member deep runtime
composition; serialized primary-host account open/reconstruction before read,
old-session epoch revocation, account-bound mismatch denial, synchronous
currentness success only for the active epoch, disposed/replaced same-account
assertion failure, idempotent session/host disposal, and static denial of the host lifecycle outside
`app/src/lib/ai/runtime.ts`/primary `App.tsx`; no raw maintenance or global read
port in feature/native-client surfaces; no result-recording method on a
scheduled handle;
exact two-table lifecycle authority/order; every post-binding transition,
source-event append, scheduled begin/retry/settlement, and live-evidence write
using the same signal through commit settlement; revocation at each callback/
commit gap with zero stale rows; runtime WeakSet rejection of forged, cloned,
disposed, and foreign bindings/handles; post-await immediate pre-artifact-
consumption revocation check;
sole boot-scoped Task 13 attempt authority construction, exact protected
dispatch binding, teardown invalidation, no alternate factory import; provider
live registration only after the exact closed provider-source start member is
durably committed at `resultEventSeq`, verifier-accepted, and read back;
terminal live completion only after the matching closed result member;
ordinary-status/execution-evidence-only/forged/cross-account/stale result denial;
linked completion proof; durable completed reconstruction with orphaned active
omission; no raw placeholder;
ephemeral preview and clear; no
preview persistence; one final message; safe cancelled/failed partial;
exactly one provider controller/registration/disposer and the identical signal
through prepare/configuration/start and every failure boundary; same-account
cross-run, cross-request, stale-attempt, cast/clone, disposed, and foreign-
runtime scope rejection before reads/transactions/effects; structured parts; typed source/artifact
projection/rendering; missing artifact backing; response-listener direct write
removal; validation before provider; journal failure retaining the user
message; unsupported transport fail-closed; rollback interlocks; activation
order; every protected call site rejecting the collision; and Browser
Operator adapter mounting, ID-only approval/context submission,
authoritative record reload, drift/replay/denial, safe-auto routing,
`user_only`, store non-persistence, honest `browser.stop` unsupported
truth, and no local terminal-state claim.

- [ ] **Step 2: Run the initial RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/kernelTurnCommit.test.ts src/lib/db/kernelTurnTransactionAuthority.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/jarvis/kernelMessageProjection.test.ts src/lib/jarvis/kernelMode.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/lib/jarvis/identity.test.ts src/lib/ai/modelSelection.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/lib/jarvis/responseListener.test.ts src/App.kernelHost.test.tsx src/lib/jarvis/kernelHost.test.ts src/lib/actions/runner.test.ts src/lib/actions/autoApprove.test.ts src/lib/jarvis/operatorListener.test.ts src/features/chat/ActionApprovalCard.test.tsx src/features/browser/browserApprovalAdapter.test.ts src/features/browser/browserStore.test.ts src/features/browser/browserActions.test.ts src/features/browser/BrowserPage.approval.test.tsx
```

Expected: FAIL because the canonical dispatcher/projection do not exist and
explicit kernel mode is not ready.

- [ ] **Step 3: Implement canonical cutover while the default stays shadow**

Implement the exact dispatcher, preview/response/artifact/message ordering,
safe failures, protected-agent call-site cleanup, and rollback behavior. Keep
`DEFAULT_JARVIS_KERNEL_MODE = 'shadow'`.

- [ ] **Step 4: Prove explicit kernel mode before activation**

```powershell
npm --prefix app test -- src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/kernelTurnCommit.test.ts src/lib/db/kernelTurnTransactionAuthority.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/jarvis/kernelMessageProjection.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/App.kernelHost.test.tsx src/lib/jarvis/kernelHost.test.ts src/lib/actions/runner.test.ts src/lib/actions/autoApprove.test.ts src/lib/jarvis/operatorListener.test.ts src/features/chat/ActionApprovalCard.test.tsx src/features/browser/browserApprovalAdapter.test.ts src/features/browser/browserStore.test.ts src/features/browser/browserActions.test.ts src/features/browser/BrowserPage.approval.test.tsx
```

Expected: PASS with the production default still `shadow`.

- [ ] **Step 5: Change the default to kernel and rerun focused and broader verification**

Change only the default constant after Step 4 passes, then run:

```powershell
npm --prefix app test -- src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/kernelTurnCommit.test.ts src/lib/db/kernelTurnTransactionAuthority.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/jarvis/kernelMessageProjection.test.ts src/lib/jarvis/kernelMode.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/lib/jarvis/identity.test.ts src/lib/ai/modelSelection.test.ts src/lib/ai/providerPromptTransport.test.ts src/lib/ai/providerAttemptEvidence.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/lib/jarvis/responseListener.test.ts src/App.kernelHost.test.tsx src/lib/jarvis/kernelHost.test.ts src/lib/actions/runner.test.ts src/lib/actions/autoApprove.test.ts src/lib/jarvis/operatorListener.test.ts src/features/chat/ActionApprovalCard.test.tsx src/features/browser/browserApprovalAdapter.test.ts src/features/browser/browserStore.test.ts src/features/browser/browserActions.test.ts src/features/browser/BrowserPage.approval.test.tsx
npm run typecheck
rg -n --fixed-strings ".slug === 'jarvis'" app/src/App.tsx app/src/components/layout/Inspector.tsx app/src/features/chat/Composer.tsx app/src/features/files/FilesPage.tsx app/src/features/files/FileExplorerDialog.tsx app/src/lib/ai/modelSelection.ts app/src/lib/ai/runtime.ts
```

Expected: focused tests and typecheck pass; the slug-only scan produces no
output; tests without an override prove the default is now `kernel`.

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/App.tsx' 'app/src/App.kernelHost.test.tsx' 'app/src/lib/jarvis/kernelHost.ts' 'app/src/lib/jarvis/kernelHost.test.ts' 'app/src/lib/actions/runner.ts' 'app/src/lib/actions/runner.test.ts' 'app/src/lib/actions/autoApprove.ts' 'app/src/lib/actions/autoApprove.test.ts' 'app/src/lib/jarvis/operatorListener.ts' 'app/src/lib/jarvis/operatorListener.test.ts' 'app/src/features/chat/ActionApprovalCard.tsx' 'app/src/features/chat/ActionApprovalCard.test.tsx' 'app/src/features/browser/browserTypes.ts' 'app/src/features/browser/browserStore.ts' 'app/src/features/browser/browserStore.test.ts' 'app/src/features/browser/browserActions.ts' 'app/src/features/browser/browserActions.test.ts' 'app/src/features/browser/BrowserPage.tsx' 'app/src/features/browser/BrowserPage.approval.test.tsx'
git diff --cached -- 'app/src/App.tsx' 'app/src/App.kernelHost.test.tsx' 'app/src/lib/jarvis/kernelHost.ts' 'app/src/lib/jarvis/kernelHost.test.ts' 'app/src/lib/actions/runner.ts' 'app/src/lib/actions/runner.test.ts' 'app/src/lib/actions/autoApprove.ts' 'app/src/lib/actions/autoApprove.test.ts' 'app/src/lib/jarvis/operatorListener.ts' 'app/src/lib/jarvis/operatorListener.test.ts' 'app/src/features/chat/ActionApprovalCard.tsx' 'app/src/features/chat/ActionApprovalCard.test.tsx' 'app/src/features/browser/browserTypes.ts' 'app/src/features/browser/browserStore.ts' 'app/src/features/browser/browserStore.test.ts' 'app/src/features/browser/browserActions.ts' 'app/src/features/browser/browserActions.test.ts' 'app/src/features/browser/BrowserPage.tsx' 'app/src/features/browser/BrowserPage.approval.test.tsx'
git add -- 'app/src/lib/jarvis/kernelTurnCommit.ts' 'app/src/lib/jarvis/kernelTurnCommit.test.ts' 'app/src/lib/db/kernelTurnTransactionAuthority.ts' 'app/src/lib/db/kernelTurnTransactionAuthority.test.ts' 'app/src/lib/jarvis/kernelRuntime.ts' 'app/src/lib/jarvis/kernelRuntime.test.ts' 'app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.ts' 'app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts' 'app/src/lib/jarvis/executionJournal/abortRegistry.ts' 'app/src/lib/jarvis/executionJournal/abortRegistry.test.ts' 'app/src/lib/db/schema.ts' 'app/src/lib/db/repositories.ts' 'app/src/lib/db/repositories.kernelTurn.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts' 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/jarvis/kernelMessageProjection.ts' 'app/src/lib/jarvis/kernelMessageProjection.test.ts' 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/identity.ts' 'app/src/lib/jarvis/identity.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts' 'app/src/types/chat.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/chat/ChatView.tsx' 'app/src/features/chat/ChatThread.tsx' 'app/src/features/chat/ChatThread.agentPanel.test.tsx' 'app/src/features/chat/MessagePart.tsx' 'app/src/features/chat/MessagePart.jarvisCreator.test.tsx' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts' 'app/src/components/layout/Inspector.tsx' 'app/src/features/chat/Composer.tsx' 'app/src/features/files/FilesPage.tsx' 'app/src/features/files/FileExplorerDialog.tsx' 'app/src/lib/ai/modelSelection.ts' 'app/src/lib/ai/modelSelection.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/kernelTurnCommit.ts' 'app/src/lib/jarvis/kernelTurnCommit.test.ts' 'app/src/lib/db/kernelTurnTransactionAuthority.ts' 'app/src/lib/db/kernelTurnTransactionAuthority.test.ts' 'app/src/lib/jarvis/kernelRuntime.ts' 'app/src/lib/jarvis/kernelRuntime.test.ts' 'app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.ts' 'app/src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts' 'app/src/lib/jarvis/executionJournal/abortRegistry.ts' 'app/src/lib/jarvis/executionJournal/abortRegistry.test.ts' 'app/src/lib/db/schema.ts' 'app/src/lib/db/repositories.ts' 'app/src/lib/db/repositories.kernelTurn.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts' 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/jarvis/kernelMessageProjection.ts' 'app/src/lib/jarvis/kernelMessageProjection.test.ts' 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/identity.ts' 'app/src/lib/jarvis/identity.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts' 'app/src/types/chat.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/chat/ChatView.tsx' 'app/src/features/chat/ChatThread.tsx' 'app/src/features/chat/ChatThread.agentPanel.test.tsx' 'app/src/features/chat/MessagePart.tsx' 'app/src/features/chat/MessagePart.jarvisCreator.test.tsx' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts' 'app/src/components/layout/Inspector.tsx' 'app/src/features/chat/Composer.tsx' 'app/src/features/files/FilesPage.tsx' 'app/src/features/files/FileExplorerDialog.tsx' 'app/src/lib/ai/modelSelection.ts' 'app/src/lib/ai/modelSelection.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(chat): cut protected Jarvis over to the kernel"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the sixty-five files across the
two literal staging blocks above. The
installer and whitespace queries produce no output.

## Task 21A: Voice-Session Binding Through the Canonical Kernel

**Prerequisites:**

- Task 16B's default kernel cutover is complete.
- Task 18 supports multiple labelled abort registrations per run.
- Task 19 approval/action execution and Task 20 artifacts are canonical.

**Files:**

- Create: `app/src/features/voice/voiceSessionBinding.ts`
- Create: `app/src/features/voice/voiceSessionBinding.test.ts`
- Modify: `app/src/features/voice/voiceChatRouting.ts`
- Modify: `app/src/features/voice/voiceChatRouting.test.ts`
- Modify: `app/src/features/voice/voiceTurnCommit.ts`
- Modify: `app/src/features/voice/voiceTurnCommit.test.ts`
- Create: `app/src/features/voice/voiceResponseRecovery.ts`
- Create: `app/src/features/voice/voiceResponseRecovery.test.ts`
- Modify: `app/src/features/voice/store.ts`
- Modify: `app/src/features/voice/store.test.ts`
- Modify: `app/src/features/voice/VoiceModal.tsx`
- Modify: `app/src/features/voice/VoiceModal.turn.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.stop.test.tsx`
- Modify: `app/src/features/voice/voiceRouter.ts`
- Modify: `app/src/features/voice/voiceRouter.test.ts`
- Modify: `app/src/features/voice/streamingVoice.ts`
- Modify: `app/src/features/voice/streamingVoice.test.ts`
- Modify: `app/src/lib/jarvis/kernel.ts`
- Modify: `app/src/lib/jarvis/kernel.integration.test.ts`
- Modify: `app/src/lib/jarvis/kernelTurnCommit.ts`
- Modify: `app/src/lib/jarvis/kernelTurnCommit.test.ts`
- Modify: `app/src/lib/jarvis/kernelRuntime.ts`
- Modify: `app/src/lib/jarvis/kernelRuntime.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/App.tsx`
- Create: `app/src/App.voiceResponseRecovery.test.tsx`

**Interfaces:**

- Consumes Task 16B's canonical kernel runtime, Task 18's labelled abort and
  live-evidence registries plus atomic verified transition, and Task 15's
  speech/playback gates.
- Produces one immutable voice-session binding plus one runtime-issued opaque
  per-turn handle and canonical voice envelope lineage for Task 17 and Task
  21B.
- Does not create a second voice lifecycle or treat abort delivery as a
  terminal cancellation.

**Exact binding:**

```ts
export interface VoiceSessionBinding {
  sessionId: string;
  accountId: string;
  chatId: ChatId;
  startedAt: number;
  activeRunId?: string;
}

export function newVoiceSessionId(): string;

export function createVoiceSessionBinding(input: {
  sessionId: string;
  accountId: string;
  chatId: ChatId;
  startedAt: number;
}): Readonly<VoiceSessionBinding>;
```

`useVoiceStore` adds:

```ts
session: Readonly<VoiceSessionBinding> | null;
beginSession(binding: Readonly<VoiceSessionBinding>): boolean;
setSessionRun(runId: string | undefined): void;
endSession(): void;
```

`newVoiceSessionId()` returns
`vsession_${globalThis.crypto.randomUUID()}`. If Web Crypto is unavailable,
session start fails safely instead of using a timestamp-only or shared ID.

Rules:

- `beginSession()` succeeds only when no session is active.
- Capture the binding once when voice opens after resolving both canonical
  account identity and a protected JARVIS chat.
- Route, Workbench tab, active-chat, project-panel, or later
  `ensureJarvisChatForVoice()` changes cannot replace the binding.
- Account change ends the old session before a new session begins.
- A malformed cloud session or missing canonical identity starts no bound
  session.
- Closing requests cancellation for the active run before clearing the
  binding.
- Default JARVIS voice turns always use `session.chatId`.
- Explicit non-JARVIS voice turns retain the legacy agent path and receive no
  protected identity merely because their slug collides.

**Protected chat resolution:**

Replace slug-only `isJarvisChat()` behavior with `isProtectedJarvisAgent()`.
An unbound chat defaults to the protected built-in only after
`findProtectedJarvisAgent()` succeeds. A user-created `jarvis` slug is not a
protected default.

**Voice envelope and transcript:**

Every bound protected turn calls `runtime.startVoiceTurn()` with the same
kernel input and:

```ts
{
  surface: 'voice',
  accountId: session.accountId,
  chatId: session.chatId,
}
```

- User message, run, request, response, source refs, artifact refs, and spoken
  text share that account/chat/run lineage.
- `VoiceModal` transcript reads `session.chatId`, not mutable
  `activeChatId`.
- `focusVoiceChat()` may change visible navigation but cannot mutate the
  session binding.
- Store the current run ID only after Task 18 returns the canonical run.
- Clear it only after the kernel reaches a verified terminal state.
- Exhaustively handle `{ kind: 'committed', value: { result, handle } }` versus
  `{ kind: 'account_authority_revoked' }`; the revoked case starts no playback,
  message commit, or fallback provider call.

**Two-phase atomic voice persistence:**

Typed chat keeps Task 16B's one-phase terminal commit. A protected voice turn
uses two distinct database transactions so a durable response can exist while
playback is still truthfully in progress:

```ts
const jarvisVoiceTurnHandleBrand: unique symbol = Symbol('jarvis.voice-turn-handle');

export type VoiceResponseReadyCommitResult =
  | {
      committed: true;
      run: JarvisRun;
      event: JarvisEvent;
      message: Message;
      artifacts: readonly JarvisArtifactV1[];
    }
  | {
      committed: false;
      reason: 'status_conflict' | 'attempt_conflict' | 'response_ready_conflict';
      actualStatus: JarvisRunStatus;
    };

export type JarvisVoicePlaybackCommitResult =
  | { committed: true; run: JarvisRun; event: JarvisEvent }
  | { committed: false; reason: 'status_conflict'; actualStatus: JarvisRunStatus };

export interface JarvisVoiceTurnHandle {
  readonly [jarvisVoiceTurnHandleBrand]: true;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  commitResponseReady(): Promise<JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>>;
  runValidatedPlayback(): Promise<JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>>;
  dispose(): void;
}

export interface JarvisVoiceRecoveryHandle {
  commitRecoveredPartial(): Promise<
    JarvisAuthorityBoundResult<
      | { committed: true; run: JarvisRun; event: JarvisEvent }
      | { committed: false; reason: 'status_conflict'; actualStatus: JarvisRunStatus }
    >
  >;
  dispose(): void;
}

export interface JarvisKernelRuntime {
  startVoiceTurn(input: Readonly<JarvisKernelTurnInput> & { surface: 'voice' }): Promise<
    JarvisAuthorityBoundResult<{
      result: JarvisKernelTurnResult;
      handle: JarvisVoiceTurnHandle;
    }>
  >;
  openVoiceRecovery(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisVoiceRecoveryHandle>>;
}
```

Task 21A modifies `kernelRuntime.ts` and its focused test. Only that runtime can
start a voice turn or open recovery. `startVoiceTurn()` accepts the already
allocated `queued` run and exact Task 11 attempt, issues Task 16B's registered
account binding and the module-private `WeakSet`-registered voice handle before
the first `queued -> compiling` write, then passes that same bound lifecycle
into the internal compiler/provider/response path. The internal path is not
allowed to issue a second binding. It returns the processed response together
with that same handle, still live for response-ready persistence and playback.
Before returning, the runtime stores the exact final validated assistant-message
projection, Task 20 runtime-issued artifact identities, complete response
envelope, and its validated `spokenText` only in that handle's host-owned
WeakMap state. Neither handle method accepts a response, message, artifact, or
speech payload.
Any authority revocation is returned as the outer revoked case, never provider
failure or a response result, and the handle is disposed after active
transactions settle.

That WeakMap also owns the closed phase `response_pending |
response_commit_in_flight | response_ready_committed | playback_in_flight |
disposed`. `commitResponseReady()` synchronously claims
`response_pending -> response_commit_in_flight`, serializes concurrent calls,
and advances to `response_ready_committed` only after the seven-table
transaction commits and exact message/artifact/`response_ready` event readback
matches the captured result; an idempotent later call returns that same
readback. After a rollback, only the runtime's internal evidence re-read and
artifact rematerialization may restore `response_pending` for a bounded retry.
`runValidatedPlayback()` synchronously claims
`response_ready_committed -> playback_in_flight` to prevent double speech, then
re-reads the exact durable message/artifact/`response_ready` evidence before any
TTS/playback setup or missing-speech terminalization. Calling it before response
readiness, during response commit, concurrently, after consumption, or with
missing/changed durable readback fails with a typed
`voice_handle_phase_conflict` and zero adapter, live-evidence, event, or run
effect. No feature can advance or reset this phase.

The feature never imports a binding/issuer/commit port, never supplies
account/run/request/attempt to a commit, and cannot construct or replay a
handle. A handle is process-local, never stored in Zustand/IndexedDB, and
becomes permanently invalid after `dispose()` or authority revocation. Recovery
opens a fresh handle only after re-reading a response-ready run and its exact
persisted attempt and returns the same explicit authority-bound outcome.

Feature code supplies no response-ready or playback payload: it may only invoke
`commitResponseReady()` and `runValidatedPlayback()` on the runtime-issued
handle. The runtime loads the exact captured message/artifacts/envelope from
that handle, derives all event fields from the bound attempt, and sends only the
captured validated envelope's `spokenText` to its configured TTS adapter. It
verifies opaque adapter/native receipts against its private engine registry,
derives the workflow outcome internally, and performs the matching terminal CAS
inside `runValidatedPlayback()`. No canonical event, status, idempotency key,
producer/source member, engine ID, execution/result reference, capability,
executor identity, raw/provider text, alternate message, artifact list,
verified outcome, or terminal-commit method crosses the feature boundary;
extra arguments supplied through a structural cast are ignored and can never
replace handle state. Cast/clone/foreign receipt or handle attempts fail the
host-owned WeakSet/WeakMap check before a transaction.

The runtime retains the hidden binding through response persistence, playback,
terminal persistence, and transaction settlement. Account/scope change ends
the old handle and aborts provider/TTS/playback plus any active Dexie
transaction; a replacement session must obtain a new runtime-issued handle.
`voiceChatRouting.ts` owns the one process-local handle in a lexical
`try/finally`; it never places it in Zustand. Every exit path calls the
idempotent `dispose()` only after the pending handle method has settled.
`runValidatedPlayback()` also disposes internally in its own `finally` after success,
status conflict, authority revocation, or thrown database error. Thus double
cleanup is harmless, while a forgotten caller cannot leave an auth/scope
subscription or WeakSet entry behind. `commitResponseReady()` retains the
handle only on outer `committed` plus inner `committed: true` so playback can
continue; conflict and outer authority-revoked flows return to the caller's
`finally`. Every caller exhaustively handles the outer authority result before
inspecting the inner status/attempt result; revocation is never represented by
an inner `reason`, transport failure, or ordinary status conflict. A deliberate database
retry must remain inside that lexical lifetime and rematerialize artifacts as
required below.
Phase 1, `commitResponseReady()`, runs over exact
Dexie tables `messages`, `chats`, `sync_queue`, `settings`, `jarvis_runs`,
`jarvis_events`, and `jarvis_artifacts` in that immutable order. Both queue
writes use the binding's identical frozen owner through Task 16B's
`enqueueLocalSyncInTransaction()` and therefore atomically preserve the
owner-sidecar/no-pending-claim/no-legacy-authority invariant. The commit
requires the run to remain `running`, consumes fresh
Task 20 artifact identities only after every artifact and private pending
identity repeats exact `accountId`/`runId`/`requestId`/`attemptNumber`,
then re-verifies the runtime-issued handle and calls the hidden binding's
`assertCurrent()` after all awaited guards and immediately before the
synchronous private identity-consumption loop (with no intervening await),
inserts the exact handle-captured final validated assistant message and
artifacts, updates chat
recency plus exact owner-bound message/chat sync rows, and appends one
nonterminal event forced to:

```ts
{
  type: 'message',
  status: 'response_ready',
  idempotencyKey: `voice-response-ready:${runId}:${assistantMessage.id}`,
  title: 'Voice response ready',
  safeSummary: 'The validated response is saved and awaiting playback outcome.',
  artifactIds: artifacts.map((artifact) => artifact.id),
}
```

It does **not** change the run status or set `completedAt`. An exact handle
retry returns the same message/event/artifacts without inserting duplicates; a
changed internal message or artifact set under that derived key fails closed.
An artifact/request/attempt mismatch returns `attempt_conflict` before any
private identity is consumed or database write occurs.
If the phase-1 database transaction rolls back, Task 20's consumed in-memory
artifact identities are not rewound; the runtime must re-read producer evidence
and rematerialize every artifact through its named adapter before an internal
database retry. Feature code cannot supply replacement artifacts.

Every bound handle method verifies the handle/hidden binding before opening and at
callback entry, and passes the hidden revocation signal through
`runSignalBoundWrite()` until settlement. Phase 2 inside
`runValidatedPlayback()` uses Task
16B's already-declared `lifecycleTransaction(['jarvis_runs', 'jarvis_events'],
signal, body)` method; it applies Task 9's context-bound expected-status core
rather than opening a nested or independent transaction. It writes no message,
chat, sync, or artifact row.
The private terminal core is unreachable to feature code and runs only after
one of these independently verified conditions:

- final validated playback completes: `completed`;
- the workflow coordinator independently confirms every causally active
  provider/TTS/playback owner, including late registrations and completed
  handoffs, is quiescent: `cancelled`;
- the response is saved but TTS is unavailable, degraded, or fails:
  `partial`;
- an owning deadline verifies timeout: `timed_out`;
- an owning post-response failure makes the saved response unusable: `failed`.

A stop request or signal delivery alone performs neither phase-2 transition
nor a replacement message write. If completion wins first, cancellation loses
the expected-status compare. If verified cancellation wins first, late
completion loses. Phase 1 can never be rerun to overwrite the saved response
after any terminal state.

**Recovery and duplicate prevention:**

`voiceResponseRecovery.ts` runs from the existing account-scoped,
coordinator-ready boot in `App.tsx`. It examines only bounded Task 18
`fail_closed` decisions for nonterminal `source: 'voice'` runs. When and only
when there is exactly one valid `response_ready` event and its exact assistant
message/artifact rows exist, recovery makes zero provider, action, TTS, or
playback calls and invokes `commitRecoveredPartial()` once. The recovery handle
revalidates those persisted rows and derives `partial`, the fixed safe event,
and idempotency key `voice-recovery:${runId}` internally. Safe copy states that the
response was saved but playback completion could not be verified after
restart. Missing, duplicate, mismatched, or partially persisted evidence
remains Task 18 `manual_retry_required`/`ambiguous_executor_state`; recovery
never fabricates or reinserts a message/artifact. Repeated startup is
idempotent and terminal runs are ignored.
Recovery obtains the authority-bound outcome from `openVoiceRecovery()`, returns
the revoked case without a write, and wraps every issued recovery handle in
`try/finally { handle.dispose(); }`. Its terminal method also auto-disposes, so
success, conflict, revocation, malformed evidence discovered after opening, and
thrown errors all release the listener/WeakSet entry after settlement.

**Exact abort-registry dependency:**

Consume Task 18's existing `JarvisAbortRegistration`,
`JarvisCancellationOwnerOutcome`, and delivery-result contracts without
redefining them as booleans. Voice registers owners through the closed runtime
composition but never calls `requestRunCancellation()`; only
`voiceTurnHandle.requestCancellation()` may prepare, signal-bound persist, and
deliver the request.

For one voice run, register:

```ts
`${runId}:provider` // provider_stream
`${runId}:tts` // tts_generation
`${runId}:playback`; // audio_playback
```

Registration IDs are unique within account/run. Re-registering replaces only
the same ID. Every disposer is idempotent and removes only its matching
function. Each `abort` callback returns a typed owner outcome:

- after actually delivering an abort/stop signal:
  `{ kind: 'signal_delivered', ownerId, cancellationToken? }`;
- while ownership is transferring:
  `{ kind: 'handoff_pending', ownerId }`;
- when the concrete engine cannot cancel:
  `{ kind: 'unsupported', ownerId }`;
- when delivery is rejected:
  `{ kind: 'delivery_rejected', ownerId }`;
- when work already ended:
  `{ kind: 'already_exited', ownerId }`.

No provider, TTS, playback, or voice wrapper returns `true`/`false` as a
cancellation-owner result.

`runValidatedPlayback()` resolves the configured TTS and playback adapters
inside the trusted runtime, loads only the registered handle's captured
validated response envelope, then issues adapter-private controllers before any
effect becomes visible. A missing validated `spokenText` takes the truthful
unavailable/degraded branch without a TTS call; no caller text is accepted. The selected adapters return immutable start/result
receipts carrying their actual engine/execution/result identity; feature code
cannot choose or edit those fields. The runtime registers each controller's
abort owner before synchronous start, derives the exact closed `voice.tts` or
`voice.playback` source member, appends the fixed safe start event through the
same signal-bound lifecycle transaction, and uses its allocated sequence as
`resultEventSeq`. It independently verifies the adapter/native receipt against
the active controller and source row, commits and reads back durable evidence,
and only then publishes `busy` or issues a verified workflow outcome. A linked
completion/degradation row replaces that node. Unavailable/rejected setup
before a committed start produces no node; cleanup after start removes only
active cache visibility and cannot invent completion. Account, session, run,
request, attempt, registration, capability, producer kind, engine identity,
and source-event identity remain in the host-owned WeakMaps. The provider model
node remains owned by Task 16B. Availability, configured-provider UI state,
free-form evidence, or request-time capability snapshots never register or
verify anything.

The exact primary-main Task 21A `App.tsx` boot composition owns the single
`JarvisLiveEvidencePrimaryHostLifecycle` returned through
`app/src/lib/ai/runtime.ts`. On account startup it awaits
`liveEvidenceHost.openAccount(newId)` and receives a
`JarvisLiveEvidencePrimaryHostAccountSession`; it retains that session in the
primary host scope without importing any not-yet-created Command Center file.
Task 21B owns the later typed read/handler handoff after Task 17's retry ports
exist. Account teardown
first detaches consumers and calls the old session's idempotent `dispose()`;
opening the replacement also serially epoch-revokes any stale old session.
Boot cleanup disposes the current session and then calls
`liveEvidenceHost.dispose()` alongside the already-required security runtime
invalidation. Neither `App.tsx` nor any feature sees raw reconstruction or
invalidation functions. Voice-session cleanup disposes its registrations after
consumers detach; it cannot delete durable completed evidence or change
canonical lifecycle state. Tests prove
restart reconstruction of completed TTS/playback, omission of orphaned active
voice rows, cross-account/forged/stale proof rejection, open-before-subscribe
ordering, single-session replacement, account-bound read denial, synchronous
`assertCurrent()` success only for the active epoch, disposed/replaced
same-account rejection, and idempotent session/host cleanup.

`voiceTurnCommit.ts` owns the exact verifier:

```ts
/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisVoiceLiveEvidenceVerifier(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
}): JarvisCanonicalLiveProducerVerifier<'voice'>;
```

Through the voice handle, `voiceTurnCommit.ts` appends the fixed
safe voice-executor-start event with the exact `voice`/`phase: 'start'`
`producerSourceEvidence`; response-ready/playback-result/terminal truth carries
the matching identity's `phase: 'result'` member. The verifier accepts `busy`
or `completed | degraded` only by re-reading the corresponding member at
`resultEventSeq`, consulting the independent active adapter/native receipt,
and comparing every account/session/engine/execution/request/attempt/reference/
state/time field. A feature-supplied observation cannot satisfy either source.
`voiceTurnCommit.test.ts` proves both
source shapes are durable, contain no transcript/audio, reject ordinary event
status or the wrong producer member, and can be revalidated after a fresh
runtime boot.
Static imports reject every live-evidence owner/port, raw event/source type,
producer-kind type, registration ID, capability ID, and journal writer anywhere
under `features/voice`; only the deep verifier factory may reference the
matching canonical verifier type.
`app/src/lib/ai/runtime.ts` replaces exactly the `voice` unavailable slot with
this output; at this slice only the not-yet-landed schedule/Hive slots may
remain explicitly unavailable.

**Cancellation truth:**

- `stopCurrentVoiceResponse()` calls the current process-local
  `voiceTurnHandle.requestCancellation()` before clearing the session and stops
  local output. That method uses the retained binding's prepared-delivery plus
  signal-bound event path; voice code never calls raw
  `requestRunCancellation(accountId, runId)`.
- The host-owned voice cancellation coordinator snapshots every causally active
  provider/TTS/playback owner for the committed request and calls each aborter
  exactly once. An owner registered while delivery or handoff is pending joins
  the wait set before it can become externally active.
- An owner returning `{ kind: 'signal_delivered', ownerId, ... }` produces
  `{ kind: 'signal_delivered', cancellationRequestId, ownerIds }`, appends a
  safe cancellation-request event, and leaves the run nonterminal.
- Signal delivery alone never marks the run `cancelled`.
- Individual provider, TTS, and playback owners record only their own verified
  stop/quiescence receipt; none may terminalize the whole run. The runtime-owned
  workflow coordinator tracks that complete set, including every late owner and
  ownership handoff, and allows its private terminal core to derive
  `cancelled` only after every member is independently verified quiescent and no
  handoff remains. One confirmed owner while any other owner remains active is
  nonterminal. The private core derives the cancellation idempotency key and fixed safe event,
  supplies `updatedAt`/`completedAt` from its numeric injected clock, and Task 9
  forces the transition event to `run_state` plus `cancelled`; callers supply no
  run ID, sequence, event type/status, owner ID, or evidence text.
  Task 18 validates legality, then the port delegates the row/event commit to
  Task 9's `compareAndAppendTransitionEvent()`; no second transition table or
  non-atomic event write is permitted.

- If completion wins before cancellation is verified, the run may truthfully
  complete. Catch Task 18's typed transition conflict and retain the committed
  terminal truth.
- Once `cancelled` is verified, reject late completion/failure transitions.
- If aborters reject, throw, or are missing, report Task 18's exact
  `delivery_rejected`, `delivery_error`, `unsupported`, or `executor_missing`
  reason without claiming the operation stopped.
- Never put raw audio, TTS text, prompt text, or provider deltas in
  cancellation events.

**Voice completion ordering:**

For `surface: 'voice'`, do not mark the run completed until:

1. provider response is final and validated;
2. phase 1 atomically commits the canonical assistant message, artifacts,
   sync projection, and `response_ready` event while the run stays `running`;
3. final `spokenText` playback completes or a truthful unavailable/degraded/
   stopped/failed outcome is verified;
4. phase 2 atomically commits only the matching terminal run/event.

A stop during synthesis/playback can therefore become verified
`cancelled`; a saved transcript is not conflated with completed audio, and a
restart cannot redispatch or duplicate the saved response.

- [ ] **Step 1: Write the focused failing tests**

Cover one-time account/chat/session/account-authority capture; no session without identity;
runtime-issued handle only; structural cast/clone, disposed, replayed, and
foreign-runtime handle rejection before any read/write; no raw binding/issuer/
commit port import or persistence;
route/Workbench/active-chat changes not replacing binding; account change
ending the old binding; transcript using bound chat; protected voice surface;
user-created slug collision remaining non-protected; provider/TTS/playback
registrations sharing one run; exact disposer ownership; exact account/run
cancel request; real provider/TTS/playback live evidence committed/read back
before visibility, linked completed proof, restart reconstruction, orphaned
active omission, forged/stale/cross-account denial, zero live nodes from
configured availability, account/process invalidation; `signal_delivered`
remaining unverified/nonterminal; real
provider/TTS/playback callback verifying cancellation; one quiescent owner
while another remains active staying nonterminal; late owner registration
joining the wait set; handoff pending then replacement-owner quiescence; all
owners quiescent exactly once; duplicate confirmation idempotence; completion
winning before verified stop; late completion after verified cancellation
rejected; feature-visible handle having no terminal commit, raw event, raw
receipt, engine identity, or self-attested outcome input;
zero-argument response-ready/playback methods; exact handle-captured validated
message/artifact persistence and `spokenText` playback; missing speech taking no
TTS effect; structural-cast extra raw/divergent message, artifact, or speech
arguments being ignored with no state/effect substitution;
playback-before-response-ready, response-commit-versus-playback, concurrent/
double playback, consumed-handle replay, and changed/missing durable readback
failing with `voice_handle_phase_conflict` and zero TTS/playback/live-evidence/
journal effect; exact idempotent response commit returning the same readback;
truthful delivery rejection/error/unavailable; phase-1 rollback at every DB
write including settings/owner-sidecar failure; exact seven-table order; one
frozen start-bound owner snapshot for both sync rows; cloud A to signed-out,
A to B, same-A relogin after signout, local to cloud, and mid-settlement
revocation rollback; stable local-only success; atomic pending-row owner
sidecars with no claim or legacy V1 authority sidecars; exact request/attempt artifact binding,
`attempt_conflict` before identity consumption, and the post-await immediate
pre-consumption revocation interlock; no terminal transition before playback;
phase-2 using the exact two-table authority and touching only run/event rows;
outer authority-result exhaustiveness for start, executor start/result,
response-ready, cancellation, terminal, and recovery, with no inner revoked
reason or provider/status-failure reclassification;
restart recovery to one safe `partial` with
zero provider/TTS/message/artifact calls; repeated recovery/no duplicates;
close cancelling before clear; and existing hands-free/push-to-talk mic
behavior.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/features/voice/voiceSessionBinding.test.ts src/features/voice/voiceChatRouting.test.ts src/features/voice/voiceTurnCommit.test.ts src/features/voice/voiceResponseRecovery.test.ts src/features/voice/store.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx src/features/voice/voiceRouter.test.ts src/features/voice/streamingVoice.test.ts src/lib/jarvis/kernelTurnCommit.test.ts src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/ai/runtime.test.ts src/App.voiceResponseRecovery.test.tsx
```

Expected: FAIL because voice binding does not exist and stop still broadcasts
an unscoped legacy cancellation event.

- [ ] **Step 3: Implement canonical voice binding and abort ownership**

Implement the immutable binding, protected chat resolution, canonical voice
kernel call, bound transcript, two-phase atomic persistence, bounded recovery,
three labelled typed abort registrations, verified cancellation callbacks,
and completion ordering while preserving non-JARVIS voice and current mic
modes.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/features/voice/voiceSessionBinding.test.ts src/features/voice/voiceChatRouting.test.ts src/features/voice/voiceTurnCommit.test.ts src/features/voice/voiceResponseRecovery.test.ts src/features/voice/store.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx src/features/voice/voiceRouter.test.ts src/features/voice/streamingVoice.test.ts src/lib/jarvis/kernelTurnCommit.test.ts src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/ai/runtime.test.ts src/App.voiceResponseRecovery.test.tsx
npm run typecheck
```

Expected: the voice/kernel/runtime suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/features/voice/voiceSessionBinding.ts' 'app/src/features/voice/voiceSessionBinding.test.ts' 'app/src/features/voice/voiceChatRouting.ts' 'app/src/features/voice/voiceChatRouting.test.ts' 'app/src/features/voice/voiceTurnCommit.ts' 'app/src/features/voice/voiceTurnCommit.test.ts' 'app/src/features/voice/voiceResponseRecovery.ts' 'app/src/features/voice/voiceResponseRecovery.test.ts' 'app/src/features/voice/store.ts' 'app/src/features/voice/store.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx' 'app/src/features/voice/voiceRouter.ts' 'app/src/features/voice/voiceRouter.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/jarvis/kernelTurnCommit.ts' 'app/src/lib/jarvis/kernelTurnCommit.test.ts' 'app/src/lib/jarvis/kernelRuntime.ts' 'app/src/lib/jarvis/kernelRuntime.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/App.tsx' 'app/src/App.voiceResponseRecovery.test.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/features/voice/voiceSessionBinding.ts' 'app/src/features/voice/voiceSessionBinding.test.ts' 'app/src/features/voice/voiceChatRouting.ts' 'app/src/features/voice/voiceChatRouting.test.ts' 'app/src/features/voice/voiceTurnCommit.ts' 'app/src/features/voice/voiceTurnCommit.test.ts' 'app/src/features/voice/voiceResponseRecovery.ts' 'app/src/features/voice/voiceResponseRecovery.test.ts' 'app/src/features/voice/store.ts' 'app/src/features/voice/store.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx' 'app/src/features/voice/voiceRouter.ts' 'app/src/features/voice/voiceRouter.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/jarvis/kernelTurnCommit.ts' 'app/src/lib/jarvis/kernelTurnCommit.test.ts' 'app/src/lib/jarvis/kernelRuntime.ts' 'app/src/lib/jarvis/kernelRuntime.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/App.tsx' 'app/src/App.voiceResponseRecovery.test.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(voice): bind sessions to canonical Jarvis runs"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the twenty-seven files above. The
installer and whitespace queries produce no output.

## Task 17: Scheduled JARVIS and Hive Final Kernel Dispatch

**Schema-0 compatibility correction (normative):**

The source-backed legacy schedule history entry is exactly:

```ts
export interface JarvisScheduleLegacyRunHistoryEntry {
  schemaVersion: 0;
  at: number;
  status: 'success' | 'error';
  summary?: string;
}
```

Existing source data has no `schemaVersion`; the parser adds only
`schemaVersion: 0` and preserves the numeric `at`, the exact
`'success' | 'error'` status, and optional `summary`. It must not rename those
discriminants, reinterpret `"Run dispatched to Jarvis."` as completion, or
fabricate a run ID, request ID, event ID, artifact ID, approval ID, or
executor-result reference. Serialization of schema 0 writes the same
`success | error` discriminant, and parsing and reserializing either status
must be deterministic without promoting it to schema 1.

Add RED, GREEN, parse, serialize, and round-trip cases in
`jarvisSchedules.test.ts` for both legacy statuses, missing optional summary,
numeric timestamp preservation, and the absence of fabricated canonical IDs.

Task 17 receives no `JarvisArtifactPipeline` or artifact adapter. Scheduled and
Hive dispatch call only the closed Task 16B kernel methods; that runtime binds
the named `schedule` or `provider` Task 20B adapter matching the real authority
record to the same issued lifecycle and keeps it lexical. Schedule/Hive code
cannot select a generic adapter, mint receipts, set `verified: true`, or persist
artifacts directly.

**Prerequisites:**

- Task 21A voice binding is complete.
- Tasks 16B, 18, 19A-19D, and 20A-20C are canonical.
- Task 13 has no silent prompt-transport downgrade.

**Files:**

- Create: `app/src/features/schedule/jarvisScheduleDispatch.ts`
- Create: `app/src/features/schedule/jarvisScheduleDispatch.test.ts`
- Create: `app/src/features/schedule/jarvisScheduledTransportRetry.ts`
- Create: `app/src/features/schedule/jarvisScheduledTransportRetry.test.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.test.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.retry.test.ts`
- Modify: `app/src/features/schedule/jarvisSchedules.ts`
- Modify: `app/src/features/schedule/jarvisSchedules.test.ts`
- Create: `app/src/lib/ai/stacks/hiveFinalizer.ts`
- Create: `app/src/lib/ai/stacks/hiveFinalizer.test.ts`
- Create: `app/src/lib/ai/stacks/hiveWorkerExecutor.ts`
- Create: `app/src/lib/ai/stacks/hiveWorkerExecutor.test.ts`
- Modify: `app/src/lib/ai/stacks/runner.ts`
- Modify: `app/src/lib/ai/stacks/runner.test.ts`
- Modify: `app/src/lib/ai/stacks/hiveBalance.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/jarvis/kernelRuntime.ts`
- Modify: `app/src/lib/jarvis/kernelRuntime.test.ts`
- Modify: `app/src/lib/jarvis/executionJournal/transportAttempts.ts`
- Modify: `app/src/lib/jarvis/executionJournal/transportAttempts.test.ts`
- Modify: `app/src/lib/jarvis/contracts/execution.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.ts`
- Modify: `app/src/lib/jarvis/contracts/validators.test.ts`
- Modify: `app/src/lib/jarvis/contracts/index.ts`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/jarvisMappers.ts`
- Modify: `app/src/lib/db/jarvisMappers.test.ts`
- Modify: `app/src/lib/db/jarvisRepositories.ts`
- Modify: `app/src/lib/db/jarvisRepositories.test.ts`

**Interfaces:**

- Consumes Task 16B's canonical kernel, Task 11's request-attempt rules, Task
  18's persisted runs/child cancellation, Tasks 19A/19B's approval engine, and
  Tasks 20A/20B's backed artifacts.
- Produces canonical scheduled and Hive-final runs while preserving worker
  identities and schedule-saved model selection.
- Does not dispatch canonical schedules through mutable UI state or bypass
  approval for consequential side effects.

**Versioned schedule run history:**

Replace dispatch-as-success records with:

```ts
export type JarvisScheduleRunHistoryStatus =
  | 'dispatched'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface JarvisScheduleRunHistoryEntryV1 {
  schemaVersion: 1;
  at: number;
  runId: string;
  requestId: string;
  status: JarvisScheduleRunHistoryStatus;
  summary?: string;
}

export interface JarvisScheduleLegacyRunHistoryEntry {
  schemaVersion: 0;
  at: number;
  status: 'success' | 'error';
  summary?: string;
}

export type JarvisScheduleRunHistoryEntry =
  | JarvisScheduleRunHistoryEntryV1
  | JarvisScheduleLegacyRunHistoryEntry;
```

`JarvisScheduleMetadata.runHistory` uses this union. Parsing stays backward
compatible:

- add `schemaVersion: 0` to old `{ at, status: 'success' | 'error', summary? }`
  entries without changing any source field or fabricating a request/run ID;
- keep both old success and error history readable while treating them only
  as compatibility summaries, never canonical lifecycle proof;
- cap history at `JARVIS_SCHEDULE_HISTORY_CAP`;
- treat metadata history as a compatibility summary only; Task 18 remains
  lifecycle authority.

**Persisted transport-retry snapshot:**

Task 17 adds one versioned, local-only extension to Task 3's canonical run:

```ts
export interface JarvisScheduledRetrySnapshotV1 {
  schemaVersion: 1;
  accountId: string;
  eventId: string;
  occurrenceId: `jocc_${string}`;
  dueAt: number;
  logicalAttempt: number;
  request: Readonly<Omit<JarvisRequestEnvelope, 'requestId' | 'createdAt'>>;
}

export interface JarvisRun {
  // ...all Task 3 fields remain exact...
  scheduledRetrySnapshot?: Readonly<JarvisScheduledRetrySnapshotV1>;
}

export type JarvisRunRow = {
  // ...all Task 7 fields remain exact...
  scheduled_retry_snapshot?: JarvisScheduledRetrySnapshotV1;
};
```

The validator recursively validates the complete nested request snapshot,
including its model, identity, profile, capabilities, context, history, and
output contract. The mapper deep-clones it in both directions. It is stored
only in `jarvis_runs`; it never enters `messages`, `chats`, or `sync_queue`,
and it must contain no credential, cookie, token, secret-handle ID, or
approval grant.

Task 17 does **not** add a snapshot-only repository write. It extends Task 18's
private context-bound initial-attempt CAS and Task 16B's runtime method so the
first post-allocation write is already account-bound:

```ts
export interface JarvisKernelRuntime {
  prepareScheduledAttempt(input: {
    allocation: JarvisAllocatedScheduledOccurrence;
  }): Promise<PreparedJarvisScheduledKernelAttempt>;
  beginPreparedScheduledAttempt(input: {
    prepared: PreparedJarvisScheduledKernelAttempt;
  }): Promise<JarvisAuthorityBoundResult<JarvisScheduledKernelAttemptHandle>>;
  settleScheduledTransportFailure(input: {
    handle: JarvisScheduledKernelAttemptHandle;
  }): Promise<
    JarvisAuthorityBoundResult<
      { kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }
    >
  >;
}

/** Private `begin_initial` member after Task 17 extends the Task 18 core. */
type BeginInitialScheduledAttemptMutation = Readonly<{
  kind: 'begin_initial';
  accountId: string;
  runId: string;
  expectedStatus: 'queued';
  snapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
  attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>;
  updatedAt: number;
}>;

/** Task 17 replaces the Task 18 coordinator signatures; the snapshot is never implicit. */
export interface JarvisTransportAttemptCoordinator {
  beginInitialScheduledAttempt(input: {
    accountId: string;
    runId: string;
    requestId: string;
    snapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
    createdAt: number;
  }): Promise<JarvisScheduledAttemptLease>;
  beginScheduledTransportRetry(input: {
    accountId: string;
    runId: string;
    previousAttemptNumber: number;
    requestId: string;
    expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
    createdAt: number;
    revalidatedEvidence: JarvisZeroConsequentialEffectEvidenceV1;
  }): Promise<JarvisScheduledAttemptLease>;
  verifyLease(
    lease: JarvisScheduledAttemptLease,
    expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>,
  ): Promise<Readonly<JarvisRun>>;
  settleScheduledTransportFailure(input: {
    lease: JarvisScheduledAttemptLease;
    expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
    providerFailure: JarvisPreEffectTransportFailureEvidence;
    zeroEffectEvidence: JarvisZeroConsequentialEffectEvidenceV1 | null;
    settledAt: number;
  }): Promise<{ kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }>;
}
```

Task 17 also changes `compareAndMutateTransportAttempt()` itself: the
`begin_initial` member carries `snapshot`; `begin_retry`, `settle_retryable`,
and `settle_uncertain_failed` each carry `expectedSnapshot`. Every branch
validates exact deep equality for `accountId`, `eventId`, `occurrenceId`,
`dueAt`, `logicalAttempt`, and the complete request before any mutation. The
coordinator, signal-bound context adapter, runtime begin/readback/dispatch,
transport retry, settlement, validators, mappers, and repository tests all
thread that same immutable value. A missing/different snapshot is
`attempt_conflict` and performs zero writes or provider calls.

For a private `initial` prepared mode, `beginPreparedScheduledAttempt()` issues
and registers its account binding before opening the exact two-table lifecycle
transaction. Inside that one transaction, the private core requires the run
still `queued`, the snapshot field absent, the exact internally stored
request/attempt identity, and the exact source/account/run lineage; then it
stores the runtime-derived immutable snapshot and numeric clock, appends attempt
`1`, performs `queued -> running`, and inserts the forced attempt-start event.
The runtime reads back the run, requires the persisted snapshot to equal its
private prepared request minus only `requestId`/`createdAt`, and returns the
opaque handle only after settlement. A different snapshot, non-`queued` status, attempt conflict,
revocation, or table failure writes none of those fields/events. No public or
ordinary repository method can write, replace, or clear the snapshot, and Task
18's allocation input continues to omit it.

**Exact schedule dispatcher:**

```ts
const jarvisAllocatedScheduledOccurrenceBrand: unique symbol = Symbol(
  'jarvis.allocated-scheduled-occurrence',
);

export type JarvisAllocatedScheduledOccurrence = JarvisScheduledPreparationSeed &
  Readonly<{
    [jarvisAllocatedScheduledOccurrenceBrand]: true;
  }>;

export interface JarvisKernelRuntime {
  allocateScheduledOccurrence(input: {
    accountId: string;
    eventId: string;
    dueAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisAllocatedScheduledOccurrence>>;
  loadScheduledRun(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisAllocatedScheduledOccurrence | undefined>>;
  allocateScheduledLogicalRetry(input: {
    accountId: string;
    previousRunId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisAllocatedScheduledOccurrence>>;
}

export interface ScheduledJarvisDispatchDeps {
  kernel: Pick<
    JarvisKernelRuntime,
    | 'allocateScheduledOccurrence'
    | 'loadScheduledRun'
    | 'allocateScheduledLogicalRetry'
    | 'prepareScheduledAttempt'
    | 'beginPreparedScheduledAttempt'
    | 'dispatchPreparedScheduledAttempt'
    | 'settleScheduledTransportFailure'
    | 'disposeScheduledAttempt'
  >;
}

export type ScheduledJarvisAttemptResult =
  | { kind: 'committed'; result: JarvisKernelTurnResult }
  | {
      kind: 'transport_retry_available';
      run: JarvisRun;
      attempt: JarvisTransportAttemptV1;
    }
  | { kind: 'terminal_transport_failure'; run: JarvisRun }
  | { kind: 'account_authority_revoked' };

export interface JarvisScheduledTransportRetryPort {
  retry(input: { accountId: string; runId: string }): Promise<ScheduledJarvisAttemptResult>;
}

export interface JarvisScheduledLogicalRetryPort {
  retry(input: { accountId: string; previousRunId: string }): Promise<ScheduledJarvisAttemptResult>;
}

export function createJarvisScheduledTransportRetryPort(
  deps: Pick<ScheduledJarvisDispatchDeps, 'kernel'>,
): JarvisScheduledTransportRetryPort;

export function createJarvisScheduledLogicalRetryPort(
  deps: Pick<ScheduledJarvisDispatchDeps, 'kernel'>,
): JarvisScheduledLogicalRetryPort;

export async function scheduleOccurrenceId(input: {
  accountId: string;
  eventId: string;
  dueAt: number;
}): Promise<`jocc_${string}`>;

export async function scheduleOccurrenceRunId(input: {
  accountId: string;
  occurrenceId: `jocc_${string}`;
  logicalAttempt: number;
}): Promise<string>;

export async function dispatchScheduledJarvisOccurrence(
  input: {
    accountId: string;
    eventId: string;
    dueAt: number;
  },
  deps: ScheduledJarvisDispatchDeps,
): Promise<ScheduledJarvisAttemptResult>;
```

These are closed kernel capabilities, not repository facades. Their trusted
composition owns the read-only canonical schedule source, model resolver,
protected identity/profile/capability loaders, deterministic ID functions,
request-ID/clock sources, run allocation, effect-safety authority, and attempt
coordinator. `allocateScheduledOccurrence()` re-reads the claimed schedule by
account/event/due time, forces `source: 'schedule'`, protected JARVIS identity,
account/workspace/chat lineage, saved model selection, deterministic occurrence
and run IDs, request/attempt 1, then persists and reads back the canonical run
before issuing the registered fieldless opaque object. Its host-owned WeakMap
stores the run, canonical source, `initial | transport_retry` mode, captured
snapshots, new request ID, and numeric clock; none is an object property.
`loadScheduledRun()` accepts only
the exact account/run pair and revalidates all persisted schedule lineage before
returning the same kind of registered object. `allocateScheduledLogicalRetry()`
loads the terminal parent and current canonical schedule source itself, derives
the next logical attempt/parent lineage, and allocates/read-backs the new run.
Feature code and retry ports receive neither allocation fields nor an ordinary journal/run writer, repository,
effect authority, identity/model/profile loader, ID generator, clock, or source
loader. Cast, clone, foreign-runtime, stale-source, cross-account, duplicate,
or disposed allocation objects fail before reads, CAS writes, or dispatch.

`jarvisScheduledTransportRetry.ts` is a trusted deep module. Only the schedule
runner/composition imports its two retry factories; UI handlers receive the
closed `JarvisScheduledTransportRetryPort` and
`JarvisScheduledLogicalRetryPort`, never the effect-safety authority, attempt
coordinator, lease, opaque scheduled handle, kernel preparation/dispatch functions, source loader,
request ID generator, or schedule metadata. The runner has no generic
`runKernel` dependency.

The two IDs are domain-separated and account-scoped:

```ts
const occurrenceDigest = await sha256(
  `schedule-occurrence-v1\u0000${accountId}\u0000${eventId}\u0000${dueAt}`,
);
const occurrenceId = `jocc_${occurrenceDigest.slice(0, 32)}` as const;

const runDigest = await sha256(
  `schedule-run-v1\u0000${accountId}\u0000${occurrenceId}\u0000${logicalAttempt}`,
);
const runId = `jrun_${runDigest.slice(0, 32)}`;
```

`logicalAttempt` is `0` for the original occurrence. A duplicate poll for the
same account-scoped occurrence uses the same run ID and Task 18 idempotently returns the
existing run. Only an explicit logical retry increments the ordinal.
Only the trusted kernel capability derives these values and passes the run ID
to its private allocation core; `dispatchScheduledJarvisOccurrence()` never
receives a journal or asks a random-ID fallback for a scheduled occurrence.

**Dispatch snapshot rules:**

For the original occurrence or an explicit logical retry:

1. call only `kernel.allocateScheduledOccurrence({ accountId, eventId, dueAt })`
   for an original occurrence, or `allocateScheduledLogicalRetry({ accountId,
previousRunId })` for an explicit logical retry;
2. inside that capability and its private preparation state, reload the authoritative schedule source and reject
   deleted, changed, cross-account, unclaimed, or due-time-mismatched input;
3. derive the exact account-scoped `occurrenceId`, logical attempt, deterministic
   run ID, and parent lineage;
4. resolve the schedule's saved `modelSelection`;
5. capture the current protected identity plus active profile and capability/
   entitlement snapshots for the exact account;
6. allocate/persist and read back the stable canonical `source: 'schedule'` run
   in `queued` before returning the registered opaque allocation;
7. inside the runtime, build the full `surface: 'schedule'` request without
   accepting any caller field;
8. inside the runtime, create a fresh request ID, numeric `createdAt`, and exact
   Task 11 initial attempt with `attemptNumber: 1`;
9. inside the runtime, construct the immutable retry snapshot, including exact
   account and occurrence identity, from those same captured values and retain
   all of it only in the allocation WeakMap;
10. call only `kernel.prepareScheduledAttempt({ allocation })`; it verifies the
    registered object and returns a second fieldless prepared object while the
    run is still `queued`;
11. call `kernel.beginPreparedScheduledAttempt({ prepared })` so the runtime
    selects its private `initial` mode, issues its hidden binding, and atomically
    persists the snapshot, attempt `1`, request ID, runtime clock, exact
    schedule-start source member, and
    legal `queued -> running` handoff through the signal-bound lifecycle CAS;
12. require the committed authority result, persisted snapshot readback, and
    signal-bound schedule live-evidence start before retaining the returned
    opaque handle; and
13. call only `kernel.dispatchPreparedScheduledAttempt({ prepared, handle })`.

The runtime must read back both the allocation and atomically bound snapshot
and prove byte-for-byte equality with its private prepared request minus only
`requestId`/`createdAt` before provider dispatch. The dispatcher passes no
captured request/attempt/snapshot/time values and never re-reads global settings
after binding.

- Global model changes do not affect the run.
- Profile edits after dispatch do not affect the run.
- Identity revision changes after dispatch do not affect the run.
- If the saved model is unavailable, signed out, or unsupported, fail the run
  truthfully without switching models.
- A process restart after binding preserves the exact snapshot for a later
  explicitly authorized transport retry; Task 18's boot scanner still returns
  `fail_closed` and never auto-dispatches it.
- If run allocation succeeds but the bound initial CAS fails, the run remains
  `queued` with no snapshot, attempt, transition, source event, or live-evidence
  row. The same live attempt may retry only the identical in-memory bind.
  If the process restarts before a snapshot exists, recovery fails closed to a
  manual logical retry and never reconstructs different settings under the
  same run ID.

If the explicit scheduled kernel call returns
`{ kind: 'committed', value: { kind: 'pre_effect_transport_failure', ... } }`,
the dispatcher calls only
`kernel.settleScheduledTransportFailure({ handle })` exactly once. The failure
is not present in the public outcome; it is retained in the handle's private
state. That closed runtime method obtains the clock and invokes/revalidates the
private Task 19B safety authority; neither dispatcher nor retry port receives
the failure, proof, clock, or authority. A valid
zero-effect proof returns `transport_retry_available` and leaves the run
`running`; a missing/uncertain proof atomically terminalizes it as failed and
returns `terminal_transport_failure`; revocation before/during proof or CAS
returns `account_authority_revoked` with no stale write. The runtime disposes
the handle only after committed terminal/settlement; exceptional abandonment
uses `disposeScheduledAttempt()` in `finally`. The dispatcher never
terminalizes a safely retryable attempt and never calls itself recursively.
The outer revoked case from begin, dispatch, or settlement is mapped directly
to `ScheduledJarvisAttemptResult` and is never sent to another authority, retried as
a provider failure, or converted into schedule history success. Every branch
tracks whether proof/settlement deliberately retains the handle; all other
branches dispose it in `finally` after the last active transaction settles.

**Approval and side-effect rules:**

- A schedule trigger may create and start a run without interactive approval.
- Any consequential action still creates a Task 19 approval and transitions
  to `awaiting_approval`.
- Scheduled dispatch passes no `autoApproveActions` flag.
- A stored schedule cannot embed a consumed approval, credential, cookie,
  token, or secret-handle ID.
- Resuming after approval consumes the exact current approval once.
- Re-running a completed occurrence cannot duplicate completed side effects.

**Exact retry semantics:**

Transport retry:

```text
new requestId
same runId
new createdAt
same persisted scheduledRetrySnapshot
same model/identity/profile/capability/context/history/output snapshots
same non-secret parameters, even after restart or settings changes
```

It is allowed only through
`createJarvisScheduledTransportRetryPort().retry()`. That trusted port:

1. accepts only `{ accountId, runId }`, calls only
   `kernel.loadScheduledRun({ accountId, runId })`, and has no repository;
   inside that kernel capability the runtime requires `source: 'schedule'`,
   nonterminal `status: 'running'`, and latest attempt `retryable_failed`;
2. inside the runtime, derive `eventId`, `dueAt`, and `logicalAttempt` only from
   the immutable persisted `scheduledRetrySnapshot`, then reject any terminal
   run, missing snapshot/proof, internal snapshot/run lineage mismatch, or
   attempt-count cap;
3. inside the runtime, revalidate Task 13's durable exact-bound
   `before_first_response_byte` evidence with `responseStarted: false`,
   `chunkCount: 0`, and `actionDispatchCount: 0`, plus zero current approvals,
   artifacts, and structured executor claims through the latest journal
   sequence before returning a fieldless allocation whose private mode is
   `transport_retry`;
4. call only `kernel.prepareScheduledAttempt({ allocation })`; the runtime loads
   the snapshot, constructs the exact Task 11 transport-retry attempt from the
   persisted prior request/attempt, and adds only its private new `requestId`
   and numeric clock;
5. call `kernel.beginPreparedScheduledAttempt({ prepared })`; the runtime
   selects only the stored retry mode and invokes the private
   `beginScheduledTransportRetry()` coordinator with the internally revalidated
   evidence/time, then returns the opaque handle only from the committed case;
6. invoke `dispatchPreparedScheduledAttempt()` with that handle and exhaustively
   map its outer authority result; and
7. for a new exact Task 13 pre-first-byte failure, call only
   `settleScheduledTransportFailure({ handle })`, so the runtime uses the
   handle-stored failure plus a fresh private proof/clock exactly as for the
   initial attempt.

It has no journal/run repository, effect-safety authority, attempt coordinator,
source loader, ID generator, clock, or snapshot loader, and must not call
`runJarvisKernelTurn()` or a generic `runKernel()` callback. It never repeats
the original status transitions, message/artifact projection, approval
creation, or action execution. Boot recovery only reports
`fail_closed: scheduled_transport_retry_available`; it never invokes this
port.

A failure after any response byte/chunk never enters this port's same-run
settlement path. The kernel terminalizes the old run truthfully as
`partial | failed | cancelled` with safe accumulated output where available,
and the UI may offer only the logical-retry API below, which creates a new
run.

Logical retry:

```text
new requestId
new runId from logicalAttempt + 1
parentRunId = previous run
fresh current identity/profile/capability snapshots
same schedule-saved model selection resolved again
fresh persisted scheduledRetrySnapshot bound to the new run
```

A normal poll after failure **before run allocation** is neither a transport
nor logical provider retry. It reuses the occurrence's stable
`logicalAttempt: 0` run ID and Task 18 idempotency. Once a run row exists, a
poll cannot rebuild or replace its missing/different retry snapshot: an
unbound row fails closed to manual logical retry, while a bound row can be
used only through the explicit transport-retry rules above.

The only logical retry path for a terminal scheduled run is the closed
`JarvisScheduledLogicalRetryPort.retry()` operation with only
`{ accountId, previousRunId }`. The port calls only
`kernel.allocateScheduledLogicalRetry()`; inside the trusted runtime that
capability loads the prior run/snapshot, accepts only
`failed | timed_out | cancelled`, derives `eventId`, `dueAt`, and
`nextLogicalAttempt`, and uses its private canonical schedule source to load
the current prompt, saved model selection, workspace/chat scope, and protected
agent. Missing, cross-account, deleted, or lineage-mismatched source data fails
closed; no caller/UI supplies or reconstructs it. The capability requires
`nextLogicalAttempt === priorSnapshot.logicalAttempt + 1`, a terminal previous
status, a new deterministic run ID, and
`parentRunId === previousRun.id`; it resolves fresh current identity/profile/
capability state and the saved model again, binds a fresh snapshot, and uses
the initial scheduled-attempt path. Same-run transport retry rejects every
terminal status. For crash-time `provider_in_flight` ambiguity, a separately
authorized Task 18 failure transition must first make the old run terminal;
the logical retry API never silently abandons or reopens it.

**Hive finalizer:**

```ts
export interface HiveWorkerResult {
  stepId: string;
  label: string;
  agentId: string;
  providerId: string;
  modelId: string;
  text?: string;
  status: 'completed' | 'failed' | 'cancelled';
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  errorCategory?: string;
}

const jarvisHiveWorkerHandleBrand: unique symbol = Symbol('jarvis.hive-worker-handle');
const jarvisHiveWorkerOutcomeBrand: unique symbol = Symbol('jarvis.hive-worker-outcome');

export type JarvisHiveWorkerOutcome = Readonly<{
  result: Readonly<HiveWorkerResult>;
  [jarvisHiveWorkerOutcomeBrand]: true;
}>;

export interface JarvisHiveWorkerHandle {
  readonly [jarvisHiveWorkerHandleBrand]: true;
  execute(): Promise<JarvisAuthorityBoundResult<JarvisHiveWorkerOutcome>>;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
}

export interface JarvisKernelRuntime {
  openHiveWorker(input: {
    parentRunId: string;
    stepId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisHiveWorkerHandle>>;
  runHiveFinalTurn(
    input: Readonly<Omit<JarvisKernelTurnInput, 'surface'>> & {
      workers: readonly JarvisHiveWorkerOutcome[];
    },
  ): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>>;
}

export interface HiveFinalizerDeps {
  kernel: Pick<JarvisKernelRuntime, 'runHiveFinalTurn'>;
}

export async function finalizeHiveWithJarvis(
  input: {
    run: Readonly<JarvisRun>;
    attempt: JarvisRequestAttempt;
    userMessageId: string;
    interactionMode: JarvisInteractionMode;
    agent: Agent;
    userText: string;
    messageHistory: readonly LLMMessage[];
    workers: readonly JarvisHiveWorkerOutcome[];
    identity: JarvisIdentitySnapshot;
    profile: JarvisProfileSnapshot;
    model: JarvisModelSnapshot;
    capabilities: JarvisCapabilitySnapshot;
    context: JarvisContextPack;
    outputContract: JarvisOutputContract;
    workingDirectory?: string;
  },
  deps: HiveFinalizerDeps,
): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>>;
```

Rules:

- Worker prompts and identities remain unchanged.
- Only `runHiveFinalTurn()` may unwrap a registered outcome. It re-reads the
  separately committed child/provider result row and derives each
  `agent_output` source ref with `trust: 'external_untrusted'`; neither the
  runner nor finalizer supplies a source ref, text digest, result reference,
  identity, state, or observed time.
- Failed/cancelled workers contribute safe status metadata, never fabricated
  text.
- Final user-facing synthesis uses `surface: 'hive_final'` through the
  protected compiler/pipeline.
- The finalizer accepts the complete already-allocated kernel turn basis shown
  above and calls only `runHiveFinalTurn()`. The runtime forces
  `surface: 'hive_final'`, verifies every outcome through its host-owned
  registry plus canonical child readback, and derives the worker context. The
  finalizer does not allocate or infer a run, attempt, user message,
  interaction mode, history, output contract, working directory, identity,
  profile, model, or capability snapshot.
- Preserve all-success, partial, all-failed, cancellation, costs, worker
  attribution, source refs, and errors in the final envelope/journal.
- A worker result cannot claim plugin, MCP, terminal, or artifact success
  without canonical evidence.
- Consequential actions in final output still require Task 19 approval.
- Cancellation reaches registered child runs and the finalizer; signal
  delivery remains nonterminal until each owning executor confirms.

`jarvisScheduleRunner` receives only the closed kernel methods above. After the
concrete occurrence is claimed, the runtime's bound initial CAS appends the
exact `schedule`/`phase: 'start'` source member and then uses that allocated
event sequence for the `tool` capability `schedule.dispatch`; verifier
acceptance, signal-bound durable live-event commit, and exact row readback must
finish before the handle is returned, the node becomes visible, or provider
dispatch begins. Its canonical schedule result event is appended only through
the private successful-dispatch or transport-settlement core. That core first
commits and reads back the distinct immutable `canonicalResultEvidence`, then
derives the same identity's `phase: 'result'` member with a backward
`resultAuthority` pointer before a previous-proof-linked completed/degraded
live row can commit. The handle/runner supplies no result observation.

`runStack()` receives only `kernel.openHiveWorker()` and calls it with exactly
`{ parentRunId, stepId }`. The trusted runtime loads the canonical persisted
parent run and immutable Hive stack plan, validates the current account binding,
requires one unconsumed matching step, and derives stack/worker/agent/provider/
model plus child account/run/request/attempt identity solely from that plan. It
then allocates the deterministic child run and initial attempt through the
private journal core, reads both back, and only then registers and returns the
handle. Allocation/readback failure rolls back or fails closed with no handle;
a duplicate step, forged/missing plan, changed provider/model, cross-account
parent, caller-supplied worker/result identity, or stale attempt cannot
authorize evidence. The open call captures the derived identities in a
host-owned `WeakMap`; no handle method accepts or exposes those fields, a raw source/event,
registration ID, capability ID, producer kind, result field, state, time, or
reference.

`runStack()` then calls only `handle.execute()`. The runtime uses the captured
persisted step to invoke one named, deep-module `JarvisHiveWorkerExecutor`
constructed in `app/src/lib/ai/runtime.ts`; there is no caller-supplied prompt,
model, provider, generic callback, or receipt issuer. The executor preserves
the persisted specialist prompt and identity and returns its private native/
provider receipt to the runtime. Before effect start, the runtime commits and
reads back the fixed safe Hive start source/live rows. On settlement it first
commits the deterministic child run's separate
`canonicalResultEvidence.kind: 'hive_child_provider_result'`, reads that row
back, and only then appends the parent-scoped Hive `phase: 'result'` source row
whose `resultAuthority` names the child run, earlier event sequence, and exact
`jresult_` reference. The Hive verifier re-reads both rows before live
completion. Only after those commits/readbacks does the runtime freeze and
WeakSet-register `JarvisHiveWorkerOutcome`; `execute()` returns no raw receipt
or proof. Failed/cancelled workers use the same child-result authority path with
safe metadata and degraded live state, never a fabricated result.

The execute method auto-disposes its worker-execution/abort owners after
settlement; the runner also owns an idempotent `try/finally` handle disposer
covering conflict, revocation, executor error, and abandonment. A completed
immutable outcome remains registered separately until exactly one
`runHiveFinalTurn()` consumption or runtime/account invalidation. The final
synthesis calls only that method; it rejects cloned/cast/foreign/already-
consumed outcomes, re-reads every exact
child authority row and parent source link, and only then derives the worker
context and runs the shared initial-turn internals with forced
`surface: 'hive_final'`. It maps committed/revoked cases exhaustively and never
turns account revocation into a worker or provider failure.
Forged/free-form results or refs, a mutated outcome, step/agent/provider/model
mismatch, ordinary event status without the closed source member, a self/
forward/cross-account authority pointer, stale attempts, changed event rows,
duplicate steps, and unlinked completions fail closed.
After restart, complete verified schedule/worker chains reconstruct while
orphaned active chains do not. The final provider model node is still owned by
Task 16B's kernel. Saved schedule configuration, planned workers, provider
availability, and request-time capabilities produce no live node.
Static import tests reject raw schedule/Hive producer ports, ordinary journal
writers, attempt coordinators, effect-claim authorities, or cancellation writers
from schedule and Hive feature modules.

The final verifier constructors are exact:

```ts
/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisScheduleLiveEvidenceVerifier(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
}): JarvisCanonicalLiveProducerVerifier<'schedule'>;

/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisHiveLiveEvidenceVerifier(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
}): JarvisCanonicalLiveProducerVerifier<'hive'>;
```

The schedule verifier accepts only the exact persisted occurrence/attempt
start row with a `schedule`/`start` member or immutable schedule-result row with
the matching `schedule`/`result` member and a distinct earlier canonical kernel
result/settlement authority row. The Hive verifier accepts only a fixed
safe worker-start/worker-result row carrying the matching `hive` source member
whose stack/step/worker/result fields match plus the separately persisted child
provider-result authority row. Every authority pointer is backward, exact,
account-owned, and non-self-referential. Source and authority rows precede the
live-evidence row, contain no prompt/output, and are account/run/request/attempt
scoped.
`app/src/lib/ai/runtime.ts` replaces
the last two unavailable slots with these factory outputs; its test fails if
any of the nine final slots is unavailable, duplicated, inline, or bound to the
wrong producer kind.

**Runner integration:**

`jarvisScheduleRunner.ts` stops dispatching generic `jarvis:send` events for
canonical schedules. It calls `dispatchScheduledJarvisOccurrence()` through
injected dependencies so active UI route/chat/model state cannot alter the
run.

`runStack()` keeps specialist prompts/identities but executes each real step
only through `openHiveWorker(...).execute()`, then calls
`finalizeHiveWithJarvis()` once for the visible final response. It does not
replace each specialist prompt with JARVIS identity.

- [ ] **Step 1: Write the focused failing tests**

Schedule cases: saved model over current global model; identity/profile
captured once; later model/profile/identity changes not mutating the envelope;
unavailable saved model failing without switch; canonical run creation;
dispatcher and both retry ports receiving only the narrow kernel capability
with no journal/repository/effect authority/source loader/ID generator;
deterministic allocation and exact readback before a fieldless opaque object is
issued; preparation accepting only that registered allocation, begin accepting
only the registered prepared object, settlement accepting only the registered
handle, and no feature-visible request/attempt/snapshot/failure/proof/time;
cast/clone/foreign allocation rejection and allocation/readback rollback;
approval-required action waiting with no executor call; duplicate poll reuse;
snapshot construction from immutable captures before pure compilation and
atomic snapshot persistence before provider dispatch; atomic bind conflict; validator and
mapper round trip; restart and settings changes followed by transport retry
using the same complete snapshot and same run/new request; durable attempt
identity before provider; retryable failure leaving the run nonterminal;
runtime-issued opaque handle retained through zero-effect proof and settlement;
forged/disposed/foreign handle denial; cloud A to signed-out/B/same-A relogin,
local to cloud, and revocation during begin/retry/proof/settlement with zero
stale run/event writes; stable local-only begin/dispatch/settle; zero-effect
proof and revalidation; approval/artifact/effect-claim denial;
recovery reporting retry availability without dispatch; no initial-transition
replay; terminal-run retry rejection; logical retry new run/new request/parent
with a fresh snapshot; transport UI input limited to account/run with all
event/due/logical lineage derived internally; closed logical-retry input
limited to account/previous-run with authoritative schedule source loaded
internally; missing/deleted/cross-account/lineage-mismatched source denial; no
duplicated completed side effect; success/partial/failure/cancel/timeout/missed
occurrence; exact schedule source start/result members at the verifier's
`resultEventSeq`; a distinct backward canonical-result authority row derived
inside dispatch/settlement; denial for caller-supplied state/ref/time,
self/forward/changed/cross-account authority, or ordinary status alone; no
result-recording method on the public handle; bounded versioned history and exact
legacy `success | error` preservation.

Hive cases: unchanged worker identities/prompts; protected `hive_final`;
all-success/partial/all-failed/cancelled workers; attribution, refs, costs, and
safe error categories; no personality overwrite or unverified success; final
action approval; truthful child/finalizer cancellation; only real
`openHiveWorker({ parentRunId, stepId })` input; persisted-plan reload and
derived worker/agent/provider/model/account/run/request/attempt identity;
child allocation/readback before handle issue; one-shot no-argument
`handle.execute()` with no alternate specialist-provider path; forged/missing/
changed plan or outcome, duplicate step, child-allocation rollback, and
cross-account denial; canonical child/provider result committed/read back
before the parent Hive result source; exact backward `resultAuthority` link;
outcome WeakSet registration and one-time final consumption; worker/provider
live evidence only after exact closed source-member and authority-row
commit/readback; linked completion; ordinary-status-only and raw result/ref/
state/time injection denial; restart
reconstruction with orphan-active omission; forged,
cross-account, stale, and changed-row rejection; exact lifecycle invalidation;
and zero nodes from configuration or planned capability state.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/features/schedule/jarvisScheduleDispatch.test.ts src/features/schedule/jarvisScheduledTransportRetry.test.ts src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleRunner.retry.test.ts src/features/schedule/jarvisSchedules.test.ts src/lib/ai/stacks/hiveFinalizer.test.ts src/lib/ai/stacks/hiveWorkerExecutor.test.ts src/lib/ai/stacks/runner.test.ts src/lib/ai/stacks/hiveBalance.test.ts src/lib/ai/runtime.test.ts src/lib/jarvis/executionJournal/transportAttempts.test.ts src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts src/lib/jarvis/approvalEngine.test.ts src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/contracts/validators.test.ts src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts
```

Expected: FAIL because the schedule dispatcher, trusted retry port, and Hive
finalizer do not exist;
the current runner records dispatch as success and uses mutable UI dispatch,
and runs have no persisted scheduled transport-retry snapshot.

- [ ] **Step 3: Implement canonical scheduled and Hive-final dispatch**

Implement stable occurrence IDs, persisted-run-first dispatch, immutable
saved-model/identity/profile/capability snapshots, exact retry categories,
atomic retry-snapshot binding, durable attempt/proof settlement, explicit
restart retry authority, minimal closed transport/logical retry ports with
internal lineage/source loading, approval preservation, versioned history,
real durable live-evidence verifier wiring with all nine final runtime slots
ready, the named closed Hive worker executor, distinct canonical schedule and
child/provider result-authority rows, runtime-derived source refs, one-shot
outcome verification, canonical final synthesis, and child cancellation
without rewriting worker prompts.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/features/schedule/jarvisScheduleDispatch.test.ts src/features/schedule/jarvisScheduledTransportRetry.test.ts src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleRunner.retry.test.ts src/features/schedule/jarvisSchedules.test.ts src/lib/ai/stacks/hiveFinalizer.test.ts src/lib/ai/stacks/hiveWorkerExecutor.test.ts src/lib/ai/stacks/runner.test.ts src/lib/ai/stacks/hiveBalance.test.ts src/lib/ai/runtime.test.ts src/lib/jarvis/executionJournal/transportAttempts.test.ts src/lib/jarvis/executionJournal/liveEvidenceAuthority.test.ts src/lib/jarvis/executionJournal/liveEvidenceRegistry.test.ts src/lib/jarvis/approvalEngine.test.ts src/lib/jarvis/kernelRuntime.test.ts src/lib/jarvis/contracts/validators.test.ts src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts
npm run typecheck
```

Expected: the schedule/Hive suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/features/schedule/jarvisScheduleDispatch.ts' 'app/src/features/schedule/jarvisScheduleDispatch.test.ts' 'app/src/features/schedule/jarvisScheduledTransportRetry.ts' 'app/src/features/schedule/jarvisScheduledTransportRetry.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.ts' 'app/src/features/schedule/jarvisScheduleRunner.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.retry.test.ts' 'app/src/features/schedule/jarvisSchedules.ts' 'app/src/features/schedule/jarvisSchedules.test.ts' 'app/src/lib/ai/stacks/hiveFinalizer.ts' 'app/src/lib/ai/stacks/hiveFinalizer.test.ts' 'app/src/lib/ai/stacks/hiveWorkerExecutor.ts' 'app/src/lib/ai/stacks/hiveWorkerExecutor.test.ts' 'app/src/lib/ai/stacks/runner.ts' 'app/src/lib/ai/stacks/runner.test.ts' 'app/src/lib/ai/stacks/hiveBalance.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/jarvis/kernelRuntime.ts' 'app/src/lib/jarvis/kernelRuntime.test.ts' 'app/src/lib/jarvis/executionJournal/transportAttempts.ts' 'app/src/lib/jarvis/executionJournal/transportAttempts.test.ts' 'app/src/lib/jarvis/contracts/execution.ts' 'app/src/lib/jarvis/contracts/validators.ts' 'app/src/lib/jarvis/contracts/validators.test.ts' 'app/src/lib/jarvis/contracts/index.ts' 'app/src/lib/db/schema.ts' 'app/src/lib/db/jarvisMappers.ts' 'app/src/lib/db/jarvisMappers.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/features/schedule/jarvisScheduleDispatch.ts' 'app/src/features/schedule/jarvisScheduleDispatch.test.ts' 'app/src/features/schedule/jarvisScheduledTransportRetry.ts' 'app/src/features/schedule/jarvisScheduledTransportRetry.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.ts' 'app/src/features/schedule/jarvisScheduleRunner.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.retry.test.ts' 'app/src/features/schedule/jarvisSchedules.ts' 'app/src/features/schedule/jarvisSchedules.test.ts' 'app/src/lib/ai/stacks/hiveFinalizer.ts' 'app/src/lib/ai/stacks/hiveFinalizer.test.ts' 'app/src/lib/ai/stacks/hiveWorkerExecutor.ts' 'app/src/lib/ai/stacks/hiveWorkerExecutor.test.ts' 'app/src/lib/ai/stacks/runner.ts' 'app/src/lib/ai/stacks/runner.test.ts' 'app/src/lib/ai/stacks/hiveBalance.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/jarvis/kernelRuntime.ts' 'app/src/lib/jarvis/kernelRuntime.test.ts' 'app/src/lib/jarvis/executionJournal/transportAttempts.ts' 'app/src/lib/jarvis/executionJournal/transportAttempts.test.ts' 'app/src/lib/jarvis/contracts/execution.ts' 'app/src/lib/jarvis/contracts/validators.ts' 'app/src/lib/jarvis/contracts/validators.test.ts' 'app/src/lib/jarvis/contracts/index.ts' 'app/src/lib/db/schema.ts' 'app/src/lib/db/jarvisMappers.ts' 'app/src/lib/db/jarvisMappers.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): bind schedules and Hive finals to the kernel"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirty-one files above. The
installer and whitespace queries produce no output.

## Task 21B — Command Center lower shell

**Exact files**

- Create: `app/src/features/jarvis-command-center/types.ts`
- Create: `app/src/features/jarvis-command-center/commandCenterDataPort.ts`
- Create: `app/src/features/jarvis-command-center/commandCenterDataPort.test.ts`
- Create: `app/src/features/jarvis-command-center/selectors.ts`
- Create: `app/src/features/jarvis-command-center/selectors.test.ts`
- Create: `app/src/features/jarvis-command-center/resultMappers.ts`
- Create: `app/src/features/jarvis-command-center/resultMappers.test.ts`
- Create: `app/src/features/jarvis-command-center/commandCenterStore.ts`
- Create: `app/src/features/jarvis-command-center/commandCenterStore.test.ts`
- Create: `app/src/features/jarvis-command-center/JarvisCommandCenter.tsx`
- Create: `app/src/features/jarvis-command-center/JarvisCommandCenter.test.tsx`
- Create: `app/src/features/jarvis-command-center/JarvisOutputsTab.tsx`
- Create: `app/src/features/jarvis-command-center/JarvisLiveSystemsTab.tsx`
- Create: `app/src/features/jarvis-command-center/jarvis-command-center.css`
- Modify: `app/src/features/chat/ChatThread.tsx`
- Create: `app/src/features/chat/ChatThread.commandCenter.test.tsx`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.kernelHost.test.tsx`

Do not create a third lower tab or a graph/metrics subsystem. Task 21A owns
voice-session transcript binding and the primary account-session lifetime;
21B owns the exact post-Task-17 host/read/retry handoff, consumes the already
bound run, and renders only the lower proof shell.

```ts
export type JarvisCommandCenterExpansion = 'collapsed' | 'expanded';
export type JarvisCommandCenterTab = 'outputs' | 'live_systems';

export type JarvisCommandCenterHostPort = Readonly<{
  accountId: string;
  liveEvidence: JarvisAccountLiveEvidenceReadPort;
  requestCancellation(runId: string): Promise<JarvisCancellationRequestResult>;
  retryScheduledTransport(runId: string): Promise<ScheduledJarvisAttemptResult>;
  retryLogicalRun(runId: string): Promise<ScheduledJarvisAttemptResult>;
}>;

export type JarvisCommandCenterHandlers = {
  cancelRun?: (accountId: string, runId: string) => Promise<JarvisCancellationRequestResult>;
  retryScheduledTransport?: (
    accountId: string,
    runId: string,
  ) => Promise<ScheduledJarvisAttemptResult>;
  retryLogicalRun?: (accountId: string, runId: string) => Promise<ScheduledJarvisAttemptResult>;
};

export type JarvisCommandCenterRetryState =
  | { kind: 'none' }
  | {
      kind: 'scheduled_transport_available';
      runId: string;
      attemptNumber: number;
    }
  | {
      kind: 'logical_retry_available';
      previousRunId: string;
      terminalStatus: 'failed' | 'timed_out' | 'cancelled';
    };

export type JarvisCommandCenterDataPort = {
  getRunsForChat(input: {
    accountId: string;
    chatId: string;
    limit: number;
  }): Promise<readonly JarvisRun[]>;
  getEventsForRun(input: {
    accountId: string;
    runId: string;
    limit: number;
  }): Promise<readonly JarvisEvent[]>;
  getArtifactsForRun(input: {
    accountId: string;
    runId: string;
    limit: number;
  }): Promise<readonly JarvisArtifactV1[]>;
  getLiveEvidenceSnapshot(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisLiveEvidenceSnapshot | undefined>;
  subscribe(accountId: string, chatId: string, listener: () => void): () => void;
};

// Import and re-export only the exact Task 18 read contracts/types. Task 21B
// does not define a second live-node shape or import a writer/authority.
export type {
  JarvisAccountLiveEvidenceReadPort,
  JarvisLiveCapabilityCategory,
  JarvisLiveEvidenceSnapshot,
  JarvisLiveSystemNode,
} from '@/lib/jarvis/executionJournal/liveEvidenceAuthority';

export type JarvisCommandCenterSnapshot = {
  accountId: string;
  chatId: string;
  expansion: JarvisCommandCenterExpansion;
  activeTab: JarvisCommandCenterTab;
  currentRun?: JarvisRun;
  retryState: JarvisCommandCenterRetryState;
  events: readonly JarvisEvent[];
  outputs: readonly JarvisArtifactV1[];
  liveSystems:
    | { state: 'not_loaded' }
    | { state: 'loading' }
    | { state: 'ready'; nodes: readonly JarvisLiveSystemNode[] }
    | { state: 'unavailable'; reason: string };
  error?: string;
};
```

Task 21B adds the final host handoff only now, after Task 17 exists. The sole
factory is owned by `app/src/lib/ai/runtime.ts` and called only by primary
`App.tsx` with the active Task 21A session:

```ts
export function createJarvisCommandCenterHostPort(input: {
  accountSession: JarvisLiveEvidencePrimaryHostAccountSession;
  kernel: Pick<JarvisKernelRuntime, 'requestCancellation'>;
  scheduledTransportRetry: JarvisScheduledTransportRetryPort;
  scheduledLogicalRetry: JarvisScheduledLogicalRetryPort;
}): JarvisCommandCenterHostPort;
```

The factory first requires
`accountSession.accountId === accountSession.read.accountId`, calls
`accountSession.assertCurrent()`, captures that account, and returns only the
account-bound read port plus run-ID-only closures. Each cancellation, transport
retry, and logical-retry closure synchronously calls the captured session's
`assertCurrent()` immediately before invoking its bound kernel/retry operation,
with no intervening `await`, then injects the captured account into that exact
call. The kernel/retry operation retains its own signal-bound account-authority
checks through settlement. The closures expose no kernel runtime, retry port,
host lifecycle, account session, repository, coordinator, or effect authority.
`App.tsx` rebuilds this host port only after `openAccount()` resolves, passes it
to `ChatThread`, and drops it before disposing the old account session. A stale
port is epoch-revoked by that session even when the replacement session has the
same account ID. Static call-site tests allow the factory only in primary
`App.tsx` and reject Command Center imports from Task 21A's commit.

`commandCenterDataPort.ts` is the required production implementation; the
store never receives an ad hoc `getLiveEvidenceSnapshot` fake outside tests:

```ts
export function createJarvisCommandCenterDataPort(input: {
  repositories: Readonly<{
    runs: JarvisRunRepository;
    events: JarvisEventRepository;
    artifacts: Readonly<JarvisArtifactRepository>;
  }>;
  liveEvidence: JarvisAccountLiveEvidenceReadPort;
  subscribeJournal(accountId: string, chatId: string, listener: () => void): () => void;
}): JarvisCommandCenterDataPort;
```

The port performs the bounded account-scoped repository reads. Its
`getLiveEvidenceSnapshot({ accountId, runId })` first requires
`accountId === liveEvidence.accountId`, then awaits exactly
`liveEvidence.snapshot(runId)` and returns that detached authority-verified
snapshot; a mismatch fails before a read. It does not read or fold event rows itself, call
producer verifiers, reconstruct nodes, or derive them from request-time
capabilities, provider configuration, schedules, or render state.
`subscribe()` combines the canonical journal subscription with the exact-run
account-bound read-port subscription after the current run is known, replaces that
subscription on run change, and disposes both. Canonical boot has already
awaited Task 18's bounded account reconstruction: completed/degraded chains
may therefore remain visible after restart, while orphaned prior-process
active chains are absent. If reconstruction failed closed or a row cannot be
revalidated, the port returns no affected node rather than fabricating one.

`createJarvisCommandCenterStore()` may mutate only local UI state
(`expansion`, `activeTab`, loading/error) and replace snapshots read from the
port. It exposes no run/event/approval/artifact mutation method. All
repository requests pass `Math.min(500, Math.max(1, requestedLimit))`; store
defaults are `runs: 100`, `events: 500`, `artifacts: 500`. It uses the data
port subscription and does not poll.

Selectors:

- current run is the newest canonical run for the exact account/chat;
- retry state is composite: exact `source: 'schedule'`, canonical
  `status: 'running'`, and latest durable attempt `retryable_failed` produces
  `scheduled_transport_available`; only an exact scheduled run with a valid
  bound retry snapshot and terminal `failed | timed_out | cancelled` produces
  `logical_retry_available`; every other combination is `none`;
- events are ordered by `seq`, deduplicated by `(runId, seq)`, and capped at
  `500`;
- Outputs contains only persisted `JarvisArtifactV1` rows for the current run,
  including explicit `partial`/`quarantined` state; source refs, attachments,
  planned capabilities, acknowledgements, and message prose are excluded;
- Live Systems contains a model node only when a canonical provider
  producer's scoped authority verified and committed real start/response
  activity for this run with the exact `modelSnapshotRef`, and a capability
  node only when its current executor/runtime authority committed the matching
  capability/result chain. Active and bounded completed/degraded nodes come
  only from Task 18's async read port after exact canonical-row revalidation.
  The selector requires `evidenceRef` to be the opaque `jlive_` proof format
  but never parses it, reads its event, or treats the digest as authority. A
  generic `JarvisEvent`, free-form reference, or request-time
  `JarvisCapabilitySnapshot` may constrain a candidate but is never sufficient
  evidence that a system is live.
  `planned` is omitted. `unavailable` remains an explicit quiet unavailable
  row, not a live node. No synthetic health, latency, utilization, rotating
  edge, worker, or connector is generated.

The component has one header with truthful run state and a single
collapse/expand control. The expanded lower tablist has exactly:

```tsx
<TabsTrigger value="outputs">Outputs</TabsTrigger>
<TabsTrigger value="live_systems">Live Systems</TabsTrigger>
```

Collapsed mode renders neither tab body nor graph/layout component and never
calls `getLiveEvidenceSnapshot()`. `JarvisLiveSystemsTab` is loaded with
`React.lazy()` only after the shell is expanded **and** `live_systems` becomes
active; only then may the store request the live-evidence snapshot. Collapsing
disposes any layout subscription and a later expansion reuses immutable
loaded data only if it still belongs to the same run.

Every capability request captures an exact `{ accountId, runId }` generation.
The store accepts a result only when the returned snapshot and every returned
node repeat that exact account/run pair, `capturedAt >= currentRun.createdAt`,
and every numeric `verifiedAt` is between the run's creation and the
snapshot's capture. It discards the entire result if any ownership, timestamp,
closed category, stable ID, or required opaque `jlive_` proof reference is
invalid, or if
the account, run, expansion, active tab, or request generation changed before
it settled. A stale cross-account response must not populate the new account
even when both accounts have the same run ID.

`selectors.ts` and the store are the only UI projection logic. Components
receive immutable nodes and render labels/states only; they import no event or
run repository, live authority/runtime, producer verifier/writer, proof
constructor, registry internal, or reconstruction function. Static import
tests enforce this selector-only boundary.

Cancel renders only for a nonterminal current run, an injected `cancelRun`
handler, and `retryState.kind !== 'scheduled_transport_available'`.
`resultMappers.ts` contains pure exhaustive switches over every
`JarvisCancellationRequestResult`, every `JarvisCancellationAggregate`, and
every `ScheduledJarvisAttemptResult`, ending in `assertNever()`; components do
not partially interpret these unions. `authority_revoked_before_intent` maps to
“Account changed; cancellation was not requested.” with no terminal inference.
An `intent_committed` result always states that cancellation was requested,
including `authorityState: 'revoked_after_intent'`; its aggregate maps
`signal_delivered` to “Cancellation requested”, `handoff_pending` or
`delivery_pending` to “Waiting for the execution owner”, `queued_cancelled` to
“Queued work cancelled”, and every unsupported/missing/rejected/error case to
truthful nonterminal copy. `already_terminal` renders the canonical terminal
status. None of the pending/delivery states is rendered as cancelled. A
`scheduled_transport_available` run has no active abort owner, so Cancel is
suppressed even when a handler exists; only “Retry transport” is shown. This
task does not reinterpret cancellation intent as abandonment. A future
abandon/logical-retry flow would first need an explicit Task 18 terminalization
operation; none is fabricated here. Retry ownership is split and never
generic:

- `scheduled_transport_available` renders “Retry transport” only with an
  injected `retryScheduledTransport`; the handler must require the captured
  account and call only `hostPort.retryScheduledTransport(runId)`, whose Task
  21B host factory is the exact Task 17 closed-port adapter. It retains
  the same run, loads all lineage internally, and is suppressed for a
  stale/nonlatest attempt, active provider, uncertain barrier, or terminal
  run;
- `logical_retry_available` renders “Retry as new run” only with an injected
  `retryLogicalRun`; the handler requires the captured account and calls only
  `hostPort.retryLogicalRun(runId)`, whose host factory injects
  `{ accountId, previousRunId: runId }`, so Task 17 loads schedule authority and fresh snapshots internally,
  allocates a new run/request with parent lineage, and never calls the
  same-run port; and
- missing handlers render truthful quiet copy, not a disabled or fallback
  action.

`ChatThread`/the Command Center composition is the UI owner: primary `App.tsx`
passes it exactly one `JarvisCommandCenterHostPort`. It never receives the
account session, host lifecycle, kernel runtime, or retry-port objects. Its
three UI adapters first require the handler `accountId` to equal
`hostPort.accountId`, then call only the corresponding run-ID-only host closure;
the data port receives only `hostPort.liveEvidence`. The host factory has
already bound cancellation to Task 16B and the two retries to Task 17, so UI
code exposes neither raw cancellation writer, effect authority, attempt
coordinator, lease, nor generic `runKernel` callback. No terminal run
can reach `retryScheduledTransport`, and no retryable nonterminal run can
reach `retryLogicalRun` without first becoming terminal through an explicitly
authorized transition.

`ChatThread` uses the Command Center for a canonical built-in-JARVIS run. It
keeps `ChatActivityTimeline` and `JarvisTaskProgressCard` only for legacy/
noncanonical history, preventing duplicate lifecycle surfaces. The shell sits
below the message transcript and above ancillary memory/agent panels, uses
existing theme tokens, preserves compact mode, and has keyboard-visible focus,
tab/tabpanel labels, `aria-expanded`, and calm empty/error states.

`jarvis-command-center.css` includes an explicit
`@media (prefers-reduced-motion: reduce)` branch that removes expansion,
tab-panel, busy-indicator, evidence-state, pulse, and layout transitions while
preserving immediate stable state, visible focus, and keyboard operation.
Component tests stub `matchMedia` for both preferences and prove no animation
class/style survives reduced motion, focus remains on the initiating control,
and Arrow/Tab/Enter/Space/Escape behavior is unchanged.

**Checkbox TDD steps**

- [ ] Add `runtime.test.ts`/`App.kernelHost.test.tsx` cases proving Task 21B's
      factory is created only after the account session and Task 17 ports exist;
      exact session/read account match; run-ID-only cancellation/transport/
      logical closures inject the captured account; every effect closure calls
      synchronous session `assertCurrent()` immediately before its operation;
      disposed-session and replaced-same-account stale-port revocation with zero
      kernel/retry calls;
      App drops the old host port before session disposal; and ChatThread
      receives no raw runtime, retry port, session, or host lifecycle.
- [ ] Add selector tests for exact account/chat isolation, newest run, event
      ordering/deduplication, caller limits `0/1/500/501/1_000_000`, real artifact
      outputs, source exclusion, planned/unavailable capability handling,
      ordinary running versus latest retryable scheduled attempt, stale/
      nonlatest attempt exclusion, terminal logical-retry state, and no
      synthetic node.
- [ ] Add production data-port tests proving bounded repository calls, exact
      async delegation to the named live read port, combined journal/read-port
      subscriptions and disposal, run-switch replacement, reconstructed
      completed/degraded visibility after restart, orphan-active omission,
      fail-closed reconstruction/readback errors, no UI event/capability
      reconstruction, and no production writer/verifier/fake injection path.
- [ ] Add store tests proving subscription rather than polling, no lifecycle
      mutation API, no capability read while collapsed or Outputs is active, one
      lazy read on expanded Live Systems, exact account/run arguments,
      returned snapshot/node ownership and numeric evidence-time validation,
      missing/non-`jlive_` evidence and unknown-category rejection,
      request-time capability snapshots producing zero live nodes without
      provider/executor authority,
      cross-account same-run-ID isolation, stale asynchronous response
      suppression after account/run/tab/collapse changes, run-switch
      invalidation, exact Task 17 transport-handler ownership versus logical
      handler ownership, and cleanup.
- [ ] Add component tests for exactly two tabs, collapsed/expanded states,
      quiet empty/partial/error/cancelled/unavailable copy, no graph subtree while
      collapsed, lazy module boundary, “Retry transport” only for the composite
      nonterminal state, “Retry as new run” only for eligible terminal state,
      Cancel suppressed for scheduled transport availability even with a
      handler, no cancellation-as-abandon fallback, no
      cross-calling/fallback/generic Retry, exact minimal host-port adapters
      over Task 17 retry and Task 16B cancellation closures, every cancellation/aggregate and
      scheduled-result mapper branch with `assertNever`, explicit
      authority-revoked-before-intent and revoked-after-intent copy with no
      false terminal inference, real-handler-only cancel/retry, reduced-motion
      immediate rendering, focus preservation, and keyboard behavior.
- [ ] Add ChatThread tests proving canonical/legacy routing and no duplicate
      timeline/progress surface.
- [ ] Add static import tests proving types/selectors/store/components import
      only the read port and immutable node types; no UI file imports Task 18
      authority/runtime/registry internals, raw kernel/retry/host lifecycle,
      producer ports/verifiers, proof
      constructors, repositories for live derivation, or reconstruction.
- [ ] Run:
      `npm --prefix app test -- src/features/jarvis-command-center src/features/chat/ChatThread.commandCenter.test.tsx src/lib/ai/runtime.test.ts src/App.kernelHost.test.tsx`.
- [ ] Run `npm --prefix app run typecheck`; stage exactly the twenty files;
      run cached-name, whitespace, added-line secret, and installer checks.

```powershell
git add -- `
  app/src/features/jarvis-command-center/types.ts `
  app/src/features/jarvis-command-center/commandCenterDataPort.ts `
  app/src/features/jarvis-command-center/commandCenterDataPort.test.ts `
  app/src/features/jarvis-command-center/selectors.ts `
  app/src/features/jarvis-command-center/selectors.test.ts `
  app/src/features/jarvis-command-center/resultMappers.ts `
  app/src/features/jarvis-command-center/resultMappers.test.ts `
  app/src/features/jarvis-command-center/commandCenterStore.ts `
  app/src/features/jarvis-command-center/commandCenterStore.test.ts `
  app/src/features/jarvis-command-center/JarvisCommandCenter.tsx `
  app/src/features/jarvis-command-center/JarvisCommandCenter.test.tsx `
  app/src/features/jarvis-command-center/JarvisOutputsTab.tsx `
  app/src/features/jarvis-command-center/JarvisLiveSystemsTab.tsx `
  app/src/features/jarvis-command-center/jarvis-command-center.css `
  app/src/features/chat/ChatThread.tsx `
  app/src/features/chat/ChatThread.commandCenter.test.tsx `
  app/src/lib/ai/runtime.ts `
  app/src/lib/ai/runtime.test.ts `
  app/src/App.tsx `
  app/src/App.kernelHost.test.tsx
git commit -m "feat(jarvis): add truthful command center shell"
```

Expected staged and committed names: exactly the twenty files above; the
protected installer and every raw authority path remain absent.

## Task 21C — Development-only deterministic kernel smoke fixtures

**Voice and native automation correction (normative):**

Add deterministic scenario `voice_turn_stop`. It opens the real voice surface,
submits a fixed transcript into the protected JARVIS turn path, waits for the
canonical run state, presses the real Stop control, and proves the resulting
cancellation state/evidence without a provider credential.

That transcript injection is routing/cancellation evidence, not STT evidence.
Add a separate `native_stt_voice_turn` scenario. Under the same debug-only
native binding, a unique `voice.stt-fixture` control requests only the
repository-owned safe WAV fixture from `sik_smoke.rs`, sends those bytes through
the real Tauri `faster_whisper_transcribe` engine, and submits the returned
transcript through the same protected `flushUtterance()` path. The debug command
never returns a transcript and cannot read an arbitrary path. Evidence records
the engine/model identifier, fixture SHA-256, transcript-to-session/run
binding, zero raw audio in journal/live evidence, and truthful engine failure.
If the local model/runtime is unavailable, this scenario alone records
`BLOCKED_EXTERNAL` with the exact missing model/runtime; `voice_turn_stop` does
not substitute as STT proof and all other scenarios continue.

The stable `data-sik-evidence` values are constants in `evidenceIds.ts`:

```ts
export const SIK_EVIDENCE = {
  smokeBinding: 'smoke.binding',
  voiceOpen: 'voice.open',
  voiceTranscript: 'voice.transcript',
  voiceSttFixture: 'voice.stt-fixture',
  voiceSttState: 'voice.stt-state',
  voiceState: 'voice.state',
  voiceStop: 'voice.stop',
} as const;
```

The actual opener is the “Open Jarvis voice panel” button in
`components/layout/TopBar.tsx`; only that button receives `voice.open`.
`VoiceModal.tsx` receives `voice.state` and `voice.stop`. When and only when
the browser smoke gate is enabled, it also renders one development-only fixed
transcript control with `voice.transcript`; submitting that control calls the
same `flushUtterance()` path as a completed real utterance. It cannot call
`messageRepo`, `runJarvisKernelTurn`, the execution journal, or a cancellation
repository directly. The targeted TopBar and voice tests prove selector
uniqueness, genuine open/turn binding, Stop routing through canonical
cancellation, and truthful final evidence.

Create `scripts/shared-intelligence-kernel-smoke-driver.mjs` as the exact
automation driver. It accepts:

```text
--cdp-port <fresh-loopback-port>
--scenario <scenario-id>
--evidence-dir <contained-absolute-path>
--expected-native-pid <pid>
--expected-profile <canonical-isolated-profile>
--expected-nonce <random-launch-nonce>
```

The driver imports `{ chromium }` from the root workspace's existing
`playwright-core` dependency and uses `chromium.connectOverCDP()` against the
Tauri WebView2 debugging endpoint on `127.0.0.1:<cdp-port>`. It selects only
`data-sik-evidence` contracts, confirms the page-reported smoke binding matches
the expected native PID, port, canonical-profile digest, and nonce, runs one
named deterministic scenario, and writes evidence only below the supplied
directory. It has no generic script evaluation, repository mutation bridge,
or production route. Task 21C must not edit either `package.json` or lockfile;
`npm ls playwright-core --depth=0` at the workspace root is a prerequisite
gate.

The browser fixtures are enabled only when
`import.meta.env.DEV && import.meta.env.VITE_SIK_SMOKE === '1'`. The native
binding is independently enabled only in a debug build with exact
`VIBESPACE_SIK_SMOKE=1`, canonical isolated-profile ownership, helper-bound
loopback port, and launch nonce. Production builds omit the native command
registration and do not expose the binding or smoke selectors as an
automation API. `config.test.ts` and
`smokeHarnessContract.test.ts` prove missing flag, production mode, wrong
profile, wrong PID, wrong nonce, non-loopback/wrong port, and direct driver
invocation all fail closed.

`shared-intelligence-kernel-smoke.ps1` selects and binds an unused loopback
debug port, creates a cryptographically random launch nonce, and starts hidden
Tauri with WebView2 CDP arguments plus both smoke flags in the child
environment only. `Start-Process` returns a launcher/root PID, not proof of
the native app. The helper discovers a descendant whose canonical executable
path is exactly the current worktree's Cargo debug binary
`app/src-tauri/target/debug/jarvis.exe`, records that descendant's PID and
creation time, and rejects basename-only, non-descendant, wrong-path,
pre-existing, or ambiguous matches. It then invokes the driver with the exact
six arguments above. Keep one outer `try/finally`. Cleanup covers both native
and driver process trees, checks each descendant's recorded creation time
before stopping it, removes only the contained test profile/evidence
directories, and never kills by process name.

`app/src-tauri/src/sik_smoke.rs` owns the debug-only
`sik_smoke_binding` command. `lib.rs` registers it only under
`cfg(debug_assertions)`. The command rejects flag-off, malformed or non-loopback
port, missing/invalid nonce, a profile not equal to the canonical helper
profile, `APPDATA`/`LOCALAPPDATA` outside that profile, or a caller whose
injected Tauri window label is not exact `main`. Its private IPC
result contains the real `std::process::id()`, bound port, canonical profile,
and nonce. `KernelSmokeBindingHost` invokes it only under the browser gate,
hashes the profile before rendering, and exposes one inert `smoke.binding`
evidence node containing only PID, port, profile SHA-256, and nonce. No raw
profile path is written into screenshots, JSON evidence, DOM text, or logs.

The same module owns a second debug-only command with no caller-supplied path or
payload:

```ts
type SikSmokeVoiceFixture = Readonly<{
  audioBase64: string;
  sha256: string;
  mimeType: 'audio/wav';
}>;

// Conceptual IPC signature; Tauri injects the window/state arguments.
sik_smoke_voice_fixture(): Promise<SikSmokeVoiceFixture>;
```

`sik_smoke_voice_fixture` embeds
`app/src-tauri/tests/fixtures/sik_voice_turn.wav` with compile-time pinned bytes,
checks its frozen SHA-256, and returns only base64, that digest, and the literal
MIME type. It applies the identical debug-build, flag, canonical profile,
loopback port, launch nonce, and exact-main-host guards as
`sik_smoke_binding`; `lib.rs` registers both only inside the same
`cfg(debug_assertions)` command list, so the fixture command is absent from a
release binary. The frontend smoke control verifies the pinned digest/MIME and
passes the returned `audioBase64` directly to the existing real
`faster_whisper_transcribe` command. It never materializes or accepts a path,
and neither IPC returns a transcript. Tests prove the no-input/no-path schema,
exact pinned bytes/hash, a changed-fixture mismatch, every flag/profile/port/
nonce/main-host denial, release registration omission, use of real Faster
Whisper, and zero raw audio/base64 in messages, journal/live evidence, DOM,
screenshots, or logs. These assertions use the existing Task 21C files and do
not change the forty-three-file count.

The credential-free native CLI example remains separately gated by Rust
`debug_assertions`, the explicit smoke flag, and the exact canonical fixture
path. Neither the CLI example nor the CDP driver is reachable in a production
binary.

This is a product/development-tooling prerequisite, not part of docs-only
Task 22. It lands and passes before Task 22 starts.

**Exact files**

- Modify: `app/src/components/layout/TopBar.tsx`
- Create: `app/src/components/layout/TopBar.voiceSmoke.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.tsx`
- Modify: `app/src/features/voice/VoiceModal.turn.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.stop.test.tsx`
- Create: `app/src/features/voice/VoiceModal.sttSmoke.test.tsx`
- Modify: `app/src/features/voice/voiceSessionBinding.test.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/src/vite-env.d.ts`
- Create: `app/src/lib/jarvis/smoke/config.ts`
- Create: `app/src/lib/jarvis/smoke/config.test.ts`
- Create: `app/src/lib/jarvis/smoke/scenarios.ts`
- Create: `app/src/lib/jarvis/smoke/scenarios.test.ts`
- Create: `app/src/lib/jarvis/smoke/evidenceIds.ts`
- Create: `app/src/lib/jarvis/smoke/evidenceIds.test.ts`
- Create: `app/src/lib/jarvis/smoke/smokeHarnessContract.test.ts`
- Create: `app/src/lib/jarvis/smoke/KernelSmokeBindingHost.tsx`
- Create: `app/src/lib/jarvis/smoke/KernelSmokeBindingHost.test.tsx`
- Create: `app/src/lib/ai/providers/kernelSmoke.ts`
- Create: `app/src/lib/ai/providers/kernelSmoke.test.ts`
- Modify: `app/src/lib/ai/providerRegistry.ts`
- Modify: `app/src/lib/ai/providerRegistry.test.ts`
- Modify: `app/src/lib/ai/adapters/catalog.ts`
- Modify: `app/src/lib/ai/adapters/catalog.test.ts`
- Modify: `app/src/lib/ai/adapters/cliBridge.ts`
- Modify: `app/src-tauri/src/cli_bridge.rs`
- Modify: `app/src-tauri/src/faster_whisper.rs`
- Create: `app/src-tauri/src/sik_smoke.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Create: `app/src-tauri/examples/vibespace_kernel_smoke_cli.rs`
- Create: `app/src-tauri/tests/fixtures/sik_voice_turn.wav`
- Modify: `app/src/features/chat/ChatThread.tsx`
- Modify: `app/src/features/chat/ChatThread.commandCenter.test.tsx`
- Modify: `app/src/features/chat/ActionApprovalCard.tsx`
- Modify: `app/src/features/chat/ActionApprovalCard.test.tsx`
- Modify: `app/src/features/jarvis-command-center/JarvisCommandCenter.tsx`
- Modify: `app/src/features/jarvis-command-center/JarvisCommandCenter.test.tsx`
- Modify: `app/src/features/jarvis-command-center/JarvisOutputsTab.tsx`
- Modify: `app/src/features/jarvis-command-center/JarvisLiveSystemsTab.tsx`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/features/terminals/TerminalView.execution.test.tsx`
- Create: `scripts/shared-intelligence-kernel-smoke.ps1`
- Create: `scripts/shared-intelligence-kernel-smoke-driver.mjs`

Run the exact focused command for RED and GREEN, followed by root typecheck:

```powershell
npm --prefix app test -- src/lib/jarvis/smoke/config.test.ts src/lib/jarvis/smoke/scenarios.test.ts src/lib/jarvis/smoke/evidenceIds.test.ts src/lib/jarvis/smoke/smokeHarnessContract.test.ts src/lib/jarvis/smoke/KernelSmokeBindingHost.test.tsx src/lib/ai/providers/kernelSmoke.test.ts src/components/layout/TopBar.voiceSmoke.test.tsx src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx src/features/voice/VoiceModal.sttSmoke.test.tsx src/features/voice/voiceSessionBinding.test.ts
npm run typecheck
```

- [ ] Stage exactly the forty-three literal files below, verify cached-name parity
      is 43/43, then run whitespace, secret, installer, and cached-diff
      gates.

### 21C.1 Explicit opt-in and production inaccessibility

```ts
export type KernelSmokeConfigInput = {
  devBuild: boolean;
  explicitFlag: string | undefined;
};

export function isKernelSmokeEnabled(input: KernelSmokeConfigInput): boolean {
  return input.devBuild === true && input.explicitFlag === '1';
}
```

`app/src/vite-env.d.ts` adds only:

```ts
interface ImportMetaEnv {
  readonly VITE_SIK_SMOKE?: string;
}
```

The deterministic provider is registered only when
`isKernelSmokeEnabled({ devBuild: import.meta.env.DEV, explicitFlag:
import.meta.env.VITE_SIK_SMOKE })` is true. There is no production fallback,
query-string switch, localStorage switch, hidden UI toggle, or ordinary
provider-catalog entry. When disabled, the provider ID and scenario controls
are absent rather than merely disabled.

Registration alone does not make the provider usable. Only after
`KernelSmokeBindingHost` validates the native PID/port/profile/nonce response
may trusted smoke composition connect and select the dedicated provider
through the existing `ChatModelSelection`/model-access path in the isolated
profile. Until then the provider remains unavailable and no scenario can
dispatch. This bootstrap never writes a run, event, approval, artifact,
message, or credential directly; the real composer, voice, schedule, Hive,
approval, and terminal surfaces still create all canonical work.

The native fixture is a Cargo **example**, not another application binary.
Task 22 builds it with:

```powershell
cargo build --manifest-path app/src-tauri/Cargo.toml `
  --example vibespace_kernel_smoke_cli
```

`cli_bridge.rs` allows this one credential-free fixture only when all are
true: `cfg!(debug_assertions)`, inherited
`VIBESPACE_SIK_SMOKE=1`, the requested adapter is the dedicated smoke adapter,
the canonicalized executable is the exact example under the current
worktree's `app/src-tauri/target/debug/examples` root, and the existing executable
fingerprint/containment checks pass. It remains rejected for release builds,
flag-off development, basename collisions, symlinks/reparse escapes, and
arbitrary custom paths. Existing provider executable allowlists are unchanged.

The separate native binding contract is:

```ts
export type KernelSmokeBindingEvidence = Readonly<{
  nativePid: number;
  cdpPort: number;
  profileSha256: string;
  nonce: string;
}>;
```

`KernelSmokeBindingHost` is mounted by `App.tsx` only when
`isKernelSmokeEnabled(...)` is true. Its invoke response is not exported from
the smoke module, and only the four sanitized fields above reach the inert DOM
evidence node. The host renders no binding and performs no smoke-provider
selection on invoke rejection or field validation failure.

Tests inject both `devBuild: false` and flag-off cases, prove the provider,
scenario surface, binding host, voice transcript fixture, and all smoke
selectors are absent, and exercise a pure Rust gate with
`debug_build: false` so production rejection is tested even during a debug
test run. Rust tests also prove command-registration omission in release
configuration and exact PID/port/profile/nonce validation. No real
credential, network provider, shell profile, or user config is required.

### 21C.2 Deterministic scenarios and evidence IDs

`scenarios.ts` is an immutable fixture catalog with safe, fixed, non-secret
scenario IDs and typed provider/CLI event streams. It covers at minimum:

```ts
export type KernelSmokeScenarioId =
  | 'transport_provider_success'
  | 'transport_cli_success'
  | 'voice_turn_stop'
  | 'native_stt_voice_turn'
  | 'approval_safe_auto'
  | 'approval_confirm'
  | 'approval_dangerous'
  | 'artifact_provider'
  | 'artifact_file_action'
  | 'artifact_terminal'
  | 'schedule_dispatch'
  | 'schedule_transport_retry'
  | 'live_evidence_restart'
  | 'command_center_reduced_motion'
  | 'hive_dispatch'
  | 'partial_response'
  | 'provider_failure'
  | 'cancel_before_claim'
  | 'cancel_running'
  | 'cancel_completion_race';
```

Provider and CLI fixtures emit the same canonical semantic events for a given
scenario while preserving their distinct Task 13 transports. Approval
fixtures name registered action IDs/versions and safe canonical parameters;
they do not bypass Task 19. Artifact fixtures produce real Task 20B producer
evidence; they do not insert artifacts directly. Schedule and Hive fixtures
enter the Task 17 dispatcher. Cancellation fixtures invoke the actual Task
18/19C path. Partial/failure fixtures stop at the intended real boundary.
No fixture directly mutates a run/event/approval/artifact repository or
asserts a terminal state.

Each catalog entry also owns one exact fixed UI input sequence and safe text
fixture. The driver performs that sequence through real controls; the
development provider derives its closed scenario only from the exact catalog
fixture carried through the genuine request. `schedule_transport_retry`
dispatches a real schedule whose attempt `1` deterministically fails inside
Task 13 before the first response byte/chunk. It proves the exact zero-effect
settlement, lets the helper restart the isolated app, observes retry
availability with no automatic dispatch, then presses the real “Retry
transport” control. The same persisted snapshot/run reaches attempt `2` with
a new request ID, and the development provider emits canonical success based
only on that trusted attempt number. `voice_turn_stop` uses the fixed
`voice.transcript` submission through `flushUtterance()` after the
native-bound smoke model is selected; its provider fixture reaches canonical
`running`, waits on the real request `AbortSignal`, confirms the matching stop,
and emits no later success. `live_evidence_restart` uses real controls to
complete one provider/capability run and verify its completed Live Systems
node, then starts a second deterministic provider run that remains in flight.
The helper restarts the isolated app against the same contained profile with
no direct repository mutation. After canonical boot reconstruction, the first
run's completed/degraded node is present with the same opaque `jlive_` proof
reference only after exact source/live-row revalidation; the second run's
orphaned prior-process active node is absent. The UI performs no event fold or
verifier/write call, and no provider/action automatically resumes. There is no
query-string, `localStorage`, generic
`evaluate()`, IPC “set scenario” command, or out-of-band repository mutation.

`native_stt_voice_turn` obtains only the fixed fixture bytes from the gated
native command, invokes the existing real faster-whisper transcription path,
and binds its result to the current protected voice session before the
deterministic smoke provider handles the turn. Scenario code cannot supply a
transcript, mock the engine result, select an arbitrary audio path, or write
audio/transcript directly to the journal. Rust tests pin the exact canonical
fixture path and SHA-256 and reject release, flag-off, symlink/reparse, changed
fixture, and arbitrary-path requests. Frontend tests prove engine failure does
not fall back to transcript injection and raw audio is released before kernel
dispatch.

`command_center_reduced_motion` uses the driver's named, fixed
`page.emulateMedia({ reducedMotion: 'reduce' })` path (not generic evaluation),
opens the real Command Center, operates its disclosure and tabs by keyboard,
and captures computed-transition/animation evidence plus focus before and
after. It fails if any pulse, sweep, transition, delayed layout state, lost
focus, or inaccessible keyboard path remains.

`evidenceIds.ts` defines stable opaque selector constants used as
`data-sik-evidence` values for the chat run shell, approval card, run status,
Outputs tab, Live Systems tab, terminal execution, cancellation delivery, and
error/partial states. IDs contain no account, run, action parameter, prompt,
path, result, or secret data. Components consume constants rather than
duplicated string literals; tests prove uniqueness and presence. These
attributes are evidence selectors only, not an execution API.

### 21C.3 Exact smoke setup/teardown helper

`scripts/shared-intelligence-kernel-smoke.ps1` is the only native smoke
launcher Task 22 uses. It accepts `-ValidateOnly` or an evidence directory and
scenario list, selects a fresh unused loopback port, creates a unique Tauri
identifier, a cryptographically random nonce, and a contained disposable
app-data profile, builds the native CLI example, and starts the isolated Tauri
development process hidden. The child environment, and only the child
environment, receives `VITE_SIK_SMOKE=1`, `VIBESPACE_SIK_SMOKE=1`,
`VIBESPACE_SIK_CDP_PORT`, `VIBESPACE_SIK_PROFILE`,
`VIBESPACE_SIK_NONCE`, isolated `APPDATA`/`LOCALAPPDATA`, and WebView2
additional browser arguments for the exact loopback port and contained user
data. The parent environment is restored before any evidence assertion.

Before launching the driver, the helper waits for both the loopback CDP
endpoint and exactly one native descendant matching the canonical
`app/src-tauri/target/debug/jarvis.exe` path. It passes the driver's six exact
arguments, including that native descendant PID, the canonical profile, and
the nonce. The driver canonicalizes the expected profile, computes its
SHA-256, and compares all four page binding fields before selecting a
scenario. Evidence records contain the digest, never the raw profile.

The script has one outer `try/finally` covering **all** setup, startup,
automation, restart, and cleanup. It initializes `$Dev = $null` before the
`try`. The `finally` block tolerates failure before or during
`Start-Process`, restores every inherited environment variable, re-enumerates
only descendants of the captured launcher/root PID when one exists, verifies
the canonical executable path and each PID's UTC creation time against the
captured record immediately before stopping it, stops deepest descendants then
the root, and never selects or kills by process name. It removes only a
canonical profile path proven to be a strict descendant of the script's
dedicated profile base. Evidence/logs are preserved on failure. Existing
VibeSpace processes and ports are never attached to, reused, or stopped.

`smokeHarnessContract.test.ts` statically verifies the safety-critical script
contract: `$Dev = $null`, one outer `try/finally`, partial-start guards,
native-descendant and exact-executable-path checks, creation-time checks,
strict profile containment, hidden startup, unused-loopback-port selection,
nonce generation/propagation, all six driver arguments, root
`playwright-core` import, and absence of name-based kill commands. Task 22
still performs a real execution of the helper.

### 21C.4 TDD, gates, and commit

- [ ] Add config/provider/Rust gate tests proving dev+flag opt-in and
      production inaccessibility, exact native binding, and release command
      omission; confirm red.
- [ ] Add scenario tests proving exact deterministic semantic streams,
      complete scenario coverage, the two-phase pre-first-byte scheduled
      transport retry across real restart with no auto-dispatch, no direct
      repository mutation hooks, `live_evidence_restart` completed-chain
      reconstruction plus orphan-active omission, real faster-whisper fixture
      transcription with no injected-transcript fallback or raw-audio journal
      data, and no secret-shaped fixture fields; confirm red.
- [ ] Add TopBar opener, genuine VoiceModal transcript submission,
      binding-host, evidence-ID/component, and smoke-script contract tests;
      confirm red.
- [ ] Implement the smallest provider, CLI fixture, selectors, and safe
      launcher; run:
      `npm --prefix app test -- src/lib/jarvis/smoke src/lib/ai/providers/kernelSmoke.test.ts src/lib/ai/providerRegistry.test.ts src/lib/ai/adapters/catalog.test.ts src/components/layout/TopBar.voiceSmoke.test.tsx src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx src/features/voice/VoiceModal.sttSmoke.test.tsx src/features/chat/ActionApprovalCard.test.tsx src/features/chat/ChatThread.commandCenter.test.tsx src/features/jarvis-command-center src/features/terminals/TerminalView.execution.test.tsx`.
- [ ] Run `npm ls playwright-core --depth=0`,
      `npm --prefix app run typecheck`,
      `cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`,
      `cargo test --manifest-path app/src-tauri/Cargo.toml cli_bridge`,
      `cargo test --manifest-path app/src-tauri/Cargo.toml sik_smoke`, and
      `cargo check --release --manifest-path app/src-tauri/Cargo.toml`, then
      build the example.
- [ ] Run the helper in validation-only mode, then one minimal real isolated
      `transport_provider_success` smoke before committing.
- [ ] Stage exactly the forty-three files above; run cached-name, whitespace,
      added-line secret, installer, and production-inaccessibility checks.

```powershell
git add -- `
  app/src/components/layout/TopBar.tsx `
  app/src/components/layout/TopBar.voiceSmoke.test.tsx `
  app/src/features/voice/VoiceModal.tsx `
  app/src/features/voice/VoiceModal.turn.test.tsx `
  app/src/features/voice/VoiceModal.stop.test.tsx `
  app/src/features/voice/VoiceModal.sttSmoke.test.tsx `
  app/src/features/voice/voiceSessionBinding.test.ts `
  app/src/App.tsx `
  app/src/vite-env.d.ts `
  app/src/lib/jarvis/smoke/config.ts `
  app/src/lib/jarvis/smoke/config.test.ts `
  app/src/lib/jarvis/smoke/scenarios.ts `
  app/src/lib/jarvis/smoke/scenarios.test.ts `
  app/src/lib/jarvis/smoke/evidenceIds.ts `
  app/src/lib/jarvis/smoke/evidenceIds.test.ts `
  app/src/lib/jarvis/smoke/smokeHarnessContract.test.ts `
  app/src/lib/jarvis/smoke/KernelSmokeBindingHost.tsx `
  app/src/lib/jarvis/smoke/KernelSmokeBindingHost.test.tsx `
  app/src/lib/ai/providers/kernelSmoke.ts `
  app/src/lib/ai/providers/kernelSmoke.test.ts `
  app/src/lib/ai/providerRegistry.ts `
  app/src/lib/ai/providerRegistry.test.ts `
  app/src/lib/ai/adapters/catalog.ts `
  app/src/lib/ai/adapters/catalog.test.ts `
  app/src/lib/ai/adapters/cliBridge.ts `
  app/src-tauri/src/cli_bridge.rs `
  app/src-tauri/src/faster_whisper.rs `
  app/src-tauri/src/sik_smoke.rs `
  app/src-tauri/src/lib.rs `
  app/src-tauri/examples/vibespace_kernel_smoke_cli.rs `
  app/src-tauri/tests/fixtures/sik_voice_turn.wav `
  app/src/features/chat/ChatThread.tsx `
  app/src/features/chat/ChatThread.commandCenter.test.tsx `
  app/src/features/chat/ActionApprovalCard.tsx `
  app/src/features/chat/ActionApprovalCard.test.tsx `
  app/src/features/jarvis-command-center/JarvisCommandCenter.tsx `
  app/src/features/jarvis-command-center/JarvisCommandCenter.test.tsx `
  app/src/features/jarvis-command-center/JarvisOutputsTab.tsx `
  app/src/features/jarvis-command-center/JarvisLiveSystemsTab.tsx `
  app/src/features/terminals/TerminalView.tsx `
  app/src/features/terminals/TerminalView.execution.test.tsx `
  scripts/shared-intelligence-kernel-smoke.ps1 `
  scripts/shared-intelligence-kernel-smoke-driver.mjs
git commit -m "test(jarvis): add isolated kernel smoke fixtures"
```

## Task 22 — Docs-only native evidence and final review

Task 22 must run and record the Task 21C `voice_turn_stop`,
`native_stt_voice_turn`,
`schedule_transport_retry`, and `live_evidence_restart` scenarios in addition
to the existing approval, artifact, schedule, Hive, partial, failure, and
cancellation scenarios:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -Scenarios @('voice_turn_stop')
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -Scenarios @('native_stt_voice_turn')
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -Scenarios @('command_center_reduced_motion')
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -Scenarios @('schedule_transport_retry')
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -Scenarios @('live_evidence_restart')
```

The helper, not the reviewer, selects the fresh CDP port/profile/evidence
directory and invokes:

```text
node scripts/shared-intelligence-kernel-smoke-driver.mjs --cdp-port <helper-bound-port> --scenario voice_turn_stop --evidence-dir <contained-evidence-dir> --expected-native-pid <recorded-native-pid> --expected-profile <canonical-isolated-profile> --expected-nonce <random-launch-nonce>
```

The native evidence matrix must include:

| Scenario                        | Required stable evidence                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voice_turn_stop`               | Unique `voice.open`; submitted fixed `voice.transcript`; canonical running/cancellation/final `voice.state`; real `voice.stop`; matching run/event cancellation proof; no provider credential; no stale post-Stop assistant success                                                                                                                                       |
| `native_stt_voice_turn`         | Safe fixture SHA-256; real Tauri faster-whisper engine/model; transcript bound to the exact protected voice session/run; canonical turn result; zero raw audio in message/journal/live evidence/logs; engine/model failure recorded as this row's exact `BLOCKED_EXTERNAL` rather than transcript injection or PASS                                                       |
| `command_center_reduced_motion` | CDP `prefers-reduced-motion: reduce`; real disclosure/tab keyboard sequence; zero computed animation/transition/pulse; immediate stable state; preserved focus; unchanged Outputs/Live Systems content and accessible semantics                                                                                                                                           |
| `schedule_transport_retry`      | Initial Task 13 failure before the first response byte/chunk; exact account/run/request/attempt zero-counter evidence; zero approvals/artifacts/effect claims; persisted `retryable_failed`; restart with no auto-dispatch and Cancel suppressed; real “Retry transport”; same run and immutable snapshot; new request/attempt; terminal commit; no duplicate side effect |

| `live_evidence_restart` | One real completed provider/capability proof chain and one in-flight active chain before restart; same-profile boot reconstruction; exact source/live-row and producer-result revalidation; completed/degraded node restored with its opaque proof; orphan active node absent; zero UI event folding, auto-resume, or direct repository mutation |

Also attach the Task 21C production-inaccessibility test result, the
PID/loopback-port/profile-digest/nonce binding record, native and driver
creation times, descendant cleanup record, contained-profile cleanup record,
and proof that the unrelated VibeSpace instance and
`grok-workbench-pr25-v2` were untouched.

**Exact tracked files**

- Create: `docs/architecture/shared-intelligence-kernel.md`
- Create: `docs/testing/shared-intelligence-kernel-verification.md`
- Create: `docs/security/shared-intelligence-kernel-threat-model.md`
- Update root-checkout `AGENT_COORDINATION.md` only under its mutex; never
  stage it from this worktree.

Task 22 itself is evidence/documentation-only. If any verification or review
finds a product defect, stop Task 22 staging, register a separately named
locked TDD fix task, add a failing focused test, make the smallest product
fix, commit it separately, release its locks, and rerun Task 22 from the
affected gate. Never hide a product fix inside the documentation commit.

### 22.1 Focused and repository gates

Capture command, exit code, duration, commit SHA, and sanitized output under
the ignored directory
`.superpowers/sdd/evidence/task-22/<UTC timestamp>/`; raw evidence is never
staged.

```powershell
npm --prefix app test -- src/lib/accountIdentity.test.ts
npm --prefix app test -- src/lib/jarvis
npm --prefix app test -- src/lib/db/index.migration.test.ts src/lib/db/migrations/jarvisV3.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/db/kernelTurnTransactionAuthority.test.ts src/lib/db/repositories.kernelTurn.test.ts
npm --prefix app test -- src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/lib/ai/providerPromptTransport.test.ts src/lib/ai/providerAttemptEvidence.test.ts
npm --prefix app test -- src/features/plugins/credentialAuthorization.test.ts src/features/plugins/credentials.test.ts src/features/plugins/store.test.ts src/features/plugins/runtime.test.ts src/features/plugins/contract.test.ts src/features/plugins/activation.test.ts src/features/plugins/context.test.ts src/features/plugins/action.test.ts src/features/plugins/managementContext.test.tsx src/features/plugins/Plugins.test.tsx src/features/chat/Composer.pluginAccountScope.test.tsx src/App.jarvisSecurityRuntime.test.tsx
npm --prefix app test -- src/features/voice
npm --prefix app test -- src/features/schedule
npm --prefix app test -- src/features/jarvis-runs
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
npm --prefix app test -- src/features/jarvis-command-center src/features/chat/ChatThread.commandCenter.test.tsx
npm --prefix app test -- src/lib/jarvis/smoke src/lib/ai/providers/kernelSmoke.test.ts src/lib/ai/providerRegistry.test.ts
npm ls playwright-core --depth=0
npm --prefix app run typecheck
npm --prefix app test
npm run test:release-manifest
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
cargo check --release --manifest-path app/src-tauri/Cargo.toml
cargo build --manifest-path app/src-tauri/Cargo.toml --example vibespace_kernel_smoke_cli
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -ValidateOnly
```

If any Rust/native source differs from `origin/main`, also run:

```powershell
cargo test --manifest-path app/src-tauri/Cargo.toml
```

No security, migration, cancellation, stress, or accessibility assertion may
be skipped. A pre-existing unrelated failure is documented with command,
output, and ownership, but every kernel-caused or kernel-blocking failure is
fixed before continuing.

### 22.2 Performance and selector-limit evidence

Task 12 creates the envelope-plus-compiler harness and Task 14 creates the
response classifier-plus-linter harness. Run their exact files:

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.performance.test.ts
npm --prefix app test -- src/lib/jarvis/response/pipeline.performance.test.ts
npm --prefix app test -- src/lib/db/jarvisRepositories.test.ts src/lib/jarvis/executionJournal/recovery.test.ts src/features/jarvis-command-center/selectors.test.ts
```

Record sample count, sanitized input sizes, p50, p95, and maximum. Acceptance
is p95 `<25 ms` for envelope validation/build plus compilation excluding
retrieval/provider work, and p95 `<15 ms` for deterministic response
classification plus lint with repair-spy count `0`. Selector evidence must
show `0`, `501`, and very large caller limits are rejected or clamped as
specified, no query returns more than `500`, and the collapsed Command Center
performs zero Live Systems/graph calls.

### 22.3 Reproducible isolated native Tauri smoke

Task 22 consumes the committed Task 21C helper; it does not recreate or paste
an alternate launcher. First rerun its production-inaccessibility and
script-contract tests, then invoke the real helper from the isolated worktree:

```powershell
$Stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$Evidence = Join-Path (Resolve-Path '.').Path `
  ".superpowers\sdd\evidence\task-22\$Stamp"

& powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/shared-intelligence-kernel-smoke.ps1 `
  -EvidenceDirectory $Evidence `
  -Scenarios @(
    'transport_provider_success',
    'transport_cli_success',
    'voice_turn_stop',
    'native_stt_voice_turn',
    'command_center_reduced_motion',
    'approval_safe_auto',
    'approval_confirm',
    'approval_dangerous',
    'artifact_provider',
    'artifact_file_action',
    'artifact_terminal',
    'schedule_dispatch',
    'schedule_transport_retry',
    'live_evidence_restart',
    'hive_dispatch',
    'partial_response',
    'provider_failure',
    'cancel_before_claim',
    'cancel_running',
    'cancel_completion_race'
  )
if ($LASTEXITCODE -ne 0) {
  throw "Shared Intelligence Kernel smoke failed with exit code $LASTEXITCODE."
}
```

The helper's implementation is the Task 22 process-safety boundary. Verify in
the captured script/evidence that:

- `$Dev = $null` is initialized before one outer `try/finally` that covers
  directory creation, environment changes, build, partial/full process
  startup, readiness, scenario automation, restart, and cleanup;
- the root command remains
  `npm run tauri:dev -- -- --config <temporary-overlay.json>`;
- it uses a unique Tauri identifier, a freshly probed unused loopback port,
  random launch nonce, disposable `APPDATA`/`LOCALAPPDATA`, both explicit Task
  21C smoke flags, hidden startup, and the credential-free native CLI example;
- the PID supplied to the driver is the unique captured descendant whose
  canonical executable is exactly the current worktree's
  `app/src-tauri/target/debug/jarvis.exe`, not the `Start-Process` launcher PID
  or a process-name match;
- the driver receives and verifies PID, loopback port, canonical-profile
  SHA-256, and nonce before running any scenario;
- `finally` succeeds even when failure happens before `$Dev` is assigned or
  while descendants are only partially started;
- cleanup re-enumerates only the captured root's descendant tree, validates
  every root/child PID's UTC creation time immediately before stop, stops
  deepest-first, and never selects or kills by process name;
- profile cleanup resolves the target and proves it is a strict descendant of
  the dedicated smoke-profile base before recursive deletion;
- logs and sanitized evidence survive failure, while the disposable app-data
  profile is removed; and
- the unrelated VibeSpace localhost instance, port, profile, process tree,
  branch, and worktree are never attached to, reused, stopped, or modified.

Drive the native window only through the Task 21C stable
`data-sik-evidence` selectors and approved in-app/Windows automation. Record
screenshots plus a sanitized matrix with run IDs/event sequences and producer
receipt/result categories, never prompts, params, handles, paths, or secrets.
The matrix proves:

1. typed built-in-JARVIS provider transport and immutable model switching;
2. the credential-free native CLI transport;
3. structured question/action rendering, safe auto-approval, and independent
   confirm/dangerous human approvals;
4. cancel-before-claim exact `queued_tombstoned`, claimed/drained
   `handoff_pending`, running `signal_delivered`, matching native-exit
   `cancelled`, and completion/cancel race truth;
5. voice turn binding and Stop propagation without speaking raw stream text;
6. the safe fixture passes through the actual native faster-whisper engine into
   the protected voice turn with exact transcript/session/run binding and zero
   raw audio in canonical storage; an unavailable engine/model is reported as
   the isolated STT evidence gate, never replaced with transcript injection;
7. schedule and Hive final dispatch through the canonical kernel;
8. scheduled transport failure before the first response byte/chunk, durable
   zero-effect retry availability across restart with no auto-dispatch, then
   explicit same-run/new-request retry from the immutable snapshot to one
   terminal commit;
9. provider/file-action/terminal artifacts accepted through their exact
   producer receipts and a source-only candidate rejected;
10. collapsed Command Center with zero capability reads, Outputs, then lazy
    Live Systems containing only authority-verified account/run-scoped nodes;
    completed/degraded chains reconstruct after restart while orphan active
    chains do not; and
11. partial, failure, unavailable, and cancelled quiet states; and
12. `prefers-reduced-motion: reduce` produces immediate stable Command Center
    expansion/tabs/evidence states with no pulse/transition while preserving
    focus, keyboard navigation, and all canonical content.

The helper restarts the isolated app once with the same overlay/profile before
its final cleanup. Verify canonical runs/events/artifacts survive; queued,
running, and consumed approval work is not replayed; `awaiting_approval` is
re-presented only for an exact pending/unconsumed/unexpired v1 record; every
other nonterminal restart case fails closed with zero executor calls. An exact
scheduled `retryable_failed` attempt reports
`scheduled_transport_retry_available` without terminalization or dispatch,
then only the explicit trusted port may revalidate and retry it; an in-flight
or uncertain attempt remains `ambiguous_executor_state`, and all other cases
require manual/logical retry.

The same restart must prove Task 18 boot reconstruction is bounded and
complete for the selected run, all nine final producer verifier slots are
ready, each displayed completed/degraded node revalidates both its canonical
producer-result row and live-evidence row, a prior-process active-only chain is
omitted, and Task 21B performs no event folding or authority write. A missing,
foreign, stale, forged, gapped, over-budget, or cross-account proof chain yields
zero nodes for that run.

If the smoke fails, the helper's outer `finally` still performs the bounded
cleanup. Preserve evidence, diagnose, create a separately locked product-fix
task when needed, and rerun on a newly selected port/profile. Do not proceed
with the Task 22 documentation commit until the complete matrix passes.

### 22.4 Security, installer, and diff gates

Run the exact added-line secret scan:

```powershell
git diff --unified=0 origin/main...HEAD |
  Select-String -Pattern '^\+(?!\+\+\+).*(?i:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|Bearer\s+|BEGIN [A-Z ]*PRIVATE KEY)'
```

Every match is manually classified; any real secret blocks continuation and
is removed from history through a separately authorized safe remediation.
Also verify local-only tables, prompts, source bodies, handles, raw provider
text, and private paths do not enter sync, logs, TTS, events, artifacts, or
docs.

Prove the installer is absent from every successor-branch commit:

```powershell
git log --oneline origin/main..HEAD -- install/install.ps1
$InstallerViolations = @(
  git rev-list --reverse origin/main..HEAD | ForEach-Object {
    $sha = $_
    if (git diff-tree --no-commit-id --name-only -r $sha -- install/install.ps1) {
      $sha
    }
  }
)
if ($InstallerViolations.Count -ne 0) {
  throw "Installer touched by: $($InstallerViolations -join ', ')"
}
```

Expected output from the first command is empty and violation count is zero.
Run `git diff --check` and inspect `git diff --name-status
origin/main...HEAD`; the protected deletion remains unstaged and absent from
branch commits.

### 22.5 Independent review and separate fix loop

Invoke the requesting-code-review workflow after all gates and give reviewers
the approved design, final plan, commit range, threat model, and evidence
matrix. Review at minimum:

- transition/cancellation races and atomicity;
- approval canonicalization, drift, replay, and secret handles;
- artifact backing/source distinction;
- account switching, local-only persistence, and legacy shutdown;
- typed/voice/schedule/Hive/CLI parity;
- Command Center bounds/lazy behavior/accessibility;
- native process/profile cleanup and rollback.

For each actionable finding:

1. acquire exact file locks under the root coordination mutex;
2. append a separately named review-fix task to the execution log;
3. write and run a failing focused test;
4. implement the smallest fix;
5. run focused plus affected integration gates;
6. stage literal files and commit the fix separately;
7. release locks and rerun Task 22 from the affected checkpoint.

Workflow review acknowledgment is not another user approval gate.

### 22.6 Documentation-only commit and successor draft PR

The architecture document records authority order, request/response flow,
transition matrix, atomic journal, approvals, artifacts, account isolation,
legacy projections, Command Center, gate/rollback, and later-goal contracts.
The verification document records exact SHAs, commands, exit codes,
performance numbers, selector bounds, native environment, scenario matrix,
review fixes, and remaining external-only limitations. The threat model
records assets, trust boundaries, adversaries, secret handling, approval
tamper/replay, cancellation races, artifact poisoning, sync leakage, and
mitigations.

```powershell
git add -- `
  docs/architecture/shared-intelligence-kernel.md `
  docs/testing/shared-intelligence-kernel-verification.md `
  docs/security/shared-intelligence-kernel-threat-model.md
git diff --cached --name-only
git diff --cached --check
git diff --cached -- install/install.ps1
git commit -m "docs: document shared intelligence kernel evidence"
```

Expected cached names are exactly the three docs. Then rerun:

```powershell
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git show --check --stat HEAD
git log --oneline origin/main..HEAD -- install/install.ps1
```

Push normally and create or update the successor pull request as **draft** by
using the approved GitHub workflow/connector. Verify base `main`, exact
successor head branch, `state: OPEN`, and `isDraft: true`. Record the URL in
the verification doc/coordination log. Do not merge, mark ready, deploy,
release, force-push reviewed history, or touch `grok-workbench-pr25-v2`.

## Kernel Completion Gate

This plan is complete only when:

- all `34` executable slices across the `22` numbered task families have landed
  in the dependency-safe order, including Task 21C before docs-only Task 22;
- all six v3 stores exist and migration tests prove V1/V2 preservation and
  idempotence;
- canonical identity/profile migration preserves user extensions and account
  isolation;
- kernel records and private JARVIS instructions cannot enter generic sync;
- all JARVIS request sources build the shared envelope and compiled prompt;
- all provider transports preserve or explicitly reject the compiled contract;
- structured blocks survive response enforcement byte-for-byte;
- response truth, display text, and spoken text agree;
- raw provider text cannot reach TTS;
- the Task 18 journal is the only legal lifecycle writer, queued cancellation
  holds the exact-item lock, commits a durable non-runnable exact-item tombstone
  before the terminal CAS, rolls back exactly on pre-CAS failure, and forbids
  later-owner routing after the terminal CAS, while running cancellation remains
  nonterminal until verified owner/executor truth, and restart recovery is
  exactly `await_approval | fail_closed`; scheduled same-run transport retry
  uses Task 13's durable exact account/run/request/attempt evidence from before
  the first response byte/chunk with zero response/action observations,
  durable attempt IDs, an exact zero-effect proof, a new persisted request ID,
  and the explicit non-replaying scheduled kernel entrypoint, while every
  started/interrupted stream terminalizes truthfully and every terminal run
  requires a new logical run; every live verifier re-reads the exact closed
  `producerSourceEvidence` member at its `resultEventSeq`, never ordinary
  status/prose or process availability;
- Tasks 19A-19D preserve exact non-secret authority, private scoped
  secret handles behind the named security composition runtime, durable
  non-secret account grants for the device-global credential store through the
  strict CAS/readback storage adapter, the same injected grant repository in
  authorization and plugin management, explicit plugin-connection mutators,
  human-only legacy-unbound re-entry without pre-existing grant authority,
  exact conditional disconnect under a stable ordered lock set, account-scoped plugin
  connection/runtime/sync state, real Task 5/11 binding selectors, one
  unambiguous active version per immutable literal
  action/target/credential registration, no model-facing generic plugin
  invocation, cross-account and lifecycle fail-closed behavior, single-use
  execution, approval consumption/effect claim/source start atomically bound
  to one issued lifecycle before executor or secret resolution, durable
  pre-effect claim evidence, native cancellation truth through retained issued
  handles, and canonical Browser Operator routing;
- Tasks 20A/20B accept artifacts only through runtime-bound receipts from the
  exact provider, file/action, terminal, plugin, MCP, or schedule producer,
  with pre-digest metadata canonicalized/hashed and receipt-bound atomically
  inside the private internals boundary, and with private issuers/normalizers/
  verifiers constructible only through the named artifact/kernel runtime
  boundary;
- Task 20C stops legacy lifecycle writers and exposes only bounded read-only
  projections and canonical notifications;
- typed chat, voice, schedules, Hive finals, and deterministic actions use the
  kernel;
- the only typed-chat terminal commit is built by the named kernel runtime
  from `createKernelTurnTransactionAuthority(JarvisDexie)`, the exact seven
  real Dexie tables—including `settings` immediately after `sync_queue`—are
  passed through the accepted signal-bound array transaction in exact order and
  roll back together on every tested failure or account-revocation point, every
  pending sync row is atomically owner-bound with no claim or legacy V1
  authority sidecar, a frozen canonical account/owner binding survives from
  before the first post-allocation lifecycle write through transaction
  settlement without reclassification, every run/event CAS uses the separate
  exact two-table signal-bound authority, every approval/action claim uses the
  exact three-table signal-bound authority, voice, action, schedule, and Hive
  callers receive only runtime-issued opaque handles retained through
  terminal/settlement, every public operation exhaustively maps the outer
  authority-revoked result, and
  authority is rechecked after awaited guards immediately before irreversible
  artifact identity consumption,
  internal cross-module exports compile without a public/custom injection seam,
  and no alternate transaction/artifact/commit pair exists;
- the Task 21B Command Center has exactly `Outputs` and `Live Systems`, enforces
  account/run bounds, performs no capability read while collapsed, and shows
  only canonical state from the async live-evidence read port; active nodes are
  visible only after canonical event commit/readback, completed/degraded nodes
  are source- and row-revalidated across restart, orphaned active chains are
  omitted, all nine named producer verifier slots are ready, and UI code is
  selector-only;
- Task 21C's opt-in development fixtures are production-inaccessible and its
  isolated native helper proves exact PID/port/profile/nonce binding, safe
  setup, the two-phase `schedule_transport_retry` restart/no-auto-dispatch/
  explicit-retry path, the `live_evidence_restart` completed-chain/orphan-active
  distinction, and bounded PID/profile cleanup without name-based process
  termination;
- full typecheck, unit, manifest, build, Rust-affected, security, migration,
  selector-limit, isolated smoke, and independent-review gates have recorded
  evidence under Task 22;
- after those 34 kernel slices and Task 22 evidence complete, Unified Plan
  Phase 16 creates, stages, verifies, and commits exactly
  `docs/unified-goals/LOCAL_TEST_HANDOFF.md` as its own one-file slice. It is not
  Task 0R or Task 22 work and is not counted among the 34 kernel slices;
- after that one-file commit, Unified Plan Phase 16 runs its separately
  registered evidence-only closeout at the immutable handoff-parent cutoff and
  updates exactly `REQUIREMENTS_MATRIX.md`, `TEST_MATRIX.md`, and
  `GIT_BASELINE.md`. That three-ledger administrative commit is also outside
  the 34 kernel slices, cannot contain post-cutoff product/test claims, and
  prevents the handoff from leaving stale traceability rows without making the
  handoff commit self-referential;
- the successor branch/draft PR excludes the protected branch/worktree,
  pre-existing localhost process, installer anomaly, production state, and real
  user data.
