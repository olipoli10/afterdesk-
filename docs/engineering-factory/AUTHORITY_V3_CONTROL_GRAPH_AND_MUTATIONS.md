# Authority V3 control graph and true mutation matrix

Status: implementation-ready design only

Execution state: executionAuthorized:false

Required mutation count: 39

Accepted V2 mutation count for V3 claims: 0

## 1. Control graph

~~~mermaid
flowchart TD
    A["Static design and schema preflight"] --> B["Verify pre-anchored authority and trust roots"]
    B --> E["Start independent observer service and obtain service-ready signature"]
    E --> C["Reserve durable one-shot nonce and lease"]
    C --> D["Resolve source, fake CLI contract and provider absence"]
    D --> F["Create exact runtime with barrier closed"]
    F --> G["Fingerprint OCI, process, cgroup, FDs and namespaces"]
    G --> H["Install root-owned enforcement rules"]
    H --> I["Read back canonical rules and routes"]
    I --> J["Attach complete per-interface capture set and obtain capture-ready signature"]
    J --> U["Final independent namespace and runtime rebind"]
    U --> K["Release fake CLI barrier"]
    K --> L["Continuous observer and drift monitoring"]
    L --> M["Block-before-kill switch"]
    M --> N["Process and cgroup teardown"]
    N --> O["Privileged deletion with acknowledgments"]
    O --> P["External cleanup verification"]
    P --> Q["Resolve and byte-verify every evidence artifact"]
    Q --> R["Verify signer chain and durable nonce consume"]
    R --> S["Independent review and approval"]
    S --> T["Possible synthetic PASS publication"]
~~~

Every edge is one-way. Failure moves to the safest reachable block, teardown
and cleanup path, consumes the nonce as failure, and prevents PASS.

## 2. Edge contract

| Edge | Producer | Consumer | Required artifact | Gate | Failure behavior | Real mutation proving the gate |
| --- | --- | --- | --- | --- | --- | --- |
| A to B | static schema validator | policy verifier | canonical Authority V3 plus schema report | GATE_V3_DESIGN_SCOPE_STATIC | refuse before any process or durable reservation | V3_MANIFEST_HASH_MISMATCH |
| B to E | independent policy authority and observer signer | observer-service verifier | authority signature, pinned trust-root registry and service-ready receipt | GATE_V3_AUTHORITY_SIGNATURE_VALID and GATE_V3_OBSERVER_SERVICE_READY | refuse issuance; no lease | V3_OBSERVER_SIGNER_SUBSTITUTED and signer rotation mutations |
| E to C | observer-service verifier | replay-ledger service | signed service-ready receipt | GATE_V3_OBSERVER_SERVICE_READY | refuse reservation | V3_OBSERVER_NOT_READY in service-readiness mode |
| C to D | replay-ledger service | supervisor and policy verifier | durable reservation and exclusive lease receipts | GATE_V3_REPLAY_RESERVATION_DURABLE and GATE_V3_SINGLE_RUN_LEASE_HELD | refuse second/resumed run; consume crash recovery as fail | V3_REPLAY_AFTER_RESTART and V3_CONCURRENT_RUN |
| D to F | source resolver | runtime supervisor | source/tree, compatibility snapshot, fake binary/wrapper and absence attestations | GATE_V3_SOURCE_AND_CONTRACT_BOUND and GATE_V3_PROVIDER_COMPONENTS_ABSENT | refuse before runtime start | V3_REAL_BINARY_PRESENT, V3_WRAPPER_HASH_MISMATCH |
| F to G | runtime supervisor | controller and observer | exact OCI state and closed barrier receipt | GATE_V3_RUNTIME_CHAIN_BOUND | kill unconnected runtime; no firewall path | V3_NETAVARK_DRIFT |
| G to H | controller fingerprint service | enforcement controller | namespace prebind, process/cgroup and FD inventory | GATE_V3_NAMESPACE_PREBIND_VALID | block and destroy runtime | V3_INHERITED_SOCKET_OR_FD |
| H to I | enforcement controller | independent ruleset verifier | install receipt and canonical ruleset objects | GATE_V3_FIREWALL_INSTALLED | block namespace and destroy runtime | V3_FIREWALL_TABLE_MISSING |
| I to J | independent ruleset verifier | observer service | normalized readback, routes, interfaces and expected capture set | GATE_V3_FIREWALL_READBACK_EXACT | block and cleanup | V3_FIREWALL_DEFAULT_ACCEPT and V3_FIREWALL_HOOK_OR_PRIORITY_WRONG |
| J to U | observer signer | controller, observer and supervisor | signed capture-ready receipt for complete interface set | GATE_V3_OBSERVER_READY_INDEPENDENT | keep barrier closed; block and cleanup | V3_OBSERVER_NOT_READY and V3_OBSERVER_INTERFACE_OMITTED |
| U to K | controller plus observer | barrier authority | dual-signed final rebind receipt | GATE_V3_FINAL_REBIND_STABLE and GATE_V3_BARRIER_RELEASE_AUTHORIZED | never release; block and kill | V3_NAMESPACE_REPLACED |
| K to L | barrier authority | fake CLI and drift monitor | barrier-release receipt linked to prior gate | GATE_V3_BARRIER_RELEASE_AUTHORIZED | release exactly once; any duplicate kills | V3_REPLAY_AFTER_RESTART |
| L to M | observer and drift monitor | kill-switch controller | ordered event chain, packet statistics and drift log | GATE_V3_CONTINUOUS_DRIFT_CLEAR and GATE_V3_OBSERVER_COMPLETENESS | immediate block-before-kill | V3_UNCLASSIFIED_PACKET and V3_OBSERVER_PACKET_LOSS |
| M to N | enforcement controller | runtime supervisor | counted block receipt with candidate still alive | GATE_V3_KILL_SWITCH_BLOCK_BEFORE_KILL | quarantine; continue forced cleanup | V3_KILL_SWITCH_ORDER_BROKEN |
| N to O | runtime supervisor and controller | privileged cleanup | process/cgroup teardown receipt | GATE_V3_PROCESS_CGROUP_TEARDOWN | forced block remains; no PASS | V3_PROCESS_CGROUP_LEAK |
| O to P | privileged cleanup | external cleanup verifier | per-object deletion acknowledgments | GATE_V3_PRIVILEGED_CLEANUP_ACKNOWLEDGED | any deletion failure fatal | V3_RULE_DELETE_FAILURE |
| P to Q | external cleanup verifier | evidence resolver | signed before/after external inventory | GATE_V3_EXTERNAL_CLEANUP_VERIFIED | nonce consumed fail; PASS absent | V3_POST_CLEANUP_DRIFT |
| Q to R | immutable evidence store and resolver | signer-chain verifier | complete resolver manifest and byte receipts | GATE_V3_EVIDENCE_RESOLVED | quarantine incomplete bundle | V3_EVIDENCE_ARTIFACT_MISSING and V3_EVIDENCE_ARTIFACT_CHANGED |
| R to S | signer-chain verifier and replay ledger | independent reviewer | verified chain root and consume receipt | GATE_V3_SIGNER_CHAIN_VALID | refuse approval | V3_SIGNER_ROTATION_UNAPPROVED and V3_LEDGER_CORRUPT |
| S to T | independent final approver | PASS publisher | signed final review decision | GATE_V3_INDEPENDENT_REVIEW_APPROVED and GATE_V3_PASS_PUBLICATION | no PASS object may be created | V3_PASS_WRITTEN_BEFORE_CLEANUP |

