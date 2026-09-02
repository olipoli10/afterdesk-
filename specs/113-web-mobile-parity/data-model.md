# R33 Projection Model

R33 adds no authoritative table and expects no migration.

## GoldenWorkflowRegistryEntry

- `step`, `order`, `capabilityCode`
- owner/office and field route identifiers
- allowed roles and prerequisite blocker codes
- title, body and action copy keys

## GoldenWorkflowProjection

- schema/registry version, generated time
- workspace summary and server-derived role
- selected locale/timezone/currency
- canonical state fingerprint
- ordered step projections with `NOT_STARTED`, `CURRENT`, `BLOCKED` or `COMPLETE`
- closed blockers with severity and safe resolution route
- one primary action and bounded secondary inspection actions
- provider/external-effect counters fixed at zero in R33

## FieldGoldenWorkflowProjection

Independent schema containing only assigned workspace/project summary, allowed
schedule/evidence steps, blockers safe for the worker, one next action and the
same external-effect counters. It has no financial, import, contact-directory,
policy, connector or owner-approval fields.

## CopyCatalog

- closed key union
- complete `fr-CA` and `en-CA` records
- placeholder schema per key
- no persistence and no caller-supplied HTML

Every projection is derived from one transactionally consistent canonical
read. Its fingerprint covers stable codes and canonical identifiers/versions,
not localized prose or generation time.
