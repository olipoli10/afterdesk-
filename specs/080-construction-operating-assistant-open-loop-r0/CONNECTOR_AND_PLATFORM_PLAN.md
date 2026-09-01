# Connector and Platform Plan

## Platform decision

ENDVERA uses its own backend and canonical state. Mobile, SMS, voice, portal and email are interaction surfaces. Google, Microsoft, accounting and telephony systems are connected services, not the product brain.

## Current foundation

| Layer | Available now | Decision |
|---|---|---|
| Web portal | Next.js Projects/Calendar/Inbox/A2 | Keep and turn into generated cockpit |
| API/server | Next server actions and services | Keep; introduce versioned public/mobile API later |
| Database | PostgreSQL/Prisma | Keep as canonical state |
| Authentication | Better Auth and roles | Keep; add construction capabilities and provider grants |
| Files | S3-compatible storage/security controls | Keep through project-evidence adapter |
| AI | Model gateway and closed local interpreter | Keep; models propose typed commands only |
| Jobs | Durable workflow-run processor | Keep for internal timers, sync and follow-up |
| Human execution | HumanWork/QC | Adapt for bounded exceptions |
| Payments | Stripe customer billing foundation | Keep separate from contractor receivables |

## Connector selection gates

### Business SMS/MMS and voice

Do not pick solely on per-message price. Score candidate providers on:

- Canadian/Québec local and toll-free number availability;
- SMS/MMS and voice in one account;
- webhook signature and idempotency support;
- opt-out/consent tooling and Canadian deliverability;
- French speech/recording capabilities and recording controls;
- stable delivery callbacks and error taxonomy;
- subaccount/project isolation;
- support, incident history and unit economics;
- no forced broad access to personal devices.

One provider is chosen for sandbox; the provider-neutral boundary remains. There is no automatic fallback for an externally visible action.

### Calendar

1. Google Calendar first because the founder explicitly needs it and OAuth integration is feasible.
2. Microsoft Graph Calendar only when the first cohort requires Microsoft 365.
3. ENDVERA calendar remains the canonical operational projection.
4. External event writes require exact account, calendar, attendees, start/end/timezone, description, policy and current authority.

### Accounting

Interview and inspect actual design-partner systems before choosing. Candidate selection must cover:

- customer/project/item/tax mapping;
- draft versus final invoice semantics;
- attachment/evidence link support;
- webhook/change detection;
- duplicate protection;
- revocation and audit;
- Canadian taxes/currency and accountant workflow;
- write failure recovery without duplicate invoices.

### Mobile

The business number works without an app. The responsive portal is enough for the pilot unless observed friction proves otherwise. Native mobile is then built once in React Native/Expo for iOS and Android with shared contracts, while platform-specific permission and background behavior remain native.

## Required internal services before live connectors

- ConnectorGrant: account, scopes, owner, consent, expiry, revocation and environment.
- ExternalIdentity: provider subject ↔ workspace member/contact mapping.
- ConnectorCursor: sync token/watch expiry and last verified event.
- ExternalActionAttempt: exact action version, idempotency key, dispatch count and closed result.
- Suppression/Consent: channel/recipient opt-out and legal basis.
- DeadLetter/Exception: visible closed failure with assigned next actor.
- CostLedger: provider usage and per-loop contribution cost.

## Data minimization

- Import only selected calendars, contacts, photos, files and projects.
- Store normalized phone/email identifiers encrypted or tokenized where feasible; display masked values by role.
- Retain raw communication/evidence according to explicit workspace policy.
- Delete connector tokens on revocation and keep only the minimal audit needed to prove what occurred.
- Never use customer operational data to train a model without separate explicit agreement.

