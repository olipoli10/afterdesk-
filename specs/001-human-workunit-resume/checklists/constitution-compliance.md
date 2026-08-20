# Constitution compliance review — HumanWorkUnit + Safe Resume v1

**Review status:** implementation evidence reviewed locally; not a production
release authorization.

## Principle III — Authorization, Privacy, and Financial Integrity

**Why this feature puts it at risk:** a worker-facing surface is a new leak
site for client price, identity, data classification and undeclared inputs; the
claim now occurs in the middle of an existing run.

| Required control | Requirement / proof boundary | Review result |
|---|---|---|
| Point-of-use authorization and worker eligibility | FR-034, worker-action authorization and live eligibility recheck | PASS — server action and claim binding recheck the actor; UI is not treated as access control. |
| Role-shaped, deny-by-default worker projection | FR-014, FR-054; `humanUnitForWorker` and price-wall tests | PASS — worker/admin views are narrow and the worker panel adds no projected field. |
| Client timeline remains closed | FR-061; `CLIENT_TIMELINE_LABELS` whitelist test | PASS — no `human_unit_*` audit action is exposed to the client timeline. |
| Fixed payout and immutable accepted scope | FR-035, FR-054, DB invariants and integration suite | PASS in TEST evidence — worker claim/submission does not expose or rewrite client price. |

**Residual release risk:** a real target environment still needs deployment
configuration, access-control and audit-retention review before the flag can be
enabled. That is a release gate, not a reason to weaken the fail-closed paths.

## Principle IV — Durable Hybrid Execution Without Human Dumping

**Why this feature puts it at risk:** this mechanism could forward a whole job
to a worker while falsely reporting automation or Work Compiler coverage.

| Required control | Requirement / proof boundary | Review result |
|---|---|---|
| Typed, bounded human cut | FR-014, FR-035 and admission/refusal behavior | PASS — one accepted human step, declared inputs/output and frozen limits; unsupported topology or economics refuses. |
| Durable ownership, claim fencing and resume | FR-013, FR-015, FR-018, FR-026–FR-029 and real PostgreSQL integration | PASS in TEST evidence — claim generation, transitions, acceptance and resume are durable/replay-safe. |
| Human work does not inflate machine coverage | FR-047, SC-012 and release checklist | PASS — all commercial and coverage claims remain UNKNOWN; this path is excluded from machine / Work Compiler coverage. |
| Human verification and evidence remain distinct | FR-017–FR-020, FR-057 and contracts | PASS — submission, review, acceptance, resume and delivery remain separate gates. |

**Residual release risk:** no observed customer workflow, demand, frequency,
quality or economic outcome is established. Production operation remains
UNKNOWN until independently observed.

## Result

- [x] Principle III is named with the requirements that control its risk.
- [x] Principle IV is named with the requirements that control its risk.
- [x] The review distinguishes TEST evidence from UNKNOWN commercial or
      production evidence.
- [ ] Production release authorization — requires the remaining build gate and
      an explicit release decision; not granted by this checklist.
