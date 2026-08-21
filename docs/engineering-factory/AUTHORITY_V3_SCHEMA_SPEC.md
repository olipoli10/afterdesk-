# Authority V3 schema specification

Status: design-only; no runtime import is authorized

Schema version: 3

Kind: provider-free-synthetic-candidate-compatibility-authority

Scope: candidate-specific-provider-free-rehearsal

## 1. Normative rules

The words MUST, MUST NOT, REQUIRED, SHALL and SHALL NOT are normative.

1. The authority is canonical UTF-8 JSON with sorted object keys, no duplicate
   keys, no insignificant whitespace, integers only where the schema declares
   integers, and RFC 3339 UTC timestamps with millisecond precision.
2. Unknown fields are refused at every object level.
3. All SHA-256 values are lowercase 64-character hexadecimal strings over the
   exact stored bytes.
4. Every artifact reference contains artifactId, kind, relativePath, sha256,
   byteSize, mediaType, schemaId, producerIdentity, signerKeyId and
   storageObjectId. Empty signerKeyId is permitted only for source bytes whose
   integrity is anchored by Git and the signed resolver manifest.
5. relativePath is a normalized relative path beneath one immutable evidence
   root. Absolute paths, drive letters, parent segments, alternate data streams,
   symlinks, junctions and hard links are refused.
6. Any content-sensitive field name or value is forbidden. Forbidden classes
   include prompt, completion, output text, client data, credentials, tokens,
   cookies, authorization headers, request or response bodies, raw argv values
   beyond the approved grammar tokens, and environment values.
7. Artifact hashes alone are not evidence. Every required artifact MUST appear
   in evidence.resolverManifest.artifacts and MUST be opened, size-checked,
   hashed and schema-validated before GATE_V3_EVIDENCE_RESOLVED passes.
8. No result with verdict SYNTHETIC_PASS may exist before
   cleanup.finalExternalCleanupAttestation is resolved and
   GATE_V3_EXTERNAL_CLEANUP_VERIFIED passes.
9. The design instance has all authorization booleans false. A future issued
   run may set only syntheticFixtureExecutionAuthorized to true after separate
   explicit authorization. All other authorization constants remain false.

## 2. Top-level object

The exact top-level keys are:

| Field | Type | Required rule |
| --- | --- | --- |
| schemaVersion | integer | constant 3 |
| kind | string | constant provider-free-synthetic-candidate-compatibility-authority |
| scope | string | constant candidate-specific-provider-free-rehearsal |
| designMilestone | string | constant AUTHORITY_V3_CANDIDATE_COMPATIBILITY_DESIGN_ONLY in design artifacts |
| executionAuthorized | boolean | constant false |
| syntheticFixtureExecutionAuthorized | boolean | false in this milestone; the only field that a future separately approved run authority may set true |
| realCandidateExecutionAuthorized | boolean | constant false |
| modelExecutionAuthorized | boolean | constant false |
| providerExecutionAuthorized | boolean | constant false |
| credentialsAuthorized | boolean | constant false |
| realCandidateInvocations | integer | constant 0 |
| providerCalls | integer | constant 0 |
| run | RunV3 | required |
| candidateContract | CandidateContractV3 | required |
| runtime | RuntimeV3 | required |
| networkPolicy | NetworkPolicyV3 | required |
| observer | ObserverV3 | required |
| evidence | EvidenceV3 | required |
| cleanup | CleanupV3 | required |
| approvals | ApprovalsV3 | required |
| result | ResultV3 | required |

## 3. Common types

### 3.1 IdentityV3

Exact fields:

- identityId: stable opaque identifier, 1 to 128 safe ASCII characters;
- role: one of policy-authority, observer-signer, enforcement-controller,
  runtime-supervisor, rootless-runtime-owner, evidence-store, replay-ledger,
  cleanup-verifier or final-approver;
- operatingSystemIdentity: content-free UID, SID or service-account identifier;
- binarySha256: exact executable bytes;
- configurationSha256: exact configuration bytes;
- keyId: pinned key identifier or null when the role never signs;
- publicKeySha256: pinned DER SubjectPublicKeyInfo hash or null;
- authorityGeneration: positive integer;
- trustRootRegistrySha256: hash of the pre-run trust-root registry.

IdentityV3 MUST NOT include display names, email addresses, secrets or private
key locations.

### 3.2 ArtifactReferenceV3

Exact fields:

