# Pre-release checklist — HumanWorkUnit + Safe Resume

**Scope:** HumanWorkUnit + Safe Resume v1 only. This is a release review
artifact, not authorization to deploy. The rollout flag remains off until a
maintainer completes the production-specific checks below.

## Evidence boundary

| Claim | Evidence label | What is actually established |
|---|---|---|
| Constraint and transition behavior | TEST | Unit and real PostgreSQL integration tests exercise the typed state, DB constraints, triggers, claim fencing, resume and recovery paths. |
| Local build readiness | TEST | The full build gate passed against the named disposable `hwu-integration` database after all 35 migrations were applied. |
| Production deployment readiness | UNKNOWN | This document does not authorize a production build or deployment. Target-environment configuration and approval remain outside this local evidence. |
| Demand, frequency, coverage gain, willingness to pay, revenue and margin impact | **UNKNOWN** | No customer or production-operation evidence was collected by this feature work. |
| Machine / Work Compiler coverage | **UNKNOWN** | Human work through this path is not machine coverage and must not be counted as Work Compiler coverage. |

Do not convert TEST or SYNTHETIC fixture evidence into OBSERVED customer or
commercial evidence.

## 1. Migration status and order

The migration chain is additive. It contains the original two-stage HumanWorkUnit
sequence plus one later additive refusal-cause column:

1. `20260815120000_human_work_unit_enums` — enum values and HumanWorkUnit enum
   types, deliberately first because PostgreSQL cannot safely use an enum value
   in the transaction that adds it.
2. `20260815120100_human_work_unit` — tables, indexes, constraints and triggers.
3. `20260819150000_human_unit_admission_refusal` — nullable admission-refusal
   provenance only.

There is no backfill. Historical rows remain historically meaningful; nullable
new fields are not invented for old accepted contracts or runs.

- [ ] A designated maintainer has applied this exact migration chain to the
      intended environment through the normal deploy path.
- [ ] Migration logs and the target database identity are retained with the
      release record.
- [ ] No `prisma db push`, schema reset or manual enum/table alteration was used.

## 2. Rollout and rollback

The sole new-admission switch is `humanWorkUnitResumeEnabled`, default `false`.
It is read at admission only; disabling it blocks new admissions and does not
strand an already admitted run.

**Rollback order is mandatory:**

1. Disable the rollout flag first.
2. Deploy the previous application code only after new admissions are closed.
3. **Never roll back or down-migrate the schema** while any
   `HumanWorkUnitRunState` exists. No down migration is offered; the schema is
   a deliberate one-way door for retained operational evidence.

- [ ] Flag owner, current value and change procedure are recorded.
- [ ] The operator has a path to identify admitted/published/claimed/submitted/
      review/accepted/resumed/paused units before any code rollback.
- [ ] The rollback operator knows that an existing admitted run remains owned
      and must be resolved through its durable state, not deleted or re-admitted.

## 3. Observability and operational response

The release must make these events reconstructable without recording secrets,
raw client input, credentials or cross-tenant content:

- admission or refusal cause;
- publication, claim generation/fencing, submission, review decision,
  acceptance, resume and admitted finish transitions;
- deadline/lease lapses, alerts and admin-owned pauses;
- immutable acceptance/result digest and resumed-step record;
- downstream residual-scope publication only when the post-resume run fails.

- [ ] Operator and cron sweep paths are enabled and their per-item isolation is
      observable.
- [ ] Alerts for publication, submission and claim-lease deadlines route to a
      named operational owner.
- [ ] Admins can inspect the exact refusal/pause cause and safe next action.
- [ ] Audit retention and access controls were checked for the target environment.

## 4. Required pre-release proof

- [x] Database-free checks: lint, typecheck and fast suite pass locally.
- [x] Full real-PostgreSQL integration suite passes against a disposable
      `hwu-integration` cluster.
- [x] Build has passed only after an explicit confirmation that `DATABASE_URL`
      targets a disposable, non-production database; the build executes
      `prisma migrate deploy`.
- [ ] HumanWorkUnit flag remains off in every environment until the designated
      release owner has approved this checklist.
- [x] A review records the constitution check for Principles III and IV.

## 5. Truthful external language

Until observed customer operations exist, external or internal launch language
must not claim demand, recurring coverage, savings, worker capacity, margin,
or autonomous execution. The truthful statement is narrower: a typed,
fail-closed human step can be safely scoped, claimed, reviewed and resumed in a
verified workflow under the configured controls.
