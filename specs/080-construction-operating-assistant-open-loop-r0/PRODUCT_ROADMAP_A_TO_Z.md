# ENDVERA Construction Operating Assistant — Roadmap A to Z

## North-star promise

> Text or call ENDVERA. It remembers the job, keeps the next action moving, obtains the missing proof, coordinates authorized people and systems, and tells you when the result is actually closed.

The customer buys operational responsibility. AI, software, connectors and human workers are internal execution resources.

## Product shape

- **Talk to ENDVERA**: business SMS/MMS, voice/voicemail, in-app conversation and later email forwarding.
- **See ENDVERA**: Today, Projects, Calendar, Inbox, Money and Evidence cockpit.
- **Core**: persistent operational memory, open loops, deadlines, authority, facts, contradictions, next actor, audit and closure proof.
- **Execution**: deterministic software first, AI interpretation second, authorized connectors third, bounded human intervention last.

## NOW

### Phase 0 — Product reset and frozen architecture

**Objective**: align repository, product language and build sequence around the Construction Operating Assistant.

**Deliverables**:

- reusable-asset audit;
- Open-Loop Core contract;
- permission and action-risk model;
- connector/mobile plan;
- first economic workflow and commercial validation rubric;
- persistent implementation queue.

**Exit gate**: spec/plan/tasks/analyze coherent, no unresolved critical requirement, clean local commit.

### Phase 1 — Open-Loop Core R0, local only

**Objective**: make `work finished -> invoice-ready` durable and auditable for one synthetic project.

**Deliverables**:

- invoice-readiness loop and policy;
- evidence/fact/contradiction/verification records;
- next responsible actor/action;
- Today/Project projection;
- prepared-unsent follow-up;
- restart/idempotency/replay/role-isolation proof.

**Exit gate**: `READY_FOR_FOUNDER_OWNED_INVOICE_READINESS_LOOP_TEST`.

**Do not build**: live SMS, OAuth, accounting write, native mobile or generic workflow builder.

### Phase 2 — Founder-owned real dossier test

**Objective**: run one real Olivier-owned, non-client completion-to-invoice-ready dossier through the product.

**Measure**:

- missing evidence and contradictions found;
- invented facts;
- correct next actor;
- active owner minutes;
- time to accepted invoice-ready package;
- corrections and manual context restatement;
- difference from simple upload/summary.

**Exit gate**: founder-observed advantage with no provider/customer claim.

### Phase 3 — Discovery and design-partner admission

This runs alongside Phases 1–2 but cannot be replaced by them.

**Required evidence**:

- ten qualified interviews;
- five independent descriptions of the same failure;
- three walkthroughs of recent real dossiers;
- exact systems/channels/evidence/approval map;
- buyer, user, cost of failure and current workaround;
- design-partner data/authority agreement.

**Stop**: park the wedge if the failure is rare, low-cost, already solved, or buyers will not grant the minimum access.

## NEXT

### Phase 4 — Business number and messaging sandbox

**Objective**: allow an authorized founder/design partner to text one ENDVERA business number.

**Build**:

- provider adapter conformance;
- inbound signature and normalized envelope;
- consent/opt-out/suppression;
- sender/contact/project resolution;
- MMS selected evidence;
- exact outbound preview/approval;
- delivery status separated from workflow closure;
- cost, rate, retry and kill-switch controls.

**Exit gate**: one founder-owned sandbox loop with exactly bounded transport; no customer production.

### Phase 5 — Google Calendar connection

**Objective**: create/read/update selected calendar items from authorized conversation without making Google Calendar the workflow database.

**Build**:

- narrow OAuth consent;
- selected-calendar mapping;
- sync cursor/watch renewal;
- conflict and duplicate handling;
- exact action preview and revocation;
- internal commitment ↔ external event linkage.

**Exit gate**: founder-owned calendar sandbox with revoke/reconnect and conflict proof. Microsoft Graph follows only when design-partner demand exists.

### Phase 6 — Five-company, 30-day design-partner pilot

**Objective**: prove economics and retention, not just technical function.

**Pilot package**:

- white-glove onboarding;
- business number;
- one workflow only;
- responsive mobile web cockpit;
- weekly evidence review;
- human exception support behind ENDVERA;
- no unrestricted automation.