- artifactId: unique opaque ID;
- kind: registered artifact kind;
- relativePath: safe path beneath the immutable evidence root;
- sha256: exact-byte hash;
- byteSize: non-negative integer;
- mediaType: allowlisted media type;
- schemaId: exact schema identifier or null for opaque binary bytes;
- producerIdentity: IdentityV3 identityId;
- signerKeyId: pinned signer key ID or null;
- storageObjectId: create-only store receipt ID;
- createdSequence: positive evidence-store sequence;
- contentSensitive: constant false;
- resolved: boolean, false until independent verification;
- resolutionReceiptSha256: hash of the resolver receipt or null before
  resolution.

### 3.3 SignedReceiptV3

Exact fields:

- receiptKind;
- subjectSha256;
- sequence;
- issuedAt;
- machineBootId;
- monotonicNanoseconds;
- signerKeyId;
- signatureAlgorithm: an allowlisted algorithm pinned in the trust registry;
- signatureBase64;
- trustRootRegistrySha256.

The receipt bytes themselves are an ArtifactReferenceV3.

### 3.4 AbsentAttestationV3

Exact fields:

- componentName;
- expectedPathOrLocatorClass;
- searchBoundarySha256;
- searchMethodSha256;
- observedAbsent: constant true;
- observerIdentity;
- observedAtSequence;
- receipt: ArtifactReferenceV3.

An absent attestation is valid only when the search boundary and method are
resolved and signed. A missing field or failed search is not absence.

## 4. run: RunV3

Exact fields and rules:

| Field | Type | Rule |
| --- | --- | --- |
| runId | UUID | unique v4 UUID |
| oneShotNonce | SHA-256 | 256-bit random nonce represented by its SHA-256 |
| issuedAt | timestamp | policy-authority wall time |
| expiresAt | timestamp | later than issuedAt and within the approved maximum |
| monotonicTimeSourceIdentity | string | exact clock source and implementation fingerprint |
| monotonicIssuedNanoseconds | integer | non-negative |
| machineBootId | string | exact boot identifier, not a hostname |
| durableReplayLedgerEntry | DurableReplayLedgerEntryV3 | required |
| sourceCommitSha | Git SHA-1 | exact Engineering Factory commit |
| sourceTreeSha | Git tree SHA-1 | exact source tree |
| sourceRepositoryIdentitySha256 | SHA-256 | repository identity without remote credentials |
| authorityGenerationIdentity | IdentityV3 | policy authority |
| approvalGenerationIdentity | IdentityV3 | independent final approver |
| oneShotLease | OneShotLeaseV3 | required |
| concurrencyIdentity | string | exact single-host concurrency domain |
| runState | enum | DESIGN_ONLY, ISSUED, RESERVED, ACTIVE, TEARDOWN, CLEANUP_VERIFIED, REVIEWED, PASS_PUBLISHED or FAILED |
| stateSequence | integer | positive, monotonically increasing |
| priorStateReceiptSha256 | SHA-256 or null | null only for DESIGN_ONLY |

### 4.1 DurableReplayLedgerEntryV3

Exact fields:

- ledgerId;
- ledgerSchemaVersion;
- ledgerFileIdentitySha256;
- nonceHash;
- authorityGeneration;
- state: DESIGN_ONLY, ISSUED, RESERVED, CONSUMED_PASS, CONSUMED_FAIL or
  EXPIRED;
- appendSequence;
- priorEventHash;
- eventHash;
- transactionId;
- reservationReceipt: ArtifactReferenceV3 or null in DESIGN_ONLY;
- consumeReceipt: ArtifactReferenceV3 or null until consumed;
- fsyncReceiptSha256;
- integrityCheckReceiptSha256;
- bootIdBinding;
- expiresAt;
- recoveryDisposition: none or fail-consumed-after-crash.

The ledger MUST enforce a unique constraint on nonceHash plus
authorityGeneration and a unique active concurrency lease. RESERVED MUST never
transition back to ISSUED.

### 4.2 OneShotLeaseV3

Exact fields:

- leaseId;
- concurrencyIdentity;
- ownerIdentity;
- nonceHash;
- acquiredSequence;
- acquiredAt;
- monotonicAcquiredNanoseconds;
- bootId;
- expiresAt;
- state: DESIGN_ONLY, HELD, RELEASED_PASS, RELEASED_FAIL or RECOVERED_FAIL;
- signedReceipt: ArtifactReferenceV3 or null in DESIGN_ONLY.

## 5. candidateContract: CandidateContractV3

Exact fields:

