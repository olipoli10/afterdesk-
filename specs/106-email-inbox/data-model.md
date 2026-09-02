# R26 Data Model

## ConstructionEmailAccount

- workspace, provider kind (`GOOGLE_GMAIL` or `MICROSOFT_GRAPH`);
- opaque account and mailbox/folder scope references;
- local status, capability flags, opaque cursor hash/reference and version;
- `credentialStored=false`, `externalTransportEnabled=false` and revocation facts.

One active logical account per workspace/provider/account reference. It never
stores an address, token, OAuth grant or raw provider synchronization URL.

## ConstructionEmailEvent

- workspace/project/contact/account and canonical `ConstructionMessage` link;
- opaque provider message/thread references, direction and received timestamp;
- normalized sender/recipient references, subject/body and canonical content hash;
- resolution, verification, cursor and transport-disabled state.

The event identity and content hash are immutable. Exact replay returns the
original result; identity reuse with drift is refused.

## ConstructionEmailEvidenceLink

Links an email event or prepared draft to an existing admitted evidence record.
Workspace and project must match. The link retains evidence content hash and
role-safe label, not remote provider data.

## ConstructionEmailDraft

- exact To/Cc opaque contact references, subject, body, reply/thread reference;
- selected evidence links, version and canonical payload hash;
- `PREPARED_UNSENT` or `APPROVED_UNSENT`, approval actor/time;
- delivery count fixed at zero and external transport false.

## ConstructionEmailDecision

Immutable ledger of account preparation/revocation, event admission/refusal,
resolution, evidence link, draft preparation/approval and stale/replay refusal.
Includes actor/adapter provenance, state before/after, command fingerprint and
timestamp.

## State transitions

- Account: `NOT_CONFIGURED → PREPARED_DISABLED → SYNC_REQUIRED | REVOKED`.
- Event: `RECEIVED → APPLIED | CLARIFICATION_REQUIRED | REFUSED`.
- Draft: `PREPARED_UNSENT → APPROVED_UNSENT`; no delivered state exists in R26.
