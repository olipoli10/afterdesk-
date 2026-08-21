# ADR: Authority V3 candidate compatibility design revision R3

Status: proposed R3 design; independent review required

Date: 2026-08-21

Decision owner: Control Tower plus independent security review

Design verdict: `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R3`

Execution state: `executionAuthorized:false`

## 1. Reconciled authority and repository base

This revision started only after the following state was observed clean.

| Authority | Observed value |
| --- | --- |
| Engineering Factory worktree | `C:\dev\nightlexicon-engineering-factory` |
| Engineering Factory branch | `codex/engineering-factory-devbench` |
| Engineering Factory R3 frozen base | `db26064df0de743eb757cb71f2be56dd5ff346ad` |
| Engineering Factory R3 frozen tree | `e1ee4b23328d94e22dfada0f3865f5ff69a1d258` |
| Canonical Brain | `C:\dev\afterdesk-project-brain` |
| Independent R2 review checkpoint | `462c1384a4abcbf4fd890e19b4e81865d2dc1627` |
| Brain observed commit | `2398f95ed6647edbc41cc5661b93e15d89a91af1` |

Both repositories were tracked-clean before R3. The Brain authorizes this R3
design correction but does not authorize a candidate, provider, privileged
host mutation, WSL networking change, TPM provisioning or PASS publication.

## 2. R2 RED record and R3 decision

The independent verdict `DESIGN_NEEDS_REVISION_R3` is accepted. Before any R3
correction, the frozen R2 package had these five observed RED defects:

1. `PREPARED` existed only inside the SQLite transaction that remained open
   while the TPM counter advanced, so the promised crash-recovery bytes were
   not durably committed.
2. the 24 gate decision components used prose aliases that did not resolve to
   the closed role registry;
3. M35 allowed a compromised cleanup verifier to certify its own false
   equivalence;
4. P0-P5 manifests allowed generic producer and signer selection rather than
   phase-bound ownership; and
5. TPM NV public/provisioning and D4/P5 crash finalization were incomplete.

R3 replaces each of those structures rather than relabeling R2.

| Observed finding | R3 decision |
| --- | --- |
| The executable JSON Schema does not enforce the prose invariants | Replace the monolith with five versioned document schemas plus a mandatory deterministic semantic validator. |
| The resolver manifest requires review and PASS before those artifacts exist | Replace the future-dependent manifest with six ordered phase roots. A manifest contains only artifacts already produced in that phase. |
| The ledger can be restored from a valid backup or copied to another machine | Bind every committed ledger event to a non-migratable TPM machine anchor whose generation and head hash are outside disk backup state. |
| TPM can advance while `PREPARED` is uncommitted | Split disk prepare and TPM publication into two committed SQLite transactions; the TPM step never begins until a post-commit readback proves the exact prepare bytes durable. |
| Gate aliases and self-attestation | Bind every gate to exact producer and acceptor role tokens; the acceptor resolves to a distinct OS identity, binary and key for every security-critical claim. |
| Generic phase ownership | Freeze P0-P5 producer, signer, acceptor, predecessor and terminal transition in schema plus semantic validation. |

R3 does not weaken the claim. It narrows it to the exact proposition that can
eventually be proved:

> One exact deterministic fake CLI fixture completed one exact provider-free
> compatibility protocol under one issued authority, with external containment,
> independent observation, durable cleanup evidence, independent review and a
> non-reusable nonce.

It never proves compatibility with Codex, Claude, a model or a provider.

## 3. Five document families

All document schemas have version `3.3.0`. Their schema IDs are immutable.

| Order | Kind | Schema ID | Producer | First consumer |
| --- | --- | --- | --- | --- |
| D0 | `authority-v3-static-design` | `urn:endvera:ef:authority-v3:static-design:3.3.0` | design authority | design reviewer |
| D1 | `authority-v3-issued-run-authority` | `urn:endvera:ef:authority-v3:issued-run-authority:3.3.0` | policy authority | admission verifier |
| D2 | `authority-v3-post-run-evidence` | `urn:endvera:ef:authority-v3:post-run-evidence:3.3.0` | evidence assembler | evidence resolver |
| D3 | `authority-v3-independent-review-decision` | `urn:endvera:ef:authority-v3:independent-review-decision:3.3.0` | independent reviewer and final approver | replay ledger and PASS publisher |
| D4 | `authority-v3-final-pass-publication` | `urn:endvera:ef:authority-v3:final-pass-publication:3.3.0` | PASS publisher through evidence broker | result reader |