| Field | Type | Rule |
| --- | --- | --- |
| candidateKind | string | constant deterministic-fake-cli |
| targetSurface | string | exact future candidate surface being shaped; not a product certification claim |
| compatibilitySnapshotSha256 | SHA-256 | canonical snapshot containing only the approved interface contract |
| fakeCliBinarySha256 | SHA-256 | exact future fake CLI executable bytes |
| fakeCliWrapperSha256 | SHA-256 | exact wrapper bytes |
| fakeCliSourceTreeSha256 | SHA-256 | source bundle tree fingerprint |
| argvContract | ArgvContractV3 | required |
| stdinContract | StdinContractV3 | required |
| stdoutContract | StreamContractV3 | required |
| stderrContract | StreamContractV3 | required |
| exitContract | ExitContractV3 | required |
| signalContract | SignalContractV3 | required |
| environmentAllowlist | array | sorted unique variable names; values never persisted |
| filesystemWorkspaceContract | FilesystemContractV3 | required |
| forbiddenRealBinaryHashes | array of SHA-256 | non-empty when future real candidate hashes are known; exact absence is still required |
| forbiddenRealBinaryPaths | array | canonical path classes; no user-specific secret path values |
| providerSdkAbsenceAttestations | array of AbsentAttestationV3 | one per declared SDK/binary class |
| noUpdateTelemetryBootstrapDiscoveryContract | NegativeCapabilityContractV3 | all fields true |
| localRelayTuple | string | exact local synthetic relay IP and port |
| fakePayloadSchemaSha256 | SHA-256 | fake-only request/response schema |
| subprocessContract | SubprocessContractV3 | exact allowed process tree |
| timeoutMilliseconds | integer | positive bounded value |
| cancellationGraceMilliseconds | integer | non-negative bounded value |
| maxCombinedRawStreamBytes | integer | positive bounded value |

### 5.1 ArgvContractV3

Exact fields:

- executableToken: constant ef-fake-candidate;
- grammarVersion;
- allowedSubcommand: constant compatibility-rehearsal;
- allowedFlags: sorted exact flag descriptors;
- forbiddenFlagPatterns: login, auth, provider, model, endpoint, update,
  telemetry, connector, plugin, install, download and package-bootstrap
  patterns;
- dynamicValuesAllowed: runId, contract version, input framing version and
  output framing version only;
- promptOrPayloadInArguments: constant false;
- unknownArgumentsRefused: constant true;
- normalizedArgvSha256.

### 5.2 StdinContractV3

Exact fields:

- framing: length-prefixed-json-lines;
- schemaSha256;
- maximumFrameBytes;
- maximumFrameCount;
- fakePayloadOnly: constant true;
- endOfStreamRequired: constant true;
- malformedFrameBehavior: constant refuse-before-relay;
- sensitiveContentAllowed: constant false;
- inputDigestProjectedToEvidence: constant false.

### 5.3 StreamContractV3

Exact fields:

- framing;
- allowedEnvelopeSchemaSha256;
- maximumFrameBytes;
- maximumTotalBytes;
- backpressureMode: bounded-blocking;
- rawBytesEphemeral: constant true;
- rawBytesPersisted: constant false;
- contentFieldsPersisted: constant false;
- truncationBehavior: constant kill-and-fail;
- malformedEnvelopeBehavior: constant kill-and-fail.

### 5.4 ExitContractV3 and SignalContractV3

ExitContractV3 exact fields:

- successCode: 0;
- refusalCodes: exact map of named code to gate-safe reason class;
- internalFailureCode;
- timeoutCode;
- cancellationCode;
- unknownExitFails: true.

SignalContractV3 exact fields:

- acceptedSupervisorSignals: exact ordered list;
- candidateMayHandle: false for KILL and true only for the named graceful
  cancellation signal;
- cancellationSequenceSha256;
- blockBeforeKillRequired: true;
- unexpectedSignalFails: true.

### 5.5 FilesystemContractV3

Exact fields:

- bundleRootReadOnly;
- workspaceRoot;
- resultRoot;
- tmpfsRoots;
- allowedReadObjects: array of ArtifactReferenceV3;
- allowedWriteRelativePaths: exact allowlist;
- maximumWriteBytes;
- maximumFiles;
- symlinksAllowed: false;
- hardLinksAllowed: false;
- deviceNodesAllowed: false;
- hostMountsAllowed: false;
- runtimeSocketMountsAllowed: false;
- gitMetadataMode: none or private-detached-copy;
- parentRepositoryReachable: false;
- postRunWorkspaceTreeSha256;

