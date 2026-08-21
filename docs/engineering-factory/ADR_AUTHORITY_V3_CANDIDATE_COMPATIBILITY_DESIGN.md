# ADR: Authority V3 candidate compatibility design revision R2

Status: proposed R2 design; independent review required

Date: 2026-08-21

Decision owner: Control Tower plus independent security review

Design verdict: `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R2`

Execution state: `executionAuthorized:false`

## 1. Reconciled authority and repository base

This revision started only after the following state was observed clean.

| Authority | Observed value |
| --- | --- |
| Engineering Factory worktree | `C:\dev\nightlexicon-engineering-factory` |
| Engineering Factory branch | `codex/engineering-factory-devbench` |
| Engineering Factory start commit | `0590773d3531e5db051cd51fb65bbdf2689cba31` |
| Engineering Factory start tree | `059ba7993004918ed95452fccfc43a583f5263e4` |
| Canonical Brain | `C:\dev\afterdesk-project-brain` |
| Authority V3 Brain checkpoint | `c280d2d083271b24d4654a64fea06ffd33652d92` |
| Brain observed commit | `b7c8198296eb1173b69a8181e3be2daff2cfcf1d` |

The only Brain commit after the Authority V3 checkpoint is the unrelated
Firefox V4 synthetic portal checkpoint. It does not change the Engineering
Factory authority boundary. Both repositories were tracked-clean before R2.

## 2. Reviewer findings and decision

The independent verdict `DESIGN_NEEDS_REVISION` is accepted. R1 is not an
implementation-ready security contract for three decisive reasons.

| Observed finding | R2 decision |
| --- | --- |
| The executable JSON Schema does not enforce the prose invariants | Replace the monolith with five versioned document schemas plus a mandatory deterministic semantic validator. |
| The resolver manifest requires review and PASS before those artifacts exist | Replace the future-dependent manifest with six ordered phase roots. A manifest contains only artifacts already produced in that phase. |
| The ledger can be restored from a valid backup or copied to another machine | Bind every committed ledger event to a non-migratable TPM machine anchor whose generation and head hash are outside disk backup state. |

R2 does not weaken the claim. It narrows it to the exact proposition that can
eventually be proved:

> One exact deterministic fake CLI fixture completed one exact provider-free
> compatibility protocol under one issued authority, with external containment,
> independent observation, durable cleanup evidence, independent review and a
> non-reusable nonce.

It never proves compatibility with Codex, Claude, a model or a provider.

## 3. Five document families

All document schemas have version `3.2.0`. Their schema IDs are immutable.

| Order | Kind | Schema ID | Producer | First consumer |
| --- | --- | --- | --- | --- |
| D0 | `authority-v3-static-design` | `urn:endvera:ef:authority-v3:static-design:3.2.0` | design authority | design reviewer |
| D1 | `authority-v3-issued-run-authority` | `urn:endvera:ef:authority-v3:issued-run-authority:3.2.0` | policy authority | admission verifier |
| D2 | `authority-v3-post-run-evidence` | `urn:endvera:ef:authority-v3:post-run-evidence:3.2.0` | evidence assembler | evidence resolver |
| D3 | `authority-v3-independent-review-decision` | `urn:endvera:ef:authority-v3:independent-review-decision:3.2.0` | independent reviewer and final approver | replay ledger and PASS publisher |
| D4 | `authority-v3-final-pass-publication` | `urn:endvera:ef:authority-v3:final-pass-publication:3.2.0` | PASS publisher through evidence broker | result reader |

There is no polymorphic runtime document. A verifier is invoked with one
expected schema ID and refuses every other ID, version or kind. D0 has every
authorization boolean false. D1 is the only family that can ever contain
`executionAuthorized:true` and `syntheticFixtureExecutionAuthorized:true`, and
only after a new explicit one-shot user authority. D2-D4 contain
`furtherExecutionAuthorized:false`. Every family keeps real candidate, model,
provider and credential authority false and counters at zero.

## 4. Authorization ceiling

The R2 package and its embedded example have these exact values:

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

R2 names eighteen authoritative components:

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
Scheme, profile `JCS-IJSON-INT53-R2`: duplicate keys forbidden, Unicode scalar
values only, no NaN/Infinity, integers only, and integers restricted to the
exact range `[-9007199254740991, 9007199254740991]`. Timestamps are UTC with
exactly three fractional digits.

Duplicate-key detection is performed by a raw-token scanner before ordinary
JSON parsing. A parse tree created before that scan is never trusted. The
canonical bytes must equal the submitted payload bytes byte-for-byte.

The signature preimage is exactly:

```text
ASCII("EF-AUTHORITY-V3-R2\0")
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
state invariants are enforced by `EF-AUTHORITY-V3-SEMVAL` version `3.2.0`.
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

R2 uses six append-only phase manifests. A manifest is produced only after all
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

Every ledger transition uses this crash-safe order:

1. `BEGIN IMMEDIATE`; verify disk head equals a fresh TPM quote.
2. Insert one `PREPARED` event for expected generation `n+1` and the unique
   nonce/lease state; FULL fsync.
3. Atomically increment the TPM `TPMA_NV_COUNTER` index from `n` to `n+1`.
4. Write the inactive A/B NV head slot with generation `n+1` and the prepared
   event hash, read back both slots, quote counter+slots and verify the quote.
5. Store the quote receipt, mark the event `COMMITTED`, update the disk head and
   FULL fsync; commit.

Recovery accepts only: disk/counter/head all agree; or exactly one fsynced
PREPARED row at disk generation plus one while the counter is plus one and the
head slot is either old or new. In that single-gap case recovery writes/verifies
the missing head slot if needed, finalizes that same event and immediately
consumes an active run as failed with a new counter advance. A gap above one,
two competing PREPARED rows, mismatched slot hash or missing prepared bytes is
unrecoverable corruption. A restored valid backup is behind the TPM counter and
is rejected with `E_LEDGER_BACKUP_RESTORE`. A cross-machine copy lacks the
non-migratable key/name and machine-bound NV indices and is rejected with
`E_LEDGER_CROSS_MACHINE_COPY`. TPM unavailable, cleared, rolled back or
unquotable means no issuance, no barrier release and no PASS.

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
  firewall, fake process or mutation is authorized by R2.

The remaining unknowns are assigned to future gates, not left to implementer
judgment: schema/validator conformance; TPM ledger recovery; signer custody;
Windows outer deny; WSL containment; observer load; broker crash durability;
mutation restoration; independent review; PASS publication.

## 14. Decision record

DECISION: adopt R2 as the proposed Authority V3 design package for independent
review only.

FINAL CLAIM: `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R2`.

PROHIBITION: design completion is not execution authority.

- `executionAuthorized:false`
- `syntheticFixtureExecutionAuthorized:false`
- `realCandidateExecutionAuthorized:false`
- `providerExecutionAuthorized:false`
- `realCandidateInvocations:0`
- `providerCalls:0`
