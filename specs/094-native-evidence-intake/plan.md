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
- extend the existing mobile permission envelope with `canAddEvidence` while
  preserving every prior role and transport invariant;
- preserve original evidence provenance and role isolation;
- add unit and disposable-PostgreSQL proof.

## Native picker dependency decision

The installed Expo client has no native document/photo picker. A pasted URI or
technical file identifier would violate the contractor experience and would not
prove native evidence intake. R14 therefore authorizes the official
`expo-document-picker` module at the Expo SDK-compatible version, and only that
dependency. It grants access solely to files the user explicitly selects; it
does not grant gallery, mailbox, cloud-drive or whole-device access.

## Completion gate

- malformed, oversized, ambiguous and cross-workspace material fails closed;
- retry cannot duplicate canonical evidence;
- field-worker financial details remain hidden;
- no mailbox, provider, OAuth, external transport or store release;
- exactly one justified Expo-compatible picker dependency; no other dependency
  or lockfile drift.