### 5.6 NegativeCapabilityContractV3

All exact boolean fields are true:

- providerSdkAbsent;
- providerBinaryAbsent;
- modelBinaryAbsent;
- loginDisabled;
- accountDiscoveryDisabled;
- oauthDisabled;
- apiKeyInputDisabled;
- updateDisabled;
- downloadDisabled;
- packageBootstrapDisabled;
- telemetryDisabled;
- connectorDiscoveryDisabled;
- pluginDiscoveryDisabled;
- externalToolDiscoveryDisabled;
- inheritedProxyDisabled;
- inheritedCredentialDiscoveryDisabled.

## 6. runtime: RuntimeV3

Exact fields:

- wsl: ComponentMeasurementV3;
- kernel: ComponentMeasurementV3;
- podman: ComponentMeasurementV3;
- crun: ComponentMeasurementV3;
- netavark: ComponentOrAbsentV3;
- aardvark: ComponentOrAbsentV3;
- slirp4netns: ComponentOrAbsentV3;
- pasta: ComponentOrAbsentV3;
- seccompProfile: ComponentMeasurementV3;
- ociSpec: ArtifactReferenceV3;
- imageDigest: OCI digest;
- imageManifest: ArtifactReferenceV3;
- uidMap: exact ordered mappings;
- gidMap: exact ordered mappings;
- capabilities: exact permitted, effective, inheritable, ambient and bounding
  sets, all empty for the fake CLI;
- mounts: exact ordered mount objects;
- devices: exact ordered device objects, empty unless the design names one;
- inheritedFileDescriptors: exact array, only stdin/stdout/stderr plus approved
  barrier descriptors;
- inheritedSockets: exact array, empty;
- cgroupIdentity;
- cgroupControllers and exact limits;
- pidNamespaceInode;
- userNamespaceInode;
- networkNamespaceInode;
- mountNamespaceInode;
- controllerIdentity: IdentityV3;
- runtimeOwnerIdentity: IdentityV3;
- supervisorIdentity: IdentityV3;
- immutableNamespaceBinding: NamespaceBindingV3;
- runtimeInspectArtifact: ArtifactReferenceV3;
- ociStateArtifact: ArtifactReferenceV3;
- processTreeArtifact: ArtifactReferenceV3;
- fdSocketInventoryArtifact: ArtifactReferenceV3;

### 6.1 ComponentMeasurementV3

Exact fields:

- name;
- version;
- binaryPathClass;
- binarySha256;
- packageOrBuildIdentitySha256;
- configurationSha256;
- observedByIdentity;
- measurementReceipt: ArtifactReferenceV3.

ComponentOrAbsentV3 is exactly one of ComponentMeasurementV3 or
AbsentAttestationV3.

### 6.2 NamespaceBindingV3

Exact fields:

- bindingSequence;
- capturedAt;
- monotonicNanoseconds;
- machineBootId;
- candidatePid;
- candidatePidStartTimeTicks;
- pidNamespaceInode;
- userNamespaceInode;
- networkNamespaceInode;
- mountNamespaceInode;
- enforcementNamespaceInode;
- namespaceOwnerUid;
- interfaceInventorySha256;
- routeInventorySha256;
- rulesetSha256;
- ociSpecSha256;
- processTreeSha256;
- cgroupSha256;
- fdSocketInventorySha256;
- controllerReceipt: ArtifactReferenceV3;
- observerReceipt: ArtifactReferenceV3;
- stableThroughBarrierRelease: boolean.

The final binding MUST be captured after firewall readback and observer
readiness, immediately before barrier release.

## 7. networkPolicy: NetworkPolicyV3

Exact fields:

- policyId;
- policyGeneration;
- hostEnforcementNamespaceInode;
- hostEnforcementNamespaceOwnerIdentity;
- candidateNamespaceInode;
- relayNamespaceInode;
- fakeDnsNamespaceInode;
- fakeProviderNamespaceInode;
- canonicalRulesetObjects: non-empty ordered array of CanonicalRulesetV3;
- normalizedRulesetSha256;
- familyHookPriorityPolicyBindings: exact ordered array;
- interfaceIdentities: exact ordered array of name, ifindex, MAC hash, peer
  ifindex, namespace inode and owner;
