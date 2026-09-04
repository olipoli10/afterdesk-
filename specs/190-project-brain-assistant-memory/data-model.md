# Data Model: Project Brain Assistant Memory

## `ConstructionProjectBrainRecallReceipt`

Immutable result of one deterministic supported memory question.

Fields:

- `id`, `workspaceId`, `projectId`;
- `understandingReviewId`, `confirmedUnderstandingSnapshotId`, `confirmedUnderstandingSequence`, `memoryCanonicalHash`;
- `questionKind`: one of the eight closed recall intents;
- `commandId`, `commandHash`, `schemaVersion`;
- strict canonical `result`, `resultHash`;
- actor and timestamp.

Rules:

- unique `(workspaceId, commandId)`;
- exact replay returns the same receipt; body drift conflicts;
- the referenced snapshot is `CONFIRMED`, equals the project current pointer selected by `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)` for new commands, and is reciprocal to the same workspace/project;
- immutable and append-only.

## `ConstructionProjectBrainMemoryCitation`

Ordered relational provenance for one recall receipt or prepared-action binding.

Fields:

- exactly one parent: `recallReceiptId` or `preparedActionBindingId`;
- `ordinal`, `citationKind`: `REVIEWED_CANDIDATE`, `OWNER_RESOLUTION` or `SOURCE_METADATA`;
- required R36X snapshot/confirmation decision;
- disposition or resolution identity;
- optional R36W candidate/batch and R36V source/snapshot identities;
- canonical provenance fingerprint.

Rules:

- every link is reciprocal to the same tenant/project/upstream chain;
- reviewed-candidate citation requires an accepted current disposition included in the confirmed R36X snapshot;
- owner-resolution citation requires the exact resolution included in that snapshot;
- metadata remains labelled metadata;
- no citation may target a free unconfirmed/rejected candidate or unresolved contradiction.

## `ConstructionProjectBrainPreparedActionBinding`

Immutable link between exact confirmed memory and one existing prepared-action version.

Fields:

- tenant/project/memory identities, exact `confirmedUnderstandingSequence` and hash;
- `family`: `OPEN_LOOP_EVIDENCE_REQUEST`, `SMS_MMS`, `VOICE_CALL` or `EMAIL`;
- existing canonical prepared-action entity ID, version and payload fingerprint;
- recipient/contact identity, channel and frozen-content hash;
- `status`: `PREPARED_UNSENT`;
- `approvalRequired`: true;
- command/body hash, actor and timestamp.

Rules:

- referenced family entity must exist in the same workspace/project with matching recipient, channel, payload/version/hash and `PREPARED_UNSENT` status;
- preparation and binding commit atomically through the existing family service boundary;
- no approved/sent/delivered state may be created by R36Y;
- edits create a new family action version/binding.

## `ConstructionProjectBrainAssistantDecision`

Append-only receipt for `RECALL_CONFIRMED_MEMORY`, `PREPARE_PROJECT_ACTION`, clarification or eligible refusal.

Fields include command/body hash, exact memory hash, question/action family, entity/result hashes, actor, result and timestamp. Audit payloads contain no question, answer, body or recipient details.

## Supported canonical answers

```text
PROJECT_SUMMARY
PROJECT_SCOPE
IMPORTANT_PEOPLE
IMPORTANT_DATES
BLOCKERS
NEXT_DECISION
REVIEWED_SOURCE_INVENTORY
RESOLVED_CONTRADICTION_HISTORY
```

Each answer is a deterministic projection of only the confirmed R36X snapshot and ordered citations. There is no generated prose beyond fixed truthful labels.

## Lifecycle

```text
exact R36X project current pointer (sequence, snapshot id)
  -> deterministic recall receipt + citations
  -> or existing-family PREPARED_UNSENT action + memory binding + citations
  -> separate existing approval command (not performed by R36Y)
```

A later confirmed understanding atomically advances the unique project sequence/current pointer and becomes current for new commands. Historical receipts/bindings remain immutable and tied to their original sequence and memory hash. Concurrent confirmations, restart and equal-timestamp records cannot make current selection ambiguous.
