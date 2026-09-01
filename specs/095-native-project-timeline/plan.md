# R15 Plan — Native Project Timeline and Daily Brief

## Objective

Turn the canonical project state into one reconstructible native timeline and a
grounded daily operating brief covering appointments, open loops, evidence,
prepared actions and receivables according to role.

## Allowed implementation

- add a deterministic server projection over existing canonical records;
- add strict role-specific API/mobile contracts;
- add native project timeline and daily brief surfaces;
- reuse Assistant commands for follow-up actions;
- add unit and disposable-PostgreSQL proof.

## Completion gate

- ordering, provenance and current status are deterministic after restart;
- no invented event or transcript-derived canonical fact;
- field workers receive no financial leakage;
- no provider, customer data, external transport or write;
- no schema, migration, dependency or lockfile change.
