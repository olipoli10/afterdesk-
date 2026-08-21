# Authority V3 R3 schema and semantic-validation specification

Status: design-only; no runtime import or execution is authorized

Protocol version: `3.3.0`

Design verdict: `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R3`

## 1. Conformance model

The words MUST, MUST NOT, REQUIRED, SHALL and SHALL NOT are normative. An R3
document is valid only when all four layers pass:

1. raw-byte preparse validation;
2. the exact JSON Schema identified by the admission point;
3. canonical-byte and signature verification;
4. `EF-AUTHORITY-V3-SEMVAL` version `3.3.0`.

Failure or unavailability of any layer is a refusal. JSON Schema success alone
is never Authority V3 validity.

The executable bundle is
`AUTHORITY_V3_CANDIDATE_COMPATIBILITY_SCHEMA_EXAMPLE.json`. It contains five
separate schema definitions and one embedded D0 example. Product/runtime code
MUST NOT import the design example.

## 2. Document schema registry

| Kind | Exact schema ID | Version | Authorization meaning |
| --- | --- | --- | --- |
| `authority-v3-static-design` | `urn:endvera:ef:authority-v3:static-design:3.3.0` | `3.3.0` | documentation only; every authorization false |
| `authority-v3-issued-run-authority` | `urn:endvera:ef:authority-v3:issued-run-authority:3.3.0` | `3.3.0` | a future one-shot fake-fixture run only |
| `authority-v3-post-run-evidence` | `urn:endvera:ef:authority-v3:post-run-evidence:3.3.0` | `3.3.0` | completed run evidence; no future execution |
| `authority-v3-independent-review-decision` | `urn:endvera:ef:authority-v3:independent-review-decision:3.3.0` | `3.3.0` | approve/refuse one D2 only |
| `authority-v3-final-pass-publication` | `urn:endvera:ef:authority-v3:final-pass-publication:3.3.0` | `3.3.0` | publish one already completed synthetic result only |

Each admission API supplies the expected schema ID out of band. The document
cannot select its own verifier. The registry maps `(kind, schemaId, version)` to
one local schema SHA-256. Network references, version ranges, aliases and
fallback to an older schema are forbidden.

## 3. Raw bytes, canonicalization and signatures

### 3.1 Preparse

Before ordinary JSON parsing, a streaming tokenizer MUST reject:

- a UTF-8 BOM;
- invalid UTF-8 or non-Unicode scalar values;
- duplicate object keys at any depth;
- comments, trailing commas or concatenated JSON values;
- floating-point, exponential, NaN or Infinity tokens;
- integers outside `[-9007199254740991, 9007199254740991]`.

The parser consumes exactly one JSON value and then EOF. Duplicate-key rejection
MUST NOT rely on a parser whose object map has already overwritten a key.

### 3.2 Canonical bytes

Profile `JCS-IJSON-INT53-R3` is RFC 8785 JCS with the preparse restrictions
above. Submitted payload bytes MUST equal the JCS output exactly: UTF-8 without
BOM, sorted object keys, no insignificant whitespace. Timestamps match
`YYYY-MM-DDTHH:mm:ss.sssZ` exactly. SHA-256 is lowercase hexadecimal over exact
stored bytes.

### 3.3 Signed envelope

Every signed object uses this shape, with `additionalProperties:false`:

| Field | Type | Rule |
| --- | --- | --- |
| `payload` | object | exact family payload schema |
| `signatures` | array | typed `SignatureR3`; `minItems:1`; unique `keyId` semantically |

`SignatureR3` has exact fields `keyId`, `role`, `algorithm`, `registryGeneration`,
`signedAt`, `payloadSha256`, `signatureBase64Url`. `algorithm` is constant
`ECDSA_P256_SHA256_IEEE_P1363`; decoded signature length is exactly 64 bytes.

The signed bytes are exactly:

```text
ASCII("EF-AUTHORITY-V3-R3\0")
|| UINT32_BE(length(UTF8(schemaId)))
|| UTF8(schemaId)
|| UINT64_BE(length(canonicalPayloadBytes))
|| canonicalPayloadBytes
```

The signature array is outside `payload` and is not self-covered. Signature
cardinality and required signer roles are family-specific and verified against
the pre-anchored registry.

## 4. Common closed structures

Every object below has `additionalProperties:false`. Every array declares
typed `items`, finite cardinality and `uniqueItems:true` where item equality is
meaningful. Cross-item keys use semantic uniqueness rules.

### 4.1 Scalar profiles

- `Sha256R3`: lowercase 64-character hex.
- `UuidR3`: lowercase RFC 4122 UUID string; D1 `runId` MUST be version 4.
- `SafeIdR3`: 1-128 characters from `[A-Za-z0-9._:-]`.
- `RelativePathR3`: 1-512 ASCII characters, `/` separator, no absolute prefix,
  drive, colon, empty segment, `.`/`..`, trailing dot/space or alternate stream.
- `UtcMillisR3`: exact UTC millisecond timestamp.
- `SequenceR3`: integer 1 through `9007199254740991`.
- `Base64Url64R3`: unpadded base64url encoding of exactly 64 bytes.

### 4.2 RoleBindingR3

Exact fields:

- `role`: one value from the authoritative role registry;
- `identityId`: `SafeIdR3`;
- `operatingSystemIdentity`: canonical SID or `uid:<decimal>`;
- `binarySha256` and `configurationSha256`;
- `keyId`, `publicKeySpkiSha256` and `keyEpoch`;
- `machineIdSha256` and `serviceLauncherSha256`;
- `registryGeneration`.

The authoritative role registry is:

```text
design-authority
trust-registry-maintainer
policy-authority
replay-ledger-anchor
windows-outer-deny-controller
wsl-enforcement-controller
observer-service
observer-signer
barrier-authority
runtime-supervisor
evidence-broker
evidence-resolver
semantic-validator
evidence-assembler
external-cleanup-verifier
independent-reviewer
final-approver
pass-publisher
```

All eighteen bindings MUST be present exactly once in D1. `identityId`, OS
identity, `keyId` and `binarySha256` are pairwise unique across all eighteen.
The runtime owner and fixture identities are separate `SubjectBindingR3`
objects and cannot equal an authoritative binding on any identity dimension.

### 4.3 TrustRootRegistryR3

Exact fields:

- `registryId`, `registryGeneration`, `previousRegistrySha256`;
- `createdAt`, `effectiveAnchorGeneration`;
- `machineIdSha256`, `tpmRegistryNvIndex`, `tpmKeyNameSha256`;
- `schemaMappings`: 5 typed unique `SchemaMappingR3` entries;
- `artifactMappings`: exact typed `ArtifactKindMappingR3` registry;
- `keys`: 18 typed unique `TrustKeyR3` entries;
- `recoveryKeys`: exactly three offline distinct-custodian public keys;
- `rotations`: typed array, 0-64 items;
- `revocations`: typed array, 0-64 items;
- `compromiseRecoveries`: typed array, 0-16 items;
- `recoveryPolicySha256`;
- `tpmAnchorReceipt`: typed `AnchorReceiptR3`.