There is no polymorphic runtime document. A verifier is invoked with one
expected schema ID and refuses every other ID, version or kind. D0 has every
authorization boolean false. D1 is the only family that can ever contain
`executionAuthorized:true` and `syntheticFixtureExecutionAuthorized:true`, and
only after a new explicit one-shot user authority. D2-D4 contain
`furtherExecutionAuthorized:false`. Every family keeps real candidate, model,
provider and credential authority false and counters at zero.

## 4. Authorization ceiling

The R3 package and its embedded example have these exact values:

| Field | Value |
| --- | --- |
| `executionAuthorized` | `false` |
| `syntheticFixtureExecutionAuthorized` | `false` |
| `realCandidateExecutionAuthorized` | `false` |
| `modelExecutionAuthorized` | `false` |
| `providerExecutionAuthorized` | `false` |
| `credentialsAuthorized` | `false` |
| `realCandidateInvocations` | `0` |
| `providerCalls` | `0` |

An executable D1 schema is part of the design, but no D1 instance is issued by
this milestone. Possession of D0, source code, tests, a signer, a ledger or an
old Authority V2 artifact is never authorization.

## 5. Trust and role separation

### 5.1 Authoritative roles

R3 names eighteen authoritative components:

1. design authority;
2. trust-registry maintainer;
3. policy authority;
4. replay ledger and TPM-anchor broker;
5. Windows outer-deny controller;
6. WSL enforcement controller;
7. observer service;
8. observer signer;
9. barrier authority;
10. runtime supervisor;
11. evidence broker;
12. evidence resolver;
13. semantic validator;
14. evidence assembler;
15. external cleanup verifier;
16. independent reviewer;
17. final approver;
18. PASS publisher.

The rootless runtime owner, fake CLI,
fake relay, fake DNS and fake provider are untrusted subjects, not authorities.

Every authoritative binding has a unique Windows SID or Linux UID/service
identity, unique key ID, unique executable SHA-256 and unique configuration
SHA-256. Sharing any one of OS identity, key identity or binary identity across
two authoritative roles is a normative failure. A shared interpreter or
multi-role service process is forbidden. The semantic validator returns
`E_ROLE_OS_REUSE`, `E_ROLE_KEY_REUSE` or `E_ROLE_BINARY_REUSE` before issuance.

No authoritative private key is generated in a run root, repository, WSL
filesystem or evidence root. Policy, observer, controller, cleanup, reviewer,
approver, ledger-anchor and publisher keys are pre-existing non-exportable CNG
or TPM keys under their distinct service identities.

### 5.2 Trust-root registry

The reviewer-owned registry maps exactly one active key to each signing role and
maps every document/artifact kind to an exact schema ID, producer role and
signer role. It includes registry generation, prior registry hash, key epoch,
validity interval, revocations, schema byte hashes and the TPM registry-anchor
receipt. D1 pins the exact registry generation and hash.

Rotation is valid only when a transition is signed by the old key, new key,
registry maintainer and final approver before its effective generation. A
revoked key is invalid at and after `effectiveAnchorGeneration`. Emergency
compromise recovery requires two offline recovery keys plus the final approver,
revokes every affected generation, consumes every outstanding nonce as failed
and starts a new ledger ID. It cannot rehabilitate an old PASS.

## 6. Exact signed bytes and parsing

All signed payloads use UTF-8 without BOM and RFC 8785 JSON Canonicalization
Scheme, profile `JCS-IJSON-INT53-R3`: duplicate keys forbidden, Unicode scalar
values only, no NaN/Infinity, integers only, and integers restricted to the
exact range `[-9007199254740991, 9007199254740991]`. Timestamps are UTC with
exactly three fractional digits.

Duplicate-key detection is performed by a raw-token scanner before ordinary
JSON parsing. A parse tree created before that scan is never trusted. The
canonical bytes must equal the submitted payload bytes byte-for-byte.

The signature preimage is exactly:

```text
ASCII("EF-AUTHORITY-V3-R3\0")
|| UINT32_BE(length(UTF8(schemaId)))
|| UTF8(schemaId)
|| UINT64_BE(length(canonicalPayloadBytes))
|| canonicalPayloadBytes
```

Signatures are `ECDSA_P256_SHA256_IEEE_P1363`; the signature is exactly 64 raw
bytes encoded as unpadded base64url. A signed envelope keeps `payload` and
`signatures` separate so a signature never signs itself.

