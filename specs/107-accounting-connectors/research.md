# Research and Reuse Decisions

Official provider documentation was checked on 2026-09-02. It defines future
adapter contracts only; it is not evidence of a live connection.

## Xero

- Xero now documents granular scopes such as `accounting.invoices.read`,
  `accounting.payments.read`, `accounting.invoices` and `accounting.payments`;
  broad transaction scopes are deprecated for migration by September 2027:
  https://developer.xero.com/documentation/guides/oauth2/scopes/
- Xero write retries support an `Idempotency-Key`; stable retry identity must be
  retained instead of creating a new request:
  https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/
- Xero webhooks are signed, replayable and require consumer idempotency; they
  may be replayed after recovery:
  https://developer.xero.com/documentation/guides/webhooks/overview/
- The Accounting API covers invoices, payments, contacts and reports:
  https://developer.xero.com/documentation/api/accounting/overview

## QuickBooks Online

- Intuit documents its QuickBooks Online Accounting API as REST-based, using
  OAuth 2.0/OpenID Connect and developer sandbox environments:
  https://developer.intuit.com/app/developer/qbo/docs/develop
- Invoice is a first-class accounting entity in the official API reference:
  https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/invoice
- Intuit provides separate sandbox, webhook, OAuth and API Explorer tooling;
  none is activated by R27:
  https://help.developer.intuit.com/s/

## Product decisions

- R21 remains the canonical project receivable and invoice-readiness source.
- Provider observations cannot silently overwrite canonical state.
- R27 models normalized adapter input, exact matching and exact prepared output;
  provider-native authentication and transport are deferred to R37 authority.
- Matching must fail closed on currency, amount, project/contact or invoice
  ambiguity. Partial and overpayments remain explicit rather than coerced.
- No new dependency is needed for deterministic contracts and local proof.
