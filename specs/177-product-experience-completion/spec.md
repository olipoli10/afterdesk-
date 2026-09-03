# Feature Specification: ENDVERA Construction Product Experience Completion

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Accepted for autonomous implementation

**Input**: Preserve the existing ENDVERA site, add a prominent new TextAssist banner and dedicated `/textassist` construction-assistant experience, and replace fragmented mobile navigation with one honest assistant-first experience across iOS and Android while keeping external providers disabled until separately authorized.

## User Scenarios & Testing

### User Story 1 - Understand ENDVERA immediately (Priority: P1)

A small contractor arriving on the public site can discover a new ENDVERA TextAssist offer without losing the existing site. The dedicated experience explains that ENDVERA remembers projects, manages the day, prepares communications, tracks proof and receivables, and requests approval before consequential actions.

**Why this priority**: The current root page does not expose the new construction assistant clearly, but the founder explicitly requires the existing site to remain available.

**Independent Test**: Review the root experience and `/textassist` in French and English. Verify that the existing homepage remains structurally intact, the new banner is prominent, and the dedicated page explains the audience, problem, daily workflow, safety boundary, product state, and call to action.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor, **When** the visitor opens the root page, **Then** the existing site remains available and a prominent TextAssist banner presents a direct path to the new assistant offer.
2. **Given** a visitor comparing the product with a chatbot, **When** the visitor reads the workflow section, **Then** persistent project state, approvals, evidence, follow-ups, and bounded human support are explained plainly.
3. **Given** the product is not externally activated, **When** the visitor reviews availability, **Then** live SMS, calls, calendar sync, accounting, and published apps are not claimed as active.

---

### User Story 2 - Operate from one mobile assistant (Priority: P1)

A contractor opens the iOS or Android application and sees one useful assistant-first home with the current project context, the next decision, and direct access to the few primary operating areas instead of more than twenty equal navigation tabs.

**Why this priority**: A long flat list of technical screens makes the mobile application feel like an internal test console rather than a daily contractor assistant.

**Independent Test**: Run the mobile application against local synthetic state and verify that the primary tabs are limited, the assistant is prominent, and every secondary capability remains reachable from a single More/Operations surface.

**Acceptance Scenarios**:

1. **Given** an authenticated owner, **When** the application opens, **Then** Today shows the active workspace, current project, workflow progress, blockers, and one next action.
2. **Given** the owner wants to ask or request something, **When** they select Assistant, **Then** persistent conversation and safe outcome states are available in one surface.
3. **Given** the owner needs a secondary tool, **When** they open More, **Then** contacts, evidence, communications, receivables, permissions, reliability, privacy, and support remain reachable without occupying primary tabs.

---

### User Story 3 - See one coherent release identity (Priority: P2)

A prospective user sees consistent product naming, navigation, claims, support, privacy, and account-deletion entry points across public Web and mobile release materials.

**Why this priority**: Placeholder visual assets and mixed legacy language undermine trust even when the underlying code works.

**Independent Test**: Validate the public route inventory, mobile navigation labels, release metadata, and asset manifest for one construction-first identity and explicit remaining external dependencies.

**Acceptance Scenarios**:

1. **Given** a crawler or visitor, **When** public navigation is enumerated, **Then** construction-first pages are primary and superseded managed-work marketing pages are not promoted as the core offer.
2. **Given** a user needs support or deletion information, **When** they follow the public trust links, **Then** they reach a specific route without authentication.
3. **Given** store submission has not happened, **When** readiness is reported, **Then** local experience completion is distinguished from signing, upload, provider observation, and publication.

### Edge Cases

- An authenticated user opening `/` is still routed to the correct role-safe portal.
- A locale other than supported French or English falls back deterministically without mixed-language critical actions.
- Superseded worker and Academy infrastructure remains addressable for historical operations but is not presented as the primary customer proposition.
- A missing provider, account, credential, or production origin cannot turn a prepared action into an external effect.
- Mobile secondary routes remain deep-linkable after they are removed from the primary tab bar.

## Requirements

### Functional Requirements

- **FR-001**: The existing public root experience MUST be preserved and MUST add a prominent ENDVERA TextAssist banner linking to `/textassist`.
- **FR-002**: The public experience MUST identify small construction contractors as the primary audience and explain the daily operating loop in plain language.
- **FR-003**: Public claims MUST distinguish locally built capability from live provider, customer, store, and production evidence.
- **FR-004**: The dedicated `/textassist` navigation MUST expose product, operation, trust, support, sign-in, and account-creation paths without removing existing site routes.
- **FR-005**: A public account-deletion information/request route MUST be reachable without authentication and MUST not claim that deletion has occurred merely from opening the page.
- **FR-006**: The mobile application MUST expose no more than five primary tabs.
- **FR-007**: Today and Assistant MUST be primary mobile destinations.
- **FR-008**: All existing mobile capabilities MUST remain reachable through primary destinations, a grouped secondary destination, or stable deep links.
- **FR-009**: Mobile screens MUST preserve role-safe projections, explicit approvals, replay-safe outcomes, offline recovery, and fail-closed provider behavior.
- **FR-010**: The experience MUST use one current ENDVERA naming system; historical A2 identifiers MAY remain internal but MUST NOT be the primary customer-facing assistant name.
- **FR-011**: Automated tests MUST detect regression to the superseded root proposition, excess primary mobile tabs, missing trust routes, or external-capability overclaims.
- **FR-012**: No provider, credential, customer data, external transport, payment, deployment, store submission, or publication may be used by this feature.

### Key Entities

- **Public Product Narrative**: Audience, promise, operating loop, capabilities, safety boundary, availability, and calls to action shown to signed-out visitors.
- **Mobile Primary Destination**: One of Today, Assistant, Projects, Calendar, or More; each owns a clear daily job.
- **Mobile Secondary Destination**: An existing operational screen reachable from More or a deep link without being a primary tab.
- **Release Truth Boundary**: The explicit distinction among code, test, synthetic evidence, observed provider behavior, signed builds, and publication.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A visitor can discover TextAssist from the existing homepage and identify its target customer, primary job, and first action within 30 seconds.
- **SC-002**: The existing homepage retains its current core experience while one clearly separated banner links to `/textassist` without falsely presenting live provider capability.
- **SC-003**: Mobile primary navigation contains at most five visible destinations while 100% of current operational screens remain reachable.
- **SC-004**: French and English experiences expose the same critical promise, workflow, approval boundary, support path, and availability state.
- **SC-005**: All targeted public and mobile regression tests, lint, type checking, and production Web build pass with zero external effects.
- **SC-006**: Readiness reporting explicitly leaves signing, provider observation, customer evidence, deployment, and store publication false.

## Assumptions

- Existing authentication, role projections, project state, and mobile API contracts are reused.
- The initial audience is small construction contractors in Canada, with French Canadian and English Canadian as the primary launch languages.
- Existing homepage, worker, Academy, services, and managed-work infrastructure remains available; this feature adds a new product entry rather than deleting or replacing those surfaces.
- Final legal approval, provider activation, production hosting, store accounts, signing, and publication remain later authority-bound work.
- This feature changes public and mobile experience structure without changing the database schema, dependency graph, or lockfiles.