## 3. Mutation protocol

### 3.1 General rules

1. Each mutation is performed in a fresh, disposable mutation run with a unique
   durable nonce. No mutation edits the retained pristine proof.
2. The mutation driver is independent from the component whose gate is under
   test. It records the before object, exact mutation operation and after object.
3. A source mutation changes actual source or built bytes. A privileged mutation
   changes actual namespace, ruleset, route, process, cgroup, file descriptor or
   deletion result. An evidence mutation changes actual stored bytes or
   resolver entries. A replay mutation changes a disposable persistent ledger.
4. Changing only a boolean, expected status, fixture return value, mock of the
   final decision function or test assertion is forbidden.
5. A mutation is killed only when the exact expected gate observes the changed
   real object. An earlier unrelated refusal is not credit.
6. Redundant earlier guards may be deliberately re-bound only in the mutation
   authority so the mutation reaches its target gate. Every such neutralization
   is listed below and is itself recorded. The target detector is never
   neutralized.
7. Restoration requires both:

   - source/artifact mutations: byte-exact SHA-256 equality plus Git diff empty;
   - privileged/persistent state mutations: independent external inventory
     equality plus explicit deletion/transaction receipts.

8. A mutation with failed restoration invalidates the mutation run and all later
   runs until an independent cleanup review succeeds.

### 3.2 Required observed failure record

Every per-mutation evidence object contains:

- mutationId;
- pristineRunSourceTreeSha;
- mutationDriverIdentity;
- targetObjectIdentity;
- beforeArtifact;
- mutationOperationArtifact;
- afterMutationArtifact;
- neutralizedGuardNames;
- expectedGate;
- observedFailedGate;
- observedFailureSequence;
- independentObserverReceipt;
- restorationOperationArtifact;
- restoredArtifact;
- restorationVerifiedBy;
- sourceBytesRestored;
- privilegedStateRestored;
- ledgerStateDisposition;
- retainedSensitiveContent: false.

expectedGate MUST equal observedFailedGate.

## 4. True mutation matrix

### M01 V3_REAL_BINARY_PRESENT

- Changed control: the actual candidate bundle filesystem and OCI manifest.
- Mechanism: copy a harmless non-executed sentinel with a known forbidden real
  candidate binary hash/path class into the bundle, then rebuild the real bundle
  tree and OCI spec.
- Expected gate and failure: GATE_V3_PROVIDER_COMPONENTS_ABSENT refuses with
  REAL_BINARY_PRESENT before runtime start.
