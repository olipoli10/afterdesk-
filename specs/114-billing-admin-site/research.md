# R34 Local Reconciliation and Decisions

## Reuse

- Reuse Construction workspace membership and audit helpers for tenancy.
- Reuse R22 human escalation for support; do not create a support-ticket engine.
- Reuse R21 only as a usage/economic-state source; subscription billing stays separate.
- Reuse AppShell, authenticated route guards, rate limits and private/no-store headers.
- Preserve legacy task pricing and standing-capacity code as historical AfterDesk infrastructure; do not reinterpret those rows as Construction plans.

## Decisions

1. **No published price in R34.** A guessed price would turn an implementation milestone into an unsupported commercial claim. The plan registry carries `PRICE_NOT_SET`.
2. **Usage is informational and derived.** It is not a billable event ledger until a founder-approved billing policy defines units, exclusions and correction rules.
3. **One commercial account per workspace.** Subscription identity follows the company, not a person, project or mobile device.
4. **Admin-only mutation.** Owners can inspect but cannot self-activate paid status or choose hidden commercial terms.
5. **Support reuses R22.** Commercial support is a view and preparation path over the same escalation/resume lifecycle.
6. **Public truth is typed.** Capability and stage copy uses a closed bilingual catalog and explicit observed/prepared/unavailable labels.
7. **No external billing adapter.** Stripe, App Store and Play Billing remain outside this release and cannot be selected by configuration.

## Rejected alternatives

- Reusing `StandingCapacityAccount`: it represents weekly human capacity and USD task economics, not the Construction Operating Assistant.
- Counting usage client-side: it is forgeable and inconsistent across devices.
- Writing one usage event per current canonical row: it duplicates source state and creates correction/replay complexity before billing rules exist.
- Publishing placeholder monthly prices: it would look like an approved offer and contaminate future willingness-to-pay evidence.
- Creating a second support queue: it would split exception ownership and exact resume.
