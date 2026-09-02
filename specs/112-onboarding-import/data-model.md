# R32 Data Model

## ConstructionOnboardingSession

- `id`, `ownerUserId`, nullable `workspaceId`
- `stage`, `status`, `stateVersion`, `nextAction`
- `createdAt`, `updatedAt`, nullable `completedAt`
- unique owner and nullable unique workspace bindings

## ConstructionOnboardingCommand

- `id`, `ownerUserId`, nullable `workspaceId`
- `commandId`, `commandHash`, `action`
- immutable `result`, `resultFingerprint`, `createdAt`
- unique `(ownerUserId, commandId)`

## ConstructionImportBatch

- `id`, `workspaceId`, `kind`, `registryVersion`, `parserVersion`
- `sourceHash`, `sourceByteCount`, `headerMapping`
- `status`, `stateVersion`, `rowCount`, state counts
- `createdByUserId`, timestamps
- unique `(workspaceId, sourceHash, kind, parserVersion)`

## ConstructionImportRow

- `id`, `workspaceId`, `batchId`, `rowNumber`
- `rowFingerprint`, `normalizedProposal`, `state`, `reasonCodes`
- candidate canonical identifiers only when exact and same-workspace
- unique `(batchId, rowNumber)` and `(batchId, rowFingerprint)`

## ConstructionImportDecision

- `id`, `workspaceId`, `batchId`, `rowId`
- `action`, nullable `matchedCanonicalId`
- `expectedBatchVersion`, `decisionHash`, `decidedByUserId`, `createdAt`
- unique row decision per batch version

## ConstructionImportCommit

- `id`, `workspaceId`, `batchId`, `commandId`, `commandHash`
- `sourceHash`, `previewFingerprint`, `result`, `resultFingerprint`
- exact created/skipped/refused counts and canonical identifiers
- `committedByUserId`, `createdAt`
- unique `(workspaceId, commandId)` and one successful commit per batch

All records are workspace restricted. Delete behavior is restrictive for
evidence ledgers and follows existing canonical lifecycle policy.
