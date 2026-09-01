# Quickstart: Validating HumanWorkUnit and Safe Resume v1

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/](./contracts/)

This is a **validation and run guide** for the implementation phase. It describes how to prove the feature works end to end and what "working" means for each scenario. It contains no implementation code, no model or service bodies, no migration SQL and no test suites — those belong to `tasks.md` and the implementation phase.

---

## 0. Blockers that must be cleared first

| ID | Blocker | Clear it by |
|---|---|---|
| `BLOCK-NEXT-DOCS` | `node_modules/` is absent, so the installed Next.js 16 documentation required by `AGENTS.md` could not be read during planning. No new Next.js pattern is proposed, but none has been verified either | Run `npm install`, then read the relevant guides under `node_modules/next/dist/docs` — server actions, route handlers, caching/revalidation, `after()` — **before** writing any file under `src/app/**` or any new server action. If a guide contradicts a pattern cited in [contracts/server-actions.md](./contracts/server-actions.md), the guide wins and the contract is amended |
| `OBLIG-TRUNCATE` | Any table given a `BEFORE TRUNCATE` guard must be registered in `TRUNCATE_GUARDED_TABLES` (`test/integration/per-file-setup.ts:55-59`) or the whole integration suite breaks on the next file | Add `HumanWorkUnitAcceptance` and `HumanWorkUnitTransition` in the same change that adds their triggers |
| `OBLIG-SETTINGS` | `getSettings` overlays a database row only for keys already in `DEFAULT_SETTINGS` (`src/lib/settings.ts:260-265`) | Add each new setting in all three places — the `Settings` type, `SettingsSchema`, `DEFAULT_SETTINGS` — or its override is silently discarded |
| `OBLIG-RETENTION` | Candidate payloads and audit rows are `DELETE`-gated behind `afterdesk.retention_purge`; V1 ships the guard and **no** purge sweep, so nothing is removable | Do not write a purge path without an explicit policy change. Fail-closed is the intended V1 state |

---

## 1. Prerequisites

```bash
npm install                      # also runs prisma generate + patch-package (postinstall)
npm run lint
npm run typecheck
npm run test:run                 # the pure loop — vitest.config.mts, test/**/*.test.ts
npm run build                    # runs prisma migrate deploy, then next build
```

Real-PostgreSQL integration suite — a **separate disposable cluster**, never the app's port. The local proxy aliases every database name onto one store, and the harness's isolation probe refuses exactly that:

```bash
npx prisma dev --name integration --detach
npx prisma dev ls                          # copy THIS instance's TCP/database port

AFTERDESK_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:<TCP-port>/afterdesk_integration?sslmode=disable&pgbouncer=true&connection_limit=10" \
ALLOW_INTEGRATION_DB_RESET=1 \
npm run test:integration
```

The harness rebuilds the schema from the full migration chain whenever the chain changes, truncates every table between files, and **commits for real** — which is the only way the new constraint triggers and partial indexes are exercised at all.

**Feature flag**: `humanWorkUnitResumeEnabled` defaults to `false`. Every scenario below except §7 requires it on. It is a `Setting` row; there is no admin UI for settings in this repository, so set it directly in the database, exactly as the standing-capacity tiers comment describes for its own values.

---

## 2. Scenario A — the whole point: machine → human → machine

**Setup**: an accepted mandate whose accepted plan is *ingest (machine) → judge (human) → assemble (machine)*, with a positive `vaPayoutCents`, a positive `estimatedMinutes`, and a positive `fixedMinutes` on the human step. Flag on. One approved worker eligible for the task's category and tier. One admin who is not that worker.

**Run**: pay the task so it enters `ai_processing`; let the runner drain the pre-cut block (either via the `after()` fast path or by invoking the maintenance cron).

**Expect, in order**

1. The pre-cut machine steps complete. The downstream steps are `blocked_on_human_unit`, not `handed_to_human`.
2. The run is `awaiting_human_unit`; the unit is `published`; the task is `open` with `claimedById = null`.
3. `Task.vaPayoutCents` is **unchanged from the accepted quote** — the residual was never computed, and no `TaskHumanWorkPackage` row exists.
4. The pool shows the task at that payout. No downstream step is started, reserved against, or shown as runnable.
5. The worker claims. `Task.claimedById` is set and the unit is `claimed` in the same act, `claimGeneration = 1`, `assignmentEstablished = true` in the audit row.
6. The worker's unit view shows only the declared inputs — no client price, no other task's material, no credentials, no undeclared field.
7. The worker submits a schema-valid result. Exactly one candidate; the unit is `submitted`; exactly one audit row.
8. The admin accepts. Exactly one `HumanWorkUnitAcceptance`; the unit is `accepted`.
9. The resume applies. Exactly one `HumanWorkUnitResumeRecord` for the run; the blocked steps become `pending`; the run is `running`; the same worker still holds the task.
10. The downstream steps execute **once each**, reserving and settling only within the ceiling already frozen on the snapshot.
11. `finishAdmittedRun` marks the run `done`. The task stays `claimed`. The worker delivers through the existing flow; QC approves; exactly one `Payout` row, to that worker, at the accepted fixed payout.