- routeObjects: exact ordered array of RouteObjectV3;
- candidateToRelayRoute: exact tuple;
- relayToFakeDnsRoute: exact tuple;
- relayToFakeProviderRoute: exact tuple;
- allOtherTrafficDeny: true;
- windowsRoutesPresent: false;
- providerRoutesPresent: false;
- providerFqdnOrIpPresent: false;
- unmanagedInterfacePresent: false;
- defaultRoutePresent: false;
- dnsControls: DnsControlsV3;
- ipv6Controls: Ipv6ControlsV3;
- metadataControls: MetadataControlsV3;
- hostGatewayControls: HostGatewayControlsV3;
- runtimeHelperControls: RuntimeHelperControlsV3;
- installReceipt: ArtifactReferenceV3;
- readbackReceipt: ArtifactReferenceV3;
- finalRebindReceipt: ArtifactReferenceV3;
- continuousDriftLog: ArtifactReferenceV3;

### 7.1 CanonicalRulesetV3

Exact fields:

- namespaceInode;
- family;
- table;
- chain;
- hook;
- priority;
- policy;
- interfaceMatch;
- sourcePrefix;
- destinationPrefix;
- protocol;
- sourcePort;
- destinationPort;
- conntrackStates;
- verdict;
- counterName;
- ruleHandle;
- normalizedObjectSha256.

The complete normalized object array is retained. A single aggregate hash is
insufficient.

### 7.2 RouteObjectV3

Exact fields:

- namespaceInode;
- family;
- destinationPrefix;
- sourcePrefix;
- gateway;
- outputInterfaceIfindex;
- routeTable;
- routeType;
- metric;
- protocol;
- scope;
- allowedPurpose.

No Windows route, Internet route, provider FQDN/IP, default route, unmanaged
interface or host gateway route is allowed.

### 7.3 DNS, IPv6, metadata, host gateway and helper controls

DnsControlsV3 exact fields:

- candidateResolverConfigured: false;
- directUdp53Allowed: false;
- directTcp53Allowed: false;
- dotAllowed: false;
- dohAllowed: false;
- relayFakeDnsTuple;
- resolvConfSha256;
- hostsFileSha256.

Ipv6ControlsV3 exact fields:

- candidateIpv6Addresses: empty array;
- candidateIpv6Routes: empty array;
- ipv6RulesetPolicyDrop: true;
- ipv4MappedIpv6Denied: true;
- nat64Denied: true.

MetadataControlsV3 exact fields:

- ipv4LinkLocalDenied: true;
- ipv6LinkLocalDenied: true;
- cloudMetadataPrefixes: exact denied list;
- unixMetadataSockets: empty.

HostGatewayControlsV3 exact fields:

- loopbackExceptSelfDenied: true;
- hostGatewayRoutePresent: false;
- hostAliasesPresent: false;
- windowsInteropPresent: false;
- runtimeSocketPresent: false.

RuntimeHelperControlsV3 exact fields:

- netavark: ComponentOrAbsentV3;
- aardvark: ComponentOrAbsentV3;
- slirp4netns: ComponentOrAbsentV3;
- pasta: ComponentOrAbsentV3;
- helperProcessInventory: ArtifactReferenceV3;
- unexpectedHelperCount: 0.

## 8. observer: ObserverV3

Exact fields:

- observerId;
- trustRootRegistrySha256;
- prePinnedPublicKeySha256;
- signerKeyId;
- signerIdentity: IdentityV3;
- signerRotationPolicySha256;
- observerBinarySha256;
- observerRuntimeSha256;
- observerConfigurationSha256;
- namespaceInodes: non-empty sorted array;
- cgroupIdentity;
- capabilities;
- uid;
- gid;
- completeInterfaceSet: non-empty array of ObserverInterfaceV3;
- serviceReadyAttestation: ArtifactReferenceV3;
- serviceReadyBeforeNonceReservation: true;
- captureReadyAttestation: ArtifactReferenceV3;
- captureReadyBeforeBarrierRelease: true;
- monotonicTimeline: ArtifactReferenceV3;
- rawMetadataLog: ArtifactReferenceV3;
- perObserverDistribution: ArtifactReferenceV3;
- packetStatistics: array of PacketStatisticsV3;
- socketBufferBytes;
- kernelDrops: 0;
- unclassifiedEvents: 0;
- sequenceGapCount: 0;
- shutdownAttestation: ArtifactReferenceV3;
- shutdownComplete: boolean;
- signerSubstitutionRefused: boolean;
- contentCaptureEnabled: false.

### 8.1 ObserverInterfaceV3

Exact fields:

