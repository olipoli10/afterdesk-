# ADR: Authority V3 candidate-specific provider-free compatibility

Status: proposed design, ready only for independent design review

Date: 2026-08-21

Decision owner: Control Tower plus an independent security reviewer

Final design verdict: DESIGN_READY_FOR_INDEPENDENT_REVIEW

Execution state: executionAuthorized:false

## Reconciled authority and repository base

This design was written only after reconciling the current local authorities.

| Authority | Reconciled value |
| --- | --- |
| Engineering Factory worktree | C:\dev\nightlexicon-engineering-factory |
| Engineering Factory branch | codex/engineering-factory-devbench |
| Engineering Factory base commit | 50d862b9808cf962a439c538dbf2d26ca832f136 |
| Engineering Factory base tree | 90ab5fa9fc6477711cb1adb1fe51715b5ff159b0 |
| Engineering Factory state before design | tracked-clean, no Git lock |
| package-lock.json SHA-256 | 0B01B24159591440E08F8F78FAF3C6E17EF5CE293304B773651F69EC7F60A7CD |
| Canonical Brain | C:\dev\afterdesk-project-brain |
| Reviewer Brain starting commit | 51c344a01c6d7281c67211f0f7dbb1f5da7147ec |
| Reconciled Brain commit | 6f5ff39cfd53ec2d1c8e54453942c820a3bd661f |
| Reconciled Brain tree | 49183689d9eb1fcf4ccded8ba120d40404c97e07 |
| Brain state before design | tracked-clean, no Git lock |

The only Brain commit after the reviewer starting commit was
6f5ff39cfd53ec2d1c8e54453942c820a3bd661f, checkpoint(endvera): reconcile
operator story T044-T052. It changed ENDVERA state, handoff, roadmap, risk,
session-log and spec-manifest records. It did not change Engineering Factory
Authority or evidence artifacts and does not conflict with this design-only
mandate.

The original product checkout and HumanWorkUnit checkout contain pre-existing
untracked instruction/specification material. Those protected paths are outside
this lane and are preserved without inspection-driven edits. Model Gateway and
the inspected ENDVERA/EARN worktrees were tracked-clean.

## Decision

Define Authority V3 as a candidate-specific, provider-free, synthetic-fixture
compatibility authority. It is a design contract, not a runtime authority.

Authority V3 separates policy issuance, privileged enforcement, observation,
runtime orchestration, durable evidence, durable replay, and final approval.
No single process or signing identity may create the policy, operate the
candidate fixture, fabricate observer evidence, approve cleanup, and publish
PASS.

The current Authority V2 implementation and retained evidence remain historical
local evidence. The adversarial review supersedes their milestone verdict for
all future execution decisions:

- 0 of the claimed 18 mutations is accepted as an adversarial mutation of a
  real control;
- the retained v2 signature proves integrity under a self-created key, not
  independently anchored provenance;
- root-owned nftables inside rootless-container network namespaces proves only
  a narrow namespace ruleset, not runtime-owner inability to replace or bypass
  that namespace;
- current cleanup, observer, replay and evidence-resolution claims are
  insufficient for Authority V3.

Every execution and rehearsal remains NO-GO. The only permitted milestone is
AUTHORITY_V3_CANDIDATE_COMPATIBILITY_DESIGN_ONLY.

## Structural authorization ceiling

Every design example and every future pre-approval artifact starts with:

| Field | Required value in this milestone |
| --- | --- |
| executionAuthorized | false |
| syntheticFixtureExecutionAuthorized | false |
| realCandidateExecutionAuthorized | false |
| modelExecutionAuthorized | false |
| providerExecutionAuthorized | false |
| credentialsAuthorized | false |
| realCandidateInvocations | 0 |
| providerCalls | 0 |

Only syntheticFixtureExecutionAuthorized may become true, and only in a future
authority instance signed after a separate implementation review and an
explicit user authorization for one named synthetic fixture run. None of the
other booleans may become true under this schema or this ADR.

## Goals

1. Freeze a complete Authority V3 schema and gate registry before runtime code.
2. Make every required artifact resolvable and byte-verifiable.
3. Make observer provenance pre-anchored and independent from the supervisor.
4. Make replay prevention durable across process and machine restart.
5. Bind the exact runtime, namespaces, interfaces, routes, file descriptors and
   controller identities immediately before barrier release.