`SchemaMappingR3` has `kind`, `schemaId`, `schemaVersion`, `schemaSha256` and
`semanticProfileId`. `TrustKeyR3` has role, key ID, SPKI hash, constant
algorithm, epoch, validity interval, status (`ACTIVE` or `REVOKED`) and effective
anchor generations. A `RotationR3` names old/new keys and epochs and carries
old-key, new-key, registry-maintainer and final-approver signature references.
A `RevocationR3` names the key, reason-class enum, effective anchor generation,
registry signature and final-approver signature.

`CompromiseRecoveryR3` names old/new registry hashes and ledger IDs, every
revoked key, the receipt consuming all outstanding nonces as failed, exactly two
of the three offline recovery signatures, the final-approver signature and the
new TPM anchor receipt. No recovery key is a run role or stored online.

### 4.4 SignedReceiptR3

Every gate/authority/signature receipt is a closed typed object with receipt ID,
one exact receipt-kind enum, subject hash, sequence, UTC/monotonic time,
machine/Windows-boot/WSL-boot bindings, signer role, registry hash and one
`SignatureR3`. The executable receipt-kind registry covers admission, observer,
outer deny, reserve/lease, source/runtime/prebind, firewall, capture/rebind,
barrier, drift, block/kill, teardown, deletion, cleanup, store, resolution,
review, consume and PASS-create receipts.

### 4.5 ArtifactReferenceR3

Exact fields:

- `artifactId`, `artifactKind`, `schemaId`;
- `phase`: `P0`, `P1`, `P2`, `P3`, `P4` or `P5`;
- `producerRole`, `producerIdentityId`;
- `consumerRoles`: typed unique non-empty role array;
- `signerKeyIds`: typed unique array of one key, or exactly two keys where the
  artifact mapping requires dual signatures;
- `relativePath`, `volumeGuid`, `fileId128`, `linkCount` constant 1;
- `byteSize`, `sha256`, `mediaType`;
- `storageObjectId`, `storeReceiptSha256`, `producedSequence`;
- `contentSensitive` constant false.

An artifact reference never has a mutable `resolved` boolean. Resolution is a
separate signed `ResolutionReceiptR3`, so production cannot claim its own later
verification.

`ArtifactConsumptionR3` has artifact ID, consumer role/identity, strictly later
consumption sequence, exact purpose enum and receipt hash. The producer declares
expected consumer roles; actual consumption is recorded only in a later-created
manifest, never predicted as future evidence.

`ResolutionReceiptR3` contains artifact ID, opened final path, volume/file IDs,
link count, reparse tag, stream names, observed size/hash/schema/kind/signer,
expected values, resolver identity, sequence and result. PASS requires result
`MATCH` for every referenced artifact.

### 4.6 PhaseManifestR3

Exact fields:

- `manifestId`, `runId`, `phase`; run ID is null only for P0 and exact D1 run ID
  for P1-P5;
- `priorPhaseRootSha256`: null only for P0;
- `artifacts`: 1-256 typed unique references;
- `consumptions`: 0-256 typed unique consumption receipts;
- `firstProducedSequence`, `lastProducedSequence`;
- `artifactMerkleRootSha256`, `manifestRootSha256`;
- `producerRole`, `signerRole`, `acceptorRole`, `signerKeyId`,
  `acceptanceReceiptSha256`, `signatureReceiptSha256`.

A phase manifest lists only already stored artifacts from its own phase and only
consumptions that already occurred. It does not list itself, its storage
receipt, a future phase or an expected artifact.
The issued authority carries `ArtifactKindMappingR3` expectations instead.

The three roles are not selectable. Each phase also freezes its required ledger
state before production, resulting state, input artifact kinds, prior
attestation kinds and the output schema
`urn:endvera:ef:authority-v3:phase-manifest:3.3.0`:

| Phase | Predecessor | Prior -> result state | Producer / signer -> acceptor | Required inputs | Required prior attestations |
| --- | --- | --- | --- | --- | --- |
| P0 | none | `DESIGN_ONLY -> DESIGN_ONLY` | `design-authority / design-authority -> semantic-validator` | none | none |
| P1 | P0 | `DESIGN_ONLY -> ISSUED` | `policy-authority / policy-authority -> semantic-validator` | static design, schema bundle, gate and mutation registries | design schema valid; trust roots pre-anchored |
| P2 | P1 | `ISSUED -> RESERVED` | `evidence-assembler / evidence-assembler -> semantic-validator` | issued authority, observer readiness, outer deny, reservation and lease | source/contract and runtime chain bound |
| P3 | P2 | `RESERVED -> SEALED_PENDING_REVIEW` | `evidence-assembler / evidence-assembler -> evidence-resolver` | runtime/observer/containment/cleanup/deletion evidence and D2 | block-before-kill, external cleanup and evidence sealing |
| P4 | P3 | `SEALED_PENDING_REVIEW -> APPROVED_SYNTHETIC_PASS` | `independent-reviewer / independent-reviewer -> final-approver` | D2, resolution report and signer/ledger validation | cleanup complete; gates 1-22 passed |
| P5 | P4 | `CONSUMED_PASS -> PUBLISHED_PASS` | `pass-publisher / pass-publisher -> evidence-broker` | D3, consume-pass receipt and intended D4 object | gate 23 passed; D4 create authorized |

The semantic validator compares phase, predecessor root, run ID, producer,
signer, acceptor, required prior attestations and artifact registry. A
schema-valid P3 signed as P2, a skipped root, a duplicate root, a P0 carrying a
run ID or P1-P5 carrying another run ID fails before consumption with
`E_PHASE_PREDECESSOR_INVALID` or `E_PHASE_ROLE_INVALID`.

### 4.7 ArtifactKindMappingR3

Exact fields are `artifactKind`, `schemaId`, `phase`, `producerRole`,
`requiredSignerRoles` (typed unique array of one or two exact component roles),
`firstConsumerRole`, `minimumCount`, `maximumCount`.
Every artifact kind maps to exactly one producer role and phase. The semantic
validator rejects producer or signer substitutions even when the artifact
reference is otherwise well formed.

### 4.8 GateDecisionBindingR3

Every gate is bound to exactly one producer role and one accepting role from
the closed authoritative role registry. It also carries exact JSON-pointer
references to both D1 `RoleBindingR3` entries. At validation time those entries
resolve to one OS identity, identity ID, executable SHA-256, configuration
SHA-256, key ID and SPKI hash. Literal aliases such as `trust verifier`,
`runtime verifier`, `cleanup coordinator` or `signer/ledger verifier` are not
valid schema values.