- namespaceInode;
- interfaceName;
- ifindex;
- peerIfindex;
- linkType;
- observedDirections: exact array containing ingress and egress;
- expectedPurpose;
- observerProcessIdentity;
- observerConfigurationSha256;
- readySequence;
- shutdownSequence;
- eventCount;
- classifiedEventCount;
- unclassifiedEventCount: 0;
- firstMonotonicNanoseconds;
- lastMonotonicNanoseconds.

### 8.2 PacketStatisticsV3

Exact fields:

- observerProcessIdentity;
- namespaceInode;
- ifindex;
- socketBufferRequestedBytes;
- socketBufferEffectiveBytes;
- packetStatisticsAvailable: true;
- packetsDelivered;
- packetsDroppedByKernel: 0;
- queueFreezeCount;
- statisticsReadAtShutdown: true;
- receipt: ArtifactReferenceV3.

An unavailable PACKET_STATISTICS result is fatal. It cannot be represented as
zero drops.

### 8.3 Observer event schema

Every metadata event has:

- schemaVersion: 3;
- observerId;
- signerEpoch;
- sequence;
- priorEventHash;
- eventHash;
- monotonicNanoseconds;
- timeSourceIdentity;
- machineBootId;
- namespaceInode;
- ifindex;
- direction;
- linkProtocolClass;
- networkProtocolClass;
- sourceClass;
- destinationClass;
- sourcePortClass;
- destinationPortClass;
- packetLength;
- classification;
- killSwitchPhase;
- contentCaptured: false.

No address, body, header, query, credential, prompt or output content is
retained. Exact allowed synthetic tuple identities are represented by stable
classes bound in the policy, not user content.

## 9. evidence: EvidenceV3

The selected implementation target is the separate Windows-host,
service-identity NTFS evidence broker defined by the ADR. Its create-new,
write-through, FlushFileBuffers, ACL-seal and readback receipts are required
artifacts. This specification does not authorize creating that service or
store.

Exact fields:

- storeIdentity: IdentityV3;
- storeRootIdentitySha256;
- immutableStoragePolicySha256;
- createOnly: true;
- resolverManifest: ResolverManifestV3;
- allArtifactsResolved: boolean;
- allArtifactsByteVerified: boolean;
- signedHashChainRoot: ArtifactReferenceV3;
- independentReviewerBundle: ArtifactReferenceV3;
- contentSensitiveFieldsPresent: false;
- storeFsyncReceipt: ArtifactReferenceV3;
- storeCloseReceipt: ArtifactReferenceV3;
- evidenceGenerationSequence;
- passArtifactReference: ArtifactReferenceV3 or null;

### 9.1 ResolverManifestV3

Exact fields:

- schemaVersion: 3;
- runId;
- authoritySha256;
- evidenceRootIdentitySha256;
- artifacts: exact non-empty array of ArtifactReferenceV3;
- requiredArtifactKinds: exact sorted array;
- hashAlgorithm: sha256;
- pathPolicySha256;
- symlinkCount: 0;
- hardLinkCount: 0;
- missingArtifactCount: 0;
- sizeMismatchCount: 0;
- hashMismatchCount: 0;
- schemaMismatchCount: 0;
- signerMismatchCount: 0;
- resolverIdentity: IdentityV3;
- resolverBinarySha256;
- resolutionSequenceStart;
- resolutionSequenceEnd;
- resolutionReceipt: ArtifactReferenceV3.

Required artifact kinds are:

1. authority-v3;
2. trust-root-registry;
3. replay-reservation-receipt;
4. replay-consume-receipt;
5. compatibility-snapshot;
6. fake-cli-binary;
7. fake-cli-wrapper;
8. fake-cli-source-tree;
9. fake-payload-schema;
10. provider-sdk-absence-attestations;
11. runtime-component-measurements;
12. oci-spec;
13. image-manifest;
14. runtime-inspect;
15. oci-state;
16. process-tree;
17. fd-socket-inventory;
18. namespace-prebind;
19. canonical-ruleset-objects;
20. route-and-interface-inventory;
21. firewall-install-receipt;
22. firewall-readback-receipt;
23. observer-service-ready-attestation;
24. observer-capture-ready-attestation;
25. observer-raw-metadata-log;
26. observer-monotonic-timeline;
27. observer-per-interface-distribution;
28. observer-packet-statistics;
29. final-rebind-receipt;
30. continuous-drift-log;
31. kill-switch-proof;
32. process-cgroup-teardown;
33. privileged-deletion-acknowledgments;
34. external-before-snapshot;
35. external-after-snapshot;
36. external-cleanup-verification;
37. observer-shutdown-attestation;
38. signer-chain-verification;
39. real-mutation-manifest;
40. per-mutation-evidence;
41. source-and-state-restoration-proof;
42. evidence-hash-chain-root;
43. independent-reviewer-bundle;
44. final-review-decision;
45. synthetic-pass-pointer, only when all gates passed.

