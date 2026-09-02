# Implementation Plan: R33 Web, iOS and Android Golden Workflow Parity

## Technical context

- TypeScript strict, Next.js 16 App Router, React, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router application for iOS and Android.
- Existing Web language cookie plus Construction workspace locale.
- Existing R13-R32 canonical state, private APIs, mobile session, outbox and role projections.
- No dependency, lockfile or database migration is expected.

## Architecture

1. Define one closed Golden Workflow/capability registry and strict owner/office and field schemas.
2. Aggregate canonical readiness from existing workspace, project, schedule, evidence, follow-up, receivable, prepared-action, provenance and human-escalation state.
3. Derive completed/current/blocked steps and one next action server-side with a stable canonical fingerprint.
4. Expose one authenticated private/no-store aggregate endpoint with point-of-use membership checks.
5. Define a typed `fr-CA`/`en-CA` copy catalog keyed by server codes, plus deterministic date/money formatting helpers.
6. Build a focused Web operating cockpit with semantic progress, blockers, primary action and role-safe deep links.
7. Build the matching shared Expo cockpit and connect it to existing mobile session/API state.
8. Replace hard-coded Golden Workflow navigation/status copy with the typed catalog where it enters the parity path.
9. Add deterministic accessibility metadata and layout constraints for Web keyboard/narrow viewport and mobile screen reader/text scaling/touch targets.
10. Prove exact cross-client contract parity, translation completeness, role minimization, restart equality and zero external effect.

## Golden Workflow source map

| Step | Existing canonical source | Primary destination |
|---|---|---|
| `GET_STARTED` | R32 onboarding/session | onboarding |
| `CAPTURE_WORK` | R18 assistant history/intent | assistant |
| `PLAN_WORK` | R19 jobs + R13 calendar | jobs/calendar |
| `COLLECT_PROOF` | R14 evidence | evidence |
| `FOLLOW_UP` | R20 follow-ups | follow-ups |
| `READY_TO_INVOICE` | R21 economic cockpit | receivables |
| `APPROVE_ACTION` | R10/R11 prepared actions | actions/inbox |
| `REVIEW_HISTORY` | R15/R29 timeline/provenance | timeline/provenance |

Human support is an exception destination and exact resume target, not a ninth
business-completion flag.

## Constitution Check

- **Owned outcomes**: PASS — one canonical next action is always visible.
- **Canonical state**: PASS — the cockpit is a derived projection over R13-R32.
- **Closed-world capability**: PASS — steps, blockers, actions, routes, locales and copy keys are allowlisted.
- **Authorization/tenancy**: PASS — actor and role are server-derived at each read/action.
- **Role minimization**: PASS — field projection is independent and deny-by-default.
- **Accessibility**: PASS — semantic, keyboard, text-scale and non-colour requirements are explicit gates.
- **Replay/uncertainty**: PASS — existing exact command/outbox mechanisms remain authoritative.
- **External effects**: PASS — provider capabilities remain disabled and observable as unavailable.

No constitutional exception is required. The post-design check remains PASS.

## Validation

- R33 registry, derivation, localization, formatter and role-contract unit gates;
- disposable PostgreSQL aggregate, membership, restart and cross-workspace gates;
- shared fixture parity across server, Web parser and mobile parser;
- translation key/placeholder completeness and no mixed-locale mutation;
- Web semantic/focus/keyboard/narrow-view deterministic component gates;
- Expo accessibility role/label/state, touch-target and enlarged-font layout gates;
- R13-R22 and R28-R32 regression gates;
- root/mobile tests, lint/typecheck, Expo Doctor/export, Next.js Webpack build,
  Spec Kit Analyze, diff/lockfile/forbidden-effect audit.

## Delivery and continuation

Commit R33 coherently, mark it DONE, promote R34 Billing/Admin/Site and continue
without an intermediate final or founder prompt. No provider, customer data,
deployment, production database, push or store action.
