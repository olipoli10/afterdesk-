# Trial T70 to79 — one bounded compatibility attempt

Status: **DESIGN ONLY / EXECUTION NOT ENABLED**. This document proposes the next
controller-reviewed step; it does not activate the runner, authorize a credential
retrieval or establish that the initially in-flight PREFLIGHT70 has succeeded.

## 1. Reconciled starting point and boundary

Read-only Git observation: `a8844c0638e40127c80ae667e0efa20d31b0fde5` in
`C:/dev/endvera-astra-r03`. Existing modified `tsconfig.json` and untracked
`specs/210-personal-live-activation/drafts/` were left intact. This worktree is
therefore not an execution-ready clean source merely because HEAD is pinned.
Controller must choose a clean, inspected committed checkout for the actual run.
Only this new plan was authored. Engineering deploy-checklist guidance was used
to make departure gates, outcome classification and stop conditions explicit.

Exact target remains the existing isolated trial:

- Project `withered-mud-08129552`.
- Trial T `br-holy-brook-ax7k68oh`, checkpoint parent A `br-long-waterfall-ax3zhqtl`.
- Endpoint `ep-crimson-violet-axmmwtjw`, direct hostname
  `ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech`.
- Database `neondb`, role `neondb_owner`, PG18, direct verified TLS.
- Existing fixed0.25CU / Free plan only. No compute resizing, plan change, new
  branch or endpoint creation. Existing100CAD setup ceiling is not permission
  to spend it blindly or evidence that usage counters are current.

No connection, migration, reset or configuration of original main, pilot, or A.
Keep A untouched and retained. No application deployment, workers, provider
messages, grant/policy creation, flag activation, client generation or APK build.
T must have no application traffic; only this bounded controller procedure.

Recorded controller evidence, not new observations by this plan author:

- Actual T PG18.6 baseline:183 tables,2624 old columns,9 nonempty tables and81
  rows including70 migration records. Catalog/raw capture and aggregate SQL were
  already validated by the managed read procedure.
- Before capture `.scratch/pilot-trial-data-before70-20260910T2308Z.json`, SHA
  `3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a`.
- Baseline catalog raw SHA
  `05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4`,
  normalized SHA `b1c8f9902f0d30d6f0da0c1534f66e72d839a50c5f20af93fff58c2909fd1966`.
- Aggregate plan SHA
  `f89406ca9aae018725fae5dd9f2d184945b4e823f90cd8726cd11b3bde802241`,
  query SHA `4fdd6f2c263df2d7613f4660a49f0d090b316333c652e222737d086471730b28`,
  connector transaction-list SHA
  `2bec7f86ca19116edaa7f356ee602bc54da1ef79d0edd98b54ecc4248858f8c9`.
- Prior suspension observed23:10:23Z with suspendedAt23:09:46Z. A later
  PREFLIGHT may resume T; do not infer current endpoint state from this receipt.
- Native PG17 populated migration and preservation results are useful previous
  evidence, not proof that this PG18 migration or restoration has occurred.

Final read-only reconciliation during plan preparation: controller committed
`70827429e1ef3c9f99f75e0e0fa25b8a9f7f3a75` with the retained actual preflight
refusal. Its audit `audits/PILOT_TRIAL_PRIVATE_HANDOFF_CONTROLLER.md` was read in
full. The credential-bearing run reached childExit0 but final validation refused;
its original child snapshot was not retained, so the failing predicate is not
confirmed. A separate connector diagnostic showed backend `pg_stat_ssl.ssl=false`,
not evidence of the actual Prisma transport's TLS result. A hypothetical modified
diagnostic is not an accepted preflight. T was suspended. **Departure gate2 is
currently NOT MET; migration remains disabled.** Controller owns the bounded
diagnostic correction/review; this plan neither changes TLS checks nor equates
proxy-backend SSL metadata with client TLS. All four module hashes listed below
were reread and unchanged at70827429. The additional modified runner test was
left untouched with the existing WIP.

## 2. Reuse the existing components, not a new deployment system

Paths below are relative to `specs/210-personal-live-activation/deployment/`.

