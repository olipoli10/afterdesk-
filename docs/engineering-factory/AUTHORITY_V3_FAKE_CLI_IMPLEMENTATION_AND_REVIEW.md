# Authority V3 R2 fake CLI, future implementation phases and review

Status: design-only

Design verdict: `DESIGN_READY_FOR_INDEPENDENT_REVIEW_R2`

Execution verdict: NO-GO

`executionAuthorized:false`

## 1. Compatibility claim boundary

The only permitted future candidate-shaped process is a deterministic fake CLI
built from committed synthetic source. A green result could prove only:

> The exact fake CLI bytes accepted the exact R2 framing and lifecycle contract
> in one exact source/runtime/host snapshot under one non-reusable authority.

It cannot prove real Codex/Claude compatibility, model quality, provider safety,
authentication, tool use, file-edit quality, pricing, latency or arbitrary-code
containment. No real candidate or provider component is used as a sentinel,
fixture, dependency or reference implementation.

## 2. Executable and process identity

Logical token: `ef-fake-candidate`

Candidate kind: `deterministic-fake-cli`

The future wrapper uses direct process creation with shell disabled and executes
only one pinned fake binary through an already-open executable descriptor. It
does not search PATH at launch, load a profile, resolve a package, read Git
configuration or discover plugins/connectors.

The wrapper, binary, source tree, schema bundle and compatibility snapshot have
independent hashes in D1. The default cgroup contains the fake CLI plus only the
exact runtime shims listed in D1. No child process is permitted. The separately
hashed M20 mutation fixture may create one synthetic child solely to exercise
cgroup teardown; that build can never produce PASS.

M01 uses the only synthetic real-binary sentinel in the entire protocol. It is
a committed harmless inert file named `ef-real-binary-sentinel`, has no vendor
bytes or executable format, is never executed and exists only in M01's disposable
bundle. No other mutation or pristine run may create, copy or label such a
sentinel.

## 3. Exact argv contract

The exact token array is:

```text
[0] ef-fake-candidate
[1] compatibility-rehearsal
[2] --contract-version
[3] 3.2.0
[4] --stdin-framing
[5] u32be-jcs-json-lf-v1
[6] --stdout-framing
[7] u32be-jcs-json-lf-v1
[8] --run-id
[9] <exact lowercase D1 UUIDv4>
```

Exactly ten tokens are accepted. Duplicate, missing, reordered, abbreviated,
combined or unknown tokens fail with exit 20 before opening the relay. Response
files, shell/metacharacter expansion, wildcard expansion and alternate platform
argument parsing are disabled. No prompt, payload, path, model, provider,
endpoint, account, login, OAuth, credential, plugin or environment value occurs
in argv. The canonical length-prefixed token vector is hashed in D1.

## 4. Frame byte contract

### 4.1 Transport

Framing ID is `u32be-jcs-json-lf-v1`. Every stdin/stdout/stderr frame is exactly:

```text
4-byte unsigned big-endian integer N
N bytes canonical JCS-IJSON-INT53-R2 UTF-8 JSON
one byte 0x0A
```

`N` counts JSON bytes only; it does not include the 4-byte prefix or LF. Valid
range is 2 through the stream-specific signed maximum. Prefix value 0/1,
overflow, a JSON length mismatch, CR/CRLF, missing LF, extra byte before the next
prefix or partial prefix/body/newline at EOF is a framing failure. There is no
text line mode and no platform newline translation.

Raw JSON must already be canonical. The raw-token scanner rejects BOM, invalid
UTF-8, floats/out-of-range integers and duplicate keys before parse. Parsed then
re-serialized JCS bytes must equal the received N bytes.

### 4.2 Hash chain

Every frame has `schemaVersion:"3.2.0"`, `frameSequence`,
`priorFrameSha256` and `frameSha256`. Sequence starts at 1 and increments by one
per stream. For sequence 1, prior hash is 64 zeroes; otherwise it equals the
preceding frame's `frameSha256` on that stream. To compute the current value,
remove the `frameSha256` member, set `B=JCS(remainingObject)`, then compute
`SHA256(UINT32_BE(length(B)) || B || 0x0A)` and insert that lowercase hash as
`frameSha256`. The transported prefix is then recomputed from the final JCS
object including the hash. Verification repeats the removal algorithm exactly.
Cross-stream ordering is never inferred from hashes; the supervisor maintains
an independent monotonic event ledger.

