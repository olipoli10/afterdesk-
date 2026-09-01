# ENDVERA Construction Operating Assistant R5 — Human escalation and exact resume

## Outcome

When the Construction Operating Assistant reaches a bounded exception that it
cannot resolve safely, it creates exactly one managed HumanWorkUnit, gives the
assigned specialist only the minimum necessary context, accepts only a reviewed
structured result, and resumes the same construction workflow exactly once.

R5 integrates the proven local HumanWorkUnit + Safe Resume release candidate at
`c156348f16d2a0b7dc174ae96845427b2fe8eea1`; it does not create a parallel human
task engine.

## User stories

### P1 — Escalate a bounded construction exception

An authorized owner or ENDVERA policy may escalate one unresolved open loop
when the required action is human-only. Replays and concurrent requests resolve
to the same escalation and the same task.

Acceptance:

- the escalation is bound to one workspace, project and open loop;
- the human objective, required result schema, evidence requirements and
  acceptance criteria are frozen before publication;
- no client price, construction amount, credential, raw phone number or
  unrelated project context reaches the worker;
- local publication creates no provider call, notification transport or spend.

### P1 — Review the human result and resume exactly once

The current worker submits a result matching the frozen contract. A distinct
authorized reviewer accepts or rejects it. Only an accepted result may update
construction state, and one acceptance can be applied at most once.

Acceptance:

- self-review and stale claim generations fail closed;
- rejected, withdrawn, exhausted and unreviewed candidates never resume;
- the accepted payload and its hash remain immutable;
- concurrent recovery, retry and restart produce one construction effect;
- the construction open loop retains provenance, snapshot and next actor;
- a second application returns the already-applied result without new effects.

### P2 — Recover after interruption

If the process stops after human acceptance but before the construction update,
a recovery sweep completes the pending application from PostgreSQL without
asking the owner to restate context.

Acceptance:

- recovery reads the frozen escalation binding and accepted payload;
- abandoned/cancelled/withdrawn work is never revived;
- partial failures remain visible and retryable;
- history reconstructs request, assignment, candidate, review, acceptance and
  construction application.

## Authorization and tenancy

- Construction owners/admins may request or withdraw an escalation in their own
  workspace.
- Platform workers may see and act only on their current claimed generation.
- Platform admins may review; submitters may not review their own candidate.
- Point-of-use checks include workspace/project/open-loop binding, current task
  lifecycle, claim generation and HumanWorkUnit state.
- SQL projections omit forbidden financial, identity, credential, AI-internal
  and cross-project fields rather than fetching and filtering them later.

## Canonical state and evidence

PostgreSQL is canonical. The model interprets intent but is not the database.
The bridge stores versioned source bindings, idempotency keys, payload hashes,
timestamps and immutable audit evidence. Facts, human assertions, review
decisions and verified construction state remain distinguishable.

## Failure states

Unsupported purpose, missing contract, missing input, invalid payload, stale
generation, self-review, rejected result, revoked authority, cross-workspace
binding, concurrent replay, cancelled task, withdrawn unit and unavailable
accepted evidence all fail closed with a typed result and no construction write.

## Economics

R5 changes no customer price or worker payout. Existing HumanWorkUnit economics
remain frozen. No provider or transport spend is authorized.

## Explicit non-goals

Real worker dispatch, customer/prospect data, SMS/email/call transport, Twilio,
OAuth, Google Calendar, accounting writes, payments, mobile shells, new
dependencies, destructive migration, package-lock changes, push, Preview,
Production or deployment.

## Success criteria

- one canonical escalation and task under retry/concurrency;
- one accepted human result and one construction application;
- byte-equivalent state before/after process restart;
- zero cross-workspace visibility and zero financial leakage to workers;
- zero external transport/provider calls;
- all HumanWorkUnit RC and Construction R0–R4 invariants remain green.