For every security-critical gate, producer and acceptor MUST differ on role,
OS identity, identity ID, key ID and executable SHA-256. Failure is
`E_GATE_ACCEPTOR_NOT_INDEPENDENT`. Missing, extra or reordered bindings fail
with `E_GATE_ROLE_MAPPING_INVALID`.

### 4.9 TPM NV public-area profiles

`TpmNvPublicR3` has exact fields `purpose`, `nvIndex`, `hierarchy`, `nameAlg`,
`attributes`, `authPolicySha256`, `dataSize`, `expectedPublicNameSha256`,
`provisionerRole`, `verifierRole`, `initialState`, `allowedOperations`,
`rotationClass` and `replacementClass`. The four purposes are
`MONOTONIC_COUNTER`, `HEAD_SLOT_A`, `HEAD_SLOT_B` and `TRUST_REGISTRY_ANCHOR`.

- hierarchy is `OWNER`;
- nameAlg is `SHA256`;
- the counter has attributes `OWNERREAD|POLICYREAD|POLICYWRITE|COUNTER|
  NO_DA|WRITE_STCLEAR` and dataSize 8;
- head slots have `OWNERREAD|POLICYREAD|POLICYWRITE|NO_DA|WRITEDEFINE` and
  dataSize 256;
- the registry anchor has
  `OWNERREAD|POLICYREAD|POLICYWRITE|NO_DA|WRITEDEFINE|WRITELOCKED` and dataSize
  64;
- only `replay-ledger-anchor` provisions/writes/increments; only
  `semantic-validator` verifies public area/name/policy and reads/quotes;
- a cleared TPM, foreign public name, wrong attributes, wrong size, wrong
  policy, absent write lock or reprovisioned index is
  `E_TPM_NV_PUBLIC_MISMATCH`; no index is recreated in-place during a run.

Provisioning is an offline ceremony with owner authorization unavailable to
the runtime. It produces a signed public-area bundle and quote, independently
accepted before D1 issuance. Machine replacement or TPM clear retires the
ledger ID, consumes outstanding nonces as failed and provisions a new ledger;
it never restores or copies old NV state.

## 5. D0 static design payload

D0 has exactly these fields:

- `schemaId`, `schemaVersion`, `kind`;
- `designMilestone` constant
  `AUTHORITY_V3_CANDIDATE_COMPATIBILITY_DESIGN_REVISION_R3_ONLY`;
- `designVerdict` constant `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R3`;
- the six authorization booleans, all false;
- `realCandidateInvocations:0`, `providerCalls:0`;
- `schemaFamily`: exact five schema IDs in document order;
- `gateRegistry`: exact 24 gates in order;
- `mutationRegistry`: exact 39 R3 mutation IDs in order;
- `mutationExpectations`: exact 39 tuples of mutation ID, expected failed gate
  and mutation-specific deterministic error ID;
- `semanticValidator`: `id`, `version`, `required:true`, exact error-ID registry;
- `gateDecisionBindings`: exactly 24 `GateDecisionBindingR3` entries;
- `phaseContracts`: exactly six phase-bound ownership entries;
- `tpmNvPublicProfiles`: exactly four complete public-area profiles;
- `ledgerDurabilityProtocol`: exact T1/durability-proof/TPM/T2 ordering and the
  complete crash-boundary registry;
- `claimBoundary` constant `SYNTHETIC_FIXTURE_COMPATIBILITY_ONLY`.

No D0 field can be interpreted as a nonce, lease, signature authority or run
grant. The embedded JSON example is a D0 payload and visibly keeps
`executionAuthorized:false`.

## 6. D1 issued run authority payload

D1 can be created only in a future separately authorized phase. It has exactly:

### 6.1 Header and one-shot authority

- `schemaId`, `schemaVersion`, `kind`;
- `claimBoundary:SYNTHETIC_FIXTURE_COMPATIBILITY_ONLY`;
- `executionAuthorized:true`;
- `syntheticFixtureExecutionAuthorized:true`;
- real candidate/model/provider/credential booleans false;
- invocation/provider counters 0;
- `runId`, `nonceHash`, `issuedAt`, `expiresAt`;
- `authorityGeneration`, `machineBinding`, `sourceBinding`;
- `trustRegistrySha256`, `designRootSha256`;
- exact `roleBindings` and untrusted `subjectBindings`;
- exact, non-transitive `authorityGrants`;
- `expectedArtifactRegistry`;
- `candidateContract`, `runtimeContract`, `networkContract`, `observerContract`,
  `evidenceBrokerContract`, `ledgerContract`.

`MachineBindingR3` contains TPM endorsement-key-name hash, non-migratable ledger
key name hash, machine ID hash, Windows boot instance ID, WSL boot ID, Secure
Boot state, PCR selection and expected PCR digest. Hostname alone is forbidden.

`SourceBindingR3` contains repository identity hash, commit/tree IDs, bundle tree
hash, fake binary/wrapper/source hashes, payload-schema hash and schema-bundle
hash. It contains no real candidate hash except the M01 synthetic sentinel hash.

### 6.2 Non-transitive grants

`AuthorityGrantR3` exact fields are grant ID, authority class, component role,
mutation IDs, host/machine/boot binding, source/tree, not-before/expires, one-shot
boolean, maximum uses and parent decision hash. `maximumUses` is 1 for any
mutation/rehearsal grant.

The authority classes are exact:

```text
I1_STATIC_SCHEMA_TESTS
I2_RESOLVER_MODEL_IMPLEMENTATION
I3_DISPOSABLE_LEDGER_IMPLEMENTATION
I4_FAKE_PROCESS_IMPLEMENTATION
I5_WINDOWS_OUTER_DENY_SOURCE
I5_WSL_CONTROLLER_SOURCE
I5_OBSERVER_SOURCE
I5_SIGNER_SOURCE
I5_EVIDENCE_BROKER_SOURCE
I5_CLEANUP_VERIFIER_SOURCE
I6_WINDOWS_OUTER_DENY_MUTATIONS
I6_WSL_ROUTE_FIREWALL_MUTATIONS
I6_RUNTIME_NAMESPACE_MUTATIONS
I6_OBSERVER_MUTATIONS
I6_SIGNER_MUTATIONS
I6_BROKER_MUTATIONS
I6_CLEANUP_MUTATIONS
I6_LEDGER_CORRUPTION_MUTATIONS
I6_PRISTINE_SYNTHETIC_RUN
I7_INDEPENDENT_REVIEW
I8_PASS_PUBLICATION
```

A grant authorizes only its exact component and mutation set. Empty or omitted
mutation sets authorize none. No grant implies a later class. No Gate A/B
umbrella or subset grant can authorize all 39 mutations.

