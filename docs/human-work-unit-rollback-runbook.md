# HumanWorkUnit / Safe Resume — rollback runbook

**Status:** prepared locally, not exercised against Preview or Production.

This runbook does not authorize a deployment, a flag change, a migration or a
rollback. A named release owner and a named rollback operator must approve the
target environment and record every readback before use.

## Preconditions

- Identify the exact Vercel project, deployment SHA and environment.
- Identify the exact PostgreSQL project, branch, database and schema without
  printing a connection string or credential.
- Record the release owner, rollback operator, alert owner and decision maker.
- Confirm that a restorable database point or provider recovery window exists.
- Confirm that `humanWorkUnitResumeEnabled` is a database `Setting`, not a
  Vercel environment variable.
- Inventory counts by state only; do not export client content, worker payloads
  or credentials.

## Mandatory order

1. **Stop new admissions first.** Set the `humanWorkUnitResumeEnabled` database
   setting to `false` through the separately approved operational path.
2. Independently read the same setting back and record the timestamp, operator
   and target identity. A repository default is not a readback.
3. Prove that a new otherwise-admissible workflow is refused while existing
   admitted work remains visible and owned.
4. Inventory non-terminal HumanWorkUnit states and outstanding alerts. Do not
   delete, re-admit, reassign or fabricate terminal states.
5. Resolve or explicitly preserve every admitted, published, claimed,
   submitted, in-review, revision-requested, accepted or paused unit.
6. Only then return application traffic to a previously known artifact whose
   SHA, migrations and compatibility are recorded.
7. Keep the additive HumanWorkUnit schema. **Never down-migrate it while any
   `HumanWorkUnitRunState` exists.** No down migration is supplied.
8. Read back the flag, state counts, alert counts, failed jobs and runtime error
   rate after the application rollback.

## Stop conditions

Stop and keep the flag false if any of the following is true:

- target identity, owner or current flag value cannot be independently read;
- a new admission succeeds after the flag is disabled;
- a non-terminal unit loses its claimant, payout reservation or history;
- state/alert counts change without a corresponding audited transition;
- the previous artifact cannot read the additive schema;
- database connectivity, pool exhaustion, cron failures or elevated runtime
  errors appear;
- the recovery point or rollback artifact cannot be named exactly.

## Required evidence record

Record only metadata necessary to reconstruct the decision:

- environment and target identifiers;
- old and new application SHAs;
- flag value before/after with independent readback;
- migration inventory and schema compatibility decision;
- aggregate HumanWorkUnit state and alert counts before/after;
- operator, approver, timestamps and rollback trigger;
- smoke checks and runtime-error baseline.

Do not record secrets, raw client input, worker submissions or cross-tenant
content in the release record.
