# Conversation and simulator contracts

## Closed intents

`CALENDAR_ITEM_CREATE`, `CALENDAR_QUERY`, `OUTBOUND_MESSAGE_DRAFT`, `CLARIFICATION_REQUIRED`, `UNSUPPORTED`.

## Normalized inbound envelope

Required: schema version, simulator provider, provider message ID, channel, normalized sender, body, received timestamp and signature-valid flag. Optional: project hint. Unknown keys are rejected.

## Interpretation

Required: intent, confidence, language, project candidates, contact candidates, date phrase, parsed UTC values, clarification reason and proposed payload. Arbitrary database identifiers are refused unless independently resolved inside the authenticated workspace.

## Outbound approval

Approval binds workspace, action ID, version, recipient identity, channel, exact body and canonical SHA-256. Simulated delivery is permitted once only when every field still matches.