### 6.3 RuntimeContractR3

Exact closed structures:

- `components`: 1-32 `ComponentMeasurementR3` objects with name, version,
  canonical path class, binary/package/config hashes, producer and receipt;
- `uidMap` and `gidMap`: 1-16 `IdMapEntryR3` objects with container start, host
  start and positive length; ranges MUST be disjoint;
- `capabilities`: exact permitted/effective/inheritable/ambient/bounding arrays,
  all empty for the fake CLI;
- `mounts`: 1-32 `MountR3` objects containing source object ID, destination,
  filesystem type, flags, propagation, read-only, nodev/nosuid/noexec and
  expected mount ID;
- `devices`: 0-8 `DeviceR3` objects containing type, major, minor, mode, UID/GID
  and cgroup permission; pristine fake CLI count is zero;
- `cgroup`: version, path, controllers, exact CPU/memory/pids/io limits, owner,
  namespace and kill semantics;
- `shims`: 0-16 `RuntimeShimR3` objects with PID/start time, parent, binary/config
  hash, namespaces, cgroup and allowed purpose;
- exact PID/user/network/mount/IPC/UTS namespace inode bindings;
- inherited FD array with only 0,1,2 and named barrier FDs; inherited socket
  array empty;
- procfs/sysfs visibility contracts; netlink and eBPF contracts;
- seccomp, LSM and `noNewPrivileges:true`;
- OCI spec, image manifest, runtime inspect, state, process, cgroup and FD
  inventory artifact expectations.

Every nested object is typed and closed in the executable schema. Generic
objects or untyped arrays are forbidden.

### 6.4 NetworkContractR3

`WindowsOuterDenyR3` has exact provider/sublayer/filter GUIDs, BFE state,
boot-time/persistent flags, WFP layers, address families, WSL vNIC GUID,
compartment ID, VM creator ID, Hyper-V default actions, allow-filter count
constant zero, normalized object hash and signed install/readback expectations.

`NftTopologyR3` contains typed namespaces, interfaces, addresses, routes, base
chains and rules. The exact base-chain bindings are:

| Namespace class | Family | Hook | Priority | Policy |
| --- | --- | --- | --- | --- |
| enforcement | `inet` | `input` | `-300` | `drop` |
| enforcement | `inet` | `forward` | `-300` | `drop` |
| enforcement | `inet` | `output` | `-300` | `drop` |
| each workload | `inet` | `input` | `-300` | `drop` |
| each workload | `inet` | `output` | `-300` | `drop` |

Only candidate-to-relay, relay-to-fake-DNS and relay-to-fake-provider tuples are
accepted. Established/related state is accepted only for those tuple IDs. Drop
rules explicitly cover DNS outside fake DNS, IPv4/IPv6 link-local, metadata,
loopback cross-namespace, multicast/broadcast, IPv6, IPv4-mapped IPv6, NAT64,
default routes, Windows/host gateways and all unmatched traffic. No physical or
WSL uplink belongs to any workload namespace.

`RuntimeHelperSetR3` has exact typed entries for netavark, aardvark,
slirp4netns, pasta and every runtime shim, each either measured or accompanied
by a signed exhaustive absence attestation. `unexpectedHelperCount` is zero.

### 6.5 ObserverContractR3

Exact fields include observer/signer bindings, pre-pinned key, service-ready
deadline before reservation, netlink subscription before first link creation,
typed interface expectations, capture-ready deadline before link-up/barrier,
taxonomy, pristine/mutation load envelopes, AF_PACKET version/fanout, requested
buffer, PACKET_STATISTICS requirement, event-chain profile and shutdown steps.

`ObserverInterfaceR3` contains namespace inode, interface name, ifindex,
peer-ifindex, link type, both directions, observer PID/start time, socket ID,
fanout ID, attach/link-up sequences and expected purpose. Exact-set equality is
semantic; duplicates or omissions fail.

`LoadEnvelopeR3` contains purpose, packets/second, packet-size array, burst,
duration milliseconds, emitter CPU quota/memory/pids, observer CPU quota/memory,
expected drop range and expected unclassified range.

### 6.6 EvidenceBrokerContractR3

Exact fields bind NTFS volume GUID, root directory file ID, broker/resolver SIDs,
service SID, DACL/SACL/owner descriptor hash, required privileges, allowed file
share masks, create flags, reparse/stream/link policy, write/flush/readback/seal
steps, index journal schema/hash chain and crash recovery table hash.

### 6.7 LedgerContractR3

Exact fields bind ledger ID/schema, SQLite page/application IDs, FULL synchronous
and WAL settings, concurrency domain, one TPM counter index, alternating head
indices A/B, registry index, machine/key names, PCR policy, transition table,
maximum lease, anchor update protocol hash, recovery table hash and
compromise-recovery policy hash. R3 additionally requires:

- `tpmNvPublicProfiles`: exactly the four profiles in section 4.9;
- `tpmProvisioningReceiptSha256` and
  `tpmPublicAreaVerificationReceiptSha256`;
- `prepareTransactionCommitsBeforeTpm:true`;
- `prepareCheckpointMode:FULL`, `prepareCheckpointBusyFramesMaximum:0`,
  `databaseFileFsync:true`, `databaseDirectoryFsync:true` and
  `postCommitReadbackRequired:true`;
- `finalizeTransactionStartsAfterVerifiedQuote:true`;
- `crashRules`: the complete ordered crash matrix in section 15;
- `publicationIdempotencyUnique:true` and `terminalTransitionUnique:true`.

Any implementation that holds a SQLite transaction open while incrementing or
writing TPM NV state fails `E_LEDGER_PREPARE_NOT_DURABLE`.

## 7. D2 post-run evidence payload

D2 cannot authorize or publish anything. Exact header fields keep
`furtherExecutionAuthorized:false`, all real/model/provider/credential flags
false, counters zero and claim boundary synthetic-only.

Other exact fields:

- D1 payload hash and signature receipt;
- P0, P1 and P2 phase-root hashes;
- the P3 pre-D2 data-set root and broker data-set seal receipt;
- typed `ObserverSummaryR3`;
- typed `ContainmentSummaryR3`;
- typed `CleanupSummaryR3`;
- typed `LedgerPreReviewStateR3` with state `SEALED_PENDING_REVIEW` or terminal
  `CONSUMED_FAIL`;
- the D1 admission semantic-report hash;
- `mutationCaseId`, `expectedFailedGateName` and `observedErrorId`: all null for
  pristine evidence; all non-null for mutation evidence and equal to one exact
  D0 `mutationExpectations` tuple;
- exact passed/failed gate lists through gate 20;
- verdict `EVIDENCE_READY_FOR_REVIEW`, `SYNTHETIC_FAIL` or `QUARANTINED`;
- `passArtifactPresent:false`.

