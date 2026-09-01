# Data model

## ConstructionHumanEscalation

- immutable binding: workspace, project, open loop, purpose, source version;
- generic execution binding: task, workflow run and HumanWorkUnit state;
- frozen contract version and idempotency key;
- lifecycle: PREPARED, ACTIVE, ACCEPTED_PENDING_APPLY, RESUMED, WITHDRAWN,
  EXHAUSTED, PAUSED;
- accepted-result application: acceptance id, payload hash and applied timestamp;
- one unique escalation per idempotency key and one application per acceptance.

## Existing retained entities

- `HumanWorkUnitDefinition`: frozen instructions, inputs, output schema,
  artifacts, acceptance criteria and eligibility;
- `HumanWorkUnitRunState`: claim/revision/resume generations and state;
- `HumanWorkUnitCandidate`: append-only submitted result;
- `HumanWorkUnitReviewDecision`: append-only review;
- `HumanWorkUnitAcceptance`: immutable accepted payload;
- `HumanWorkUnitResumeRecord`: exactly-once generic workflow resume;
- `ConstructionOpenLoopTransition`, `ConstructionOpenLoopSnapshot` and
  `ConstructionAuditEvent`: construction application evidence.

## Invariants

- a bridge cannot cross workspace/project/open-loop ancestry;
- a bridge cannot change generic execution identity after activation;
- PREPARED cannot become ACTIVE unless the bound task has an authorized or
  received Payment covering its frozen client price;
- an applied acceptance id and payload hash cannot be replaced;
- only one accepted application changes construction state;
- terminal withdrawn/exhausted bridges never reopen;
- deletion/truncate of accepted application evidence is refused.
