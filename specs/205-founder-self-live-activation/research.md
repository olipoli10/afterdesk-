# Research: Founder self live activation

## Decision 1 — Dedicated ENDVERA number

**Decision**: Use a provider-hosted number for real SMS and voice. Do not read the owner's unrelated personal SMS or call history.

**Rationale**: iOS does not provide a general third-party inbox-reading path, and Google Play restricts SMS/call-log permissions to tightly reviewed default-handler or exceptional use cases. A dedicated number provides one cross-platform contract and keeps business communications auditable.

**Alternatives considered**: Becoming the default Android SMS/phone/assistant handler in V1 was rejected because it expands privacy, policy and UX scope without improving the core secretary loop.

## Decision 2 — Native calendar plus direct-cloud connector

**Decision**: Request native calendar permission in the mobile app for calendars already synchronized on the device. Retain the existing Google Calendar OAuth connector for reliable direct-cloud sync and server-side operation.

**Rationale**: Native access gives the founder immediate phone-level utility; OAuth remains necessary for durable server-side operation when the app is closed.

**Alternatives considered**: Requiring Google OAuth before any founder use was rejected as unnecessary friction. Native access alone was rejected as the terminal architecture because it cannot power all background assistant workflows.

## Decision 3 — Progressive contacts access

**Decision**: Request contacts only when the founder opens device access, show only permission/count status, and require an explicit later selection before data leaves the device.

**Rationale**: Permission to read a whole address book is not permission to upload or disclose it.

## Decision 4 — Physical internal builds before stores

**Decision**: Add Android APK and physical iOS internal-distribution profiles. Store submission remains separate.

**Rationale**: A real installed founder build can validate the product loop before public store review. iOS still requires Apple signing and a registered device; Android APK installation does not prove Play Store readiness.

## Decision 5 — Twilio as first provider candidate, provider-neutral domain

**Decision**: Add server-only Twilio configuration names and exact SMS/voice gates, but preserve provider-neutral canonical entities and no network executor in this slice.

**Rationale**: The first real number needs a concrete provider. Keeping provider state behind capability contracts prevents the entire product from becoming Twilio-specific.

## Evidence labels

- Platform and provider requirements: FACT from current official documentation, checked 2026-09-05.
- Architecture: DECISION.
- Local implementation and automated validation: CODE/TEST after execution.
- Signed builds, provisioned number, OAuth, external traffic and store publication: UNKNOWN until separately observed.