6. Require zero unclassified packet events and zero kernel-reported packet
   drops.
7. Require real-control mutations that alter source, binary, policy, privileged
   state, namespace, evidence bytes or durable ledger state.
8. Make cleanup externally verified and strictly precede any PASS publication.

## Non-goals

- No Authority V3 runtime, controller, observer, signer, ledger or fake CLI is
  implemented by this milestone.
- No WSL, Podman, container, network namespace, firewall, observer or candidate
  process is started or changed.
- No synthetic rehearsal is performed.
- No real Codex, Claude, model, provider SDK, provider endpoint, account,
  credential, prompt, output or client data is inspected or invoked.
- No claim is made that the design is feasible on the current host until the
  RED-first implementation and independent privileged review prove it.
- No Production, Preview, shared database, migration, install, push or
  deployment is authorized.

## Observed V2 defects that V3 must close

These are observed in the current source at the reconciled base, not inferred
from the old PASS label.

| Defect | V3 design response |
| --- | --- |
| Mutation runner flips fields in PASSING_CONTROL_OBSERVATION | Mutations alter a real source, binary, ruleset, namespace, process, artifact or durable ledger and must fail a named gate |
| Controller generates its own RSA key and signs its payload | Observer signer and policy signer are pre-anchored, separate identities whose public keys are pinned before the run |
| Enforcement is installed inside rootless-owned network namespaces | Root-owned enforcement namespace, immutable binding, runtime-owner edit challenge, namespace replacement detection and outer-boundary inventory are required |
| Host snapshot omits anonymous container namespaces | External snapshots enumerate every named and anonymous namespace and bind its inode, owner, interfaces, routes and rulesets |
| nft delete errors are ignored | Every deletion has an acknowledgment; any failure is fatal and prevents final cleanup attestation |
| Cleanup booleans can be constants | Cleanup claims derive from resolved before/after inventory objects and independent verifier signatures |
| PASS data can be assembled before final cleanup | PASS publication is a separate final state transition after external cleanup verification and evidence resolution |
| 629 of 1,072 events were unclassified | Zero unclassified events is mandatory; per-observer distributions and raw metadata-log hashes are retained |
| No PACKET_STATISTICS or kernel-drop proof | Every observer records buffer sizing, PACKET_STATISTICS availability and zero kernel drops |
| Authority resolves only a subset of asserted artifacts | A resolver manifest lists every required artifact, and verification reads and hashes every byte before approval |
| Replay ledgers are in-memory Sets | A local durable transactional ledger owns reservation, consume, recovery and concurrency state |
| Relay readiness can precede nft and observer readiness | Candidate and fake fixture barriers remain closed until firewall readback, observer readiness and final rebind all pass |

## Trust boundaries

### Components

1. Independent policy authority

   A pre-existing local authority identity issues the one-shot Authority V3
   envelope. It may read the approved design, source/tree hashes, compatibility
   snapshot and trust-root registry. It may create and sign the authority and
   reserve a nonce through the replay service. It may not start a runtime,
   install a firewall, observe packets, write run evidence, verify cleanup or
   publish PASS.

2. Pre-anchored observer and observer signer

   The observer service and signer become ready independently before durable
   nonce reservation. After the runtime creates closed, unconnected namespaces,
   the service attaches the exact per-interface capture set and signs a second
   capture-ready attestation before barrier release. Its binary, runtime,
   configuration, public-key fingerprint and signer identity are pinned in the
   issued authority. The signer holds a pre-existing, non-ephemeral key outside
   the run root. It signs service readiness, capture readiness, the ordered
   event-chain root, packet statistics and shutdown completeness. It may not
   issue policy, install or remove rules, operate Podman, approve cleanup or
   publish PASS.

3. Privileged enforcement controller

   The controller owns the host enforcement namespace, veth binding, nftables
   objects, block-before-kill switch and privileged cleanup. It may read the
   signed authority and runtime fingerprint. It signs controller readback with
   its distinct pre-anchored controller identity. It may not possess the
   observer private key, policy private key or final approver key and may not
   publish PASS.

