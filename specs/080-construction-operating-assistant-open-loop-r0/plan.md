# Implementation Plan: Construction Operating Assistant Open-Loop R0

## Technical context

- Application: Next.js 16.2.12, React 19.2.4, TypeScript, PostgreSQL, Prisma 6.19.3.
- Existing construction surface: Projects, Calendar, Inbox and bounded A2 conversation.
- Existing safety: workspace ownership, raw-first message persistence, idempotency, exact action approval, audit, local simulator.
- R0 environment: local only, disposable PostgreSQL, synthetic or explicitly founder-owned material.
- Dependency policy: no new package and no lockfile change.

## Constitution check

| Principle | Plan response |
|---|---|
| Outcome over feature count | First outcome is invoice-ready closure, not a connector catalogue |
| Canonical state outside the model | PostgreSQL and deterministic transition policy own truth |
| Evidence and provenance | Facts, evidence, verification and closure snapshots remain linked |
| Fail-closed authority | No external transport; all prepared actions remain unsent |
| Reuse before duplication | Extend Construction Assistant V1 and shared security/runtime assets |
| Synthetic is not live proof | Dashboard and readiness labels remain unchanged by local tests |
| Smallest meaningful slice | One loop type, one project, one economic outcome |

## Target architecture

```text
Business number / mobile / portal
             |
      normalized intake
             |
  identity + project resolution
             |
 typed command proposal (AI or deterministic)
             |
 authority + policy validator
             |
 Open-Loop Closure Core <----> PostgreSQL facts/evidence/audit
             |
 projection + next actor + prepared actions
             |
 Projects / Today / Calendar / Inbox / Human exception
```

External connectors are adapters outside the Core. A provider event never writes canonical state directly.

## R0 implementation boundaries

### Add

- One versioned OpenLoop domain contract.
- One invoice-readiness policy and deterministic evaluator.
- Project-scoped facts/evidence/contradiction/verification records.
- One Today/Tomorrow projection.
- One prepared-unsent evidence-request action using the existing action boundary.
- Synthetic scenario and disposable-PostgreSQL proof.

### Reuse

- Construction workspace/project/contact/message/action/audit.
- Existing authentication and workspace isolation.
- Existing project portal and inbox patterns.
- Existing file-security and Human Work adapters only where necessary.

### Exclude

- Live provider, OAuth, calendar sync, accounting write, native app, customer data and production paths.

## Build vs integrate

| Capability | Build | Integrate later |
|---|---|---|
| Open-loop state, policy, provenance, authority, audit, projections | Yes | No |
| Business SMS/voice transport | Provider-neutral contract only | One provider after sandbox gate |
| Calendar | Canonical internal commitments | Google Calendar first; Microsoft Graph on demand |
| Contacts | ENDVERA project contacts and selected import contract | Google People/mobile contact picker only with consent |
| Files/photos | Project evidence adapter and existing security pipeline | Native camera/file APIs after pilot |
| Accounting | Invoice-ready package | QuickBooks/other selected from design partners |
| Push notifications | Notification intents | APNs/FCM through mobile layer after pilot |
| Human exceptions | Bounded HumanWork adapter | Workforce operation only after privacy/economics proof |

## Implementation order

1. Freeze product contract, asset audit, permissions, connectors and roadmap.
2. Define OpenLoop data model and transition/evaluation contracts.
3. Add RED tests for missing evidence, contradiction, replay, authority and role leakage.
4. Implement pure invoice-readiness evaluator.
5. Persist loops and transitions with forward-only migration and atomic inbox/audit behavior.
6. Add project/Today projection and prepared-unsent follow-up.
7. Run a synthetic end-to-end scenario through restart and replay.
8. Run proportional regression, Spec Kit Analyze and closeout.
9. Checkpoint only demonstrated facts in the canonical Brain.

## Risks and controls

| Risk | Control | Stop condition |
|---|---|---|
| Building a generic platform before demand | One loop type and commercial interview/pilot gates | Scope expands without observed dossier evidence |
| Chatbot state mistaken for truth | Typed commands + deterministic service + Postgres | Model output directly mutates a record |
| Silent external action | Prepared-unsent only in R0 | Any provider/network path becomes necessary |
| Financial leakage | Capability projections and negative role tests | Field role can access restricted amount |
| Evidence theatre | Frozen truth ledger and non-vacuous RED | Synthetic fixtures are described as customer proof |
| Migration risk | Additive forward-only migration and disposable DB | Destructive/shared DB operation required |
| Human-work cost hides poor automation | Measure interventions per dossier | Unit economics cannot be measured in pilot |

## Validation strategy

- Contract and pure policy tests first.
- Disposable PostgreSQL tests for transaction, idempotency, restart and concurrency.
- Construction Assistant V1 regression tests.
- Access Authority, file-security and Human Work adapter tests where touched.
- Lint, typecheck, git diff check and fresh migration.
- Full suite/build only when product code or Prisma changes justify it.

## Exit verdicts

- `READY_FOR_FOUNDER_OWNED_INVOICE_READINESS_LOOP_TEST`
- `REWORK_OPEN_LOOP_R0`
- `REJECT_PRODUCT_RESET_R0`

