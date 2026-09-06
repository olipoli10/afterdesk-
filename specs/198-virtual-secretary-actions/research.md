# Research — R38B virtual secretary actions

## Decision: product definition

ENDVERA is a virtual secretary whose interface is conversation and whose value is maintaining and coordinating the owner's operation. It is not limited to one invoice workflow and is not merely a general chatbot.

## Decision: separate reads from writes

Schedule questions may be answered immediately from authorized canonical state. Google Calendar questions require a current read grant. Project changes, event creation, text messages and calls produce an exact prepared action before execution.

**Rationale**: The owner gets fast answers while consequential mutations remain inspectable and replay-safe.

## Decision: one-to-ten operational broadcast

A batch contains one common message and between one and ten unique resolved contacts. The planner refuses duplicates, unresolved recipients, missing communication eligibility and lists larger than ten.

**Alternatives considered**: Unlimited recipients and automatic deduplication were rejected because they hide audience changes and create abuse, consent and cost risk.

## Decision: Google Calendar as a connector, not phone surveillance

Calendar data uses separately scoped connector authority. The application does not infer Google Calendar access from device permissions or read unrelated phone data.

## Decision: calls are prepared work

The local action includes recipient, purpose and assistant disclosure. Dialing, synthesis, recording, consent handling and provider delivery remain a later externally authorized capability.

## Decision: provider-neutral AI

The model interprets language and proposes a typed capability. The deterministic ENDVERA planner decides whether the capability is ready, needs clarification or must be refused. A model response alone can never execute.
