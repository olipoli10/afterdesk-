# Typed approval tranche A — pure contracts, no caller

2026-09-10. Authorized bounded A only. New
`src/server/personal-assistant/correlated-calendar-approval-contract.ts` and
`test/correlated-calendar-approval-contract.test.ts`. No calendar-actions, recovery,
route, DB, schema79, migration, generated client or flag activation changed.

## Frozen versions and shape contracts

- `personal-correlated-calendar-approval-view-v1`
- `personal-correlated-calendar-approval-command-v1`
- `personal-correlated-calendar-write-claim-v1`
- `personal-correlated-calendar-write-state-v1`

The descriptor matches the backend plan's five top-level keys: version, scope,
review, request, presentation. It carries hashes of the immutable packet/reference
proof rather than duplicated texts, citations or timestamps. No inspectedAt enters
the fingerprint. The future real loader must reconstruct and compare the descriptor
to the actual displayed item; hashing arbitrary caller-provided values proves none
of those sources. `calendarRequestId` is the existing deterministic UUID8 for the
receipt. Request hash separately uses the original six-field wire order.

Command keys are exactly version/workspaceId/reviewId/expectedRequestHash/
expectedReviewFingerprint. Serialized claim keys: version, origin, userId,
workspaceId, operationId, expectedRequestHash, request, authority, approvalToken,
approvedAt, approvalExpiresAt, leaseUntil. Origin is the exact kind plus approvalId,
reviewId and reviewFingerprint. Authority is the existing WRITE descriptor narrowed
to owner, bounded positive revisions and unique bounded scopes containing WRITE.
The pure contracts do not add read scopes; the existing token-loader's additional
READ dependency remains a future offer/gate check, not READ→WRITE substitution.

All claim dates are immutable canonical UTC-millisecond strings. No Date.now is
read: historical claims can be inspected after expiration without being authorized.
Shape invariants include original pilot bounds, positive <=25s lease, lease<=approval
expiry, ordered exact draft instants, and owner revision instants<=approvedAt.
The future runtime executor must make private Date copies from this serialization;
it must not silently substitute this contract for its current runtime type.

State is a closed discriminated union:

- CLAIMED: origin + approvedBy/hash/token/writeAuthority + dispatchStarted:false.
- DISPATCH_CLAIMED: same fields, dispatchStarted:true.
- CONFIRMED: origin + strict deterministic event receipt + automaticRetry:false.
- UNCERTAIN: origin + writeConfirmed:false/reviewRequired:true/automaticRetry:false
  and one of WRITE_OUTCOME_UNKNOWN, CLAIM_LEASE_EXPIRED,
  CLAIM_COMMIT_OUTCOME_UNKNOWN, DISPATCH_COMMIT_OUTCOME_UNKNOWN,
  TERMINAL_COMMIT_OUTCOME_UNKNOWN.

These shapes describe material, not permitted state transitions. Only future
transaction/CAS/SQL79 guards may authorize a transition. The pure code neither
generates a new approvalToken nor creates any state in persistence.

## Inspection boundaries

Schemas and helpers preflight bounded JSON before canonicalization: <=32768 bytes,
4096 visited nodes, depth12, bounded dense arrays/objects; cumulative string-byte
budget before serialization; reject NUL, lone UTF16 surrogates, nonfinite numbers,
accessors (without invoking them), hidden/symbol keys, custom prototypes, cycles,
holes and oversized sparse arrays. Snapshot via canonical serialization precedes
shape parsing; equality rejects silent normalization. Nested objects are frozen.
This is not a sandbox against JavaScript Proxy traps or hostile executable code.

`inspect...Command` compares its supplied view hash/scope/review/request.
`inspect...Claim` compares view/actor/account/request fields and exact wire hash.
`inspect...State` compares origin and processing approval fields to that claim;
CONFIRMED also requires the exact existing deterministicGoogleEventId.