## 10. cleanup: CleanupV3

Exact fields:

- externalBeforeSnapshot: ArtifactReferenceV3;
- externalAfterSnapshot: ArtifactReferenceV3;
- anonymousNamespaceInventories: array of NamespaceInventoryV3;
- rulesetInventoryBefore: ArtifactReferenceV3;
- rulesetInventoryAfter: ArtifactReferenceV3;
- interfaceInventoryBefore: ArtifactReferenceV3;
- interfaceInventoryAfter: ArtifactReferenceV3;
- routeInventoryBefore: ArtifactReferenceV3;
- routeInventoryAfter: ArtifactReferenceV3;
- processInventoryBefore: ArtifactReferenceV3;
- processInventoryAfter: ArtifactReferenceV3;
- cgroupInventoryBefore: ArtifactReferenceV3;
- cgroupInventoryAfter: ArtifactReferenceV3;
- filesystemInventoryBefore: ArtifactReferenceV3;
- filesystemInventoryAfter: ArtifactReferenceV3;
- podmanInventoryBefore: ArtifactReferenceV3;
- podmanInventoryAfter: ArtifactReferenceV3;
- observerInventoryBefore: ArtifactReferenceV3;
- observerInventoryAfter: ArtifactReferenceV3;
- signerInventoryBefore: ArtifactReferenceV3;
- signerInventoryAfter: ArtifactReferenceV3;
- keyInventoryBefore: ArtifactReferenceV3;
- keyInventoryAfter: ArtifactReferenceV3;
- tempRootInventoryBefore: ArtifactReferenceV3;
- tempRootInventoryAfter: ArtifactReferenceV3;
- windowsNetworkInventory: ArtifactReferenceV3 or BoundaryLimitationV3;
- deletionAcknowledgments: non-empty array of DeletionAcknowledgmentV3;
- deletionFailureCount: 0;
- residualObjectCount: 0;
- beforeAfterEquivalent: true;
- finalExternalCleanupAttestation: ArtifactReferenceV3 or null until complete;
- finalCleanupAttestationSequence;
- passArtifactObservedBeforeFinalCleanup: false;

NamespaceInventoryV3 exact fields include every namespace inode, type, owner,
open-reference process, interfaces, routes, rulesets, peer relationships and
inventory receipt. Anonymous namespaces MUST be enumerated through process and
runtime references; named ip-netns output alone is insufficient.

DeletionAcknowledgmentV3 exact fields:

- objectKind;
- objectIdentity;
- deleteRequestedSequence;
- deleteCompletedSequence;
- commandOrApiIdentitySha256;
- exitStatus;
- stderrClass;
- objectAbsentAfterDelete: true;
- controllerSignerKeyId;
- receipt: ArtifactReferenceV3.

Any missing acknowledgment, non-zero exit, unverifiable stderr class or object
still present makes cleanup fatal.

BoundaryLimitationV3 exact fields:

- boundaryName;
- limitation;
- affectedClaims;
- reviewerDisposition: must-refuse or accepted-non-claim;
- signedReceipt.

A Windows inventory limitation can only narrow the proof to a boundary with no
Windows claim. It cannot waive evidence of a route that could carry fixture
traffic outside WSL.

## 11. approvals: ApprovalsV3

Exact fields:

- policyAuthorityReceipt: ArtifactReferenceV3;
- observerSignerReceipt: ArtifactReferenceV3;
- controllerReadbackReceipt: ArtifactReferenceV3;
- signerChainVerification: ArtifactReferenceV3;
- cleanupVerifierReceipt: ArtifactReferenceV3 or null until cleanup;
- independentReviewerBundle: ArtifactReferenceV3 or null until review;
- finalReviewDecision: ArtifactReferenceV3 or null until review;
- reviewerIdentity: IdentityV3;
- reviewerIndependentFromProducers: boolean;
- requiredGateNames: exact ordered gate registry;
- passedGateNames: exact ordered subset;
- failedGateNames: exact ordered subset;
- approvalState: DESIGN_ONLY, NOT_REVIEWED, REFUSED or APPROVED_SYNTHETIC_PASS;

reviewerIndependentFromProducers is true only when the reviewer key ID, OS
identity and binary identity differ from policy, observer, controller,
supervisor, runtime owner, evidence-store and replay-ledger producers.