- Independent evidence: resolver tree walk, file hash receipt, OCI manifest and
  provider-absence search receipt.
- Restoration: remove the sentinel, recreate the bundle from the pristine
  source tree and prove identical bundle tree, OCI spec and image manifest.
- Guards to neutralize: update the mutation authority compatibility-bundle hash
  and source-tree reference so GATE_V3_SOURCE_AND_CONTRACT_BOUND does not fail
  first.
- Not self-fulfilling: the absence scanner finds actual bytes at an actual path;
  no final-decision boolean is changed.

### M02 V3_PROVIDER_ROUTE_PRESENT

- Changed control: actual route object in the controller-owned enforcement
  namespace.
- Mechanism: add one route toward a reserved provider-test prefix through an
  otherwise present interface; no packet is sent.
- Expected gate and failure: GATE_V3_FIREWALL_READBACK_EXACT refuses with
  PROVIDER_ROUTE_PRESENT.
- Independent evidence: canonical route readback from controller and observer,
  namespace inode and netlink change sequence.
- Restoration: delete the exact route by handle and prove the full normalized
  route inventory equals the before inventory.
- Guards to neutralize: mutation policy names the reserved prefix solely as the
  injected forbidden object; do not add it to any allowlist.
- Not self-fulfilling: the detector reads kernel route state.

### M03 V3_MANIFEST_HASH_MISMATCH

- Changed control: stored compatibility snapshot bytes.
- Mechanism: flip one byte after the authority has signed its expected hash.
- Expected gate and failure: GATE_V3_SOURCE_AND_CONTRACT_BOUND refuses with
  COMPATIBILITY_SNAPSHOT_HASH_MISMATCH.
- Independent evidence: evidence-store object version, before/after byte hashes
  and resolver receipt.
- Restoration: restore the exact original bytes and verify size/hash and
  create-only pristine object remain unchanged; the mutated object stays
  quarantined.
- Guards to neutralize: none.
- Not self-fulfilling: a real stored artifact no longer matches signed policy.

### M04 V3_WRAPPER_HASH_MISMATCH

- Changed control: fake CLI wrapper bytes.
- Mechanism: insert a no-op byte-level source change and build the actual
  wrapper without changing the signed expected hash.
- Expected gate and failure: GATE_V3_SOURCE_AND_CONTRACT_BOUND refuses with
  FAKE_CLI_WRAPPER_HASH_MISMATCH.
- Independent evidence: source diff, built binary hash and resolver receipt.
- Restoration: inverse patch, rebuild and prove source and wrapper byte hashes
  equal pristine values.
- Guards to neutralize: none; the hash gate is the intended first gate.
- Not self-fulfilling: the executable wrapper bytes actually differ.

### M05 V3_FIREWALL_TABLE_MISSING

- Changed control: real nftables table in the enforcement namespace.
- Mechanism: delete the table by exact family/name after installation and before
  readback.
- Expected gate and failure: GATE_V3_FIREWALL_INSTALLED refuses with
  FIREWALL_TABLE_MISSING.
- Independent evidence: nft monitor event, canonical ruleset readback and
  namespace inode.
- Restoration: reinstall from pristine canonical policy, remove the mutation
  table at teardown and prove before/after external inventory equality.
- Guards to neutralize: freeze namespace and runtime drift checks so the
  intentional table delete reaches the installation/readback gate; observer is
  not disabled.
- Not self-fulfilling: kernel nft state is deleted.

### M06 V3_FIREWALL_DEFAULT_ACCEPT

- Changed control: output base-chain policy in the real nftables ruleset.
- Mechanism: atomically replace policy drop with policy accept.
- Expected gate and failure: GATE_V3_FIREWALL_READBACK_EXACT refuses with
  FIREWALL_DEFAULT_ACCEPT.
- Independent evidence: canonical nft JSON object, rule handle and controller/
  observer dual readback.
- Restoration: atomically restore drop policy and prove normalized object hash
  and external inventory equality.
- Guards to neutralize: update only the aggregate mutation-object reference so a
  generic hash mismatch does not hide the semantic default-policy gate.
- Not self-fulfilling: the kernel chain policy is accept.

### M07 V3_FIREWALL_HOOK_OR_PRIORITY_WRONG

- Changed control: actual base-chain hook or priority.
- Mechanism: replace output hook priority with a later priority or wrong hook.
- Expected gate and failure: GATE_V3_FIREWALL_READBACK_EXACT refuses with
  FIREWALL_HOOK_PRIORITY_MISMATCH.
- Independent evidence: canonical nft JSON and packet-path hook metadata.
- Restoration: recreate the chain with exact hook/priority and prove normalized
  ruleset equality.
- Guards to neutralize: rebind the mutation-specific ruleset aggregate to reach
  semantic validation; retain hook detector.
- Not self-fulfilling: real evaluation order changes in nftables.

### M08 V3_ROOTLESS_RUNTIME_CAN_EDIT

