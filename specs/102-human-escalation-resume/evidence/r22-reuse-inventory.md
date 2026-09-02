# R22 Reuse Inventory

Evidence label: `CODE`

R22 extends the existing Construction R5 and Human Work Unit implementation. It does not create a second human-task lifecycle.

## Construction R5 bridge

- `src/lib/construction-operating-assistant-r5/contracts.ts`
  - closed-world purpose `OBTAIN_MISSING_EVIDENCE`;
  - evidence kinds `WRITTEN_APPROVAL`, `PHOTO`, and `DOCUMENT`;
  - strict preparation contract and separate client-price/worker-payout economics;
  - deterministic compiled Human Work Unit contract.
- `src/server/construction-operating-assistant-r5/escalations.ts`
  - `requestConstructionHumanEscalation` for atomic, idempotent admission;
  - `activateFundedConstructionHumanEscalation` for the durable funding gate;
  - `withdrawConstructionHumanEscalation` for recoverable cancellation;
  - `applyAcceptedConstructionHumanEscalation` for exact Construction delivery;
  - `recoverPendingConstructionHumanEscalations` for restart recovery.
- `src/lib/queries/construction-human-escalation.ts`
  - deliberately minimal worker-facing projection.

## Canonical Human Work Unit engine

The canonical Prisma models remain the only lifecycle store:

- `HumanWorkUnitDefinition`;
- `HumanWorkUnitRunState`;
- `HumanWorkUnitCandidate` and `HumanWorkUnitCandidateFile`;
- `HumanWorkUnitReviewDecision` and `HumanWorkUnitAcceptance`;
- `HumanWorkUnitResumeRecord`, `HumanWorkUnitTransition`, and `HumanWorkUnitAlert`.

## R22 incremental boundary

R22 adds only:

- a strict owner/office projection and command adapter;
- one protected mobile API route;
- one shared iOS/Android Human Support cockpit;
- focused PostgreSQL, authorization, replay, recovery, and redaction proof.

It adds no provider, transport, payment mechanism, worker marketplace, database model, or alternate state machine.