| Existing seam | Exact reuse / required narrow change after review |
|---|---|
| `pilot-trial-prisma-runner.mjs` | Keep `PILOT_TRIAL_TARGET`, strict credential decoder, child environment, source inspection, `stageSource`, `verifyStage`, `PILOT_TRIAL_HISTORY_SQL` and `inspectPilotTrialHistory`. Add the single reviewed migration branch only after implementation review. |
| `pilotTrialPrismaPhase` | Existing migration descriptor selects installed Prisma `migrate deploy --config <owned stage>/prisma-79.config.ts`. It is currently selection-only, not reachable execution authority. Verify the executable CLI resolves to the actual `checked.cli` bytes immediately before spawn. |
| `pilot-trial-private-bridge.mjs` | Its current ingress, pins, raw-terminal restoration and output filtering may be reused, but its PREFLIGHT70-only receipt/65s child limit must not silently accept migration. A separately reviewed closed migration path/receipt is required, not arbitrary modes, paths or arguments. |
| `pilot-migration-catalog.mjs` | Rebuild local exact79 catalog; pin catalog hash and each raw staged migration checksum. Historical first70 raw/LF/CRLF handling remains the existing explicit rule, not a rewrite of old history. |
| `pilot-trial-aggregate-transaction.mjs` | Rebuild `preparePilotTrialAggregateTransaction` from the original pinned PG18 catalog and unchanged migration catalog; run the same15 statements after79. Do not replace its input with the new79 catalog. |
| `pilot-data-preservation.mjs` | `compareSuppliedPilotDataPreservation(original source, before70, after79-old-columns)`; require all183 tables and2624 columns, no truncation, and zero changed counts/digests. |
| `pilot-schema-drift.mjs` | Capture with `PILOT_SCHEMA_CATALOG_SQL`; use the strict supplied comparator unchanged, retaining environment, definition, coverage and known-guard differences. It is not an automatic migration allowlist. |
| `migration-rehearsal/rehearsal.mjs` | Reuse `privatePrismaConfig`, version/dependency checks and the reviewed guard inventory. **Do not execute its `snapshotSql` against T**: that synthetic helper returns full application rows/function body. Adapt only the specific postconditions into metadata/aggregate-only checks. |

Read source hashes at this starting HEAD:

- Runner `618a826d8d105363a38ae254a4f02fd4dde40d3bf2182e25abc04e29b3bc4848`.
- Aggregate adapter `b1874524305449d727f075d166f258fe164872dd97e93feae70ae91eacc90527`.
- Schema comparator `a27b1c23750cf22b5e71ef89c1d6a83606afa0a7b8b3fa583826f409d695cf3d`.
- Preservation builder `934efe005c283d29eb3904853421e420aa4a4eb1962b36c86816f739ec1afdc7`.

These are pre-implementation pins. Future reviewed changes need fresh committed
HEAD, module/runtime/CLI/staging hashes and evidence; do not transplant these pins
onto changed code. No applied migration may be reformatted or edited.

## 3. Departure gates — before any write-capable process

1. Controller reads this plan and subsequent narrow implementation/test review.
   The current `MIGRATE_70_TO_79` hard refusal remains until then. A valid JSON
   manifest or a flag is source binding, not newly created execution permission.
2. Finish and inspect the actual PREFLIGHT70 outcome. Require exact T target,
   TLS, database/role/PG18 identity,70 successful ordered histories and pinned
   source/catalog. A missing receipt or terminal message alone is insufficient.
3. Reconcile fresh managed metadata: T still descends from A, A is retained,
   exact endpoint/capacity and current usage headroom. Reject a changed branch,
   endpoint, ancestor, source, runtime, CLI, schema or resource bound. No app
   writes during the window; if concurrency cannot be excluded, stop.
4. Revalidate private baseline bytes and strict shape locally. If its data/schema
   freshness is no longer established, recapture T70 through the same bounded
   read-only adapters and compare to the preserved baseline BEFORE writing.
   A changed row or unexplained schema delta is a stop, not a new baseline to
   accept silently. This is a read-only prerequisite, never an automatic retry
   of a migration attempt.
5. Inspect the clean checkout, whole source binding, generated-client fingerprint,
   installed Prisma6.19.3 and exact Node/Prisma CLI bytes before secret admission.
   Preserve WIP elsewhere. No shared dependency mutation/generation/install.
6. Stage unchanged schema/config/lock and exact79 migrations in the existing
   owned exclusive directory. Verify every byte and the complete directory
   inventory, including refusal of an extra migration80 or sibling file.
   Recheck source and stage after private credential admission and before CLI.
7. Bind one controller-planned attempt to T, sourceHEAD, catalog, source/stage
   fingerprint and baseline capture hash. Persist an exclusive-create local
   content-free attempt-started marker before spawning the write-capable child;
   it is a no-reentry record, not a general authorization framework. Do not place
   it among immutable staged inputs unless the exact inventory explicitly
   includes it. A preexisting marker/unknown previous attempt requires manual
   reconciliation, not a fresh UUID to bypass it.