## 5. stdin state machine

Every stdin frame has exact common keys plus the frame-specific keys allowed by
its schema. Unknown keys fail.

```text
START -> REQUEST{1..64} -> [CANCEL] -> END
START -> REQUEST{1..64} -> END
```

- `start` occurs once at sequence 1 and binds run ID and contract hash.
- `request` contains a synthetic request ID, payload-class enum and fake payload
  that validates against the committed fake schema.
- `cancel` occurs at most once and names only a prior accepted fake request.
- `end` occurs once and is terminal input.

Maximum frame size is 65,536 bytes, maximum frame count 67 and maximum total
stdin bytes 1,048,576. Values are also pinned in D1 and may only be lower.
Malformed schema/sequence/hash/run/request/payload or early EOF returns 21 and
performs no relay operation.

The fake payload contains no prompt, instruction, repository content, client
data, credential, real domain/IP, provider identifier or vendor wire shape. The
ephemeral canary used to verify non-persistence is generated in memory, never
written and never hashed into durable evidence.

## 6. stdout and stderr

### 6.1 stdout

Allowed stdout frame types are:

```text
ready, accepted, progress, result, cancelled, refused, terminal
```

Exact common fields are schema/version, type, stream sequence/hash, run ID,
fake request ID or null, status-class enum, result-class enum or null,
byte-count-class enum and terminal boolean. No raw result text exists.

`ready` is emitted only after open-descriptor, environment, filesystem and relay
tuple validation. One `accepted` precedes progress/result for each request. A
successful run emits one result per accepted request and exactly one terminal
frame. Any frame after terminal fails. Maximum stdout frame is 16,384 bytes and
maximum stdout total is 1,048,576 bytes.

### 6.2 stderr

stderr is zero bytes on success. On refusal/failure it contains exactly one
framed canonical envelope with exact fields:

```text
schemaVersion
errorClass
gateHintClass
retryable:false
contentIncluded:false
```

Maximum JSON payload is 1,024 bytes and maximum stderr total is 1,029 bytes
(prefix + payload + LF). A second frame, raw exception, path, environment value,
stack, body, header or partial frame fails. stderr never carries a prompt or
output.

### 6.3 Concurrent drain and pipe closure

stdout and stderr reader tasks start before stdin is written and drain
concurrently until their independent EOF. The supervisor never waits for process
exit before draining either pipe and never reads one stream to completion before
the other. Each reader has a 65,536-byte ring and reports framed events to one
bounded arbiter queue; maximum combined unvalidated raw bytes is 131,072.

Pipe rules are exact:

- stdout EOF before a valid terminal frame is `STDOUT_EOF_BEFORE_TERMINAL`;
- stdout EOF after terminal is valid even if stderr remains open briefly;
- stderr EOF with zero bytes is valid; stderr EOF after one complete error frame
  is valid only for a nonzero/refusal exit;
- stdin `EPIPE` before the complete planned input sequence is
  `STDIN_CLOSED_EARLY`;
- a pipe remaining open after child exit until the drain deadline is
  `PIPE_HELD_BY_UNAPPROVED_DESCENDANT`;
- a partial prefix/body/LF on either output is `PARTIAL_FRAME_AT_EOF`;
- closure of one pipe never stops draining the other.

Raw frames stay in bounded memory and are zeroed after validation. Durable
evidence contains only frame counts, size/status/result classes, state events and
schema/config hashes.

## 7. Exit, cancel and timeout arbitration

| Exit | Exact meaning |
| ---: | --- |
| 0 | valid terminal success for all accepted fake requests |
| 20 | argv refusal |
| 21 | stdin/frame/schema refusal |
| 22 | environment/filesystem/descriptor refusal |
| 23 | local relay contract refusal |
| 24 | graceful cancellation completed |
| 25 | fake CLI self-observed bounded timeout |
| 26 | backpressure or output-limit refusal |
| 70 | deterministic internal fixture failure |

Every other code is `UNKNOWN_EXIT`. Exit 0 without a valid terminal frame, or a
terminal-success frame with nonzero exit, fails.