Network schema retrieval is forbidden. The verifier receives an expected
schema ID from its compiled admission point, looks up the exact schema SHA-256
in the pre-anchored registry, loads only those local bytes, and requires exact
`schemaId`, `schemaVersion` and `kind`. Unknown IDs, aliases, older versions,
`$ref` redirection and kind/schema mismatches fail with
`E_SCHEMA_CONFUSION_OR_DOWNGRADE`.

## 7. Mandatory semantic validation

JSON Schema enforces local shape, constants, typed arrays and conditional
document variants. Cross-document, cryptographic, ordering, uniqueness and
state invariants are enforced by `EF-AUTHORITY-V3-SEMVAL` version `3.3.0`.
Schema success without semantic success is invalid.

The validator input is: raw document bytes, expected schema ID, compiled-schema
hash, pre-anchored registry bytes, current TPM anchor quote, current
machine/boot binding, prior phase root and resolver access to every referenced
artifact byte. Output is one canonical signed validation report containing
input hashes, validator binary/config hashes, ordered checks, ordered error IDs,
`valid`, and exit code. Exit `0` means valid, `64` means normative refusal and
`70` means validator/internal dependency failure; exit 70 also fails closed.

The exact checks and error IDs are specified in
`AUTHORITY_V3_SCHEMA_SPEC.md`. At minimum they enforce authorization constants,
state transitions, gate/verdict consistency, role separation, trust roots,
signature preimages, one-producer ordering, cleanup-before-review,
review-before-PASS, ledger/anchor state and the prohibition on relabeling any
synthetic evidence as real authority.

## 8. Acyclic evidence protocol

R3 uses six append-only phase manifests. A manifest is produced only after all
artifacts it lists exist and is never edited. It contains no expected future
artifact.

| Phase | Root | Contains | Must not contain |
| --- | --- | --- | --- |
| P0 | `designRoot` | D0, schema bundle, semantic-validator contract, gate/mutation registries | run artifacts |
| P1 | `issuanceRoot` | trust registry snapshot, D1, policy signature | reservation, runtime or future evidence |
| P2 | `admissionRoot` | service-ready, TPM reserve/lease, source/runtime binding, outer deny, firewall, capture-ready, final rebind and barrier receipts in production order | post-run, review or PASS |
| P3 | `postRunRoot` | observer logs/statistics/shutdown, block/kill, teardown, typed deletions, external cleanup, broker seal and D2 | review or PASS |
| P4 | `reviewRoot` | resolved P0-P3 roots, semantic reports, D3 and dual review/approval signatures | PASS |
| P5 | `publicationRoot` | review root, TPM-anchored `CONSUMED_PASS` receipt and D4 | any new run authority |

Each root signs the prior root hash. P0 has `runId:null`; P1-P5 bind the exact
D1 run ID. Each artifact reference declares one producer and one or more typed
expected consumers. Each later phase records typed consumption receipts with a
strictly greater sequence. The issued authority contains an
expected-kind registry, not references to future bytes. The semantic validator
rejects a missing producer, multiple producers, consumption at or before the
production sequence, an unreachable producer root or any root cycle. A
same-phase consumption is valid only when its producer already exists at a lower
sequence, so mutual same-phase dependency is impossible.

If the final approver is unavailable before the D1 expiry, no D3 or D4 is
created. The ledger anchor broker appends `CONSUMED_FAIL` under the expiry
transition, releases the lease and emits a failure receipt in a failure-only
phase record. It may not retry with the same nonce.

## 9. Rollback-resistant replay and concurrency

SQLite remains only the transactional disk journal. It is not the replay trust
root. The authoritative external state is a TPM 2.0 NV monotonic counter plus
two alternating fixed-size NV head slots outside disk/backup state. The slots
hold `ledgerId`, `machineIdHash`, counter generation, event-head hash and the
non-migratable ledger signing-key name. The current head is the highest valid
quoted slot whose generation equals the counter.

Every ledger transition uses two SQLite transactions separated by the TPM
operation. No SQLite transaction is held across TPM I/O.

1. **T1 PREPARE.** `BEGIN IMMEDIATE`; verify the committed disk head equals a
   fresh TPM quote; reserve the unique `(nonceHash, authorityGeneration)` and
   concurrency-domain lease; insert one immutable `anchor_prepared` row and one
   `nonce_events` row with `commit_state=PREPARED`; commit T1.
2. **Durability proof.** With no transaction open, call
   `sqlite3_wal_checkpoint_v2(..., SQLITE_CHECKPOINT_FULL, ...)`, require zero
   busy frames, fsync the database file and containing directory, reopen the
   database read-only through a new handle and verify the complete canonical
   prepare record, event hash, prior head, expected generation and idempotency
   key. Only the hash of these committed bytes may enter the TPM step.