The private channel remains memory/pipe-only under the reviewed handoff model.
No credential in CLI args, model text, diagnostic output, logs or new secret file.
Tool-service audit retention is not a local-vault guarantee. Never print Prisma
stderr/stdout on failure; it may include sensitive connection context.

## 4. One attempt and exact outcome handling

Use one fresh runner invocation for one migration attempt. Immediately inside
that invocation, repeat the existing read-only target/history70 check, rather
than relying solely on an earlier successful process. Bind its first70 history
fingerprint to the expected baseline; preserve all original history fields via
the old-column aggregate. Never alter `_prisma_migrations` directly.

Spawn exactly Node + the pinned resolved Prisma CLI + `migrate deploy` + the
owned `prisma-79.config.ts`, with `shell:false` and the existing closed child env.
Only the fixed T URL enters the child's private DATABASE_URL/DIRECT_URL. No
`db push`, `migrate dev`, `resolve`, reset, seed, schema engine override, arbitrary
SQL argument, root config lookup or alternate target is permitted.

Proposed separately reviewed bound:180s total runner wall+monotone budget,
120s maximum migration child and20s reserved for read-only postflight. Reserve
before starting the write-capable child; if insufficient time remains, refuse
BEFORE spawn. The bridge migration watchdog must be longer than the runner's
total bound, e.g.185s plus2s owned-child cleanup, not its current65s preflight
bound. Exact values must be validated in synthetic tests and retained in the
receipt; this plan does not edit them. Do not reset the budget at each await.

Do not claim all nine migrations are one atomic transaction: that property has
not been established by the current runner/descriptor or this plan. Once the
Prisma child may have started, any timeout, nonzero exit, lost acknowledgement,
output overflow, source change, cleanup uncertainty or failed postflight is
`MIGRATION_OUTCOME_UNCERTAIN`. A child spawn exception without an observed
execution boundary must be classified conservatively too.

No second migration spawn, automatic retry, backward migration, `resolve`,
history-row repair, T reset or attempt-marker deletion. Retain the original
failure/partial-history evidence. A separately authorized read-only diagnostic
may establish the actual committed history/state later, but never makes the
original failed result a PASS retroactively.

## 5. After79 verification — separate history, data and schema evidence

### A. Real Prisma postflight

After child exit0 and within remaining budget, perform the existing bounded
READ ONLY history query over a fresh connection/transaction to exact T. Call
`inspectPilotTrialHistory(..., catalog,79)`: all79 exact ordered names, first70
accepted historical checksums, last9 exact raw staged checksums, successful
timestamps, no rollback and no extra/missing/duplicate history rows. Compare the
first70 fingerprint to the immediate preflight, not just its count.

Exit0 alone is not migration verification. The resulting migration receipt
records known child invocation/exit and postflight facts but leaves data/schema
preservation and backup verification false until their independent gates pass.

### B. Complete old-column aggregate preservation

Controller captures the exact previously reviewed15-statement aggregate query
again on T79, with original PG18 catalog70, same plan/source/query pins and
single READ ONLY REPEATABLE READ transaction. Retain the before capture; write
after to a new private artifact. Query30s/transaction45s/lock2s/work_mem4MB and
max500000 rows/table remain unchanged. Never return individual row data/hashes.

Strict comparison must report `SUPPLIED_OLD_COLUMN_AGGREGATES_MATCH`,183 tables,
2624 old columns, zero changedTables/changedCounts/changedDigests. The historical
table is deliberately filtered to first70 and must still count70; this does not
replace A's full79 history check. An after capture with the original plan should
still total81 old-projection rows if everything is preserved. The nine new
history rows are outside that81, not evidence of deleted data.

### C. New state and catalog guards, without reading application rows

Capture the supported public catalog with the existing query and bounded
metadata-only transport. Keep raw captures and full comparison counts; do not
accept a truncated difference list as if every item were reviewed.

- Require the seven new proof tables empty: PersonalCalendarSmsConfirmationNonce,
  PersonalCalendarSmsConfirmation, PersonalSmsTemporalClarification,
  PersonalSmsTemporalClarificationReply, PersonalSmsConversationExpectation,
  PersonalSmsCorrelatedCalendarReview, PersonalSmsCorrelatedCalendarApproval.
  Migration76's historical expectation copy reads table73; because this trial
  began at70 and no app writes are admitted, it must not create new evidence.
