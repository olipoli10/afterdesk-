# Correlated calendar pure helpers — bounded cross-review

2026-09-10. Scope: new correlated-calendar-id.ts and correlated-calendar-proof.ts,
their author tests and the updated eight-key schema plan. No SQL/migration,
native database, global campaign, provider or product integration. Reviewer owns
only test/personal-correlated-calendar-proof-review.test.ts and this audit.

The controller's eight-key proof decision is now exact: version,
receiptProofVersion, inspectedReceiptProofHash, titleNormalization, draft,
executionAuthorized:false, semanticInterpretationVerified:false and
sourceAuthority:NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT. Receipt/packet identities
remain beside the JSON for future scalar binding. No duplicate citations/messages,
source lists, lease, phone/SID or model request copy is needed in this envelope.

The builder invokes the real durable receipt inspector on private copies, then
uses the existing calendar draft schema for trim-only title handling. Standalone
schema/hash validation explicitly does not prove that inspector was run or that
the source/DB is authentic. An invented self-consistent hash remains unauthorized;
future server projection must reconstruct it from current scoped durable facts.

UUIDv8 construction uses the fixed literal namespace, one NUL separator and exact
UTF8 receipt ID, truncates SHA256 to16bytes and sets version/variant bits. IDs are
nonempty/bounded191 UTF16 units, reject NUL/lone surrogates and are not normalized
or trimmed. Installed zod UUID compatibility and distinct NFC/NFD/whitespace
inputs are covered; neither uniqueness probability nor hashing is authorization.

## Reproduced JSON preflight defects —12:01:44

Fresh reviewer run:9 PASS /3 FAIL. Safe inputs only, no large memory stress:

1. Non-enumerable accessor in required draft.title was not seen by Object.keys;
   later schema.parse invoked it once before rejecting. Expected no invocation.
2. A non-enumerable hidden callback was ignored and the original visible/hash
   projection accepted, contradicting rejection of non-JSON input shape.
3. Array(20000) with no elements passed key-count preflight and reached actual
   canonicalJson before the UTF8 byte ceiling refused it. The small probe exposes
   the missing length/density gate without allocating an enormous array/string.

Author notified after this isolated RED and authorized to repair only the new
guard: inspect own descriptors, refuse hidden/accessor/symbol/non-JSON fields,
and bound array length/density before serialization. No change to historical
canonicalJson or request hashes is needed. These are local pure-boundary defects;
no HTTP exposure, DB write, authority bypass or exploitable remote path is claimed.

Nine unchanged controls pass: exact eight-field order-independent proof,
PostgreSQL-incompatible nested/ID strings, stored-proof trim refusal even if
rehashed, explicit false authority for forged inspector hash/arbitrary semantics,
UTF16 ID bounds/UUIDv8 compatibility, and real-builder refusal of changed source.
No corrected GREEN is recorded until the author's patch is rerun and reviewed.

## Correction and fresh closure

Author changed only the new bounded JSON walker: Reflect.ownKeys with own data
descriptors requires enumerable string keys and rejects accessors/hidden/symbol
properties. Arrays require the exact standard prototype, length<=64, dense own
indices and no extra keys before canonical serialization. Ancestor cycle/depth/
node/string bounds and final canonical UTF8 ceiling remain. Existing canonicalJson
and historical calendar request hashing were not changed.

Reviewer read this delta and reran the same RED cases unchanged. Fresh12:03:11:
**70/70 PASS** (12 reviewer +34 new author +24 existing receipt-proof tests).
Scoped reviewer ESLint passes. No new global/native/type-generation run by reviewer.
The previous9 PASS/3 FAIL remains the observed pre-fix result, not relabeled.

GREEN for this pure boundary after the fix. It is not a hostile-JavaScript sandbox
or proof that a proxy can be inspected without executing its traps. Normal JSON
data from the future authenticated loader remains the intended input boundary.
There is still no SQL serializer/native parity or real calendar preparation in
these helpers; schema/adapter current-authority/atomic-relation gates remain next.
Pure proposed draft and UUID confer no action, source authenticity or provider GO.