`ObserverSummaryR3` includes one typed interface record and one packet-statistics
record per capture socket, event counts, classification counts, sequence gaps,
kernel drops, buffer values, shutdown ordering and signed event root.

`DeletionAcknowledgmentR3` exact fields are object kind/ID, volume-or-namespace
identity, request/completion sequences, API/binary hash, return code, stderr
class enum, absent-after result, independent readback artifact and controller
signature. Every created object ID has exactly one acknowledgment. Deleting an
already absent object is not a successful acknowledgment unless its create
receipt proves the object was never committed.

`CleanupSummaryR3` includes typed before/after inventories for Windows filters,
routes/DNS, WSL namespaces, nft objects, links, addresses, routes, processes,
cgroups, mounts, files, runtime objects, observer/signer handles and temp roots;
the complete acknowledgment set; external verifier identity/signature; zero
residual count; exact-equivalence true; and PASS-absent true.

## 8. D3 independent review decision payload

D3 has two schema-disjoint variants.

### 8.1 APPROVED

An approved payload requires:

- exact D1, D2 and P0-P3 root hashes;
- all resolution and semantic reports valid;
- gate list 1-22 exactly passed, no failed gate;
- cleanup verified and PASS absent;
- ledger state `SEALED_PENDING_REVIEW`;
- reviewer and final-approver role bindings distinct from every producer;
- decision `APPROVED_SYNTHETIC_PASS`;
- `finalApproverAvailable:true`;
- empty error IDs;
- one independent-reviewer and one final-approver signature.

### 8.2 REFUSED

A refused payload has decision `REFUSED`, at least one exact error ID, no PASS
authorization and reviewer signature. A final-approver signature may record the
refusal but cannot convert it to approval. If the final approver is unavailable,
the expiry service does not synthesize approval: it anchors `CONSUMED_FAIL`; no
D4 can validate.

## 9. D4 final PASS publication payload

D4 is intentionally rigid. Every success fact is a constant or required exact
reference:

- claim `SYNTHETIC_FIXTURE_COMPATIBILITY_ONLY`;
- D1/D2/D3 hashes and P0-P4 roots;
- D3 decision `APPROVED_SYNTHETIC_PASS`;
- TPM-anchored ledger receipt state `CONSUMED_PASS` binding the D3 and P4 hashes;
- gates 1-23 passed before publication and gate 24 passed by this create;
- cleanup/evidence/signatures/role separation all true;
- `passPublished:true` and exactly one create-new broker receipt;
- `furtherExecutionAuthorized:false`;
- real candidate/model/provider/credential authority false;
- invocation/provider counters zero.

There is no nullable success field and no alternative combination. Therefore a
PASS-before-cleanup, PASS-with-refusal, PASS-with-missing review, PASS-with-live
lease or PASS-with-real authority does not validate structurally.

## 10. Exact artifact producer registry

The D1 registry MUST contain these mappings. `consumer` is the first typed
consumer; later consumer sets are declared on each reference.

| Phase | Artifact kind | Sole producer | Required signer set | First consumer |
| --- | --- | --- | --- | --- |
| P0 | static-design | design-authority | design-authority | policy-authority |
| P0 | schema-bundle | design-authority | design-authority | semantic-validator |
| P0 | semantic-validator-contract | design-authority | design-authority | semantic-validator |
| P0 | gate-registry | design-authority | design-authority | policy-authority |
| P0 | mutation-registry | design-authority | design-authority | policy-authority |
| P1 | trust-root-registry | trust-registry-maintainer | trust-registry-maintainer | policy-authority |
| P1 | issued-run-authority | policy-authority | policy-authority | semantic-validator |
| P2 | observer-service-ready | observer-service | observer-signer | replay-ledger-anchor |
| P2 | replay-reservation | replay-ledger-anchor | replay-ledger-anchor | barrier-authority |
| P2 | exclusive-lease | replay-ledger-anchor | replay-ledger-anchor | barrier-authority |
| P2 | source-contract-readback | evidence-resolver | evidence-resolver | runtime-supervisor |
| P2 | provider-absence | evidence-resolver | evidence-resolver | runtime-supervisor |
| P2 | windows-outer-deny-readback | windows-outer-deny-controller | windows-outer-deny-controller | barrier-authority |
| P2 | runtime-chain-readback | runtime-supervisor | runtime-supervisor | wsl-enforcement-controller |
| P2 | namespace-prebind | wsl-enforcement-controller | wsl-enforcement-controller | observer-service |
| P2 | inner-firewall-install | wsl-enforcement-controller | wsl-enforcement-controller | evidence-resolver |
| P2 | inner-firewall-readback | evidence-resolver | evidence-resolver | observer-service |
| P2 | observer-capture-ready | observer-service | observer-signer | barrier-authority |
| P2 | final-rebind | barrier-authority | barrier-authority | runtime-supervisor |
| P2 | barrier-release | barrier-authority | barrier-authority | runtime-supervisor |
| P3 | continuous-drift-log | observer-service | observer-signer | evidence-assembler |
| P3 | observer-metadata-chain | observer-service | observer-signer | evidence-assembler |
| P3 | observer-packet-statistics | observer-service | observer-signer | evidence-assembler |
| P3 | observer-shutdown | observer-service | observer-signer | external-cleanup-verifier |
| P3 | block-before-kill | wsl-enforcement-controller | wsl-enforcement-controller | runtime-supervisor |
| P3 | process-cgroup-teardown | runtime-supervisor | runtime-supervisor | external-cleanup-verifier |
| P3 | deletion-acknowledgment-set | wsl-enforcement-controller | wsl-enforcement-controller | external-cleanup-verifier |
| P3 | external-cleanup-verification | external-cleanup-verifier | external-cleanup-verifier | evidence-assembler |
| P3 | broker-data-set-seal | evidence-broker | evidence-broker | evidence-assembler |
| P3 | ledger-pre-review-state | replay-ledger-anchor | replay-ledger-anchor | independent-reviewer |
| P3 | mutation-observation | semantic-validator | semantic-validator | evidence-assembler |
| P3 | restoration-verification | external-cleanup-verifier | external-cleanup-verifier | evidence-assembler |
| P3 | post-run-evidence | evidence-assembler | evidence-assembler | evidence-resolver |
| P4 | resolution-report | evidence-resolver | evidence-resolver | independent-reviewer |
| P4 | semantic-validation-report | semantic-validator | semantic-validator | independent-reviewer |
| P4 | signer-chain-report | independent-reviewer | independent-reviewer | final-approver |
| P4 | independent-review-decision | independent-reviewer | independent-reviewer + final-approver | replay-ledger-anchor |
| P5 | ledger-consume-pass | replay-ledger-anchor | replay-ledger-anchor | pass-publisher |
| P5 | final-pass-publication | pass-publisher | pass-publisher | result-reader |
| P3 | ledger-consume-fail | replay-ledger-anchor | replay-ledger-anchor | failure-auditor |

