# Accounting Connector Contract

## Providers and capabilities

- Providers: `QUICKBOOKS_ONLINE`, `XERO`.
- Capabilities: `READ_RECEIVABLES`, `READ_PAYMENTS`, `PREPARE_INVOICE`,
  `PREPARE_RECONCILIATION`; `EXTERNAL_WRITE` is prohibited.

## Commands

- `PREPARE_ACCOUNT` and `REVOKE_ACCOUNT`.
- `ADMIT_OBSERVATION` for a trusted normalized invoice/payment envelope.
- `PREPARE_INVOICE` from one R21 invoice-ready dossier.
- `PREPARE_RECONCILIATION` from one exact observation/receivable match.
- `APPROVE_DRAFT` for one exact draft version and payload hash.

All commands are strict, workspace-bound, idempotent, versioned and
unknown-field rejecting.

## Normalized observation

Contains opaque provider account/entity/cursor refs, kind, amount minor units,
ISO currency, provider status, external document number hash, supplied time,
content hash and trusted adapter assertion. It contains no credential, raw URL,
bank credential or unselected attachment.

## Draft and approval

An invoice draft exposes exact provider, contact, currency, line items, tax
codes/amounts, due date, evidence refs and source fingerprints. A reconciliation
draft exposes one observation, one receivable and amount disposition. Approval
does not post; the terminal R27 state is `APPROVED_UNPOSTED`.

## Role projection

Owner/admin projections may include financial details. Field projections are
empty or explicitly assigned non-financial next-action summaries and recursively
exclude amount, currency, tax, contact-accounting identity, payment and evidence.
