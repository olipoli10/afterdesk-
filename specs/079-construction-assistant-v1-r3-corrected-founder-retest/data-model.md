# Data Model: Construction Assistant V1 R3 Founder Retest

## RetestSession

- `schemaVersion`: exact integer `1`
- `sessionId`: UUID generated server-side
- `mode`: `TECHNICAL_DRY_RUN | FOUNDER_OBSERVATION`
- `status`: `NOT_STARTED | IN_PROGRESS | SUBMITTED | SEALED`
- `userId`, `workspaceId`, `projectId`: server-derived identifiers
- `currentStep`: integer 0–9
- `providerMessageId`: opaque server-generated value
- `startedAtUtc`: absent until first founder action
- `completedAtUtc`: present only after final form
- `technicalMeasurements`: closed object recomputed from PostgreSQL
- `founderAnswers`: absent until founder submission

## FounderAnswers

- three ratings from 1–5
- nonnegative integer correction and context-restatement counts
- boolean `nextDecisionIdentified`
- optional bounded comment
- no technical success fields

## TechnicalMeasurements

Contains only the required automatic counters and booleans: canonical appointment, ambiguity writes, tomorrow accuracy, inbound and duplicate effects, outbound prepared actions, first/second simulated delivery counts, replay refusal, projection consistency, invented facts and external transports.

## State transitions

`NOT_STARTED -> IN_PROGRESS` occurs only on the first founder action. Steps advance sequentially after server verification. `IN_PROGRESS -> SUBMITTED -> SEALED` requires all nine steps, closed founder answers and successful recomputation. A dry run can never enter the founder-observation sealed state.