- Aggregate violation counts only: new AiOperation.personalAssistantOperationId
  and PersonalAssistantOperation.sourcePersonalOperationId/modelGatewayOperationId/
  correlatedTemporalReceiptId must be NULL on retained legacy rows. Voice sessions
  must have subjectKind `voice_intake` and NULL for requestedByUserId,workspaceId,
  projectId,intakeId,projectBrainSourceId,requestCommandId,sourceBinding,
  sourceBindingHash,segmentManifest,segmentManifestHash. Empty-table checks are
  vacuous and must be labelled accordingly, not nonempty legacy behavior proof.
- Verify the18 UTC timestamp defaults listed in the existing rehearsal inventory,
  exact new FK/unique/check/trigger definitions, enabled/validated/enforced state,
  valid/ready/live indexes, and deferred guard properties. Require zero explicit
  knownGuardReviewCount and no unexplained unsupported coverage. No disabling
  triggers/constraints to make a migration or comparison pass.
- In particular check migration77's final `sms_temporal_final_binding()` against
  the immutable final source at a body/full-definition hash boundary; do not emit
  its body or ignore a changed trigger because the name exists.
- Compare against the retained local79 expected catalog AND the actual PG18
  before70 catalog. Expected71–79 DDL deltas must map to the exact nine migration
  files. Old PG18-only objects/ACLs and environment-specific differences are
  preserved and explicitly reviewed, not silently dropped to match localPG17.

The comparator is deliberately not patched to ignore version, owner, extension,
ACL/RLS, function, collation or NOT NULL differences. Its `DIFFERENT` between70
and79 is expected but not sufficient; enumerate and reconcile the complete
intended delta. `ENVIRONMENT_REVIEW_REQUIRED`, `GUARD_REVIEW_REQUIRED`, unsupported
coverage or unexplained definition differences are stop conditions until a
bounded documented review resolves them.

The previous64-function reconciliation (38 raw +26 historically corroborated
LF) applies only to those exact prior inputs. It is not a universal LF rewrite
or an after79 proof. New/changed functions need their own observed definition
hashes and exact final-migration binding; never strip arbitrary whitespace to
manufacture equality.

## 6. Suspension and retained evidence

On success, refusal or uncertain outcome, controller requests suspension of
only endpoint `ep-crimson-violet-axmmwtjw` and verifies later actual state by
metadata. A request accepted is not proof of suspension. Existing
`suspend_timeout_seconds=0` must not be presented as automatic shutdown.

Stop/observe the exact owned CLI process first; client kill does not establish
that the database rolled back or that every descendant exited. If shutdown or
suspension is unconfirmed, record it and stop further work rather than claim
cleanup PASS. Never use broad process-name termination or affect other branches.

Retain A, T, before/after private captures, attempt marker, staged immutable
inputs and content-free receipts. Do not destroy T to hide partial state. Any
future restoration uses separately reviewed authority and explicitly identified
resources; no reset of T or restoration test is implied by this migration plan.

## 7. Implementation and proof gates before release of execution

Small subsequent patch only: existing runner's one migration branch and closed
receipt, minimal bridge support for that exact branch after explicit review, and
fixed aggregate-only postconditions adjacent to the existing trial verification.
No generic executor, new service, schema change, dependency, job scheduler or
permission system. Ownership must be assigned by controller before edits.

Tests must cover: refusal before spawn for every source/target/baseline pin;
dirty or hidden tracked edits; staged extra migration80; exactly one CLI spawn;
no credential/log leakage; frame/deadline/cleanup behavior; child exit0 with70 or
partial history; changed original70 row; last9 wrong checksum; lost ack after
actual committed change; timeout after spawn; replay marker; postflight failure
without retry; same-count modified data; nonempty proof table; incorrect added
column/default; disabled/unvalidated guards; unexplained schema difference.
Preserve PREFLIGHT-only regression tests and explicitly version any new receipt.

Require distinct-agent/main source review, targeted tests/types/lint and a local
synthetic rehearsal of the new execution branch before managed use. Such review
is not independent model-quality certification. No test here may retrieve a real
credential or connect remotely. Controller alone runs the later authorized T
attempt and verifies suspension; a local test PASS is not permission to do so.

Successful endpoint of this plan: one observed T migration to79, complete old
aggregate preservation, separately verified added-state/catalog postconditions,
and T suspension, all tied to exact source/captures. This is a compatibility
rehearsal on a copy, **not** pilot/main migration, recoverable-backup/restore proof,
full database equivalence, provider/customer E2E, deployment or APK readiness.
