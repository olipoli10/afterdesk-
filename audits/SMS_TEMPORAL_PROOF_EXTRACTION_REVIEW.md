# Temporal proof-reader extraction — bounded review

2026-09-10. Read `sms-temporal-clarification-proof.ts` completely, the store's
imports/aliases/re-export and `SMS_TEMPORAL_OUTBOX_HOOK_PLAN.md`. Reviewer did not
edit production source or execute a database/provider.

## Extraction verdict

**GREEN code review + existing unit regression coverage.** The four extracted
items are Stored->StoredTemporalClarification, reinspectStored->
temporalRegistryStoredProof, lockRow->temporalRegistryLockProof and current->
temporalRegistryCurrentProof. The store aliases those functions back to its
existing names and re-exports the unchanged serialization-version constant.

The reader retains strict reconstructed prepared proof/scalar/date comparisons;
owner-bound candidate lookup, live check, source namespace lock and question
UPDATE lock in that order; and current binding/source/review comparison followed
by locked model/gateway/attempt/decision/AI evidence and canonical model authority
inspection. It creates no operation, draft, receipt or consent.

Fresh 09:47:33: **74/74 PASS** across registry authority31, store23, independent
review17 and forward-fix3. Original source was untracked and no separate pre-move
snapshot was retained. Thus the reviewer can compare with the previously read
blocks and rerun behavior tests, but **does not claim independently verified
byte-for-byte equivalence**. Parent's native regression remains required.

## Hook-plan review only

The plan keeps temporal attachment as an additional restriction on the ordinary
self-SMS source, not another sending authority. Namespace/question/source locks
must precede common outbound locks in each claim/pre-HTTP/post-response path.
Immutable proof, bounded lease, one invocation, no network await under DB locks
and same-transaction completed receipt plus WAITING are explicit requirements.
Unknown transport or failed commit keeps exposure and prevents resend.

One implementation oracle sent to parent: `markSmsTemporalClarificationAskedInTransaction`
returns DISABLED rather than throwing when OFF. Its caller must explicitly require
WAITING_FOR_TEMPORAL_REPLY before committing, not equate any resolved promise with
successful attachment. Also pin present-but-invalid attachment refusal (no ordinary
fallback) and immutable namespace/prepared/binding/question hash/expiry reinspection
after HTTP. These are implementation requirements, not observed source defects.

No new outbox-authority or hook implementation is certified by this extraction
review, and no activation, real SMS receipt or provider delivery is implied.