- Changed control: runtime-owner privileges against the real enforcement object.
- Mechanism: change the real namespace ownership/user-namespace mapping or
  grant the runtime owner the minimum capability required to edit, then from
  that identity perform an actual nft add/delete in the enforcement namespace.
- Expected gate and failure: GATE_V3_NAMESPACE_PREBIND_VALID refuses with
  ROOTLESS_RUNTIME_CAN_EDIT after the real edit succeeds. An edit merely denied
  by the pristine kernel boundary is useful baseline evidence but does not kill
  this mutation.
- Independent evidence: command identity, exit receipt, before/after nft monitor
  trace and owner namespace mappings.
- Restoration: delete any injected object as controller, rebuild pristine
  rules, and prove user, network namespace and ruleset inventories equal before.
- Guards to neutralize: rebind the mutation OCI/user-namespace aggregate so the
  specific ownership/editability detector is reached; permit the mutation
  driver one controlled attempt without granting that capability to the fake
  CLI; keep the ownership detector active.
- Not self-fulfilling: the rootless identity actually exercises kernel
  authority. If it can edit, the architecture fails rather than claiming PASS.

### M09 V3_NAMESPACE_REPLACED

- Changed control: candidate network namespace inode and runtime association.
- Mechanism: stop/recreate the barriered container or reattach its process to a
  new anonymous network namespace after prebind.
- Expected gate and failure: GATE_V3_FINAL_REBIND_STABLE refuses with
  NETWORK_NAMESPACE_REPLACED.
- Independent evidence: PID start time, namespace inode links, OCI state,
  runtime inspect and observer receipt.
- Restoration: destroy both namespaces and recreate a fresh pristine mutation
  run; namespace replacement is not repaired in place.
- Guards to neutralize: keep the container name and approved OCI profile bound
  in the mutation authority so the inode gate, not a name mismatch, is tested.
- Not self-fulfilling: Linux namespace inode and process membership really
  change.

### M10 V3_EXTRA_INTERFACE_OR_ROUTE

- Changed control: actual interface and route inventory.
- Mechanism: add a dummy/veth interface or non-default extra route to the
  candidate namespace.
- Expected gate and failure: GATE_V3_FINAL_REBIND_STABLE refuses with
  EXTRA_INTERFACE_OR_ROUTE.
- Independent evidence: netlink sequence, ifindex, peer mapping and route
  readback.
- Restoration: delete the injected link/route and prove all namespace
  inventories equal the pre-run external snapshot.
- Guards to neutralize: rebind aggregate inventory hash in the mutation
  authority so exact set/cardinality validation is reached.
- Not self-fulfilling: a kernel network object is created.

### M11 V3_DNS_DIRECT_BYPASS

- Changed control: actual nft and route policy.
- Mechanism: add an allow rule for candidate UDP/TCP 53 to a synthetic
  non-fixture destination and a route to that destination; no real DNS is used.
- Expected gate and failure: GATE_V3_FIREWALL_READBACK_EXACT refuses with
  DNS_DIRECT_BYPASS.
- Independent evidence: canonical ruleset/route objects and zero external
  packets.
- Restoration: delete exact handles/routes and prove normalized ruleset and
  route inventory equality.
- Guards to neutralize: mutation manifest acknowledges the synthetic
  destination as the injected forbidden target; provider absence remains true.
- Not self-fulfilling: actual policy would permit direct DNS.

### M12 V3_IPV6_BYPASS

- Changed control: actual IPv6 address, route or nft rule.
- Mechanism: enable one IPv6 address and add an IPv6 accept rule or route.
- Expected gate and failure: GATE_V3_FIREWALL_READBACK_EXACT refuses with
  IPV6_BYPASS_PRESENT.
- Independent evidence: ip -6 JSON, nft JSON and interface state.
- Restoration: delete address/route/rule, disable the interface path and prove
  pristine inventory equality.
- Guards to neutralize: bind the mutation-specific inventory aggregate but not
  the IPv6 semantic detector.
- Not self-fulfilling: real IPv6 kernel state is present.

### M13 V3_RELAY_EXTERNAL_EGRESS

- Changed control: relay route and firewall policy.
- Mechanism: add a route/allow toward a reserved non-provider external-test
  prefix or host gateway; send no external traffic.
- Expected gate and failure: GATE_V3_FIREWALL_READBACK_EXACT refuses with
  RELAY_EXTERNAL_EGRESS_PRESENT.
- Independent evidence: route and ruleset readback plus Windows/WSL outer
  inventory.
- Restoration: delete objects and prove no default, host-gateway or external
  route remains.
- Guards to neutralize: rebind aggregate hashes only.
- Not self-fulfilling: the relay obtains a real additional egress path.

### M14 V3_INHERITED_SOCKET_OR_FD

- Changed control: actual fake CLI process descriptor table.
- Mechanism: supervisor opens a bound socket or file outside the contract and
  deliberately passes its descriptor through OCI preserve-fds.
