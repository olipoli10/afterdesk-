# Research and Product Decisions

## Evidence base

The detailed market/competition report is preserved at:

`C:\Users\oliro\Documents\Codex\2026-08-31\ENDVERA-recherche-capacites-entrepreneurs-2026\ENDVERA-recherche-strategique-capacites-entrepreneurs-2026.pdf`

It contains 35 direct sources across construction software, calendars, communications, accounting, field evidence and qualitative contractor complaints. This feature uses that report as strategic input; it does not copy market claims into code.

## Fact / inference / hypothesis / unknown

### FACT

- The repository already contains a workspace/project/contact construction domain, durable PostgreSQL state, normalized local SMS/email envelopes, idempotency, exact-version outbound approval, audit events, model-gateway boundaries, secure file handling and Human Work infrastructure.
- The current Construction Assistant closed interpreter supports appointment creation, ambiguity clarification, tomorrow queries and prepared outbound messages.
- No live Google/Microsoft Calendar, business-number provider, accounting connector or native mobile client is presently proven in the construction product.
- The R2 founder observation recorded REWORK. R3 corrections are code/test/synthetic evidence only because the founder observation file is absent.

### INFERENCE

- Rebuilding authentication, storage, messaging contracts, audit or Human Work would add risk without improving the customer promise.
- A generic assistant that only answers, summarizes or classifies can be substituted by ChatGPT plus manual work.
- The durable differentiator must be responsibility for open operational loops across time, channels, systems and humans.
- The smallest workflow that exercises this differentiator and connects directly to money is `work finished -> invoice-ready`.

### HYPOTHESIS

- Small Québec contractors lose enough time or revenue between field completion and invoice creation to pay for reliable closure.
- A business-number-first interaction plus a generated cockpit will reduce adoption friction compared with mandatory portal entry.
- Contractors will authorize narrow calendar and messaging actions when every external action is visible, reversible where possible and auditable.

### UNKNOWN

- The actual frequency and dollar impact of invoice-readiness failures per contractor.
- Which evidence rules repeat across trades and which require trade-specific templates.
- Whether Google Calendar, Microsoft 365 or an existing construction platform is the dominant calendar of the first design partners.
- The acceptable price, onboarding effort and human-support cost.
- Whether a native mobile app is required for retention after a business-number and responsive-web pilot.

## Decisions

### D1 — Product architecture

Use an Open-Loop Closure Core. A conversation can create or update a loop, but conversation history is not canonical state. PostgreSQL stores the current operational truth; every transition retains provenance.

### D2 — First workflow

Select `WORK_FINISHED_TO_INVOICE_READY` as R0. Calendar assistant behavior remains important and reusable, but it is an enabling capability rather than the first economic wedge.

### D3 — Mobile sequence

Start with the business number and responsive portal. After a successful design-partner pilot, build one React Native application using Expo development builds for both iOS and Android, with shared TypeScript schemas/API client and native camera, file picker, push notification and contact-picker adapters. A Samsung-specific application is unnecessary; Samsung devices receive the Android app.

### D4 — Communication channel

Use an ENDVERA-controlled business number, not access to personal SMS history. Keep the existing provider-neutral contract and select one SMS/voice provider only after sandbox conformance, Québec/Canada deliverability, number availability, consent, opt-out, recording and unit-economics checks.

### D5 — Calendar

Google Calendar connection is technically feasible through OAuth and narrow calendar scopes. Microsoft Graph follows when demanded. ENDVERA keeps its own canonical commitments and syncs authorized calendar projections; it does not treat an external calendar as the workflow database.

### D6 — Contacts and files

Use ENDVERA-managed project contacts plus explicit selected import/contact-picker flows. Use selected camera/files only. Never request silent general access to the phone, address book, photo library or mailbox.

### D7 — Accounting

R0 ends at a verified invoice-ready package. QuickBooks Online or another accounting connector is selected from actual design-partner usage. Initial output can be a reviewed export/draft; no accounting write occurs without connector-specific authorization.

### D8 — AI responsibility

Models interpret and propose typed commands. Deterministic policy validates identity, project, authority, facts, evidence and transitions. Models do not become the database and do not silently execute external actions.

### D9 — Human layer

Reuse the existing Human Work fabric only for bounded exceptions with minimum context. Do not expose a freelancer marketplace or make the contractor manage workers.

### D10 — What not to build yet

Defer a generic workflow builder, full ERP/accounting suite, universal connector marketplace, autonomous spending/legal commitments, continuous surveillance, personal inbox/SMS takeover and separate native codebases.

