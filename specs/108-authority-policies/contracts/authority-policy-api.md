# Authority Policy API Contract

## Commands

- `CREATE_POLICY_DRAFT`: owner-only, stable command ID, optional exact source policy version.
- `UPSERT_DRAFT_RULE`: owner-only, exact draft state version and registered action key.
- `ACTIVATE_POLICY_SET`: owner-only, exact set version and complete policy hash.
- `REVOKE_POLICY_SET`: owner-only, exact active version; returns to fail-closed baseline.
- `EVALUATE_ACTION_AUTHORITY`: server-side internal boundary with exact registered action context.
- `DECIDE_AUTHORITY_EVALUATION`: authorized exact approve or reject for `APPROVAL_REQUIRED` only.

## Queries

- `GET_POLICY_COCKPIT`: role-safe active version, drafts and pending decisions.
- `GET_AUTHORITY_EVALUATION`: exact role-safe evaluation inspection.

## Mandatory response fields

Every result includes schema version, workspace, stable command/evaluation ID,
policy-set ID/version, action key/version, payload hash, outcome/status,
replayed, `externalTransportPerformed=false`, `externalWritePerformed=false`
and `providerEffectCount=0`.

## Refusal contract

Unknown keys/fields, stale versions, mismatched hashes, missing context,
unregistered actions, cross-workspace resources and unauthorized roles fail
closed with a stable refusal code. The refusal ledger records only operation
kind, input hash, code, workspace and authorized actor identity.