- Expected gate and failure: GATE_V3_NAMESPACE_PREBIND_VALID refuses with
  INHERITED_SOCKET_OR_FD.
- Independent evidence: proc fd links, socket inode table, OCI spec and process
  start receipt.
- Restoration: close the descriptor, destroy the process/cgroup and prove no
  referenced socket inode survives.
- Guards to neutralize: mutation OCI hash is re-signed so exact FD semantic
  validation is reached.
- Not self-fulfilling: the process actually inherits a kernel descriptor.

### M15 V3_OBSERVER_NOT_READY

- Changed control: real observer process/readiness channel.
- Mechanism: delay or terminate one observer before it writes its signed ready
  record.
- Expected gate and failure: GATE_V3_OBSERVER_READY_INDEPENDENT refuses with
  OBSERVER_NOT_READY; runtime barrier remains closed.
- Independent evidence: process state, missing ready sequence and signer log.
- Restoration: terminate all observers, remove ephemeral state and start a new
  mutation run with the pristine observer set.
- Guards to neutralize: none.
- Not self-fulfilling: an expected observer process is genuinely absent or not
  bound.

### M16 V3_OBSERVER_PACKET_LOSS

- Changed control: real AF_PACKET receive buffer/statistics.
- Mechanism: reduce socket buffer and generate bounded local synthetic packet
  pressure until PACKET_STATISTICS reports at least one kernel drop.
- Expected gate and failure: GATE_V3_OBSERVER_COMPLETENESS refuses with
  OBSERVER_KERNEL_DROPS_NONZERO.
- Independent evidence: signed PACKET_STATISTICS, generated packet counter and
  per-interface event totals.
- Restoration: end the mutation run, restore configured buffer size and prove
  the next pristine observer reports the approved effective buffer and zero
  drops.
- Guards to neutralize: authorize the bounded fake traffic pattern in the
  mutation contract so classification remains exact; do not alter drop gate.
- Not self-fulfilling: the kernel reports packet loss.

### M17 V3_UNCLASSIFIED_PACKET

- Changed control: actual local packet metadata.
- Mechanism: emit one bounded synthetic Ethernet/IP protocol or tuple that is
  observed but intentionally absent from the classification table.
- Expected gate and failure: GATE_V3_OBSERVER_COMPLETENESS refuses with
  UNCLASSIFIED_PACKET_NONZERO.
- Independent evidence: signed raw metadata event chain and per-interface
  distribution.
- Restoration: stop the emitter, tear down namespaces and prove no process,
  interface or route remains.
- Guards to neutralize: policy permits the mutation emitter only as a test
  actor; firewall readback is re-bound so the observer classification gate is
  reached without allowing external traffic.
- Not self-fulfilling: a real observed event has no class.

### M18 V3_OBSERVER_SIGNER_SUBSTITUTED

- Changed control: actual observer signer key/service.
- Mechanism: start an observer signer with a newly generated unpinned key and
  sign a syntactically valid readiness record.
- Expected gate and failure: GATE_V3_OBSERVER_READY_INDEPENDENT refuses with
  OBSERVER_SIGNER_SUBSTITUTED.
- Independent evidence: readiness bytes, DER public-key hash and trust-root
  registry.
- Restoration: stop substitute signer, delete its disposable key and prove the
  pinned signer service/key inventory is unchanged.
- Guards to neutralize: none; syntactic signature validation must pass so the
  trust-root mismatch is targeted.
- Not self-fulfilling: a different cryptographic key signs real bytes.

### M19 V3_REPLAY_AFTER_RESTART

- Changed control: durable nonce ledger and machine/process lifecycle.
- Mechanism: reserve a nonce, close/reopen the ledger service or simulate a
  new boot ID, then attempt a second barrier release with the same authority.
- Expected gate and failure: GATE_V3_REPLAY_RESERVATION_DURABLE refuses with
  NONCE_ALREADY_RESERVED_OR_CONSUMED.
- Independent evidence: persistent ledger rows/events before and after restart,
  sequence/hash chain and boot ID.
- Restoration: the disposable nonce transitions to CONSUMED_FAIL; it is never
  deleted or made reusable. Remove only the entire disposable mutation-ledger
  fixture after its immutable evidence is retained.
- Guards to neutralize: use an unexpired authority and identical source/runtime
  so replay is the intended first failure.
- Not self-fulfilling: state survives an actual service reopen and persistent
  storage read.

### M20 V3_KILL_SWITCH_ORDER_BROKEN

- Changed control: actual controller operation order.
- Mechanism: mutation source issues cgroup kill before installing/reading back
  the counted block.
- Expected gate and failure: GATE_V3_KILL_SWITCH_BLOCK_BEFORE_KILL refuses with
  KILL_BEFORE_BLOCK.
- Independent evidence: monotonic controller events, observer timeline, cgroup
  state and nft counter readback.
- Restoration: inverse source patch, byte-exact rebuild and fresh cleanup proof.
- Guards to neutralize: source and controller binary hashes are re-bound in the
  mutation authority so operation-order evidence reaches the target gate.