One supervisor arbiter owns the terminal cause. It serializes events using a
single monotonic read and incrementing `arbiterSequence`; sources cannot assign
their own order. At one sampling boundary, precedence is:

1. framing/schema/output-limit violation;
2. explicit user/supervisor cancellation already queued;
3. overall timeout deadline reached;
4. child exit;
5. ordinary frame event.

The first accepted terminal cause is set by compare-and-swap and cannot change.
Explicit cancellation at exactly the deadline wins over timeout; a violation
already queued wins over both. Overall timeout is `startReceiptMonotonic +
timeoutMilliseconds`; it is not reset by progress. Cancellation deadline is
`cancelAcceptedMonotonic + graceMilliseconds`.

On cancel, stdin closes after the cancel frame, the CLI stops accepting requests,
closes relay, emits `cancelled` then `terminal`, closes stdout and exits 24. On
missed grace/timeout, the controller proves outer+inner counted block while the
cgroup is alive and then kills the cgroup. Any forced kill without the gate 17
receipt is fatal.

Backpressure is bounded blocking. Stall deadline is 2,000 ms from the
independent monotonic source. The child may not discard, truncate or switch to
unbounded buffering.

## 8. Exact environment

The child environment is created from an empty block. Sorted exact entries are:

```text
EF_AUTHORITY_SCHEMA_VERSION=3.2.0
EF_COMPATIBILITY_CONTRACT_VERSION=3.2.0
EF_FAKE_RELAY_HOST=198.18.0.2
EF_FAKE_RELAY_PORT=47001
EF_RUN_ID=<exact lowercase D1 UUIDv4>
HOME=/nonexistent
LANG=C.UTF-8
LC_ALL=C.UTF-8
PATH=/ef/bin
TMPDIR=/ef/tmp
```

There are no other variables. The wrapper compares the exact UTF-8 name/value
set and its D1 hash before ready. `/ef/bin` contains only the pinned already-open
fake executable; PATH lookup is disabled after validation. Evidence records the
environment-contract hash and names, never a runtime memory dump.

Proxy, auth, token, key, account, provider, telemetry, update, package,
connector, plugin, cloud, SSH, Git credential, Windows interop and user-profile
variables are forbidden.

## 9. Filesystem and replacement resistance

Visible roots are exact:

```text
/ef/bundle      read-only content-addressed fixture
/ef/workspace   bounded private writable root
/ef/result      bounded private writable root
/ef/tmp         tmpfs, bounded and noexec
```

Allowed writes are only:

```text
/ef/workspace/state.json
/ef/workspace/operations.jsonl
/ef/result/result.json
```

Maximum is 16 files and 1,048,576 total written bytes. No host repository,
`.git`, Windows drive, profile, runtime socket, credential directory, device or
unrelated worktree is mounted.

Before launch the supervisor opens each root and records mount ID, device,
inode, owner, mode and expected path. Every file operation is relative to these
descriptors using `openat2` with `RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|
RESOLVE_NO_MAGICLINKS|RESOLVE_NO_XDEV`. It rereads mount/device/inode before
ready, before each create/replace and at shutdown. Root rename, bind replacement,
mount replacement, symlink, hardlink, magic link, device-node, alternate stream
or mount-ID change fails with 22. Path-string equality is insufficient.

Writes use create-new or temp-file+fsync+same-directory atomic rename beneath the
opened root. Final workspace/result trees are independently inventoried and
hashed as fake-content artifacts; raw fake result content is not promoted to
durable compatibility evidence.

## 10. Relay and fake fixtures

The fake CLI receives only numeric `198.18.0.2:47001`. It cannot accept a URL,
hostname, endpoint flag, proxy or discovered route. The relay accepts only the
candidate namespace/ifindex, D1 run/route IDs, committed frame schema and bounded
fake classes. Fake DNS is `198.18.0.3:5300`; fake provider is
`198.18.0.4:47002`.

The relay rejects provider names/FQDNs/IPs, public roots, vendor SDK formats,
auth/OAuth/API-key shapes, redirects, updates, downloads, telemetry and
connectors. All addresses are benchmark-network synthetic addresses and have no
route to Windows or a physical interface.

## 11. Future authorization ladder