4. Runtime supervisor

   The supervisor coordinates state transitions and consumes signed outputs.
   It may stage only approved fixture bytes, start the fake services and
   rootless runtime through exact profiles, hold/release the barrier and request
   teardown. It may not mint authority, edit firewall objects directly, sign
   observer evidence, alter the durable ledger, approve cleanup or publish
   PASS.

5. Rootless runtime owner

   The rootless runtime identity creates only the exact OCI objects permitted
   by the signed profile. It is explicitly untrusted. It may not access signer
   keys, policy storage, evidence storage, replay storage or privileged
   controller channels. It must be unable to add an interface, attach
   slirp/pasta/netavark/aardvark egress, replace the bound namespace, inherit a
   socket, edit nftables, mount the host, or change the OCI spec without a
   gate failure.

6. Untrusted synthetic fake CLI

   This is the only candidate-shaped process the future authority may ever
   permit. Its bytes are exact, deterministic and content-addressed. It receives
   only fake frames and may reach only the local relay tuple. It owns no
   authority, key, credential, provider SDK or runtime socket.

7. Fake relay, fake DNS and fake provider

   These are deterministic local fixtures. Each binary and configuration is
   content-addressed. The relay enforces one exact signed local route; fake DNS
   answers only the invalid-domain fixture; fake provider accepts only fake
   payloads. None may reach Windows, the Internet or a real provider.

8. Durable evidence store

   This append-only, local, immutable store accepts content-free artifacts by
   expected hash and create-only path. It exposes resolution and byte-read
   operations to verifiers. It does not decide gates and cannot sign policy,
   observation or approval.

9. Durable replay ledger

   A separate local transactional service owns nonce reservation, lease,
   consume and recovery. The supervisor receives signed receipts, not direct
   write access. The ledger is not a Production or shared database.

10. Independent reviewer and final approver

    The reviewer verifies the authority signature, resolved evidence,
    observer/controller signatures, gate sequence, mutation evidence and
    external cleanup proof. Only the final approver identity may sign the
    review decision that permits a synthetic PASS publication. The reviewer
    cannot retroactively authorize a run that lacked prior
    syntheticFixtureExecutionAuthorized:true.

### Explicit non-trust

- The runtime supervisor is not trusted to report its own readiness.
- The controller is not trusted to attest observer completeness.
- The observer is not trusted to attest firewall correctness.
- The rootless runtime owner and fake CLI are hostile.
- A local filesystem path, hash string, PID, container name, boolean or exit
  code is not evidence unless its producer, resolver, bytes and signature are
  bound.
- Wall-clock time alone is not trusted for ordering.
- WSL root, the WSL kernel and the Windows host are not independent of one
  another. Host or kernel compromise is outside the achievable local proof and
  invalidates the entire run.

## Artifact authority matrix

Legend: C=create, R=read/resolve, S=sign, V=verify, M=mutate, D=delete. A dash
means forbidden.

| Artifact | Policy authority | Observer signer | Controller | Supervisor | Runtime owner / fake CLI | Evidence store | Replay ledger | Reviewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authority V3 envelope | C/S | R | R/V | R/V | - | C-once/R | receipt only | R/V |
| Trust-root registry | R | R | R | R | - | R | - | C/S/V outside run |
| Replay reservation/consume events | request | - | receipt R | receipt R | - | receipt C-once/R | C/M/S | R/V |
| Candidate compatibility snapshot | R/hash | - | R | R/V | read-only projected bytes | C-once/R | - | R/V |
| OCI/runtime profile | R/hash | - | R/V | C request only | runtime owner consumes exact profile | C-once/R | - | R/V |
| Host enforcement namespace/rules | - | observe R | C/R/M/D/S readback | request only | forbidden | snapshots C-once/R | - | R/V |
| Observer raw metadata log | - | C/R/S chain | no content access | receipt only | - | C-once/R | - | R/V |
| Observer summary/statistics | - | C/S | R | R/V | - | C-once/R | - | R/V |
| Runtime stdout/stderr metadata | - | - | - | C reduced counters only | produces raw ephemeral bytes | content-free projection C-once | - | R/V |
| Cleanup inventory/acknowledgments | - | shutdown S | C/D/S own actions | request/read | no delete authority | C-once/R | - | R/V |
| External cleanup verification | - | R | R | R | - | C-once/R | - | C/S/V |
| Final review decision | - | - | - | R | - | C-once/R | consume receipt R | C/S |
| Synthetic PASS pointer | - | - | - | proposal only | - | C-once after gate | final state R | S/approve |

