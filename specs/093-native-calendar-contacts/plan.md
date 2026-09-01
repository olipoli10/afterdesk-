# R13 Plan — Native Calendar and Contacts Cockpit

## Objective

Expose canonical project contacts and calendar items in dedicated native
iOS/Android surfaces while retaining the existing conversational command path.
Every item remains workspace-scoped, role-projected and grounded in PostgreSQL.

## Allowed implementation

- extend the shared role-safe cockpit with a bounded contact directory;
- add strict mobile contact/calendar contracts;
- add native Calendar and Contacts routes and navigation;
- reuse the R9 Assistant for appointment, clarification and rescheduling commands;
- add unit and disposable-PostgreSQL proof.

## Completion gate

- authorized users see the correct project, contact and calendar identities;
- field workers receive no private phone or email fields;
- ambiguous commands remain consequence-free;
- no Google OAuth, provider, external write or transport;
- no schema, migration, dependency or lockfile change.