**Pass thresholds**:

- at least 80% of eligible items reach an owner-accepted invoice-ready dossier;
- fewer than three active owner minutes per dossier;
- no critical wrong-project, privacy, money or external-action incident;
- at least three of five companies state a concrete willingness to pay;
- support/human cost produces a credible contribution margin path.

**Kill criteria**:

- teams will not consistently submit the minimum field signal;
- evidence rules vary so much that every job becomes custom consulting;
- human correction cost does not decrease after repeated runs;
- owners prefer existing accounting/project software at equivalent effort.

### Phase 7 — Mobile application v1

**Decision gate**: build only after the pilot proves repeated use and identifies mobile-only friction.

**Architecture**:

- one React Native/Expo development-build application for iOS and Android;
- shared TypeScript contracts/API client, not shared UI by force;
- native camera, selected photo/file picker, push notifications, contact picker and secure local session;
- resumable background upload with explicit status;
- deep links into exact project/approval/open loop;
- no WebView wrapper as the product.

**iOS work**:

- Apple developer account, signing, privacy manifest, permission strings, APNs, TestFlight, App Store review, account/data deletion flows.

**Android/Samsung work**:

- Google Play developer account, Android permissions, FCM, background/battery behavior, Play testing/review and Samsung device matrix. Samsung uses the Android app; a separate Galaxy Store build is optional later, not a requirement.

**Exit gate**: selected upload, notification, deep-link and offline/retry behavior proven on representative iPhone and Samsung devices.

## LATER — unlocked by observed demand

### Phase 8 — Money and schedule modules

Add one at a time with separate product/economic proof:

1. Receivable follow-up closure.
2. Tomorrow Ready: workers, materials, access, permits and appointments.
3. Change-order capture and approval evidence.
4. Quote follow-up and lead response.
5. Supplier/subcontractor commitment tracking.

Accounting writes use the connector chosen by actual design-partner systems. Calendar, SMS and invoice actions each retain independent authority.

### Phase 9 — Human exception fabric

Adapt AfterDesk Human Work Units for narrow exceptions:

- call a supplier and return a structured delivery date;
- verify a document or photo;
- resolve a mapping ambiguity;
- complete a browser-only step;
- perform language-specific follow-up.

The client sees ENDVERA progress, not a freelancer marketplace. Measure intervention rate, time, cost, accuracy and reduction across repeated runs.

### Phase 10 — Operating standards and scale

Only successful repeated workflows become versioned Operating Standards with:

- required inputs;
- state machine and decision rules;
- authority policy;
- connector mappings;
- exception taxonomy;
- verification and closure criteria;
- observed automation/human economics.

Scale work then includes multi-region/provider resilience, enterprise audit/export, connector marketplace controls and trade-specific templates.

## Workstreams that run through every phase

### Security and permissions

- least privilege, selected access, per-project membership;
- owner/office/manager/field/accountant/external/operator projections;
- risk-classed actions and point-of-use recheck;
- revocation, replay refusal, data retention/deletion and audit.

### AI quality

- typed command schemas;
- evaluation sets from anonymized/consented examples;
- explicit unknown and clarification;
- zero model-direct canonical writes;
- measured hallucination, correction and escalation rates.

### Reliability

- idempotent intake;
- transactional state/audit;
- durable timers and jobs;
- provider breakers and closed failure;
- no hidden external retries;
- observability by workflow outcome, not token count.

### Go-to-market and economics

- one contractor profile and one workflow;
- founder-led onboarding and weekly review;
- price against recovered cash/time, not AI usage;
- measure onboarding hours, active owner minutes, exception minutes, connector cost, gross margin and churn reason.

## Initial monetization hypothesis

Pilot: paid setup plus monthly managed service for one workflow, with a clear volume ceiling. After economics stabilize, move to a base subscription plus included completed loops and transparent overage/human exception pricing. Do not offer unlimited bespoke operations.

## What moves off the roadmap

- Generic cross-industry workflow builder.
- Full construction ERP/accounting replacement.
- Separate iOS and Samsung product teams before pilot proof.
- General personal mailbox/phone access.
- Autonomous spending, signing, payment or legal commitments.
- Connector breadth used as a substitute for one reliable outcome.