The durable evidence store creates storage objects but does not author their
semantic contents. Producer and storage identities are both retained.

## Failure domains and fail-closed behavior

| Failure domain | Required detection | Required response |
| --- | --- | --- |
| Supervisor compromise | sequence, signature, barrier or resolved-artifact mismatch | keep barrier closed or trip kill switch; consume nonce as failed; no PASS |
| Controller compromise | controller signature mismatch, forbidden state, observer/controller disagreement, mutation gate | block all traffic, tear down, mark controller-compromise-suspected |
| Observer compromise | signer mismatch, chain gap, unclassified event, drop counter, missing interface or shutdown proof | block before kill; quarantine all run evidence |
| Runtime-owner compromise | namespace, OCI, process, cgroup, interface, route, FD or helper drift | immediate block-before-kill and fatal teardown |
| WSL kernel or Windows host compromise | cannot be independently disproved locally | invalidate proof; final reviewer must refuse |
| Concurrent run | durable one-shot lease or controller namespace collision | second run refused before staging; first run remains isolated |
| Restart or replay | boot ID, durable reservation and prior consume event | recover to failed/consumed; never re-release barrier |
| Partial cleanup | missing deletion acknowledgment or before/after mismatch | no final cleanup attestation and no PASS |
| Evidence-store failure | create, fsync, resolve or byte-verify failure | block/kill if active; nonce failed; no PASS |
| Signer substitution | trust-root fingerprint or key epoch mismatch | refuse before observer readiness or approval |
| Clock failure | invalid wall/monotonic relationship, rollback or unavailable source | refuse issuance or stop active run |
| Namespace replacement | inode or owner changes at prebind, rebind or continuous monitor | block-before-kill; record drift; no PASS |
| Replay-ledger corruption/unavailability | integrity check, monotonic sequence or transaction failure | authority issuance and barrier release refused |
| Cleanup verifier compromise | reviewer key mismatch or verifier binary/config mismatch | final approval refused |

## Enforcement topology

The future implementation must not treat a rootless container namespace as the
outer firewall boundary. The required topology is:

1. A controller-owned host enforcement namespace in the initial WSL user
   namespace, with no unmanaged interface and no default route.
2. Controller-created veth links from the exact candidate, relay, fake DNS and
   fake provider namespaces into that enforcement namespace.
3. Deny-by-default nftables base chains in the controller-owned namespace and
   narrow defensive tables inside each workload namespace.
4. The candidate runtime starts with network none. The rootless owner does not
   create the authorized network path; the privileged controller attaches the
   exact path after namespace fingerprinting.
5. Candidate-to-relay, relay-to-fake-DNS and relay-to-fake-provider are the only
   allowed routes. There is no physical, Windows, Internet, metadata, host
   gateway, provider, default or unmanaged route.
6. slirp, pasta, netavark, aardvark and runtime sockets are explicitly absent or
   content-addressed and bound as required components. A helper appearing or
   changing is fatal.
7. Immediately before barrier release, controller and observer independently
   re-read namespace inodes, interfaces, routes, rulesets, OCI spec, process
   tree, cgroup, FDs and sockets.
8. A separately controlled outer Windows/WSL egress deny must prevent a
   transient rootless slirp/pasta helper from using the ordinary WSL uplink
   between drift-monitor samples. Its exact mechanism, identity and normalized
   rule objects must be approved and mutation-proved before rehearsal. Process
   monitoring alone is not a packet firewall.

If the future host cannot implement this topology or independently prove that
the rootless runtime owner cannot create a bypass, implementation must stop.
The design does not permit replacing that proof with a boolean assertion.

## Key custody and provenance

- Policy, observer, controller and final-approver keys are four distinct
  pre-existing identities.
- Public keys, algorithms, key IDs, validity intervals and rotation epochs are
  pinned in a reviewer-owned trust-root registry before nonce reservation.
- Private keys are never generated inside a run, never stored in a run root and
  never returned to the supervisor.
- A key rotation is a separate signed registry transition that names the old
  and new key, effective authority generation and independent approval. An
  unannounced new key is substitution, not rotation.