3. **TPM advance.** Compare the quoted counter to `n`, increment the counter to
   `n+1`, write the inactive A/B head slot for `n+1`, read back both NV public
   areas and slot bytes, then quote counter plus slots. Any uncertainty after
   increment enters recovery; it never retries an increment blindly.
4. **T2 FINALIZE.** `BEGIN IMMEDIATE`; compare-and-swap the one PREPARED row by
   `transaction_id`, `expected_generation`, `prepared_event_hash` and prior
   disk head; store the verified quote receipt, mark the event `COMMITTED`,
   publish the new disk head and commit T2. A second T2 is idempotent only when
   every resulting byte and quote hash is already identical.
5. **Post-commit acceptance.** The semantic validator, under a different role,
   reopens the ledger and verifies disk head, TPM public names, counter, slots,
   quote and the transition receipt before any later gate can consume it.

Authoritative recovery bytes are the committed T1 rows: ledger ID, machine and
key names, nonce/authority generation, lease and concurrency domain, transition,
prior event/head hashes, prepared event hash, expected TPM generation,
transaction ID, intended terminal disposition and canonical-byte hash. A WAL
frame that was written but not committed is never authoritative.

Recovery accepts only the total rows in the R3 crash matrix. The important
cases are: a committed and durably proven PREPARED with TPM still at `n` is an
orphan that must complete that exact prepared transition to `n+1` and then use
a separate anchored transition to consume the active run as failed; a committed
PREPARED with TPM at `n+1` and an old or new slot completes that same
transaction, publishes the missing slot if required, then likewise anchors the
failure transition; a fully matching committed transition is returned
idempotently. If the durability proof cannot be completed, recovery halts
without changing TPM or claiming a burn. Missing prepare bytes,
multiple PREPARED rows, a gap above one, wrong NV public name, contradictory
slot, foreign machine or unknown state is permanent fail-closed corruption. A
restored valid backup is rejected with `E_LEDGER_BACKUP_RESTORE`; a cross-machine
copy is rejected with `E_LEDGER_CROSS_MACHINE_COPY`.

Nonce/evidence generation is bound to the unique tuple `(ledgerId, nonceHash,
authorityGeneration, transactionId, expectedGeneration)`. That tuple is never
deleted or reused. `CONSUMED_PASS` and `CONSUMED_FAIL` are terminal and have
unique partial indexes preventing a second terminal event or a second D4
publication receipt.

Reservation, nonce state and the unique concurrency-domain lease change in one
transaction and one TPM anchor advance. `RESERVED` never returns to `ISSUED`.
A crash, boot-ID change, lease expiry, approver timeout or uncertain commit
recovers only to `CONSUMED_FAIL`. Compromise recovery creates a new ledger ID
through the trust-registry emergency transition and leaves an anchored tombstone
for the retired ledger.

## 10. Containment, observation and evidence decisions

### 10.1 Outer Windows/WSL deny

Before a future WSL distribution or risky helper can start, a separate Windows
outer-deny controller must install persistent boot-time WFP block filters at
ALE authorization and outbound transport layers for IPv4 and IPv6, bound to the
dedicated WSL VM/vNIC/compartment identifiers. A Hyper-V firewall default
outbound block is required as defense in depth. No allow filter exists because
all fake traffic remains inside controller-created WSL namespaces.

The BFE/WFP provider, sublayer GUIDs, filter IDs, weights, conditions, vNIC GUID,
compartment, Hyper-V policy and normalized Windows route/DNS inventory are
signed and read back before WSL start and again immediately before barrier
release. If the boot-time filter cannot precede WSL networking, the host is
ineligible. Process monitoring is not an outer firewall.

### 10.2 Inner topology and drift

The WSL controller creates a no-uplink enforcement namespace first, with nft
base chains already default-drop, then creates workload namespaces with
`network=none`. Each veth remains down and unaddressed until its observer is
attached. Exact nft family/hook/priority/policy bindings are defined in the
control-graph specification. There is no default, Windows, metadata, loopback
cross-namespace, link-local, multicast, IPv6, mapped-address, NAT64, DNS,
provider or unmanaged route.

slirp, pasta, netavark, aardvark, runtime shims, netlink, eBPF, procfs, sysfs,
devices, mounts, inherited FDs/sockets and namespace membership are exact bound
sets. Any new object or inode change trips an atomic controller operation that
first replaces all Windows and WSL allow paths with counted deny, verifies the
deny readback while the target cgroup is alive, and only then kills it.