Every inspector result has executionAuthorized:false, authorityVerified:false,
providerConfirmationVerified:false, persistencePerformed:false and the pure-contract
unauthenticated source label. **Even CONFIRMED-shaped data is not provider evidence.**
Pure inspection cannot establish whether operationId/approvalId refer to real DB
rows or a human choice: the future immutable FK/loader is mandatory. A regression
explicitly demonstrates this limitation without claiming a bypass.

## Local evidence and canonical vector

- First new suite: **88/88 PASS**, 13:37:45 America/Toronto.
- Added a separately assembled Node canonical vector: 89 contract cases; expanded
  with UUID/proof/prior proof-review suites: **135/135 PASS**, 13:39:20.
- First TypeScript run found a test fixture's overly narrow literal scope-array
  type. Widened only that caller-mutation fixture to string[]; oracle unchanged.
- Source hash at freeze:
  `e24300e76eb6678b0979b91b831bafb62aa5c0168f5692361b80611dbb3ac836`.

For the test's `receipt`/`review`/`workspace`/`owner` fixture and title
`inspection 🛠️` (exact UTC 2026-09-11 18:00→19:00, America/Toronto, accountVersion1):

- requestId `a912443d-1e19-8185-ba4d-3cbfbb315066`
- original wire request SHA256
  `e5f02375cecd18258c319498c254217335283b91aa5e1e238a843f65d57359a8`
- descriptor SHA256
  `22d5fee446023c13a6c03f23947a78c1b457007729f6050c9e5acae0d0d07f0d`

Canonical descriptor order is presentation,request,review,scope,version; inner
ASCII keys sort with the existing canonicalJson helper. This vector is checked
locally in Node, **not yet SQL79/native parity proof**. SQL79 must independently
match it and varied Unicode/number/null/extra-key negatives before migration GO.

Peer cross-review pending at this entry. No native/provider test or new caller is
claimed by tranche A. Backend plan remains proposed for B beyond this authorized
pure implementation.

## Cross-review correction — 13:43

The peer reproduced **2 PASS / 12 FAIL** in its separate review suite at
13:43:03. Own enumerable `__proto__` keys survived the preflight but were dropped
by the shared canonical serializer's object assignment before strict-schema
validation. JSON.parse and defineProperty inputs reproduced this at root and
nested levels across view, command, claim and state. This was an unknown-key
acceptance defect; no global prototype pollution or external effect is claimed.
The narrow correction rejects that exact key at every preflight depth before
canonicalization. The shared serializer is unchanged; valid canonical vectors
must remain identical. Fresh rerun and peer verdict follow separately.

Import-graph limitation: functions do not execute DB queries, clock reads or
transport calls, but the existing evidence.ts serializer imports the Prisma
singleton transitively (including its environment initialization). This module
is **not a DB-free import graph**. The direct-import static test title was corrected
without weakening its assertion. No serializer extraction is part of A.

The author TypeScript and scoped ESLint rerun before this correction both exited
0. Those checks are not a verdict on the subsequently discovered key defect.

After the correction, five targeted suites produced **149/149 PASS** at 13:44:41
(89 author contracts, 14 peer reproductions, 46 existing UUID/proof cases). The
valid canonical vector remained unchanged. Fresh TypeScript and scoped ESLint
both exited 0. Corrected source SHA256:
`823210e6bd4542a95cd6fcb31d5892d726d50cf42b6a35708d6ce14e29846690`.
Peer final review remains pending; no SQL/native validation is inferred.

Final cross-review received and read in full: peer **103/103 PASS** at 13:45:03,
fresh TypeScript and scoped ESLint exit0. Its twelve original rejection oracles
pass unchanged. Verdict **GREEN for A only**, recorded in
`specs/210-personal-live-activation/audits/SMS_CORRELATED_APPROVAL_CONTRACT_INDEPENDENT_REVIEW.md`.
This is a separate reviewer run within the same-model campaign, not independent
model-quality assurance. Source is frozen at the corrected hash above. B/SQL79,
runtime authorization and provider/native execution remain outside this result.