- The observer signs readiness before candidate staging, then signs an ordered
  hash-chain root and shutdown record.
- The controller signs exact enforcement readbacks and deletion
  acknowledgments.
- The final approver signs only after all artifacts resolve and external cleanup
  verification is complete.

The concrete implementation target is separate Windows-host signer services
using non-exportable persisted Windows CNG keys under distinct local service
identities. The WSL run root never contains those private keys. A signer service
accepts only typed, bounded, content-free digest receipts over an authenticated
one-shot channel created by its independent launcher. Whether that channel and
process measurement are strong enough is an independent implementation-review
gate; a plain pipe owned by the supervisor is insufficient.

## Durable evidence-store decision

The concrete implementation target is a Windows-host evidence-store broker
under a local service identity distinct from supervisor, controller, signer and
reviewer identities. It stores content-addressed objects in a dedicated NTFS
directory outside every repository, WSL mount and run root. Producers receive a
write-once submission handle, never filesystem mutation or delete access.

For each object the broker must use create-new semantics, write-through,
FlushFileBuffers, a directory/index durability barrier, exact readback, then an
ACL transition that removes producer write/delete rights. It appends a
hash-chained store receipt and refuses replacement of an existing object ID.
The final resolver opens objects through the broker under a separate read-only
identity. Host-administrator compromise remains outside the proof and
invalidates it; ordinary supervisor or WSL-root compromise must not grant store
mutation.

This is a design selection only. It does not authorize creating a service,
account, directory or evidence object in this milestone.

## Durable replay and concurrency decision

The implementation target is a local, single-host transactional ledger owned by
the independent policy authority. SQLite 3 is the selected candidate mechanism
for the implementation specification because BEGIN IMMEDIATE, unique
constraints, FULL synchronous durability and an append-only event table can
provide atomic reservation across processes. This ADR authorizes no database
creation or code.

Required logical tables are:

- ledger_meta: schema version, ledger UUID, last sequence, last verified hash;
- nonce_current: nonce hash, authority generation, state, boot ID, lease ID,
  owner identity, issued/expires times, monotonic issuance value and final
  event sequence;
- nonce_events: append-only sequence, prior hash, event hash, nonce hash,
  transition, wall time, monotonic time, boot ID, actor key ID and signed
  receipt hash;
- run_leases: unique active lease for the declared concurrency domain.

Allowed nonce transitions are:

ISSUED to RESERVED to CONSUMED_PASS, CONSUMED_FAIL or EXPIRED.

After RESERVED, a crash or boot-ID change may recover only to CONSUMED_FAIL.
There is no transition back to ISSUED and no barrier release from a recovered
lease. A reservation transaction atomically appends the event, updates current
state and acquires the unique concurrency lease. A final transaction appends
the consume event and releases the lease. Ledger unavailable, corrupt,
unfsynced or unverifiable means refusal.

## Consequences

- Authority V3 is larger and operationally more expensive than V2.
- A local synthetic run can remain blocked even after all code exists if the
  host cannot prove runtime-owner containment or independent observation.
- Evidence size increases because normalized rulesets, inventories,
  per-observer distributions and resolver metadata are retained.
- Cryptographic integrity becomes meaningful provenance only when keys are
  pre-anchored and custody is separated.
- The compatibility result can certify only the deterministic fake CLI contract
  at one exact source/runtime snapshot. It cannot certify a real client.
- Design completion is never execution authority.

## Related specifications

- AUTHORITY_V3_SCHEMA_SPEC.md
- AUTHORITY_V3_CONTROL_GRAPH_AND_MUTATIONS.md
- AUTHORITY_V3_FAKE_CLI_IMPLEMENTATION_AND_REVIEW.md
- AUTHORITY_V3_CANDIDATE_COMPATIBILITY_SCHEMA_EXAMPLE.json

## Decision record

DECISION: adopt this document as the proposed Authority V3 design for
independent review only.

UNKNOWN: whether the current Windows/WSL host can satisfy the outer enforcement,
pre-anchored signer and runtime-owner non-bypass gates. Only a separately
authorized implementation and privileged review can answer this.

PROHIBITION: no implementation or execution may be inferred from
DESIGN_READY_FOR_INDEPENDENT_REVIEW.
