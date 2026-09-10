# Correlated calendar schema and mobile plan — design cross-review

2026-09-10. Design only. Read both complete plans:
SMS_CORRELATED_CALENDAR_SCHEMA_PLAN.md and SMS_CORRELATED_MOBILE_REVIEW_PLAN.md.
Also traced actual calendar preparation/claim/execution, receipt and operation
Prisma fields/scoped keys, durable proof construction, citation producer and
the existing SQL canonical hash helper. Engineering code-review skill applied.
No tests, Prisma generation, SQL, migration, DB, provider or product edits in
this design review. This audit does not authorize implementation or activation.

## Verdict

Architecture acceptable for a bounded prepare-only slice, subject to the precise
decisions below before SQL. No demonstrated current correlated-draft bypass:
the producer does not yet exist. The generic-path problem is a prospective
integration defect correctly identified by the plans, not an observed incident.

The INSERT-only nullable marker plus append-only one-to-one review is justified:
the marker lets every canonical generic boundary reject an origin even without
a valid joined review; a deferred binding prevents committing the marked orphan.
Relation-only or UI filtering cannot supply both invariants. Unique receipt and
calendar-operation IDs make replay permanent, independent of parser versions.
The added scoped receipt unique key supplies a real FK target; current question
and operation scoped unique keys already exist. No mutable authority-version FK
is needed or desirable. Revocation must remain possible.

Generic list exclusion must stay global marker-OR-any-relation, before LIMIT,
and canonical lockWrite must refuse both initial claim and forged legacy execute.
The ordinary UUID replay branch also needs explicit origin refusal. Matching
request bytes alone are insufficient. Existing NULL/no-relation cases must keep
their existing behavior, including public ordinary preparation without origin.

## Decisions to close before SQL

1. **Specify one serializer domain and exact title transformation.** Existing
   calendar request hashing is JSON.stringify in schema order, not sorted JSONB.
   Its exact six fields must be reconstructed in that order. The fixed envelope
   keys are ASCII, which avoids cross-runtime arbitrary-key sorting issues;
   values still need exact escaping and Unicode parity. String.trim is not
   PostgreSQL btrim's default operation. Define whether SQL verifies the exact
   ECMAScript trim character set or merely compares a separately recomputed
   canonical draft; do not silently substitute btrim or normalize Unicode.
   Explicitly refuse PostgreSQL-unrepresentable NUL/unpaired surrogate inputs
   before persistence; do not repair them into different source/request bytes.
   Existing offset-aware timestamps must not be reformatted for hash checking.
   Required future parity vectors include escapes/control characters, accents,
   supplementary characters, NBSP/BOM/other trim characters and reordered JSONB.
   This is a specification gate, not evidence those vectors already pass.

2. **Make createdAt server-recorded, not just server-defaulted.** A default can
   be overridden by a caller. The new BEFORE INSERT guard should assign the UTC
   DB clock truncated to milliseconds itself (or an equivalently strict check).
   Deferred checks reload the final row and compare with fresh UTC DB time. The
   operation and review need not have identical creation instants, but the new
   review cannot backdate itself to fit an expired preparation interval. The
   plan already states this intent; implementation must make it explicit.

3. **Choose and freeze a single reduced proof format before the migration.**
   The existing accepted packet, prepared question and calendar request already
   provide immutable data and hashes. Hashing duplicated references does not
   prove the TypeScript inspector was invoked. Keep a field only for a distinct
   integrity or compatibility invariant; recompute at the authenticated boundary.

   - Required durable linkage: scoped receipt/question/source/child/calendar IDs,
     marker, packetHash, exact request UUID/hash, account snapshot, version and
     preparation expiry. These support FKs, permanent non-reuse and exact action.
   - Reasonable compact envelope: supported inspector/resolver versions, a
     hash of the exact inspected proof, normalization version and the exact
     draft-to-packet binding. Its hash protects those bytes, not actor authority.
   - Optional denormalized convenience: four citation refs, two source refs,
     prepared/binding/evidence/resolution hashes and anchor/timezone. Every one
     must equal the canonical producer field; otherwise omit and derive on read.
   - Unnecessary duplication: startsAt/endsAt both outside and inside draft,
     complete source/quote texts, duplicated full originalPacket/resolution,
     or current permission booleans presented as durable authorization.

   Author's subsequent proposed reduction removes proposal metadata and
   duplicate standalone instants. Removing pilot fields from JSON is coherent
   only if the chosen scalar/question source still establishes the exact pinned
   pilot expiry required by the final guard. The plan must name that source;
   an unstored current environment variable cannot be read by a SQL trigger.
   Keep the 16KiB canonical byte ceiling plus strict SQL types/keys; a large
   allowance is not a requirement to fill it. No final SQL GREEN is implied.

4. **First mobile slice is read-only.** The schema plan's approvalAvailable:false
   is clear. Mobile step4 and its explicit Google button describe a later typed
   approval feature, not the initial projection/card. Label that sequencing
   explicitly. Also render "pas encore ajouté" only for an actually pending
   draft, never as a fixed heading above processing/completed/uncertain history.
   Backend origin refusal remains mandatory even if every visible button is off.

## Replay, SQL and concurrency checks to preserve

The deterministic UUID namespace must never rotate after parser/version changes;
an occupied unmarked key refuses rather than adopts an existing ordinary draft.
Internal marked preparation needs a caller transaction; the existing generic
Prisma client convenience path must not accidentally commit a marked insert
before its review. This is a fail-closed integration guard, not a new executor.

Deferred creation guards must load current final rows, dispatch polymorphic
records by explicit IF, and reject missing/swapped/replaced relations, final
nonpending operation state and expired preparation. Those initial-state checks
must not be installed on every later operation update. Narrow permanent request,
scope/account/marker identity guards remain; future typed execution/terminal and
recovery transitions will need separately reviewed positive compatibility cases.

Read-only exact replay must revalidate present ownership and immutable linkage,
return actual current status, and neither prepare again nor renew expiry. Until
a historical viewing policy exists, stale preparation refusal is acceptable.
No requirement that every later namespace expectation be absent: only this
question's own inactive permanent ledger must match. Namespace-before-question
ordering and no new provider/day lock are consistent with the current loader.

SQL hash equality is not grammar correctness or authorization. The server must
run the actual durable inspector/closed resolver and compare the exact rebuilt
proof. A caller object with status "inspected" cannot substitute. Direct-SQL
guards should bind exact packet dates/citations/request contents without creating
a second French parser. Unknown commit must return no known-prepared success;
a later exact read may resolve it without a fresh UUID or retry side effect.

## UI and retained-evidence assessment

Version negotiation or a separate private endpoint is necessary because the
installed V1 parser is strict. Reuse the existing service screen/date display,
but retain both full original/answer texts and their distinct receipt times,
anchor, timezone and citations. The title's trim-only transformation must not
rewrite the original quote. Reinspection failures are unavailable, not empty
success; caller context and in-flight generation fence late responses. UI-only
busy flags never replace durable one-attempt execution.

Reference-only storage avoids duplicating SMS bodies; the exact draft necessarily
copies its short title. Restrictive FKs preserve history but do not themselves
implement a deletion/retention policy. Do not expand retention or label synthetic
candidate text as real inference/delivery. No model-quality or provider-E2E
readiness follows from this design review.

Follow-up mobile plan review: author has now explicitly made the first card
read-only/approvalAvailable:false without a button; typed approval is a later
tranche, and "pas encore ajouté" applies only to actual pending rows. Design
clarification4 is closed. This does not close the separate pre-SQL serializer,
DB timestamp or final reduced-proof decisions.
