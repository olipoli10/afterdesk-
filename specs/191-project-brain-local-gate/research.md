# Research: Project Brain Local Gate

## Decision 1 — One orchestrating validator, existing tests underneath

**Decision**: Add one PowerShell validator that invokes targeted R36V–R36Y suites, one integrated scenario, fresh PostgreSQL tests, mobile automation, mutations and final static/build gates.

**Rationale**: A single entry point prevents selective evidence while reusing accepted lower-level tests instead of duplicating their logic.

## Decision 2 — Fresh owned PostgreSQL, not shared state

**Decision**: Every gate run uses a uniquely named disposable database with a run ownership marker and refuses ambiguous targets.

**Rationale**: Restart/concurrency/raw-SQL evidence is meaningful only against real persistence, while cleanup must never threaten shared data.

## Decision 3 — Product APIs for the positive chain

**Decision**: Fixture setup may use the test harness, but every positive intake/review/recall/action effect runs through real authenticated product boundaries.

**Rationale**: Direct database creation of success state would test fixtures rather than integration.

## Decision 4 — Separate structural binary validation from semantic understanding

**Decision**: Count R36V bounded signature/container admission separately from forbidden semantic OCR/transcription/vision/document understanding.

**Rationale**: Reporting all byte reads as AI understanding would be false; allowing semantic processing under a generic binary-read label would weaken the boundary.

## Decision 5 — Genuine restart uses fresh processes/clients

**Decision**: Capture canonical hashes, terminate/recreate local server/database clients and remount mobile durable state before comparison.

**Rationale**: Re-rendering the same in-memory objects does not prove recovery.

## Decision 6 — UI automation is synthetic usability evidence

**Decision**: Drive visible controls/accessibility labels without IDs or direct domain calls, but label the result `SYNTHETIC`/`TEST` and keep founder/customer observation absent.

**Rationale**: Automated reachability catches broken flow but cannot measure comprehension or real-world utility.

## Decision 7 — Fail closed on missing evidence

**Decision**: Unknown, skipped, absent or schema-invalid assertions are failures; the validator never infers PASS from a command exit alone.

**Rationale**: A green wrapper around missing tests is the main false-positive risk of a gate.

## Decision 8 — Machine report precedes closeout

**Decision**: Tests emit only isolated run-owned fragments or JSON stdout. The validator accepts an exact fragment allowlist, rejects duplicate/extra/missing inputs, aggregates them, performs and verifies cleanup, writes the complete report to a same-directory temporary file and atomically renames it. The human closeout summarizes only that validated final report.

**Rationale**: This prevents prose from overstating or drifting from measured evidence.

## Decision 9 — Explicit non-vacuous contradiction fixture

**Decision**: The owner brief contains `L’unique inspection finale est vendredi à 09 h.` in `summary` and `L’unique inspection finale est lundi à 09 h.` in `importantDates`. R36W copies both full fields with exact range provenance; the gate harness explicitly declares them contradictory, then proves both values/provenances survive resolution and sealing.

**Rationale**: The assertions are objectively incompatible while respecting R36W’s rule that deterministic adapters do not infer or auto-detect contradictions.
