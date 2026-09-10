# SMS temporal registry76 — independent source review

2026-09-10. Read the complete registry plan, schema/migration and store/authority
sources available during implementation. Production sources belong to the author;
this reviewer owns only `test/sms-temporal-registry-review.test.ts` and this note.
No database, migration, provider, credentials or native process was executed.

## Reproduced classification defect

05:14:55: **one RED / one positive control PASS** with the real temporal resolver
and real store, synthetic DB and authority boundaries. A CLARIFY-only original
proposal with MISSING_END_TIME yields INSUFFICIENT_ORIGINAL_TEMPLATE from the
resolver. The store classified every non-CLARIFY status as ACCEPTED, returning
CORRELATED_NOT_EXECUTED and writing an accepted receipt. This incorrectly made an
insufficient interpretation the terminal accepted answer. No calendar execution
occurred or was demonstrated.

The author changed acceptance to require RESOLVED_NOT_AUTHORIZED exclusively.
Insufficient templates now receive REFUSED with an explicit reformulation reply.
Independent follow-up at 05:17:44: **13/13 PASS**, including the original defect,
positive resolution, seven scalar tamper checks, two timestamp divergence checks,
OFF-before-DB and already-expired deadline. Canonical model authority inspection
is mocked explicitly in this bounded store test; its actual SQL is not proved by
these cases. Scoped ESLint and root typecheck passed at this checkpoint.

## SQL/current-authority observations sent to author

These are static review findings, not reproduced PostgreSQL failures:

- Source claim liveness at registry/reply INSERT alone did not prove the original
  lease was still owned when a later source completion occurred. The author added
  transition-time processing1, exact OLD lease against captured sourceClaim,
  current DB-clock liveness and NEW completed1/null lease checks. Both original
  and reply sources are covered. The corrected guard was reread; native tests
  should mutate/expire the lease between INSERT and final source completion.
- Preparation's original proof loader enforced the pilot window, but later
  current-authority inspection initially lacked the same current pilot checks.
  The author added DB-clock/reference/expiry enforcement, locked active model
  credential and canonical current model-grant fingerprint reinspection. These
  deltas were reread; fake authority fixtures are not native revocation proof.
- Reply SQL initially validated packet hash and false flags but did not bind
  ACCEPTED outcome to a RESOLVED_NOT_AUTHORIZED packet/resolution hash. This could
  contradict the corrected TypeScript union for a direct SQL write. Returned to
  author. The correction was reread: ACCEPTED now requires the closed resolution
  version/status, its exact canonical resolution hash, ordered UTC dates and
  original timezone/anchor/action. Both exact source packets, evidence and
  correlation hashes are bound; REFUSED has a closed status union and the generic
  refusal is a fixed JSON object. Native forged-packet tests remain required.

## Shared namespace/history review

The TypeScript pair hash preserves the legacy compact JSON array without owner,
workspace or protocol namespace additions. SQL validates E.164 and constructs the
same closed compact bytes. The partial unique active namespace crosses both
subject types; legacy CONSUMED stays active while temporal CONSUMED is terminal.
Historical rows are copied as stored before guards, never claimed repaired.
New ledger creation forces current UTC DB time instead of allowing source/caller
backdating. Histories cannot be deleted/truncated/rewritten. Serializable
transactions and common advisory locking are required, but actual overlapping
cross-type/global-cap behavior still needs native multi-backend tests.

No registry-wide GREEN yet: SQL is unexecuted by reviewer and the parent's native
checkpoint remains required. No product readiness, model quality or live authority
is implied by synthetic tests.

## Final bounded source verdict

The author additionally normalized accepted claim offsets to canonical ISO Z at
schema parse, before immutable sourceClaim capture. This closes the previously
noted mismatch between equivalent offset input and text equality in the SQL
correlation lease proof. An independent actual-store test supplies +00:00 and
verifies the inserted receipt retains canonical Z.

09:26:28: **48/48 PASS** (17 independent store countertests +31 author authority
tests). The 17 cases retain the originally reproduced RED and its positive
control. SQL review is GREEN to proceed to the parent's controlled native
validation; it is not a claim that migration syntax, all triggers or overlapping
multi-backend transactions have passed. Explicit native priorities remain:
cross-type/cross-workspace active uniqueness, six terminal/backdated creations,
last-slot concurrent cap, lease mutation/expiry after INSERT, forged ACCEPTED
packet, final source-CAS rollback, timestamp zones, receipt replay/counter and
grant revocation without erased history.

## Native fixture source review, before execution

Read all 17 cases of `temporal-registry.postgres.test.ts` without running them.
The fixture uses real persisted gateway admission/dispatch with injected synthetic
model output; it labels manually persisted SMS acceptance as TEST-CREATED evidence,
not Twilio delivery. Source completion is an exact SQL CAS; the expired-lease test
asserts its after-insert callback was reached. The cross-type overlap captures two
backend PIDs and requires exactly one fulfilled transaction and one active ledger.

Requested stronger negative-test oracles from the author: assert the forged packet
actually reached INSERT, then match its expected trigger refusal; likewise match
the sixth-creation cap refusal instead of accepting any thrown error. This avoids
mistaking an unrelated fixture/precondition failure for the intended protection.
These requests do not change the source verdict or claim an observed test failure.

Coverage boundaries: the three timezone variants currently change only the
synthetic-acceptance transaction, not all prepare/consume transactions. Historical
UPDATE backdating is tested, but a sixth new INSERT with supplied old creation time
is not yet covered. Identical phone pair across workspaces and concurrency at the
last hourly-cap slot also remain outside these 17 cases. Parent owns execution
and must attach actual native receipts before reporting their result.

## Native76 failure and forward77 review

Parent reported real native76 **12 FAIL / 5 PASS**, retained under
`evidence/postgres-native-1789047473968`. The deferred final-binding function used
a CASE expression referencing `NEW.clarificationId` when the actual trigger record
was a registry row without that field. This invalidates any registry-wide native
PASS inference from the earlier source review. The applied76 file stays intact.

Read all of forward77, `20260910140000_sms_temporal_trigger_record_dispatch`.
Independent extraction comparison: old function5633/new5797 characters; the body
from `SELECT * INTO q` onward is byte-identical. Exactly one CREATE OR REPLACE
changes the dispatch to IF registry->NEW.id / ELSIF reply->NEW.clarificationId /
ELSE explicit refusal. No validation, trigger definition or stored data is changed.

Author fixture hardening reread: actual forged INSERT reach sentinel plus expected
bound-resolution error, source-after-insert reach sentinels plus exact lease error,
and exact sixth-creation global-cap refusal. Three forward-migration static tests
passed in the independent 60-test run at09:44:06. **GO for controlled local native
rerun**, not an assertion that77 has executed or repaired all17 native behaviors.