- Not self-fulfilling: real kernel operations occur in the wrong order.

### M21 V3_RULE_DELETE_FAILURE

- Changed control: actual privileged deletion operation.
- Mechanism: hold a namespace reference or mutate the expected table handle so
  exact nft deletion returns non-zero or the table remains present.
- Expected gate and failure: GATE_V3_PRIVILEGED_CLEANUP_ACKNOWLEDGED refuses
  with RULE_DELETE_FAILURE.
- Independent evidence: command exit, stderr class, nft readback and open
  namespace reference inventory.
- Restoration: release the reference, delete the exact object, and obtain an
  independent absent-after-delete receipt plus before/after equality.
- Guards to neutralize: none; cleanup continues far enough to collect the fatal
  acknowledgment.
- Not self-fulfilling: actual deletion fails or object remains.

### M22 V3_PROCESS_CGROUP_LEAK

- Changed control: real subprocess/cgroup.
- Mechanism: fake CLI spawns an allowed mutation child that double-forks or
  remains in the cgroup after parent exit.
- Expected gate and failure: GATE_V3_PROCESS_CGROUP_TEARDOWN refuses with
  PROCESS_CGROUP_LEAK.
- Independent evidence: cgroup.procs, proc start times, process tree and
  teardown receipt.
- Restoration: cgroup kill, wait for empty cgroup, remove cgroup and prove no
  PID/start-time pair survives.
- Guards to neutralize: mutation OCI/process contract permits exactly this
  child so the teardown gate, not subprocess-contract gate, is targeted.
- Not self-fulfilling: a real kernel process remains.

### M23 V3_TEMP_ROOT_OR_SECRET_LEAK

- Changed control: actual temp root or fake secret file.
- Mechanism: retain one sentinel file in a run temp root or a fake-only secret
  mount after teardown.
- Expected gate and failure: GATE_V3_EXTERNAL_CLEANUP_VERIFIED refuses with
  TEMP_ROOT_OR_SECRET_LEAK.
- Independent evidence: filesystem inode/path-class inventory, mount inventory
  and content-free file hash.
- Restoration: remove exact file/root/mount and prove external inventory
  equality; never retain secret bytes.
- Guards to neutralize: use a non-sensitive fake sentinel and bind it as the
  mutation object.
- Not self-fulfilling: a real filesystem/mount object survives.

### M24 V3_CONCURRENT_RUN

- Changed control: durable concurrency lease.
- Mechanism: two independent processes attempt atomic reservation in the same
  concurrency domain with overlapping lease intervals.
- Expected gate and failure: GATE_V3_SINGLE_RUN_LEASE_HELD refuses the loser
  with CONCURRENT_RUN.
- Independent evidence: transaction IDs, lock acquisition order and durable
  receipts from both processes.
- Restoration: winner transitions to CONSUMED_FAIL; loser remains refused; no
  lease row is deleted outside normal state transition.
- Guards to neutralize: both authorities otherwise valid and use distinct
  nonces so only the concurrency lease conflicts.
- Not self-fulfilling: two real processes race on persistent transactional
  state.

### M25 V3_POST_CLEANUP_DRIFT

- Changed control: actual external state after cleanup.
- Mechanism: create a run-labelled dummy interface, route, process or file
  between privileged cleanup and external after-snapshot.
- Expected gate and failure: GATE_V3_EXTERNAL_CLEANUP_VERIFIED refuses with
  POST_CLEANUP_DRIFT.
- Independent evidence: before/after inventories and mutation-driver receipt.
- Restoration: remove injected object and prove a second external inventory
  matches the original before state; the run stays failed.
- Guards to neutralize: deletion acknowledgments for legitimate run objects
  remain valid so drift is isolated to external verification.
- Not self-fulfilling: actual external state changes after cleanup.

### M26 V3_PASS_WRITTEN_BEFORE_CLEANUP

- Changed control: actual evidence-store object creation order.
- Mechanism: mutation publisher attempts to create the PASS object before final
  external cleanup receipt or approval.
- Expected gate and failure: GATE_V3_PASS_PUBLICATION refuses with
  PASS_BEFORE_CLEANUP and the store rejects creation.
- Independent evidence: evidence-store sequence, failed create receipt and
  absence proof for the PASS path.
- Restoration: no PASS object exists; consume nonce as fail. If a buggy store
  created it, quarantine the entire store and fail the architecture.
- Guards to neutralize: supply a syntactically valid proposed PASS so ordering,
  not shape, is tested.
- Not self-fulfilling: a real create operation is attempted against the store.

### M27 V3_SIGNER_KEY_SUBSTITUTED

- Changed control: actual controller or final-approver signing key.
- Mechanism: sign a valid receipt using an unpinned same-algorithm key.
- Expected gate and failure: GATE_V3_SIGNER_CHAIN_VALID refuses with
  SIGNER_KEY_SUBSTITUTED.
