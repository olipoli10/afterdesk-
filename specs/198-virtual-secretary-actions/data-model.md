# Data model — R38B virtual secretary actions

## SecretaryCapability

- `key`: one of seven closed-world capabilities
- `effectClass`: `READ`, `INTERNAL_WRITE` or `EXTERNAL_WRITE`
- `connector`: none, Google Calendar, SMS or voice
- `approvalRequired`: whether execution needs an exact approval
- `verificationRequired`: whether an external postcondition must later be checked

## SecretaryActionRequest

- `schemaVersion`
- `requestId` and `idempotencyKey`
- `actorVerified`, `actorAuthorized`, `workspaceBound`
- `capability`
- `payload`: discriminated action-specific data

## Recipient

- `contactId`: canonical resolved contact identifier
- `displayName`: preview label
- `communicationEligible`: current consent/eligibility decision

Validation: one recipient for single text or call; one to ten unique recipients for broadcast; duplicates are refused rather than silently removed.

## CalendarEventDraft

- `calendarId`
- `title`
- `startAt`, `endAt`
- `timeZone`

Validation: end follows start; a current write grant is required before a provider execution can later be admitted.

## ProjectMutationDraft

- `projectId`
- `expectedStateVersion`
- `changeSummary`

Validation: exact project and positive expected version are mandatory.

## SecretaryActionPlan

- `outcome`: `ANSWER_READY`, `CONNECTION_REQUIRED`, `CLARIFICATION_REQUIRED`, `PREPARED_ACTION`, `REFUSAL` or `HUMAN_HANDOFF`
- `reasonCode`
- `capability`
- `effectClass`
- `preview`: exact plain-language target/channel/content fields
- `approvalRequired`, `verificationRequired`
- `externalTransportPerformed`: always false in R38B

## State transitions

`REQUESTED → PLANNED_READ | CONNECTION_REQUIRED | CLARIFICATION_REQUIRED | PREPARED_ACTION | REFUSED | HUMAN_HANDOFF`

No R38B transition reaches execution.