**Then diff the accepted contract before and after**: scope, client price, plan version, capability versions, budget ceiling, payout totals, data classification and stored artifact bytes must compare identical (SC-008).

**Covers**: SC-001, SC-003, SC-004, SC-006, SC-008; User Story 1 scenarios 1–4.

---

## 3. Scenario B — partial resume

**Setup**: as A, plus one downstream step that is not machine-runnable on its own merits — no registered primitive, or a primitive version that moved since acceptance, or a prior budget demotion.

**Expect**: that step is **not** resumed; its own reason is preserved and reported unchanged; it is not labelled a human dependency and a budget-demoted step is still reported as a budget decision. Its id appears in `skippedStepRunIds`. Every other eligible step resumes exactly once, and the run continues with the remainder.

If a resumed downstream step fails permanently, the existing `TaskHumanWorkPackage` is inserted at most once to describe the remaining scope to the same claimant. Its payout-reference fields equal the frozen accepted task payout; `Task.vaPayoutCents` and `Task.estimatedMinutes` remain unchanged; replay creates no second package or claim.

**Covers**: FR-024, FR-025, FR-038; User Story 1 scenario 5; readiness CHK050.

---

## 4. Scenario C — revision, then acceptance

**Run**: submit → admin rejects with instructions (bound not exhausted) → the unit returns to workable for the **same** claimant, `remainingRevisions` decreases by exactly one, the previous candidate is retained as evidence, no machine step resumes → resubmit → accept → resume once.

**Also assert**:
- while a candidate is under review, no downstream step is runnable and **no** provider spend, budget reservation or hold exists for it;
- the submitting worker cannot review or accept their own submission — refused **and recorded**;
- a second decision on the same candidate is refused as a duplicate and the first stands unmodified;
- a submission that fails the frozen output schema or lacks a required artifact is refused with a message naming what is missing, and the worker keeps the task and the unit.

**Covers**: User Story 2, all six scenarios; FR-016 through FR-023.

---

## 5. Scenario D — contention, staleness and release

1. Fire concurrent claims from several eligible workers at one published unit → **exactly one** succeeds, **exactly one** task assignment exists afterwards, zero duplicate holders, zero second assignments.
2. A task that already has a different claimant → the unit claim is refused; no second worker becomes able to work or be paid.
3. Let a claim lapse; a second eligible worker reclaims → the stale holder's late submission is refused **as stale**, never accepted and never merged.
4. A worker releases the task → the existing release semantics apply unchanged: no revision consumed, the run does not advance, no money moves, the run keeps waiting.
5. A worker releases **after** a revision was consumed → the consumed revision stays consumed and the next claimant inherits the remainder; if nobody reclaims before the deadline, the run pauses and alerts an admin without another revision being consumed.
6. A non-approved worker, a worker failing category/tier/prior-delivery eligibility, a non-claimant, and a worker whose approval is withdrawn after claiming → every view, claim, submit and revise is refused **at the point of use**, regardless of any earlier successful check.

**Covers**: User Story 4; SC-002; FR-009 through FR-015; FR-043.

---

## 6. Scenario E — crash and replay

Run each with the process killed at the named point, then let the recovery path run.

| Injection point | Expected convergence |
|---|---|
| Immediately **before** candidate commit | No candidate, no state change, no audit row. The same request is safe to retry |
| Immediately **after** candidate commit | Exactly one candidate, one state change, one matching audit row. No partial state is observable |
| Between acceptance and resume | Recovery converges on **exactly one** resume; no step made runnable twice; the accepted result applied once |
| Mid-downstream-step | The existing lease, fencing and replay rules govern, unchanged |
| Full replay of the maintenance cron, twice, concurrently | Zero duplicate resumes, zero duplicate downstream executions, zero second claims, zero duplicate alerts |

**Covers**: SC-005, SC-015; FR-018, FR-026 through FR-029.

---

## 7. Scenario F — fail-closed, and today's behaviour preserved

Compile one mandate for each and assert the outcome is **exactly today's** — downstream demotion, one residual package, one mandate to the pool — plus one distinct recorded cause:

| Mandate | Cause |
|---|---|
| Two or more human steps | `unsupported_topology` |
| One human step, plus a step that is neither ancestor nor descendant of it | `unsupported_topology` |
| A dependency cycle, or a dependency on a nonexistent step | `malformed_topology` |
| A human step whose `fixedMinutes` is null or zero | `unmapped_economics` |
| No positive `vaPayoutCents` or no positive `estimatedMinutes` | `unmapped_economics` |
| **Flag off**, mandate otherwise in the supported shape | not admitted; behaves exactly as today |

For every one: zero unauthorized downstream budget is consumed; the mandate lands in the existing manual residual path or an admin-visible pause with a named cause and an available manual next action; the admin surface names the cause **in its own terms** and shows **no** missing-capability badge and **no** budget-demotion badge for it.

Also assert **replay of the admission decision**: re-evaluating the same accepted contract yields the same verdict, because the verdict is a property of the frozen contract and not of when it was evaluated.

**Covers**: User Story 3; SC-007; SC-013 (first half); FR-003 through FR-005; FR-053.

---

## 8. Scenario G — rollout and rollback

1. Flag **off**: run a mandate in the supported shape end to end → behaves exactly as today. Run a historical (pre-migration) mandate → identical behaviour and identical stored values before and after the migration.
2. Turn the flag **on**: only mandates admitted *after* enablement take the new path. A run evaluated while it was off is never retroactively admitted.
3. Turn the flag **off while a run is waiting on a claimed, submitted unit**: zero new admissions, and the waiting run still reaches acceptance, rejection or a named admin-owned fail-closed state. **Nothing strands a mandate or a claimant.**
4. Revert the application deploy while keeping the migration: the new tables are inert; an admitted run is resolvable by an admin through the existing task paths. Exercise this degraded path explicitly — it is the realistic rollback, not a hypothetical one.
5. No historical run, package, payout, accepted result or audit record changes meaning at any point.

**Covers**: SC-013; FR-064, FR-065.

---

## 9. Scenario H — deadlines, alerts and admin comprehension

1. Let each deadline lapse — publication with no claim; claim with no submission; revision requested with no reclaim → each produces **exactly one** durable actionable admin alert, causes zero automatic acceptance, zero automatic rejection, zero revision consumption, and incurs zero provider execution spend. Run the sweep twice and concurrently → still exactly one alert.
2. Put a run into **every** waiting state and every refusal cause. For each, an authorized admin viewing it must be able to state, without querying storage directly: why it waits, who may act, the deadline, the revisions remaining, and one recommended safe next action — matching the table in [contracts/projections.md](./contracts/projections.md#4-admin-projection).
3. Assert that **zero** runs reach a waiting state with no owner and no available next action.

**Covers**: User Story 5; SC-010, SC-011, SC-016; FR-044, FR-052, FR-059, FR-060.

---

## 10. Scenario I — leakage and final QC

1. Across every lifecycle state and every data classification: zero worker projections contain an undeclared field, a forbidden category, a client price, cross-task material, a credential, or post-acceptance unit inputs or candidate content; zero client projections contain a worker payout; zero worker-side access decisions depend on client-tenant membership; every post-acceptance claimant view shows exactly one permitted status value and one safe next action.
2. Assert no `human_unit_*` action appears in the client timeline whitelist.
3. Reject a delivery at **final QC** after the unit was internally accepted → the accepted result, the resume record and the already-completed downstream executions are unchanged; no automatic replay; the existing task revision or residual path applies for the same claimant, or an explicit authorized reassignment.
4. Read the audit trail: zero records contain a money value, a credential, a raw input, submitted content, or material belonging to another task, client or accepted contract; zero records were altered or removed.

**Covers**: SC-009, SC-014, SC-017; FR-047 through FR-063.

---

## 11. Definition of done for this feature

- All ten scenarios above pass, the integration ones against a real PostgreSQL instance.
- `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` pass.
- Every invariant in [contracts/db-invariants.md](./contracts/db-invariants.md) has a test proving the **database** rejects its violation.
- `test/price-wall.test.ts` and `test/client-timeline.test.ts` are extended and pass.
- The review records an explicit constitution compliance check naming Principle III and Principle IV as the principles this change puts at risk, and points at the requirement addressing each.
- The release note states migration status, the rollback path (flag, then deploy — never the schema), observability coverage, and carries the evidence label `UNKNOWN` for every commercial claim: demand, frequency, coverage gain, willingness to pay and revenue impact are not established by this work and must not be presented as if they were.