No phase below is started by this document. Each needs a new explicit user
decision naming worktree, source/tree, host boundary and allowed writes/tests.

### I0 - R2 independent design review

Authorized milestone now: review these five documents only.

Success: reviewer returns R2 acceptance, revision request or DESIGN_BLOCKED.

Stop: any unresolved normative placeholder, schema contradiction or claim that
R2 authorizes implementation.

### I1 - static schema tests

Requires only `I1_STATIC_SCHEMA_TESTS`. It authorizes unprivileged static tests
for the five schemas/semantic vectors; no process beyond the approved test
harness, datastore or network.

RED cases include duplicate keys, schema downgrade, authorization constants,
role reuse, state/gate/PASS combinations and DAG cycles.

### I2 - resolver and semantic model

Requires `I2_RESOLVER_MODEL_IMPLEMENTATION`. Disposable filesystem fixtures
only. It does not authorize a signer service, real broker, database, WSL or fake
process.

### I3 - replay ledger

Requires `I3_DISPOSABLE_LEDGER_IMPLEMENTATION`. It names disposable disk paths
and a simulated anchor only until a later separately reviewed TPM authority.
Real TPM/NV creation is not implied.

RED cases: reserve/consume atomicity, torn writes, valid-backup restore,
cross-machine binding, boot change, concurrent lease, corruption and approver
timeout.

### I4 - fake process contract

Requires `I4_FAKE_PROCESS_IMPLEMENTATION`. It can build/run only the deterministic
fake CLI with network disabled in a disposable unprivileged harness. No WSL,
container, relay, real candidate or provider.

RED cases cover exact argv, u32be framing/LF, duplicate keys, concurrent drains,
partial pipes, timeout/cancel arbitration, environment, root replacement,
backpressure and subprocess leaks.

### I5 - privileged source implementation, split authority

There is no transitive Gate A. Each component requires its own source-only grant:

- `I5_WINDOWS_OUTER_DENY_SOURCE`;
- `I5_WSL_CONTROLLER_SOURCE`;
- `I5_OBSERVER_SOURCE`;
- `I5_SIGNER_SOURCE`;
- `I5_EVIDENCE_BROKER_SOURCE`;
- `I5_CLEANUP_VERIFIER_SOURCE`.

One grant cannot write another component. Source/static dependency-injected tests
do not authorize WFP, WSL, namespace, firewall, capture, service account, key,
TPM, evidence directory or rehearsal mutation.

### I6 - privileged mutation rehearsal, split families

There is no transitive Gate B. A future pristine run requires
`I6_PRISTINE_SYNTHETIC_RUN`. Each mutation requires one of these later grants
plus its exact mutation ID:

- `I6_WINDOWS_OUTER_DENY_MUTATIONS`;
- `I6_WSL_ROUTE_FIREWALL_MUTATIONS`;
- `I6_RUNTIME_NAMESPACE_MUTATIONS`;
- `I6_OBSERVER_MUTATIONS`;
- `I6_SIGNER_MUTATIONS`;
- `I6_BROKER_MUTATIONS`;
- `I6_CLEANUP_MUTATIONS`;
- `I6_LEDGER_CORRUPTION_MUTATIONS`.

The D1 grant names one host/boot, component, mutation set, expiry and maximum use
1. An observer grant cannot mutate Windows; a route grant cannot mutate signer,
broker, cleanup or ledger; a subset cannot silently authorize 39 mutations.
Outer deny must already be active before any WSL/helper/route mutation.

### I7 - independent evidence review

Requires `I7_INDEPENDENT_REVIEW` for one retained P0-P3 bundle. It authorizes
read/verify/sign only. Reviewer and final approver remain distinct. Approver
unavailable at expiry means no approval and anchored `CONSUMED_FAIL`.

### I8 - PASS publication

Requires `I8_PASS_PUBLICATION` for one already approved D3/P4 root. It can only
ask the broker to create one D4 after anchored consume-pass. It cannot execute or
reuse the nonce.

## 12. What must not be built before proof

- generic multi-candidate runner;
- real CLI adapter or provider proxy;
- credential/account/model integration;
- UI/dashboard;
- shared/Production evidence or replay service;
- generalized plugin/connector/tool discovery;
- telemetry, updater, downloader or package bootstrap;
- retry path that reuses a nonce;
- compatibility claim for a real product.

