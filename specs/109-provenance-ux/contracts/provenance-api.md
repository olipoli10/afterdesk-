# Protected Project Provenance API

## Read

`GET /api/endvera/v1/mobile/provenance?workspaceId=<id>&projectId=<id>`

- authenticated, verified `CLIENT` session;
- active Construction membership rechecked server-side;
- project reloaded under the same workspace;
- private, no-store response;
- owner/office or field-worker schema selected server-side.

## Closed entry kinds

`FACT`, `INFERENCE`, `DECISION`, `ACTION`, `HUMAN_RESULT`, `VERIFIED_STATE`.

## Invariants

- no request-provided role;
- no cross-workspace or cross-project result;
- no LLM-generated statement;
- unknown database enum or malformed canonical JSON refuses the projection;
- field response recursively excludes protected keys;
- this endpoint performs no mutation and no external effect.
