# Implementation Plan: R34 Commercial Account, Operator and Public Site Alignment

## Technical context

- TypeScript strict, Next.js 16 App Router, Prisma/PostgreSQL, Zod and Vitest.
- Existing R21 economic cockpit, R22 human escalations, R28 authority, R30 privacy, R31 reliability, R32 onboarding and R33 Golden Workflow.
- Existing legacy task pricing/Stripe surfaces remain historically valid but are not the Construction commercial account.
- One additive forward-only migration is expected; no dependency or lockfile change.

## Architecture

1. Create a closed code-owned Construction plan registry with immutable version/hash, feature catalog, usage metrics and explicitly unavailable price.
2. Add one workspace commercial-account row and immutable decision rows. Bind all changes to exact account version and stable command identity.
3. Derive seven informational usage readings from canonical Construction tables inside one repeatable-read transaction; do not write billing usage or calculate charges.
4. Expose strict owner/office commercial and admin portfolio projections. Refuse field commercial access rather than redacting a shared schema.
5. Add ADMIN-only local plan assignment/state commands with idempotent, concurrency-safe transitions and immutable audit.
6. Add a focused client Account surface and Construction operator portfolio/support surfaces. Reuse R22 support state instead of creating a second ticket engine.
7. Add a bilingual public `/construction` surface with closed capability/status copy and an honest Early Access/provider-disabled boundary.
8. Link R33 Web cockpit, client shell and admin shell to the new safe surfaces without changing provider behavior.
9. Prove tenancy, exact replay, concurrency, restart, counts, role minimization, public-claim guards and zero external effect.

## State boundaries

| Concern | Authority |
|---|---|
| Project economic readiness | R21 canonical state |
| Human exception/support | R22 canonical escalation |
| Action authorization | R28 policy |
| Privacy/retention | R30 control plane |
| Workspace usage reading | R34 derived aggregate |
| Construction plan/account decision | R34 commercial account + immutable decision |
| Card/payment/subscription | unavailable and outside R34 |
| Public claim | R34 typed bilingual copy |

## Constitution Check

- **Responsibility, not model selection**: PASS — plan features describe managed outcomes.
- **Canonical state**: PASS — account decisions persist; usage is derived from authoritative tables.
- **Closed-world capability**: PASS — plans, features, metrics, states, transitions and claims are registered.
- **Authorization/tenancy**: PASS — admin or active membership is reloaded at point of use.
- **Role minimization**: PASS — field commercial schema does not exist.
- **Replay/concurrency**: PASS — command identity, expected version and unique decision fingerprint bind mutations.
- **Commercial honesty**: PASS — no unapproved price, paid claim or checkout.
- **External effects**: PASS — provider/billing/transport counts remain zero.

No constitutional exception is required.

## Validation

- registry/hash/transition/public-copy and role-contract unit gates;
- disposable PostgreSQL account, decision, concurrency, replay, restart, count and tenancy gates;
- R21/R22/R28/R30/R31/R32/R33 relevant regressions;
- client/admin/public semantic and narrow-layout checks;
- root/mobile lint, typecheck and relevant tests;
- migration deploy on fresh disposable PostgreSQL;
- Next.js Webpack build, Spec Kit Analyze, diff/lockfile/provider audit.

## Delivery and continuation

Commit R34 coherently, mark it DONE, promote R35 Release Packaging and
continue without an intermediate final or founder prompt. No provider,
customer data, payment, external transport, deployment, push or store action.