- Independent evidence: public-key hash, signature and trust-root registry.
- Restoration: stop substitute service, delete disposable key and prove pinned
  key inventory unchanged.
- Guards to neutralize: keep receipt schema and subject hash valid.
- Not self-fulfilling: cryptographic identity actually differs.

### M28 V3_SIGNER_ROTATION_UNAPPROVED

- Changed control: actual trust-root registry/key epoch.
- Mechanism: replace current key with a new key without the old-key and reviewer
  cross-signed rotation record.
- Expected gate and failure: GATE_V3_SIGNER_CHAIN_VALID refuses with
  UNAPPROVED_KEY_ROTATION.
- Independent evidence: registry versions, epochs and missing rotation receipt.
- Restoration: restore exact registry bytes and pinned service configuration;
  prove hashes equal pristine.
- Guards to neutralize: new key may be otherwise syntactically valid and within
  time so rotation policy is the target.
- Not self-fulfilling: the registry/key epoch really changes.

### M29 V3_EVIDENCE_ARTIFACT_MISSING

- Changed control: actual immutable evidence object.
- Mechanism: omit one required per-interface distribution object from the
  mutation bundle while leaving its resolver entry.
- Expected gate and failure: GATE_V3_EVIDENCE_RESOLVED refuses with
  REQUIRED_ARTIFACT_MISSING.
- Independent evidence: resolver open failure and storage inventory.
- Restoration: never rewrite the failed bundle; create a new pristine bundle
  in a fresh mutation run and prove all required objects resolve.
- Guards to neutralize: authority and manifest hashes remain valid so resolver
  reaches the missing object.
- Not self-fulfilling: the file/object is genuinely absent.

### M30 V3_EVIDENCE_ARTIFACT_CHANGED

- Changed control: stored artifact bytes.
- Mechanism: flip one byte in a disposable copied observer-statistics object
  after its resolver manifest is signed.
- Expected gate and failure: GATE_V3_EVIDENCE_RESOLVED refuses with
  EVIDENCE_ARTIFACT_HASH_MISMATCH.
- Independent evidence: storage object bytes, size/hash and signed expected
  reference.
- Restoration: original immutable object remains untouched; mutated store is
  quarantined and a fresh bundle is required.
- Guards to neutralize: none.
- Not self-fulfilling: actual bytes differ from the signed hash.

### M31 V3_OBSERVER_INTERFACE_OMITTED

- Changed control: actual observer launch set.
- Mechanism: omit the observer process for one expected ifindex while retaining
  the real interface.
- Expected gate and failure: GATE_V3_OBSERVER_READY_INDEPENDENT refuses with
  OBSERVER_INTERFACE_SET_INCOMPLETE.
- Independent evidence: interface inventory versus signed readiness set and
  process inventory.
- Restoration: terminate observer set and start a fresh pristine mutation run;
  do not hot-add after barrier.
- Guards to neutralize: none.
- Not self-fulfilling: a real interface lacks a real observer.

### M32 V3_PACKET_STATISTICS_UNAVAILABLE

- Changed control: actual observer socket/statistics call.
- Mechanism: run a mutation observer that does not request or cannot return
  PACKET_STATISTICS at shutdown.
- Expected gate and failure: GATE_V3_OBSERVER_COMPLETENESS refuses with
  PACKET_STATISTICS_UNAVAILABLE.
- Independent evidence: syscall/result receipt and observer binary hash.
- Restoration: inverse source mutation, byte-exact rebuild and fresh observer
  run with a valid statistics receipt.
- Guards to neutralize: rebind observer binary hash in the mutation authority so
  statistics availability is targeted.
- Not self-fulfilling: the kernel statistics operation is actually unavailable
  or omitted.

### M33 V3_NETAVARK_DRIFT

- Changed control: real netavark or aardvark binary/configuration.
- Mechanism: substitute a harmless different binary build or configuration
  before OCI creation.
- Expected gate and failure: GATE_V3_RUNTIME_CHAIN_BOUND refuses with
  RUNTIME_HELPER_DRIFT.
- Independent evidence: binary bytes, package/build identity and runtime inspect.
- Restoration: restore exact binary/config bytes from trusted source and prove
  hashes plus package inventory equal pristine.
- Guards to neutralize: none; runtime-chain mismatch is intended.
- Not self-fulfilling: an actual runtime helper changes.

### M34 V3_SLIRP_OR_PASTA_APPEARS

- Changed control: actual helper process and candidate FD/socket set.
- Mechanism: start slirp4netns or pasta attached to the barriered candidate
  namespace.
- Expected gate and failure: GATE_V3_FINAL_REBIND_STABLE refuses with
  UNAPPROVED_RUNTIME_HELPER_PRESENT.
- Independent evidence: process tree, namespace inode, socket/FD and helper
  binary hash.
- Restoration: kill helper/cgroup, close descriptors, destroy namespace and
  prove process/socket inventories equal before.
- Guards to neutralize: mutation profile rebinds OCI container hash but does not
  add helper to approved set.
- Not self-fulfilling: a real userspace networking path appears.

