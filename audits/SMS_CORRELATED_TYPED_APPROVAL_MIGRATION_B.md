# Typed correlated approval B — forward79 DRAFT, not applied

2026-09-10. Controller-authorized B only. New migration
`prisma/migrations/20260910180000_sms_correlated_calendar_approval/migration.sql`,
minimal Prisma additions and one static/JS-vector suite. No Prisma validation,
generation, formatting, DB application, native process, flag activation, transport,
calendar executor, recovery, route or mobile code changed by this author.
The SQL skill was used for PostgreSQL typing, null-safe joins and explicit UTC.

## Protocol and minimum persistence

One INSERT-only `PersonalSmsCorrelatedCalendarApproval` with exactly:
id, reviewId, calendarOperationId, workspaceId, userId, approvalToken,
fingerprintVersion, reviewFingerprint, approvedAt, approvalExpiresAt, leaseUntil,
writeAuthority. No copy of SMS, packet, draft or credential secrets. One composite
RESTRICT FK goes to the existing immutable review and its operation/scope mapping.
Global unique reviewId, operationId and nonce remain independent. Composite unique
indexes on both sides support the singular Prisma relation without replacing the
original simple indexes. Prisma changes: 21 inserted lines only at first freeze.

The trigger overwrites approvedAt with DB UTC truncated to milliseconds; caller
must use INSERT RETURNING approvedAt and exact lease, then construct the A claim
and CLAIMED state. Expiry exactly equals min(review preparation expiry, pilot end).
The lease is positive, <=25s and never past that expiry. This is not permission to
renew a 25s caller deadline: future runtime must clamp to its original remaining
budget. UUID validation matches installed Zod including NIL/MAX forms; the future
server still generates randomUUID, not user-selected nonce material.

No backfill/adoption. The preparation review must already be committed. Forward78
is unchanged, including its insert-only deferred pending/0/resultNULL requirement.
The approval insert and pending→processing/1 CAS must be in one new serializable
transaction; a deferred approval trigger reloads actual final rows and requires
exact CLAIMED(false). Thus approval-only, CAS-only, same-TX dispatch and terminal
substitution cannot satisfy the protocol. New phases are represented by the exact
A state union, not the old free-form result.

Subsequent processing→DISPATCH_CLAIMED is one-use; approval must be from a prior
transaction. CONFIRMED additionally requires the dispatch row version from a prior
transaction and the exact existing deterministic Google event ID. Terminal states
are immutable except irrelevant updatedAt-only no-op writes. CONFIRMED requires
externalTransportPerformed=true, but SQL consistency still cannot prove a POST was
made. UNCERTAIN has a closed reason and never authorizes retry; the lease-expiry
reason is refused before lease expiry. Bookkeeping can close a claim after expiry
or revocation without current grants and does not request a new lease.

## Global protection and lock order

The operation trigger uses marker OR global review relation OR global approval.
The absence of all three returns the legacy operation unchanged. Correlated
immutable identity/request fields are guarded even if a malformed reverse relation
would not be visible through scoped ORM access. A raw new correlated preparation
remains under 78's existing guards. No change to generic application guards here;
future C must continue excluding the typed path at every public generic boundary.

Required future caller order:

1. SERIALIZABLE transaction and bounded local timeouts before first discovery.
2. Scoped discovery without rowlock; canonical conversation namespace.
3. Actual receipt loader/current-source/model/owner/member locks and proof.
4. Review, calendar UPDATE, immutable approval, exact CAS and final clock.

The migration takes **no advisory lock and no explicit mutable-authority row lock**.
UPDATE and FK machinery naturally hold their own row/key locks. In particular no
trigger acquires namespace after the operation lock. SQL compares the exact owner,
active owner membership, connected account, credential reference/revocation, active
WRITE grant, scopes, versions and owner epochs against writeAuthority at insert,
transition and deferred final recheck. It does not select ciphertext. There are no
FKs to mutable grant/epoch values, so legitimate revocation is not blocked by
immutable history.

These SELECTs establish consistency under the transaction snapshot. They are
**not fresh point-of-use authority against concurrent revocation**. The actual
caller must hold canonical current-authority locks and perform the existing model,
source, pilot, permission and deadline checks before dispatch and after response.
Full current-receipt loader validation is not duplicated as a second SQL grammar.
The old token loader's additional READ prerequisite also belongs to future C.

## Committed-row seam: constrained snapshot check, native proof mandatory

