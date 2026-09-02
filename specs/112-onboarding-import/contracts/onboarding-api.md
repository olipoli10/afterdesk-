# R32 Onboarding API Contract

Private endpoint: `/api/endvera/v1/mobile/onboarding`

## GET

Returns the current strict role projection. Owner/office projection includes
session stage, first-value readiness, canonical project/contact summaries,
active batch summary and next action. Field projection includes only assigned
workspace/project invitation state and no import controls or coordinates.

Headers: authenticated, `Cache-Control: private, no-store`.

## POST command actions

- `INITIALIZE_WORKSPACE`
- `CREATE_FIRST_PROJECT`
- `CREATE_FIRST_CONTACT`
- `PREVIEW_IMPORT`
- `DECIDE_IMPORT_ROW`
- `COMMIT_IMPORT`
- `DISCARD_IMPORT`
- `COMPLETE_ONBOARDING`

Every command carries schema version and stable `commandId`. Workspace commands
carry exact `workspaceId`; preview carries import kind and CSV text; decisions
carry batch/row/version; commit carries batch/version/source/preview hashes.

The server derives actor, role, completion and canonical matches. Exact retry
returns the immutable prior result. Collision, stale version, unsupported
column/decision, cross-workspace reference or changed canonical conflict
refuses. The endpoint performs no provider or external action.

Row decisions are a closed union: `SKIP`, safe `CREATE_NEW`, or `USE_EXISTING`
with one server-issued exact same-workspace candidate identifier. A caller may
not request overwrite, merge or provide an arbitrary canonical identifier.
