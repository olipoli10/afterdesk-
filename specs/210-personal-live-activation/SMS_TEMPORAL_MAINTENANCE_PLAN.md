# Local OFF temporal-question expiry bookkeeping

2026-09-10. Parent-authorized separate follow-up; no worker, route, schema, provider or existing native fixture edits.

## Outcome and invariants

Release the shared one-active conversation slot after a temporal question's immutable TTL expires. Only existing PREPARED/WAITING rows may transition to EXPIRED. Never consume an SMS, execute/retry an action, send/cancel a message, release a budget, erase a nonce, or alter evidence. The existing migration76/77 transition and deferred source-proof/ledger triggers remain authoritative and unchanged.

The actor-scoped helper works even after grants, credentials or phone identity are revoked: expiration is bookkeeping, not revival of current authority. Source leases and outbound status are not rewritten. The original question request remains protected by existing outbound TTL/current-state checks.

## Bounded transaction design

- Exact STORE plus separate MAINTENANCE switches, OFF before parsing or DB work. Strict actor and batch1..25; optional original controller deadline and AbortSignal. Effective wall deadline min(original, now+2500ms).
- Caller-owned SERIALIZABLE variant sets bounded SQL statement/lock timeouts itself. No nested transaction. Standalone wrapper uses the same original deadline, bounded maxWait and transaction timeout, no retry.
- The caller must invoke maintenance before taking source/question row locks, or use the standalone wrapper. This helper cannot undo incompatible locks already acquired by its caller; future worker integration must preserve that ordering explicitly.
- Discover at most25 actor-owned DB-expired PREPARED/WAITING rows without row locks. Discovery is not authorization to update.
- In deterministic namespace/id order, acquire `pg_try_advisory_xact_lock` of the existing shared namespace before any question row lock. Busy namespace is skipped. Reload exact actor/id/namespace/phase/preparedHash, still DB-expired, `FOR UPDATE SKIP LOCKED`. Then exact CAS changes only phase and DB-UTC updatedAt.
- Existing phase trigger atomically changes the existing ledger's active mirror. Immutable historical rows remain. CAS0/skipped locks are not retries; unknown errors/deadline/abort throw so caller rollback preserves original state.
- In-transaction counts are explicitly provisional. Standalone counts become committed only after successful database commit.

## Falsifiable checks

OFF no DB; batch25 cap and strict actor; original deadline/nonfinite/abort/flag revocation at each await; actual SERIALIZABLE; namespace lock before row lock; busy namespace/row skips; stale discovery and CAS0; unsupported phases/duplicate rows fail closed; DBclock rather than application expiry; exact source proof remains unchanged; no consent/credential/source/outbound/budget mutation. Native expiry, revoked-context, replay and concurrent workers require a later controller-approved serialized DB slot; mocks do not prove concurrency.

## Local receipt

2026-09-10 10:18:25 America/Toronto:37 new tests plus24 legacy confirmation-maintenance tests =61/61 PASS. Root TypeScript and scoped lint passed before the final four additional tests (impossible CAS counts and captured actor mutation). Independent review requested; no native DB run, worker wiring, permission activation or live effect. Tests inject query results and therefore do not prove PostgreSQL locks/concurrency.

Remaining semantic limit inherited from the registry: acceptedAt records DB observation of provider acceptance, not actual delivery or reading. After expiration and a later question, a bare hour can be causally correlated to the currently active question but this is not proof of the human's intended older/newer message. All correlation results remain non-executable; this maintenance must not be used to claim action authority.

Independent review reported GREEN at10:24:33:37 author +5 independent maintenance tests =42/42 PASS, scoped ESLint PASS. The added oracles cover rollback after a second CAS, deadline after the final CAS, mutation of the discovered result during await, mismatched locked id, and known commit followed by a switch change. This is source/unit review only; PostgreSQL trigger/concurrency proof remains controller-owned and pending for maintenance.