The phase manifest is the root container, not an artifact inside itself. This
registry is acyclic: every first consumer is in a later production step, and D3,
consume-pass and D4 are absent from P0-P3.

## 11. Deterministic semantic validator

### 11.1 Input and output

Command contract, for a future separately authorized implementation:

```text
ef-authority-v3-semval
  --expected-schema-id <exact SafeId/URN token>
  --document-handle <broker handle token>
  --registry-handle <broker handle token>
  --prior-phase-root <sha256-or-NONE>
  --anchor-quote-handle <ledger receipt token>
```

No path, network URI or schema URL is accepted. Handles are broker-issued,
single-use, content-free tokens. Input bytes are read once from broker handles.

Output is one canonical semantic-validation report with exact fields:
`validatorId`, `validatorVersion`, `binarySha256`, `configurationSha256`,
`expectedSchemaId`, input/registry/schema/anchor hashes, `checks` (exact ordered
check IDs), `errorIds` (sorted unique), `valid`, `exitCode`, `producedSequence`,
and validator signature. stdout contains only the framed report; stderr is a
single error class. Exit codes are 0 valid, 64 normative invalid, 70 internal or
dependency failure.

### 11.2 Ordered checks and exact error IDs

| Check | Failure ID |
| --- | --- |
| raw UTF-8/BOM/token scan | `E_PARSE_UTF8_OR_BOM` |
| duplicate-key scan | `E_PARSE_DUPLICATE_KEY` |
| integer/profile scan | `E_PARSE_NUMBER_PROFILE` |
| canonical-byte equality | `E_CANONICAL_BYTES_MISMATCH` |
| expected schema/kind/version/hash | `E_SCHEMA_CONFUSION_OR_DOWNGRADE` |
| JSON Schema | `E_SCHEMA_INVALID` |
| design authorization constants | `E_DESIGN_AUTHORITY_TRUE` |
| real/model/provider/credential constants | `E_FORBIDDEN_EXECUTION_AUTHORITY` |
| state transition | `E_STATE_TRANSITION_INVALID` |
| gate order and cardinality | `E_GATE_ORDER_INVALID` |
| gate/verdict consistency | `E_GATE_VERDICT_INCONSISTENT` |
| OS identity uniqueness | `E_ROLE_OS_REUSE` |
| key identity uniqueness | `E_ROLE_KEY_REUSE` |
| binary identity uniqueness | `E_ROLE_BINARY_REUSE` |
| subject/authority separation | `E_ROLE_FORBIDDEN_COMBINATION` |
| trust registry pre-anchor | `E_TRUST_ROOT_NOT_PREANCHORED` |
| key status/epoch | `E_KEY_REVOKED_OR_EPOCH_INVALID` |
| rotation/recovery signatures | `E_KEY_ROTATION_OR_RECOVERY_INVALID` |
| signature preimage/signature | `E_SIGNATURE_INVALID` |
| artifact producer count | `E_ARTIFACT_PRODUCER_COUNT` |
| kind/producer/signer/schema mapping | `E_ARTIFACT_MAPPING_INVALID` |
| consumption sequence strictly after reachable producer | `E_ARTIFACT_ORDER_INVALID` |
| phase root cycle/prior root | `E_PHASE_DAG_INVALID` |
| exact phase producer/signer/acceptor | `E_PHASE_ROLE_INVALID` |
| phase predecessor/run/state contract | `E_PHASE_PREDECESSOR_INVALID` |
| 24 exact gate producer/acceptor bindings | `E_GATE_ROLE_MAPPING_INVALID` |
| producer/acceptor identity independence | `E_GATE_ACCEPTOR_NOT_INDEPENDENT` |
| handle/path/volume/file ID/link/stream | `E_ARTIFACT_HANDLE_IDENTITY_INVALID` |
| byte size/hash | `E_ARTIFACT_BYTES_INVALID` |
| schema/kind from bytes | `E_ARTIFACT_SCHEMA_KIND_INVALID` |
| broker write/flush/seal/index journal | `E_EVIDENCE_STORE_DURABILITY` |
| deletion acknowledgment exact set | `E_CLEANUP_ACK_MISSING_OR_INVALID` |
| external before/after equivalence | `E_EXTERNAL_CLEANUP_INVALID` |
| review strictly after cleanup/P3 | `E_REVIEW_BEFORE_CLEANUP` |
| final approver present and distinct | `E_FINAL_APPROVER_UNAVAILABLE_OR_REUSED` |
| PASS strictly after D3/consume-pass | `E_PASS_ORDER_INVALID` |
| D4 success constants | `E_PASS_COMBINATION_INVALID` |
| synthetic-only claim and artifact kinds | `E_SYNTHETIC_RELABELLED_REAL` |
| machine/TPM key binding | `E_LEDGER_MACHINE_BINDING` |
| boot binding | `E_LEDGER_BOOT_BINDING` |
| disk/TPM head relation | `E_LEDGER_ANCHOR_MISMATCH` |
| valid backup behind anchor | `E_LEDGER_BACKUP_RESTORE` |
| different TPM/machine | `E_LEDGER_CROSS_MACHINE_COPY` |
| unique nonce/lease transaction | `E_LEDGER_LEASE_OR_NONCE_CONFLICT` |
| torn-write recovery state | `E_LEDGER_TORN_WRITE_UNRECOVERABLE` |
| committed PREPARED before TPM | `E_LEDGER_PREPARE_NOT_DURABLE` |
| orphan PREPARED disposition | `E_LEDGER_ORPHAN_PREPARED` |
| TPM NV public area/name/policy | `E_TPM_NV_PUBLIC_MISMATCH` |
| TPM provisioning/rotation lifecycle | `E_TPM_PROVISIONING_INVALID` |
| consume/PASS/P5 idempotent finalization | `E_LEDGER_FINALIZATION_INVALID` |
| mutation observer/acceptor independence | `E_MUTATION_OBSERVER_NOT_INDEPENDENT` |
| content-sensitive scanner | `E_CONTENT_SENSITIVE_EVIDENCE` |

The validator emits every deterministically discoverable error after safe parse,
but `valid` is false if any error exists. It does not select a weaker path based
on which error appears first.

## 12. State and gate invariants

Allowed ledger transitions are exactly:

```text
ISSUED -> RESERVED
ISSUED -> EXPIRED_UNUSED
RESERVED -> ACTIVE
RESERVED -> CONSUMED_FAIL
ACTIVE -> TEARDOWN
ACTIVE -> CONSUMED_FAIL
TEARDOWN -> SEALED_PENDING_REVIEW
TEARDOWN -> CONSUMED_FAIL
SEALED_PENDING_REVIEW -> CONSUMED_PASS
SEALED_PENDING_REVIEW -> CONSUMED_FAIL
```