## 13. Independent reviewer checklist

### Schemas and semantics

- [ ] Five separate schema IDs/kinds/versions are exact.
- [ ] Every nested object is closed and every array typed/bounded.
- [ ] D0 example validates and has every authorization false.
- [ ] D4 has no structurally valid unsafe combination.
- [ ] Duplicate keys are rejected before parse; JCS bytes and signature preimage
  are exact.
- [ ] Semantic validator inputs, outputs, exit codes and error IDs are complete.

### Trust, DAG and ledger

- [ ] OS, key and binary identities are pairwise unique across roles.
- [ ] Trust roots/schema hashes are pre-anchored; rotation/revocation/recovery are
  exact.
- [ ] P0-P5 manifests contain no future artifact and each artifact has one
  producer plus later typed consumers.
- [ ] TPM NV head makes valid backup restore and cross-machine copy fail closed.
- [ ] Reserve/lease/consume are atomic; crash/boot/expiry/approver timeout only
  consume fail.

### Windows/WSL and observer

- [ ] Boot-time WFP/Hyper-V deny precedes WSL and every risky helper/route.
- [ ] nft family/hook/priority/policy, interfaces and routes are exact.
- [ ] DNS, IPv6, NAT64, mapped, metadata, loopback, link-local, multicast and
  runtime-helper bypasses are closed.
- [ ] netlink/eBPF/procfs/sysfs/devices/mounts/FDs/sockets are bound and watched.
- [ ] Observer starts before first connected interface and capture attaches
  while links are down.
- [ ] Pristine, M16 and M17 envelopes/criteria are mutually coherent.
- [ ] PACKET_STATISTICS and shutdown-after-kill are complete.

### Broker, cleanup and mutations

- [ ] Broker validates final path by handle, volume/file IDs, link/reparse/stream
  state, exact share modes and security descriptor.
- [ ] Every write/flush/readback/seal/index boundary and crash disposition is
  deterministic.
- [ ] Every created object has one typed deletion acknowledgment.
- [ ] All 39 IDs have one real mutation, one gate and one error.
- [ ] M04 mutates before gate 10; service/capture, clock, corruption, cleanup and
  Windows multi-gate cases are split.
- [ ] Restoration is byte/object exact and followed by a new pristine run.

### Fake CLI and authority

- [ ] Frame prefix is 4-byte big-endian; N excludes LF; LF is exactly 0x0A.
- [ ] stdout/stderr drain concurrently and partial closures are deterministic.
- [ ] timeout/cancel arbitration and environment values are exact.
- [ ] opened-root identity prevents path/root replacement.
- [ ] M01 is the only inert synthetic sentinel.
- [ ] No real Codex/Claude/model/provider binary, module, SDK, account, login,
  OAuth, key, endpoint, plugin, prompt, output or client data exists.
- [ ] I1-I8 grants are explicit, one-shot where relevant and non-transitive.

## 14. Residual unknowns by future gate

| Future gate | Unknown requiring proof |
| --- | --- |
| I1/I2 | executable schema and semantic-validator conformance on adversarial vectors |
| I3 | TPM NV availability, atomic recovery behavior and backup/copy rejection |
| I4 | fake process byte/pipe behavior under the bounded harness |
| I5 Windows | boot-time WFP binding can precede every WSL route |
| I5 WSL | runtime owner cannot replace/bypass controller namespaces |
| I5 observer | zero-loss pristine capture within the exact envelope |
| I5 broker | NTFS crash/durability and security-descriptor behavior |
| I6 | all real mutations can be restored exactly without unacceptable host risk |
| I7 | independent reviewer accepts key custody, evidence and boundaries |
| I8 | broker guard makes a single-component forged D4 impossible |

These unknowns block implementation/rehearsal/PASS claims, but not independent
review of this completed R2 design.

## 15. Final state

`DESIGN_READY_FOR_INDEPENDENT_REVIEW_R2`

- `executionAuthorized:false`
- `syntheticFixtureExecutionAuthorized:false`
- `realCandidateExecutionAuthorized:false`
- `providerExecutionAuthorized:false`
- `realCandidateInvocations:0`
- `providerCalls:0`