Initial development considered xmin != top-level xid. That is insufficient for
SAVEPOINT writes. pg_xact_status was then rejected after reading the primary
[PostgreSQL17 transaction-function documentation](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-PG-SNAPSHOT)
and [official xid8funcs.c implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/xid8funcs.c#L590):
subtransaction status is not an unconditional parent-commit certificate.

The draft instead has one `sms_correlated_approval_pre_snapshot(xid)` helper.
It is valid only for a tuple actually selected and visible under the same required
SERIALIZABLE transaction. Its fixed snapshot precedes own writes; comparing
`age(tuple xmin) > age(snapshot xmax::xid)` rejects own newly written top/subxids.
Other tuples returned by normal MVCC visibility are already visible to that
snapshot. PostgreSQL's native xid age comparison is used rather than inventing a
64-bit epoch reconstruction. This is **not a universal commit oracle for arbitrary
XIDs**, timestamp-based proof, subxid visibility helper or wraparound test result.

Controller native gate must demonstrate all of these before accepting it:

- committed preparation accepted; own preparation rejected;
- initial SELECT pg_current_xact_id(), then SAVEPOINT→prepare→RELEASE;
- outer write before SAVEPOINT→prepare; both with SET CONSTRAINTS IMMEDIATE;
- claim created in SAVEPOINT cannot dispatch in that outer transaction;
- dispatch row updated in SAVEPOINT cannot confirm before outer commit;
- ordinary separate commits remain accepted, including two backend contention;
- UTC/New York/Tokyo independent of session timezone. XID wraparound itself is not
  currently exercised by the disposable native campaign and must not be claimed.

## Pure SQL contracts and expected parity

- `sms_correlated_approval_view(review composite)` reconstructs the five-key A view.
- `sms_correlated_approval_view_fingerprint(view JSONB)` validates nested exact keys,
  scalar types, bounds, version constants and deterministic request UUID, then hashes
  canonical ASCII keys. Only accountVersion is normalized from JSONB 1.0→JS1.
- `sms_correlated_approval_authority_valid(JSONB)` checks exact owner descriptor,
  bounded unique arrays containing real WRITE, epochs and integer revisions.
- `sms_correlated_approval_state_valid(state JSONB,approval composite,review composite)`
  verifies the closed processing/confirmed/uncertain union against persisted inputs.
- `sms_correlated_approval_binding` joins all immutable scope/request/hash/TTL pins;
  its callers always combine binding + state validation, never trust state alone.

JSON null/missing keys use IS DISTINCT FROM, coalesce or exact object comparison.
Unknown keys including __proto__ are not dropped by these SQL shapes. PostgreSQL
JSONB itself rejects NUL and unpaired Unicode escapes. The request serializer is
the original six-field function from 78. No new Unicode normalization or timezone
grammar is substituted for the actual producer/loader. JS vector checked locally:
view hash `22d5fee446023c13a6c03f23947a78c1b457007729f6050c9e5acae0d0d07f0d`.
This is an expected parity oracle, **not a SQL execution result**.

## Compatibility / deployment gate

Historical fixtures that raw-update a correlated pending draft directly to
uncertain must instead create the real synthetic table protocol's approval+claim,
then a closed UNCERTAIN transition in a later transaction. Such fixture rows are
explicitly synthetic SQL material, not human approval or actual runtime C proof.
Existing completed/uncertain correlated rows without approval remain unchanged and
opaque; B never adopts or repairs them.

The existing recovery currently emits the legacy free-form union. It has NOT been
modified here. If a typed processing row is present, that old writer will be
refused by the new SQL guard, potentially rolling back its whole bounded batch.
Therefore applying B locally for controller tests is not authorization to deploy
or activate typed execution. Runtime C plus its narrow recovery branch must be
validated before real typed processing can exist. Native fixtures must leave no
unclosed typed processing material when testing unrelated legacy recovery.

## Recorded local evidence

- First 15 new static cases +103 A +8 prior78: **126/126 PASS**, 13:59:31.
- Added snapshot seam static test: **126 PASS /1 FAIL**, 14:00:57. The assertion
  matched a forbidden function name in an explanatory comment, not executable SQL.
  Adjusted only that scanner to strip line comments before checking function calls.
- Fresh four suites: **127/127 PASS**, 14:01:16. TypeScript exit0; scoped ESLint exit0.
- Applied78 exact hash remains
  `2517fa32d1d4bb1ef2d8888ea82cf1df09cf0c6fe0c07549de12f447bf8b98ef`.
- First frozen79 SHA256:
  `cd9380f0dc06181590eafdb3b023f11ba878a1a174ca0e0d87facc87afcbc321`.

Complete author SQL re-read performed after saving. Peer/controller review pending.
**NO native syntax/trigger/parity result, Prisma validation/generation, DB application
or production readiness is claimed.** Same-model peer review is not independent
model-quality assurance. Controller alone owns the next native execution gate.

## Cross-review bounded hardening before application

Controller/peer identified that limiting writeAuthority alone did not cap the full
state envelope. Added the same 32768-byte bound to the whole serialized state
before phase matching. Also added explicit approval↔review scope/operation/version/
fingerprint comparisons to the standalone state validator; triggers already paired
it with binding(), so this second point strengthened the pure helper contract.
Neither finding is described as a native reproduction. No 78/helper-A change.

New static regression plus existing suites: **128/128 PASS**, 14:04:45 (17 B,
103 A and 8 prior78). Revised79 SHA256:
`05163ed1dae6a7421ea3c2a1ecbd83cc7ed2abce77d6fda2cb4d34869060e1f7`.
Controller reports Prisma validate passed using fake loopback URLs (first attempt
lacked DIRECT_URL and failed P1012). Author did not run Prisma or inspect secrets.
Review remains separate from pending native application and SAVEPOINT evidence.

## Peer review and first controller native receipt — 18:08:50Z

Peer audit read in full:
`specs/210-personal-live-activation/audits/SMS_CORRELATED_APPROVAL_SQL_B_INDEPENDENT_REVIEW.md`.
Pre-native GREEN on SQL05163..., Prisma delta and bounded contracts. Peer run
**127/127 PASS**, 14:06:12 (89 A author, 14 A reviewer, 17 B author, 7 B reviewer),
TypeScript/scoped lint exit0. Distinct from the author's 128-test run.

Controller executed, author read result.json and output.txt:
`specs/210-personal-live-activation/evidence/postgres-native-1789063654307`.
**119 PASS /2 FAIL of121**, finished `2026-09-10T18:08:50.198Z`, exit1 retained.
Native17.11, migrated-template isolated clone, migration fingerprint
`79:41de317b70655965d494f1c3e0ea5940`; explicit server STOPPED marker observed.

All **16 new approval protocol cases PASS**. Author also read their real fixture:
INSERT RETURNING DB time then A inspector; own TOP_XID/SAVEPOINT/released savepoint/
outer write with early constraints; same-parent claim→dispatch and dispatch→confirm
refused with exact codes and reached markers; two distinct PIDs commit only one
approval. Fingerprint/state/epoch checks passed in **UTC, America/Toronto and
Pacific/Auckland** (these are the actual zones, not the earlier proposed matrix).
Missing claim/null authority/wrong origin roll back; unapproved mutation,
duplicate/nonce/scope/delete and terminal substitution/reopening are refused.
The successful terminal is explicitly TEST-CREATED synthetic SQL material, not
Google confirmation or a human tap. No XID wraparound experiment is claimed.

The two failures were older error-name expectations: marker rewrite now refuses
earlier with CORRELATED_APPROVAL_OPERATION_IMMUTABLE, and same-TX unapproved claim
with CORRELATED_APPROVAL_REQUIRED. Controller changed only those expected codes,
preserving rollback snapshots. No SQL change followed this run. The first overall
run remains FAIL; the full20-clone rerun is separate and was still running when
this addendum was written. Code/schema/tests remain frozen during that rerun.

## Full controller native rerun — completed 18:13:01Z

Read result.json and output.txt from
`specs/210-personal-live-activation/evidence/postgres-native-1789063777614`.
Author independently counted the recorded per-file rows: **20 clones, all exit0,
317/317 tests PASS**, all carrying the same migration fingerprint
`79:41de317b70655965d494f1c3e0ea5940`. Temporal suite **121/121 PASS**, completed
`18:12:37.5171347Z`. Overall result exit0 at `2026-09-10T18:13:01.013Z`, with explicit
disposable-server STOPPED marker. The SQL stayed at05163... throughout both runs.
This updates the overall local SQL verdict without erasing the earlier119/2 run.

Controller subsequently reports generation79 PASS in its owned .prisma-client
directory (no junction). Author did not generate. Full-root B baseline and the B
commit remain controller-owned separate checkpoints; no C0/runtime write occurred
while their snapshot was being collected. Local protocol compatibility is now
observed; real human approval, provider execution, production deployment and XID
wraparound coverage remain unproven and unauthorized by B.