### M35 V3_MONOTONIC_CLOCK_FAILURE

- Changed control: actual monotonic time provider/service.
- Mechanism: inject a time-source adapter that returns a rollback, duplicate or
  unavailable monotonic reading while wall time remains valid.
- Expected gate and failure: the next active gate refuses with
  MONOTONIC_CLOCK_INVALID; before runtime this is
  GATE_V3_REPLAY_RESERVATION_DURABLE, during runtime
  GATE_V3_CONTINUOUS_DRIFT_CLEAR.
- Independent evidence: signed clock-source readings and binary/config hash.
- Restoration: restore pristine adapter bytes and prove a strictly increasing
  source in a fresh run; failed nonce remains consumed.
- Guards to neutralize: rebind time-source binary in mutation authority while
  retaining monotonic-order detector.
- Not self-fulfilling: the actual clock provider emits invalid readings.

### M36 V3_DURABLE_LEDGER_UNAVAILABLE

- Changed control: real local ledger file/service.
- Mechanism: deny access, stop service or hold an incompatible lock during
  reservation.
- Expected gate and failure: GATE_V3_REPLAY_RESERVATION_DURABLE refuses with
  REPLAY_LEDGER_UNAVAILABLE.
- Independent evidence: OS file/service state, transaction failure and absence
  of a reservation receipt.
- Restoration: restore service/access; run integrity check; do not reuse a nonce
  whose reservation outcome is uncertain.
- Guards to neutralize: authority otherwise valid.
- Not self-fulfilling: a real durable dependency is unavailable.

### M37 V3_DURABLE_LEDGER_CORRUPT

- Changed control: actual disposable ledger page or append-chain event.
- Mechanism: flip one byte in the closed disposable ledger or alter an event
  prior hash, then reopen.
- Expected gate and failure: GATE_V3_REPLAY_RESERVATION_DURABLE or
  GATE_V3_SIGNER_CHAIN_VALID refuses with REPLAY_LEDGER_CORRUPT.
- Independent evidence: database integrity check, event-chain recomputation and
  file hash.
- Restoration: quarantine corrupted ledger; restore only from a verified
  pristine mutation fixture. Never silently repair production-like state.
- Guards to neutralize: use a syntactically openable corruption when targeting
  append-chain validation rather than file-open failure.
- Not self-fulfilling: persistent bytes or chain content actually change.

### M38 V3_CLEANUP_VERIFIER_COMPROMISED

- Changed control: actual cleanup-verifier binary/key or output.
- Mechanism: substitute a verifier binary that signs an unequal before/after
  pair or use an unpinned cleanup key.
- Expected gate and failure: GATE_V3_EXTERNAL_CLEANUP_VERIFIED or
  GATE_V3_SIGNER_CHAIN_VALID refuses with CLEANUP_VERIFIER_IDENTITY_OR_RESULT_INVALID.
- Independent evidence: verifier binary hash, key hash, inventories and signed
  result.
- Restoration: remove substitute binary/key, restore pinned verifier bytes and
  prove trust registry unchanged.
- Guards to neutralize: make substituted report canonical so identity and
  semantic comparison gates are reached.
- Not self-fulfilling: a different real verifier attempts to approve drift.

### M39 V3_WINDOWS_ROUTE_OR_DNS_DRIFT

- Changed control: actual Windows route or DNS inventory within the declared
  outer boundary.
- Mechanism: add a temporary reserved-prefix route or change the dedicated
  boundary DNS setting without sending traffic.
- Expected gate and failure: GATE_V3_FINAL_REBIND_STABLE or
  GATE_V3_EXTERNAL_CLEANUP_VERIFIED refuses with WINDOWS_NETWORK_DRIFT.
- Independent evidence: Windows route/DNS snapshots signed by the external
  verifier and WSL outer-path inventory.
- Restoration: remove the exact temporary object and prove byte-normalized
  Windows network inventory equals before.
- Guards to neutralize: this mutation is mandatory only if Windows route/DNS is
  inside the declared proof boundary. If outside, the authority MUST carry a
  signed limitation and MUST NOT claim Windows isolation.
- Not self-fulfilling: host network state actually changes.

## 5. Coverage summary

| Control family | Mutations |
| --- | --- |
| Source, manifest and candidate absence | M01, M03, M04 |
| Firewall, route, DNS and IPv6 | M02, M05-M07, M10-M13, M39 |
| Runtime owner, namespace, OCI, FD and helper chain | M08, M09, M14, M33, M34 |
| Observer readiness, completeness and provenance | M15-M18, M31, M32 |
| Durable replay, clock and concurrency | M19, M24, M35-M37 |
| Kill switch, teardown and cleanup | M20-M23, M25, M38 |
| Evidence resolution and PASS ordering | M26, M29, M30 |
| Signer substitution and rotation | M18, M27, M28, M38 |

The matrix contains 39 real-control mutations. No mutation receives credit from
a mocked final decision, boolean/status flip or assertion-only change.
