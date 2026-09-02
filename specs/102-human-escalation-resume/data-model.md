# R22 Data Model

R22 reuses existing versioned records. It adds no parallel human-task or construction-state model.

## ConstructionHumanEscalation

Durable binding from one Construction open loop to one Human Work Unit.

Key invariants:

- workspace, project, and open-loop binding cannot cross tenants;
- one workspace idempotency key maps to one immutable input fingerprint;
- one task and one unit state belong to one escalation;
- purpose and evidence kind are closed-world values;
- source state version captures the loop version at admission;
- acceptance and accepted-result fingerprint are recorded before application;
- `appliedAt` is the exact-once Construction delivery marker;
- withdrawal and terminal states preserve history.

Lifecycle projection:

```text
PREPARED
  -> ACTIVE
  -> ACCEPTED_PENDING_RESUME
  -> RESUMED_PENDING_APPLICATION
  -> APPLIED

PREPARED | ACTIVE
  -> WITHDRAWN

ACTIVE
  -> PAUSED | EXHAUSTED
```

The underlying Human Work Unit has a richer canonical state machine. R22 maps it into owner-facing states without rewriting it.

## HumanWorkUnitDefinition

Immutable work contract containing minimum instructions and inputs, strict output schema, required artifact kinds, acceptance criteria, reviewer authority, eligibility, data classification, deadlines, revision bound, and frozen economics.

## HumanWorkUnitRunState

Current fenced lifecycle state. Claim generation and resume generation prevent stale workers and stale recovery attempts from mutating current state.

## HumanWorkUnitCandidate and CandidateFile

One structured worker result plus task-bound evidence. Only the current fenced claimant may submit. Evidence must be clean and match required artifact kinds.

## HumanWorkUnitReviewDecision and Acceptance

Independent immutable decision and the accepted candidate payload fingerprint. Revision and exhaustion preserve earlier attempts.

## HumanWorkUnitResumeRecord

Unique durable record that the accepted work has resumed the machine lifecycle. It is not itself proof that the Construction loop effect committed.

## ConstructionOpenLoop Evidence and Transition

The final application writes verified evidence and a versioned construction decision in one transaction. Existing contradictory and historical claims remain immutable.

## R22 Owner Projection

Derived fields include escalation, project and loop identifiers; purpose and evidence kind; owner-facing state; next responsible role and action; deadline and revisions; acceptance and result fingerprints; application timestamp; and explicit zero external transport.

## Role Projections

- **Owner/office**: operating status, frozen client price, next action, review and resume provenance.
- **Worker**: only instructions, declared inputs, output/evidence requirements, deadline, revisions, and own candidate state; no client price, project financial state, credentials, or unrelated contacts.
- **Field worker**: no escalation economics and no external human-worker details.
- **Admin/reviewer**: complete review evidence through the existing admin Human Work Unit query.
