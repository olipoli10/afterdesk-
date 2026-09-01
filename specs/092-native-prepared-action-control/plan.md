# R12 Plan — Native Prepared-Action Control Center

## Objective

Turn the mobile Actions surface into an exact human control center. Show the
recipient, channel, body, provenance and fingerprint before a decision; permit
only role-authorized approve, reject or revoke operations; preserve stable retry
after unknown outcomes; and make the absence of dispatch explicit.

## Allowed implementation

- add strict mobile action contracts, API adapter and attempt state;
- update the existing Actions screen without creating another outbox;
- refresh canonical cockpit state after every confirmed/replayed decision;
- add mobile contract/state tests and end-to-end disposable-PostgreSQL proof.

## Completion gate

- no decision is possible without exact visible content;
- double taps and unknown-outcome retries cannot duplicate a transition;
- owner/office permissions are honored and field workers see no controls;
- approved means `APPROVED_UNSENT`, never delivered;
- no provider, device transport, push, store, Preview or Production action.

