# Local OFF temporal question worker wiring

2026-09-10. This is a code-only continuation of the existing SMS worker, not a
new provider authorization or a new conversation engine. Existing registry76
and forward77 stay immutable. No live switches are activated.

## Next implementation slice: question preparation only

The current model worker returns a final-review closure whose canonical result
already contains the durable child id. Reuse that id after finalization; no API
extension or caller-supplied child metadata is needed. The lower proof loader
still verifies its owner, source and complete provenance.

Inside the existing source final SERIALIZABLE transaction, acquire the shared
visible-phone-pair namespace before calling the review closure when the new
preparation/store switches are on and a final-review closure is present. This preserves
namespace-before-source locking: the closure already locks source/child rows.
Then finalize the ordinary review. Only a single CLARIFY result whose kind is
PREPARE_CALENDAR_EVENT enters the new lower inspection. CLARIFY-only, SMS, voice
and read results retain their current message; a model's generic reason label
does not prove that the user intended a calendar request. Complete resolved proposals keep their current calendar draft
and confirmation path; mixed/multiple actions retain the existing review path.

For an eligible single ambiguous slot, use the exact inspected full-wire text,
insert the ordinary pending outbound operation, attach it through fresh lower
inspection in the same transaction, require exact requiredSourceReview equality,
then perform the existing source final CAS. A changed flag, lease, authority,
question or proof aborts the entire transaction. A refusal selects the fixed
full-reformulation text and creates no temporal registry entry. No invented hour,
merged SMS, new model call, action approval or external effect is introduced.

Default OFF must preserve the previous worker path. Question length must never
be silently truncated after registry eligibility. Missing/forged child metadata
on an injected review cannot authorize a correlated question.

## Verification

Countertests: OFF behavior; namespace before closure; exact eligible wire and
attachment before source CAS; full-reformulation on incomplete original; source
CAS loss or changed inspection rolls back question/registry; active switch
revocation refuses rather than publishes an unbound question; resolved and
multi-action reviews retain existing behavior. Review by another agent and
native source-final-transaction tests supplement ordinary unit tests. Prior
native25 receipt/registry tests do not prove this worker wiring.

## Following slice, not claimed here

Inbound reply routing must discover the sole current expectation before calling
the model, preserve both immutable SMS records and consume through the existing
temporal registry. An accepted temporal resolution remains NOT_AUTHORIZED and
does not itself create/execute a Google change. Its downstream canonical review
adapter needs an explicit source-bound design and tests before activation.

## Recorded controller checks

Worker15 plus reviewer6 and legacy59 tests:80/80 PASS after two independently
reproduced post-CAS deadline/flag failures were fixed. The fake transaction
demonstrates ordering; the three subsequent native worker cases exercise actual
source claim, synthetic candidate provenance, ordinary question INSERT, registry
attachment, source CAS and rollback after a flag is revoked immediately after
the SQL UPDATE. No second source attempt or actual model transport is introduced.

Those three native cases passed inside temporal32/32 twice: targeted
`postgres-native-1789050187218`, then full-file-isolated
`postgres-native-1789050288734`. The latter's179 assertions all pass but its
campaign cleanup timed out; retain its exit1 separately from assertion success.
Standalone expiry maintenance and queue selection are subsequent slices.