Terminal states have no outgoing transition. Boot change, crash during an active
lease, expiry, final-approver timeout, uncertain anchor update and any gate
failure select only `CONSUMED_FAIL`. `CONSUMED_PASS` requires approved D3, P4
root, cleanup true and gates 1-23 passed. D4 is created afterward.

The exact 24 gate names and their mutation mapping are normative in the control
graph. D2 success has gates 1-20 passed and no PASS. Gate 21 then resolves P0-P3
including D2; gate 22 validates signer/ledger state; D3 approval adds gate 23.
D4 adds gate 24. A failure verdict has one first failed gate and no later passed
gate. Mutation evidence requires its D0 tuple to match `mutationCaseId`,
`expectedFailedGateName`, the sole `failedGateNames` entry and
`observedErrorId`; any mismatch fails `E_GATE_VERDICT_INCONSISTENT`.

## 13. Observer event and load structures

`ObserverEventR3` exact fields are schema/version, observer/socket IDs, sequence,
prior/event hashes, monotonic time, boot ID, namespace/ifindex/direction,
link/network/transport classes, source/destination class, port class, packet
length, taxonomy class, mutation ID or null, kill-switch phase and
`contentCaptured:false`.

The exhaustive pristine taxonomy is:

```text
AUTHORIZED_CANDIDATE_RELAY
AUTHORIZED_RELAY_FAKE_DNS
AUTHORIZED_RELAY_FAKE_PROVIDER
DENIED_DNS
DENIED_IPV6
DENIED_IPV4_MAPPED
DENIED_NAT64
DENIED_METADATA
DENIED_LOOPBACK_CROSS_NAMESPACE
DENIED_LINK_LOCAL
DENIED_MULTICAST_OR_BROADCAST
DENIED_UNMANAGED_ROUTE
DENIED_OTHER
```

Mutation-only classes are `M16_BOUNDED_LOAD` and
`M17_INTENTIONALLY_UNCLASSIFIED`. The latter increments unclassified count
instead of being accepted as a normal class.

Exact envelopes:

| Run | pps | Packet sizes | Burst | Duration | Emitter limit | Observer limit | Expected drops | Expected unclassified |
| --- | ---: | --- | ---: | ---: | --- | --- | --- | --- |
| pristine | 2,000 | 64, 256, 1024 | 250 | 30,000 ms | 1 CPU, 64 MiB, 16 pids | 2 CPU, 256 MiB, 32 pids | exactly 0 | exactly 0 |
| M16 | 100,000 | 64 | 10,000 | at most 5,000 ms | 1 CPU, 64 MiB, 16 pids | 1 CPU, 64 MiB, 32 pids; socket buffer 4,096 bytes | at least 1 | exactly 0 |
| M17 | 1 | 64 | 1 | at most 1,000 ms | 0.25 CPU, 32 MiB, 8 pids | pristine observer limits | exactly 0 | exactly 1 |

M16/M17 are failing mutation runs and are never evaluated against pristine PASS
criteria. If M16 cannot produce a kernel-reported drop within its envelope, the
mutation verdict is `NOT_EXERCISED`; the run still follows the exact
block/kill/cleanup sequence below. If M17 loses the packet, its mutation verdict
is likewise `NOT_EXERCISED` and cleanup remains mandatory.

Shutdown order is exact: outer+inner counted block readback; target cgroup kill;
capture drain to kernel queue empty; PACKET_STATISTICS per socket; final netlink
inventory; signed last event/root; close sockets; verify observer cgroup empty;
observer-signer shutdown receipt. Missing any step is incomplete.

## 14. NTFS broker handle protocol

### 14.1 Open and identity rules

The broker pins an NTFS volume GUID and opens the root directory by handle. A
submission uses `CreateFileW(..., CREATE_NEW)` under a broker-generated pending
name with `GENERIC_READ|GENERIC_WRITE|READ_CONTROL|WRITE_DAC|ACCESS_SYSTEM_SECURITY`,
share mode `0`, `FILE_FLAG_WRITE_THROUGH|FILE_FLAG_OPEN_REPARSE_POINT`, and
`SECURITY_ATTRIBUTES.bInheritHandle=FALSE`. `SetHandleInformation` confirms
inheritance disabled.

Before and after every boundary it obtains:

- `GetFinalPathNameByHandleW(FILE_NAME_NORMALIZED|VOLUME_NAME_GUID)`;
- `GetFileInformationByHandleEx(FileIdInfo)` volume serial and 128-bit file ID;
- `FileStandardInfo` link count exactly 1;
- reparse-point info: none;
- stream enumeration: exactly unnamed `::$DATA`;
- owner, protected DACL and SACL hashes.

The final path must remain under the opened root directory on the pinned volume.
Any reparse tag, junction, symbolic link, hard-link count above 1, alternate
stream, volume/file-ID change or normalized-path escape is fatal.

### 14.2 Security descriptor and read handles

Owner is the dedicated evidence-broker service SID. The protected DACL grants
broker full object rights, resolver `FILE_READ_DATA|READ_CONTROL` only, and no
write/delete/owner/DACL right to policy, controller, supervisor, runtime owner,
WSL users, reviewer or publisher. The SACL audits every failed write/delete/
owner/DACL attempt and every successful broker seal. Host administrator
compromise remains out of scope and invalidates the proof.

After seal, resolver opens with `GENERIC_READ|READ_CONTROL`, share mode
`FILE_SHARE_READ`, `OPEN_EXISTING`, non-inheritable and open-reparse-point flags.
No `FILE_SHARE_WRITE` or `FILE_SHARE_DELETE` is permitted.

### 14.3 Durable state machine

Exact broker states:

```text
REQUEST_ACCEPTED -> PENDING_CREATED -> BYTES_WRITTEN -> FILE_FLUSHED
-> SAME_HANDLE_READBACK -> ACL_SEALED -> FINAL_NAME_COMMITTED
-> INDEX_PREPARED -> INDEX_FLUSHED -> FINAL_HANDLE_READBACK -> RECEIPT_SIGNED
```

The broker writes exact declared bytes, calls `FlushFileBuffers`, seeks and
rehashes through the same handle, applies owner/DACL/SACL, flushes again, and
commits the final create-only name with `MoveFileExW(MOVEFILE_WRITE_THROUGH)`
after proving the final name absent. Its append-only hash-chained index journal
records a PREPARED entry and is flushed, then records COMMITTED with the final
handle identity and is flushed. Only then is the signed receipt returned.

Crash disposition is exact:

| Boundary | Recovery |
| --- | --- |
| before PENDING_CREATED | no object; request may be retried with a new submission ID |
| partial write through pre-flush | quarantine pending file; object ID permanently burned |
| FILE_FLUSHED/SAME_HANDLE_READBACK | recover only if bytes and prepared request match; otherwise quarantine |
| ACL_SEALED before final rename | finish same prepared transaction after full revalidation |
| final rename before INDEX_PREPARED | orphan final object quarantined; never auto-indexed |
| INDEX_PREPARED before INDEX_FLUSHED | quarantine unless journal checksum proves full record |
| INDEX_FLUSHED before COMMITTED | complete only from exact prepared record and final handle identity |
| COMMITTED before receipt return | idempotently return the already signed receipt after readback |

An object is evidence only in `RECEIPT_SIGNED`. No recovery overwrites bytes,
reuses a burned object ID or accepts path-only identity.

## 15. Replay anchor protocol

The disk journal has exactly five logical tables:

- `ledger_meta(ledger_id PRIMARY KEY, schema_version, disk_generation,
  disk_head_hash, machine_id_hash, ledger_key_name_hash)`;
- `nonce_current(nonce_hash, authority_generation, state, run_id, lease_id,
  windows_boot_id, wsl_boot_id, expires_at, final_event_sequence,
  PRIMARY KEY(nonce_hash, authority_generation))`;
- `nonce_events(event_sequence PRIMARY KEY, nonce_hash, authority_generation,
  prior_event_hash, event_hash, transition, transaction_id, anchor_generation,
  anchor_quote_hash, commit_state)`; rows are append-only;
- `run_leases(concurrency_domain PRIMARY KEY, lease_id UNIQUE, nonce_hash,
  authority_generation, owner_identity, acquired_at, expires_at, state)` with a
  partial unique constraint permitting one `HELD` lease per domain;
- `anchor_prepared(transaction_id PRIMARY KEY, expected_generation UNIQUE,
  prepared_event_hash UNIQUE, disk_fsync_receipt_hash, state)`.

Triggers refuse UPDATE/DELETE of committed event rows, state transitions outside
the exact table, release without a terminal consume event, and more than one
prepared transaction. `BEGIN IMMEDIATE`, WAL, `synchronous=FULL`, application
ID and page size are verified before every transition. T1 inserts the nonce
event, current state, lease and prepared anchor row and **commits**. Only after a
FULL checkpoint, database and directory fsync, and independent reopen/readback
may the TPM operation begin. T2 starts after the quote verifies; it finalizes
the same transaction by compare-and-swap. Reservation and terminal consume use
the same protocol. No transaction spans TPM I/O.

The TPM external state is one `TPMA_NV_COUNTER` index and two alternating
fixed-size head indices. A head record contains exact canonical fields
`ledgerId`, `machineIdSha256`, counter generation, `eventHeadSha256`,
`ledgerKeyNameSha256`, `registryHash` and `lastBootBindingHash`. Counter and both
slots are quoted under a non-migratable TPM key and selected PCRs. The highest
valid quoted slot whose generation equals the counter is authoritative. Disk
rows contain the matching quote receipt hash.

The complete crash matrix is normative:

| Boundary | Durable disk | TPM counter/slot | Head/publication | Only allowed recovery | Acceptor | Error when contradictory | Retry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before T1 | prior committed head | n / slot n | prior | start a new transaction ID | `semantic-validator` | `E_LEDGER_ANCHOR_MISMATCH` | yes, new ID |
| T1 begun, not committed | prior committed head | n / slot n | prior | SQLite rollback; burn uncommitted ID | `semantic-validator` | `E_LEDGER_PREPARE_NOT_DURABLE` | yes, new ID |
| T1 committed, before durability proof | PREPARED n+1 | n / slot n | prior | complete proof and continue exact transaction; otherwise halt with no TPM or terminal claim | `semantic-validator` | `E_LEDGER_PREPARE_NOT_DURABLE` | same ID only for proof |
| durability proven, before TPM increment | PREPARED n+1 | n / slot n | prior | complete exact prepared transition to n+1, then anchor a separate `CONSUMED_FAIL` transition | `semantic-validator` | `E_LEDGER_ORPHAN_PREPARED` | same transaction for recovery; no run retry |
| counter incremented, slot old | PREPARED n+1 | n+1 / slot n | prior | write exact prepared hash to inactive slot, quote, T2 finalize, then consume fail | `semantic-validator` | `E_LEDGER_TORN_WRITE_UNRECOVERABLE` | same ID only |
| slot write uncertain | PREPARED n+1 | n+1 / slot n or n+1 | prior | read both slots; complete only exact matching hash | `semantic-validator` | `E_LEDGER_TORN_WRITE_UNRECOVERABLE` | same ID only |
| quote verified, before T2 | PREPARED n+1 | n+1 / slot n+1 | prior | T2 compare-and-swap same bytes, then consume fail if run was active | `semantic-validator` | `E_LEDGER_ANCHOR_MISMATCH` | same ID only |
| T2 committed, receipt not returned | COMMITTED n+1 | n+1 / slot n+1 | new disk head | return byte-identical existing receipt after readback | `semantic-validator` | `E_LEDGER_ANCHOR_MISMATCH` | idempotent return |
| consume-pass committed, D4 absent | terminal COMMITTED | matching terminal head | no D4 | publish exact intended D4 object ID once | `evidence-broker` | `E_LEDGER_FINALIZATION_INVALID` | same publication key |
| D4 sealed, P5 absent | terminal COMMITTED | matching terminal head | one D4 | resolve existing D4 and create P5 root | `evidence-resolver` | `E_LEDGER_FINALIZATION_INVALID` | same publication key |
| P5 committed, receipt not returned | terminal COMMITTED | matching terminal head | D4 and P5 present | return existing P5 receipt | `evidence-resolver` | `E_LEDGER_FINALIZATION_INVALID` | idempotent return |

Any missing prepare bytes, two prepared candidates, generation gap above one,
wrong NV public name, wrong policy/attributes/size, foreign machine, duplicate
terminal transition, second D4 object or unknown state is unrecoverable and
fails closed. A second run cannot acquire the unique active concurrency domain.
A disk backup behind the TPM generation is rejected. A copied ledger cannot use
another TPM key or NV indices. TPM clear/loss does not permit fallback; only the
independently authorized compromise-recovery transition can start a new ledger
ID, after all prior outstanding authority is terminally failed and tombstoned.

## 16. Design-only conclusion

The executable D0 example validates only the design family. It demonstrates:

- `executionAuthorized:false`;
- `syntheticFixtureExecutionAuthorized:false`;
- `realCandidateExecutionAuthorized:false`;
- `providerExecutionAuthorized:false`;
- `realCandidateInvocations:0`;
- `providerCalls:0`.

No schema, validator contract or example authorizes implementation or execution.