### 10.3 Observer

The observer service and signer identities are distinct and pre-pinned. Netlink
observation begins before the first connected interface is created. Capture is
attached while each link is down, before address assignment or `UP`. The signed
capture-ready set is the exact interface/direction set derived from readback.

Pristine success requires zero kernel drops, zero sequence gaps and zero
unclassified events. Mutation M16 intentionally requires at least one
kernel-reported drop while keeping unclassified events zero. Mutation M17
requires exactly one unclassified event and zero kernel drops. Neither mutation
can PASS. Exact packet rates, sizes, burst, duration, CPU and memory envelopes
are in the control-graph specification. Every AF_PACKET socket must return
`PACKET_STATISTICS`; unavailable statistics are not zero.

### 10.4 NTFS evidence broker

The broker uses create-new, non-inheritable handles and validates the final path
by opened handle, volume GUID, 128-bit file ID, link count, reparse tag and stream
inventory. It refuses junctions, symlinks, hard links, alternate streams,
cross-volume paths and file-ID changes. The exact DACL/SACL/owner/service SID,
share modes, write/flush/readback/seal/index sequence and every crash boundary
are normative in the schema specification. A path string is never evidence.

## 11. PASS cannot be forged by one component

The evidence broker accepts a D4 create request only when it independently
verifies all of the following bytes and signatures:

- D1 under the policy key and current trust registry;
- D2 and P3 root after external cleanup;
- D3 under distinct reviewer and final-approver keys;
- the TPM-anchored `CONSUMED_PASS` receipt for the same nonce and review hash;
- role-separation and semantic-validation reports;
- exact P0-P4 phase-root continuity.

The PASS publisher cannot write broker storage, the broker cannot sign review,
the reviewer cannot advance the TPM ledger, and the ledger cannot create a
cleanup attestation. Compromise of any one component is insufficient to create
a valid D4.

### 11.1 D4/P5 crash-safe finalization

After D3 approval, the replay-ledger anchor prepares and commits exactly one
`SEALED_PENDING_REVIEW -> CONSUMED_PASS` transition whose event bytes bind the
D3 hash, P4 root, intended D4 object ID and publication idempotency key. It then
uses the two-transaction protocol above. The lease is released only in the T2
commit that finalizes `CONSUMED_PASS`.

The PASS publisher submits one create request keyed by the committed consume
event. The evidence broker either creates and seals the exact D4 bytes or
returns the already sealed byte-identical object. It may never create a second
object ID. P5 is accepted only after the evidence resolver independently reads
the D4 object by handle, matches it to the consume event and records the single
publication receipt. A crash before consume commit resumes the same transition;
a crash after consume commit but before D4 resumes the same publication key; a
crash after D4 but before P5 resumes resolution. No recovery path increments the
generation again, reuses the nonce, creates another PASS or returns to an active
state.

## 12. Failure disposition

Every normative dependency fails closed. Active-run failures execute the safest
available outer+inner block, verify block-before-kill, tear down, attempt typed
cleanup, seal failure evidence if possible and anchor `CONSUMED_FAIL`. Failure
of cleanup, evidence storage, anchor, signer or semantic validation prevents
review approval and PASS. Failure evidence is never upgraded to success.

Host administrator, Windows kernel, WSL kernel or TPM compromise is outside the
local proof and invalidates the run. That limitation cannot be converted into a
PASS waiver.

## 13. Consequences and future proof gates

- The design is substantially more expensive than R1 and may prove infeasible
  on the current host.
- A TPM 2.0 NV compare-and-write protocol, boot-time WFP ordering and the NTFS
  broker crash model require independent implementation proof.
- The exact fake CLI result remains candidate-shaped synthetic evidence only.
- No implementation phase, local database, service, WSL change, observer,
  firewall, fake process or mutation is authorized by R3.

The remaining unknowns are assigned to future gates, not left to implementer
judgment: schema/validator conformance; TPM ledger recovery; signer custody;
Windows outer deny; WSL containment; observer load; broker crash durability;
mutation restoration; independent review; PASS publication.

## 14. Decision record

DECISION: adopt R3 as the proposed Authority V3 design package for independent
review only.

FINAL CLAIM: `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R3`.

PROHIBITION: design completion is not execution authority.

- `executionAuthorized:false`
- `syntheticFixtureExecutionAuthorized:false`
- `realCandidateExecutionAuthorized:false`
- `providerExecutionAuthorized:false`
- `realCandidateInvocations:0`
- `providerCalls:0`
