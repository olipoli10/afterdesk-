# R14 Plan — Native Evidence Intake

## Objective

Connect the native client to the existing secured evidence contracts so an
authorized user can select a local photo or document, bind it to the exact
workspace/project and prepare durable evidence intake without mailbox, cloud
drive, provider or customer data.

## Allowed implementation

- reuse existing selected-evidence validation and storage boundaries;
- add strict metadata, size, type and project-binding contracts;
- add a native project evidence surface with stable retry and clear status;
- preserve original evidence provenance and role isolation;
- add unit and disposable-PostgreSQL proof.

## Completion gate

- malformed, oversized, ambiguous and cross-workspace material fails closed;
- retry cannot duplicate canonical evidence;
- field-worker financial details remain hidden;
- no mailbox, provider, OAuth, external transport or store release;
- no new dependency unless separately justified and authorized.
