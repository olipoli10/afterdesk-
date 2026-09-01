# Connector Boundaries

## Universal adapter rule

Every connector is an untrusted boundary adapter. It authenticates and normalizes provider input, but the Core independently validates tenant, identity, project, authority, idempotency, payload, policy and current state.

## Planned connectors

| Connector | Purpose | Minimum permission | First gate | Failure behavior |
|---|---|---|---|---|
| Business SMS/MMS | Owner/worker updates and approved outbound routines | ENDVERA business number only | Local/sandbox conformance | No hidden retry or fallback across providers |
| Business voice/voicemail | Call/voice-note intake and bounded outbound call tasks | Explicit call/recording policy | Recorded synthetic fixtures, then founder-owned sandbox | Closed error; human fallback only if authorized |
| Google Calendar | Read selected calendars and create/update authorized events | Selected calendar scopes, revocable OAuth | One founder-owned calendar sandbox | Sync conflict is visible; Core retains unresolved commitment |
| Microsoft Graph Calendar | Same for Microsoft 365 users | Selected calendars | Demand from design partners | Same as Google |
| Mobile camera/files | Selected evidence upload | User-selected items/camera | Responsive web first, native after pilot | Upload remains pending; no whole-library scan |
| Contacts | Resolve project contacts | ENDVERA contacts or selected import | Manual/project contacts first | Ambiguity requires clarification |
| QuickBooks/accounting | Create reviewed invoice draft after readiness | Narrow customer/item/invoice scopes | Only after design-partner accounting audit | No write on mapping/conflict/authority failure |
| Push notifications | Bring owner back for approval/exception | App notification permission | Native app phase | In-app inbox remains canonical |

## Explicitly prohibited shortcuts

- General Gmail/Outlook mailbox access for R0.
- Reading personal SMS databases.
- Silent address-book or photo-library enumeration.
- Treating provider delivery acknowledgment as business outcome closure.
- Retrying an externally visible action without an idempotent provider contract and current authority.