## 12. result: ResultV3

Exact fields:

- verdict: DESIGN_ONLY, SYNTHETIC_PASS, SYNTHETIC_FAIL or QUARANTINED;
- designVerdict: DESIGN_READY_FOR_INDEPENDENT_REVIEW,
  DESIGN_NEEDS_REVISION or DESIGN_BLOCKED;
- syntheticPassPublished: boolean;
- passPublicationSequence: integer or null;
- passPublicationReceipt: ArtifactReferenceV3 or null;
- cleanupVerifiedBeforePass: boolean;
- allEvidenceResolvedBeforePass: boolean;
- independentApprovalBeforePass: boolean;
- executionAuthorized: false;
- realCandidateExecutionAuthorized: false;
- modelExecutionAuthorized: false;
- providerExecutionAuthorized: false;
- credentialsAuthorized: false;
- realCandidateInvocations: 0;
- providerCalls: 0;
- residualUnknowns: array of content-free reason codes.

In a design artifact, verdict is DESIGN_ONLY and syntheticPassPublished is
false. SYNTHETIC_PASS requires syntheticFixtureExecutionAuthorized true in the
pre-run authority plus every gate through GATE_V3_PASS_PUBLICATION.

## 13. Gate registry

The exact ordered gate names are:

1. GATE_V3_DESIGN_SCOPE_STATIC
2. GATE_V3_AUTHORITY_SIGNATURE_VALID
3. GATE_V3_OBSERVER_SERVICE_READY
4. GATE_V3_REPLAY_RESERVATION_DURABLE
5. GATE_V3_SINGLE_RUN_LEASE_HELD
6. GATE_V3_SOURCE_AND_CONTRACT_BOUND
7. GATE_V3_PROVIDER_COMPONENTS_ABSENT
8. GATE_V3_RUNTIME_CHAIN_BOUND
9. GATE_V3_NAMESPACE_PREBIND_VALID
10. GATE_V3_FIREWALL_INSTALLED
11. GATE_V3_FIREWALL_READBACK_EXACT
12. GATE_V3_OBSERVER_READY_INDEPENDENT
13. GATE_V3_FINAL_REBIND_STABLE
14. GATE_V3_BARRIER_RELEASE_AUTHORIZED
15. GATE_V3_CONTINUOUS_DRIFT_CLEAR
16. GATE_V3_OBSERVER_COMPLETENESS
17. GATE_V3_KILL_SWITCH_BLOCK_BEFORE_KILL
18. GATE_V3_PROCESS_CGROUP_TEARDOWN
19. GATE_V3_PRIVILEGED_CLEANUP_ACKNOWLEDGED
20. GATE_V3_EXTERNAL_CLEANUP_VERIFIED
21. GATE_V3_EVIDENCE_RESOLVED
22. GATE_V3_SIGNER_CHAIN_VALID
23. GATE_V3_INDEPENDENT_REVIEW_APPROVED
24. GATE_V3_PASS_PUBLICATION

No gate may be skipped. A later gate receipt MUST bind the prior gate receipt
hash and monotonically greater sequence. Any failure transitions the durable
nonce to CONSUMED_FAIL after the safest available block and cleanup sequence.

## 14. Signature verification order

The verifier MUST:

1. parse exact canonical JSON and reject unknown fields;
2. resolve and verify the pre-run trust-root registry;
3. verify policy-authority key ID, generation and signature;
4. verify observer-service readiness under the pre-pinned observer key before
   durable nonce reservation;
5. verify source commit/tree and compatibility-snapshot bytes;
6. verify durable replay reservation and active lease receipts;
7. verify per-interface observer capture readiness before barrier release;
8. verify controller readback under the controller key;
9. resolve every artifact and recompute every hash and size;
10. verify observer event chain, packet statistics and shutdown signature;
11. verify controller deletion acknowledgments;
12. verify external cleanup attestation under the cleanup-verifier identity;
13. verify replay consume receipt;
14. verify independent reviewer identity and final approval signature;
15. verify PASS was absent before step 14 and published only afterward.

Clock, ledger, signer, evidence store or trust-root unavailability is a refusal,
not a retry under weaker controls.

## 15. Design-only example

AUTHORITY_V3_CANDIDATE_COMPATIBILITY_SCHEMA_EXAMPLE.json is a non-runtime JSON
Schema example for static review. Product or runtime code MUST NOT import it.
It does not authorize a ledger, signer, controller, observer or rehearsal.
