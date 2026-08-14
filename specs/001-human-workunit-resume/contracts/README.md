# Interface Contracts: HumanWorkUnit and Safe Resume v1

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

These are design artifacts. No TypeScript, SQL or test file is created by this phase. Signatures are written in TypeScript notation because that is the repository's language; they are contracts to be implemented, not code to be pasted.

## What this feature exposes

| Contract | Audience | File |
|---|---|---|
| Server actions — worker and admin mutations | Browser (worker portal, admin console) | [server-actions.md](./server-actions.md) |
| Runtime-internal functions — admission, publication, resume, sweeps | Server-only callers (`workflow-runs.ts`, `sweeps.ts`, the cron route) | [runtime-internal.md](./runtime-internal.md) |
| Role-shaped projections + the authorization matrix | Every read path | [projections.md](./projections.md) |
| Database invariants — constraints and triggers | PostgreSQL | [db-invariants.md](./db-invariants.md) |
| Audit and notification vocabulary | Auditors, admin surfaces, operators | [audit-events.md](./audit-events.md) |

**Not exposed**: nothing client-facing. V1 adds no client surface and no client data projection; existing client task visibility is unchanged (FR-061). No public HTTP API is added — the only route touched is the already-authenticated maintenance cron.

## Conventions these contracts inherit

All from repository `CODE`, cited so the implementation phase copies rather than invents:

1. **Server actions** are `"use server"` modules whose exported functions return a discriminated result, never throw to the browser, and map a known refusal to a message while rethrowing anything unknown — `src/server/actions/va-tasks.ts:15-27`.
2. **Authorization** happens first, in the server-side data path: `requireApprovedVa()` / `requireRole("ADMIN")`, each of which re-reads the database on every call — `src/lib/authz.ts:132-152`.
3. **Every check that binds runs inside the transaction that performs the compare-and-swap.** Read outside, it is advisory — `va-tasks.ts:29-36`.
4. **State changes go through `transitionTask`**, which is the only writer of `Task.status` and which writes its audit event in the same transaction — `src/lib/state.ts:137-200`.
5. **Zod at the boundary**, parsed with `safeParse`, refusing rather than coercing — `va-tasks.ts:267-288`.
6. **`revalidatePath` after success**, `after()` for post-response work — `va-tasks.ts:452-468`.
7. **Role-shaped selects omit** fields a role may not see rather than fetching and filtering — `src/lib/queries/tasks.ts:7-18`.
8. **Refusal messages never reveal what exists behind the gate** — `authz.ts:127-136`.

## Refusal vocabulary shared by every contract

| Code | Meaning | Worker-visible wording (indicative) |
|---|---|---|
| `not_available` | The unit does not exist, is not yours, or you may not see it. **Deliberately indistinguishable** across those three | "This work is no longer available." |
| `stale_generation` | The actor carries a superseded claim or resume generation | "This task was reassigned. Nothing was changed." |
| `duplicate` | A second submission or a second decision for the same subject | "This was already recorded. The first decision stands." |
| `schema_invalid` | The candidate does not satisfy the frozen output schema or is missing a required artifact | Names exactly what is missing |
| `not_eligible` | A live eligibility fact fails the frozen criteria | Names the criterion, as `claimTask` already does for certification |
| `self_review` | The submitting worker attempted to decide their own candidate | "A different reviewer has to look at this." |
| `lifecycle_exit` | The run has left the executing lifecycle | "This mandate is closed." |
| `paused` | The run is in an admin-owned pause | "An operator has to look at this before it can continue." |
| `revisions_exhausted` | The frozen bound is spent | "This has used its revisions." |

Every refusal is recorded as a transition or a `TaskEvent` where the spec requires it (notably FR-019's self-review attempt, which must be refused **and** recorded).
