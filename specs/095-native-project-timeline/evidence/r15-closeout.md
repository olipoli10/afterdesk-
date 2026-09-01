# R15 Closeout — Native Project Timeline and Daily Brief

## Result

R15 adds one native project timeline and deterministic daily operating brief.
The owner or office manager sees canonical appointments, open loops, evidence,
prepared actions and receivables. A field worker receives the same non-financial
operating history with private calendar titles, action payloads, invoice
references, balances and source references removed.

The projection is read directly from PostgreSQL and ordered newest-first by
canonical occurrence time, then kind and entity ID. Every event carries a
canonical entity type and ID. The brief derives the local operating day from
the workspace timezone and identifies one bounded next-decision category; it
does not use a chat transcript or generate facts with a model.

## Observed gates

- mobile suite: 26/26 passed, including strict owner/field timeline parsing;
- targeted R0/R7/R8/R15 unit gates: 29/29 passed;
- disposable PostgreSQL R0/R7/R8/R13/R14/R15 integrations: 15/15 passed on 45 migrations;
- exact R15 restart/fresh-query reconstruction: passed;
- mobile lint, mobile typecheck and root typecheck: passed;
- Expo Doctor: 21/21 passed;
- local Expo export: iOS, Android and Web passed with an inert HTTPS build URL;
- `git diff --check`: passed.

## Authority and limits

- no schema, migration, dependency or lockfile change;
- no provider, customer data, external transport, external write, push,
  Preview, Production, deployment, EAS or store action;
- a local deterministic briefing is build evidence, not observed client value,
  provider readiness or Verified-E2E coverage.
