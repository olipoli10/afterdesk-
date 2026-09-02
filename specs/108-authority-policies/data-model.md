# Data Model

## ConstructionAuthorityPolicySet

One immutable workspace policy version with `DRAFT`, `ACTIVE`, `SUPERSEDED` or
`REVOKED` status, semantic version, source hash, state version, creator,
activation/revocation facts and no external-effect fields.

## ConstructionAuthorityPolicyRule

Immutable rule belonging to one policy set. It carries the registered action
key, optional project/role/data-class scope, authority outcome, optional amount
ceiling in integer minor units, reason code and deterministic priority facts.

## ConstructionAuthorityEvaluation

One exact point-of-use result bound to workspace, actor, action definition
version, target scope, policy set/version, source fingerprint, payload hash,
expiry and outcome. It stores a minimized context summary, not raw rejected
sensitive payloads.

## ConstructionAuthorityDecision

Immutable exact approval or rejection for an `APPROVAL_REQUIRED` evaluation,
including expected versions, actor, decision hash and local effect count.

## ConstructionAuthorityRefusal

Immutable safe audit record for rejected preparation, activation, evaluation or
decision attempts. It stores operation kind, input hash, refusal code and actor,
never credentials or raw rejected payloads.

## ConstructionAuthorityOperation

Idempotent command ledger for policy draft, rule, activation and revocation
operations. It binds workspace/command identity to the exact command hash and
stored result so replay cannot mutate policy state twice.

## Invariants

- at most one active policy set per workspace;
- an active/superseded/revoked policy set and its rules are immutable;
- activation and revocation are workspace-serialized and exact-version bound;
- one evaluation per workspace/command identity and exact request hash;
- one decision effect per evaluation/version;
- registry guards can only tighten, never be weakened by workspace policy;
- unknown/conflicting/incomplete actions are prohibited;
- no external-effect-capable action is automatic;
- no field projection exposes rules, ceilings or protected context;
- no R28 row claims provider, transport, spend or external-write effect.
