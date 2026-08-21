# Authority V3 fake CLI compatibility, implementation plan and review checklist

Status: design-only

Design verdict: DESIGN_READY_FOR_INDEPENDENT_REVIEW

Execution verdict: NO-GO

executionAuthorized:false

## 1. Compatibility claim boundary

The future fake CLI is a deterministic interface fixture shaped like a possible
candidate command-line surface. It is not Codex, Claude or another product. A
green synthetic compatibility run could establish only:

The exact fake CLI build accepted the exact fake framing and lifecycle contract
under the exact Authority V3 source/runtime snapshot.

It could not establish:

- real Codex or Claude compatibility;
- real CLI flag, output, update, authentication or provider behavior;
- model quality, latency, cost, tool use or file-edit behavior;
- provider account, endpoint, retention or credential safety;
- safe execution of arbitrary native code;
- authority to inspect, install or execute a real candidate.

## 2. Deterministic fake CLI contract

### 2.1 Executable identity

Logical executable token: ef-fake-candidate

Candidate kind: deterministic-fake-cli

The future binary, wrapper, source tree and compatibility snapshot each have an
independent SHA-256 in CandidateContractV3. The wrapper may exec only the pinned
fake binary. It may not search PATH, a package manager, a registry, a user
profile or a plugin directory.

No actual Codex, Claude, model client, vendor library or provider SDK may be
linked, imported, loaded, discovered or invoked.

### 2.2 argv grammar

The only accepted normalized grammar is:

    ef-fake-candidate compatibility-rehearsal
      --contract-version 3
      --stdin-framing length-prefixed-json-lines
      --stdout-framing length-prefixed-json-lines
      --run-id UUID

Rules:

1. The four flags occur once, in that order.
2. contract-version is exactly 3.
3. framing values are exact constants.
4. run-id equals the signed authority runId.
5. Unknown, duplicate, abbreviated, combined or reordered flags are refused.
6. No input frame, prompt, payload, path, endpoint, model, provider, token,
   account, OAuth value, environment value or credential appears in argv.
7. Response files, shell expansion, globbing and platform-specific alternate
   argument parsing are disabled.
8. The normalized argv token array, excluding no values, is bound by hash
   because all permitted values are content-free.

The wrapper uses direct process creation with shell disabled.

### 2.3 stdin frames

Transport is a binary length prefix followed by canonical UTF-8 JSON. Each
frame contains exact keys:

- schemaVersion: 3;
- frameType: start, request, cancel or end;
- frameSequence: positive integer;
- priorFrameSha256;
- runId;
- fakeRequestId;
- payloadClass;
- fakePayload.

start occurs once at sequence 1. request occurs one or more times. cancel is
optional and may occur once. end occurs once and is terminal.

fakePayload is generated locally from a committed synthetic schema. It contains
no prompt, model instruction, repository content, client data, secret,
credential, real endpoint or provider identifier. A seeded fake canary is
allowed only in ephemeral memory to prove non-persistence and must never appear
in durable evidence.

Limits are signed in CandidateContractV3:

- maximum frame size;
- maximum frame count;
- maximum total bytes;
- maximum idle interval;
- required end-of-stream.

Malformed length, JSON, schema, sequence, prior hash, run ID, request ID,
payload class or extra field causes refusal before any relay operation.

### 2.4 stdout envelope

stdout uses the same length-prefixed canonical JSON framing. Allowed exact frame
types are:

- ready;
- accepted;
- progress;
- result;
- cancelled;
- refused;
- terminal.

Every stdout frame contains:

- schemaVersion;
- frameType;
- frameSequence;
- priorFrameSha256;
- runId;
- fakeRequestId or null;
- statusClass;
- fakeResultClass or null;
- byteCountClass;
- terminal boolean.

fakeResultClass is an enum, not raw content. The process may emit only committed
synthetic classes. The supervisor validates framing in an ephemeral bounded
buffer, persists only counters/classes, and destroys raw bytes.

ready is emitted only after stdin and local relay descriptors are validated.
terminal is emitted exactly once. A successful terminal follows one result per
accepted request. Missing, duplicate, reordered or unknown frames fail.

### 2.5 stderr envelope

stderr is empty on success. On refusal or internal failure, it may contain at
most one canonical content-free error envelope with:

- schemaVersion;
- errorClass;
- gateHintClass;
- retryable: false;
- contentIncluded: false.

No exception text, path, environment value, payload, request body, stack trace,
provider detail or raw system error is allowed. Any non-envelope byte, second
envelope, truncation or size overflow causes kill-and-fail.

### 2.6 Exit codes

| Code | Meaning |
| --- | --- |
| 0 | all accepted fake requests reached terminal result |
| 20 | argv contract refusal |
| 21 | stdin framing/schema refusal |
| 22 | environment or filesystem contract refusal |
| 23 | local relay contract refusal |
| 24 | cancellation completed |
| 25 | bounded timeout observed by fake CLI |
| 26 | backpressure/output limit refusal |
| 70 | deterministic internal fixture failure |

Every other exit code is UNKNOWN_EXIT and fails the run. Exit 0 without a valid
terminal stdout frame also fails.

### 2.7 Signals, cancellation and timeout

- The supervisor may send one named graceful cancellation signal defined by
  the compatibility snapshot.
- The fake CLI stops accepting frames, emits cancelled and terminal envelopes,
  closes its relay connection and exits 24 within the signed grace interval.
- If it misses the deadline, the controller blocks network before cgroup kill.
- SIGKILL or platform-equivalent forced termination cannot be caught and must
  be preceded by the signed kill-switch block receipt.
- Any signal not declared by the contract fails the run.
- Timeout is measured by the independent monotonic source. Wall time is
  recorded only for human correlation.

### 2.8 Streaming and backpressure

1. stdin, stdout and stderr use bounded pipes.
2. The supervisor never buffers more than the signed per-stream and combined
   limits.
3. Backpressure is blocking with a signed maximum stall interval.
4. Output after cancellation, terminal or pipe close is a contract failure.
5. Partial frames on EOF fail.
6. A process blocked beyond the stall interval enters block-before-kill.
7. Raw frames are never durable. Only content-free frame counts, size classes,
   state transitions and hashes of schema/configuration objects are evidence.

### 2.9 Environment allowlist

The exact environment variable names are:

- EF_AUTHORITY_SCHEMA_VERSION
- EF_COMPATIBILITY_CONTRACT_VERSION
- EF_FAKE_RELAY_HOST
- EF_FAKE_RELAY_PORT
- EF_RUN_ID
- HOME
- LANG
- PATH
- TMPDIR

Rules:

- The child environment is constructed from empty state.
- PATH contains one immutable fixture bin directory and is never searched for a
  real candidate.
- EF_FAKE_RELAY_HOST and port identify the local synthetic relay only.
- No inherited proxy, auth, token, key, account, provider, telemetry, update,
  package, connector, plugin, cloud, SSH, Git credential or user-profile
  variable is present.
- Evidence records only the sorted variable names and their configuration hash,
  never values.

### 2.10 Filesystem and workspace

The fake CLI sees:

- one read-only content-addressed fixture bundle;
- one bounded writable workspace;
- one bounded writable result directory;
- exact tmpfs paths;
- no host repository mount, shared .git link, user profile, Windows drive,
  runtime socket, device, credential directory or unrelated worktree.

Allowed writes are:

- workspace/state.json;
- workspace/operations.jsonl;
- result/result.json.

All writes are create-only or atomic replace within the private workspace,
bounded by file count and total bytes. Symlinks, hard links, alternate streams,
device nodes and path traversal are refused. The final workspace tree and
result schema are hashed; content is fake and remains subject to the
content-free evidence projection.

### 2.11 Subprocess tree

The default contract permits no child process. The wrapper execs the fake CLI
so the cgroup contains one fixture process plus runtime shims explicitly named
in the OCI profile. Threads are bounded; worker processes, shells, interpreters,
package tools, downloaders and runtime helpers are absent.

Mutation M22 may use a separately hashed mutation build that creates one
sentinel child solely to prove cgroup teardown. That mutation build can never
yield PASS.

### 2.12 Local relay and fake payloads

The fake CLI receives one numeric local relay tuple from the signed environment.
It may not accept a hostname, URL, endpoint flag, proxy variable or discovered
route.

The relay accepts only:

- the exact candidate namespace/interface;
- the exact runId and routeId;
- the exact fake request schema;
- bounded fake payload classes;
- one fake DNS route and one fake provider route.

The relay rejects real provider names, FQDNs, IPs, TLS roots, SDK wire formats,
auth headers, OAuth, API keys, redirects, updates, downloads, telemetry and
connector traffic.

## 3. Authority required before any real candidate work

Even read-only inspection of a real candidate later requires a new explicit
user mandate naming:

- candidate product and exact version;
- permitted inspection operation;
- exact binary/source paths;
- whether hashing, signature verification or documentation reading is allowed;
- protected repository boundary;
- content/secret handling rules;
- whether Internet lookup is allowed;
- expected non-execution evidence and stop point.

Execution of a real candidate requires a still-separate authority that cannot
be issued by Authority V3. At minimum it must add:

1. realCandidateExecutionAuthorized:true in a new schema/kind expressly created
   for the named candidate;
2. modelExecutionAuthorized and providerExecutionAuthorized decisions;
3. exact candidate binary, wrapper, bootstrap and library-chain hashes;
4. exact invocation/model/effort/tool profile;
5. dedicated benchmark identity and credential broker;
6. provider endpoint and control-plane allowlist;
7. independently verified provider retention and account controls;
8. real provider egress firewall and observer design;
9. prompt/output/client-data policy;
10. cost, rate, kill-switch and incident limits;
11. independent security/privacy approval;
12. one-shot explicit user authorization for the exact run.

None of those authorities is present or implied here.

## 4. RED-first implementation plan

The plan is ordered so privileged execution cannot begin while static contracts
are incomplete.

### Phase I0: freeze design and test names

Authorized in a future documentation/test-planning task only.

Work:

- accept or revise the four design artifacts;
- freeze schema identifiers, gate names and all 39 mutation IDs;
- define the exact static test file names and fixture data shapes;
- confirm the design-only JSON Schema is not imported by runtime code.

Success gate:

- independent reviewer checks every required field and returns
  DESIGN_READY_FOR_IMPLEMENTATION_PLANNING.

Stop:

- any contradictory authority, unknown security behavior or attempt to weaken a
  mandatory gate.

Do not build:

- runtime code, signer, controller, observer, datastore or CLI.

### Phase I1: failing static schema and contract tests

Requires a separate user authorization for unprivileged test/code work.

RED first:

- schema rejects missing/unknown fields and every forbidden authorization true;
- resolver requires all 45 artifact kinds;
- gate registry order is exact;
- PASS-before-cleanup is structurally impossible;
- fake CLI grammar/environment/filesystem contracts reject all unapproved
  values;
- content-sensitive field scanner rejects seeded canaries;
- design artifact cannot be imported into runtime entry points.

Success gate:

- all new tests fail for the intended missing implementation, with no WSL,
  container, network, database or build command.

Stop:

- a test launches a process beyond the approved static harness or writes outside
  its disposable temp root.

### Phase I2: unprivileged canonical schema, resolver and evidence model

Requires a separate unprivileged implementation mandate.

Work:

- implement canonical parsing and exact schema validation;
- implement content-free artifact references and resolver manifest;
- implement local immutable-store interface against disposable filesystem
  fixtures only;
- implement signature verification against fixture public keys;
- implement fake CLI parser/framing as a library-level deterministic fixture;
- keep every authorization boolean false.

Success gate:

- static RED tests turn green;
- artifact missing/changed, signer substitution and PASS ordering mutations fail
  exact gates using disposable files;
- no privileged process or network path exists.

Stop:

- any need for WSL, Podman, firewall, persistent signer key, shared database or
  real binary.

### Phase I3: durable replay-ledger implementation

Requires new user authorization specifically for a local disposable datastore
implementation. It does not authorize a rehearsal.

RED first:

- restart/replay, concurrent reservation, boot-ID change, unavailable ledger,
  corruption and crash-between-reserve/consume cases fail.

Work:

- implement the local single-host transactional ledger with append-only events,
  unique nonce and lease constraints, FULL durability and signed receipts;
- use only disposable local test ledgers;
- never connect Production or shared databases.

Success gate:

- mutations M19, M24 and M35-M37 fail their exact gates;
- crash recovery can only consume fail;
- byte/integrity evidence is independently reproducible.

Stop:

- shared DB, network DB, migration of an existing database, uncertain consume
  state or reusable reserved nonce.

### Phase I4: unprivileged fake CLI process contract

Requires a new user authorization for local provider-free fake process tests.
This is not a container or privileged rehearsal.

RED first:

- argv/input/output/environment/workspace/backpressure/timeout/cancellation and
  subprocess cases fail.

Work:

- build only the deterministic fake CLI;
- run only fake local frames with network disabled;
- retain no raw stream content.

Success gate:

- exact process contract passes in an unprivileged disposable harness;
- zero real candidate binaries and provider components are present;
- realCandidateInvocations:0 and providerCalls:0.

Stop:

- any real candidate, SDK, account, credential, endpoint, model or external
  network requirement.

### STOP AUTHORIZATION GATE A

Completion of I0-I4 does not authorize WSL, Podman, namespaces, firewall,
observer capture or a rehearsal.

Required new decision:

- explicit user authorization for privileged implementation only;
- named worktree/commit;
- named controller/observer scope;
- exact host boundary;
- allowed mutation mechanisms;
- explicit statement that execution remains forbidden.

### Phase I5: privileged controller and independent observer implementation

Only after Gate A.

RED first in source/static fixtures:

- namespace binding, ruleset object, interface/route, observer readiness,
  PACKET_STATISTICS, signer and deletion-acknowledgment contracts fail.

Work:

- implement controller-owned enforcement namespace;
- implement exact runtime/network fingerprints;
- implement pre-anchored independent observer signer;
- implement dual final rebind;
- implement block-before-kill and acknowledged cleanup.

No rehearsal is authorized in this phase. Static and dependency-injected tests
must not mutate host state.

Success gate:

- implementation is source-complete and independently reviewed;
- no security behavior was invented beyond accepted design;
- executionAuthorized:false.

Stop:

- inability to separate signer custody, inability to prove runtime-owner
  non-bypass, or requirement to treat rootless namespace ownership as outer
  enforcement.

### STOP AUTHORIZATION GATE B

Source completion is not authority for a privileged rehearsal.

Required new decision:

- explicit one-time user authorization for a privileged provider-free mutation
  rehearsal;
- exact host, boot ID, commit/tree, controller/observer/signers and mutation
  subset;
- rollback and incident plan;
- independent reviewer assigned;
- syntheticFixtureExecutionAuthorized:true in a separately signed one-shot
  authority.

### Phase I6: privileged provider-free mutation rehearsal

Only after Gate B.

Work:

- run one pristine control and all 39 true mutations under distinct nonces;
- retain complete content-free evidence;
- stop immediately on failed cleanup, signer/ledger/store failure or unexpected
  state.

Success gate:

- every mutation fails its exact named gate;
- every restoration is source-byte and privileged-state exact;
- zero kernel drops and zero unclassified events;
- external cleanup verified before evidence resolution;
- no PASS yet.

Stop:

- any restoration failure, outer-boundary uncertainty, host/kernel compromise
  suspicion or evidence gap.

### STOP AUTHORIZATION GATE C

Rehearsal completion is not PASS and not real-candidate authority.

Required new decision:

- independent review authorization for the retained provider-free bundle.

### Phase I7: independent evidence review

Only after Gate C.

Work:

- reproduce all hashes from bytes;
- verify keys, ledger, timelines, mutation objects, cleanup ordering and store
  sequence;
- verify reviewer independence;
- sign approve/refuse decision.

Success gate:

- GATE_V3_INDEPENDENT_REVIEW_APPROVED.

Stop:

- missing/unresolvable artifact, self-signed provenance, cleanup/PASS ordering
  defect, non-real mutation or content-sensitive evidence.

### STOP AUTHORIZATION GATE D

An approved synthetic bundle may permit only publication of its
candidate-specific fake compatibility result. It never permits another run or
a real candidate.

### Phase I8: possible synthetic PASS publication

Only after Gate D and only for the already completed exact run.

Success gate:

- append-only PASS pointer created after final approval;
- replay nonce already consumed;
- all authorization constants for real/model/provider/credentials remain false.

Stop:

- any attempt to use PASS as preauthorization for execution.

## 5. What must not be built before proof

- a generic multi-candidate runner;
- provider proxy or credential broker;
- real CLI adapter;
- model/provider account integration;
- UI dashboard;
- Production/shared evidence service;
- generalized plugin/connector discovery;
- telemetry, auto-update or package bootstrap;
- compatibility claims for any real product;
- retry logic that can reuse a nonce or weaken a failed gate.

## 6. Independent reviewer checklist

### 6.1 Schema completeness

- [ ] Top-level schemaVersion, kind and scope are exact.
- [ ] All six authorization booleans are present; only future
  syntheticFixtureExecutionAuthorized is variable.
- [ ] realCandidateInvocations and providerCalls are zero.
- [ ] Run identity includes nonce, clocks, boot ID, source commit/tree, durable
  ledger entry and exclusive lease.
- [ ] Candidate, runtime, network, observer, evidence, cleanup, approvals and
  result objects include every normative field.
- [ ] Unknown fields and content-sensitive fields are refused.

### 6.2 Trust separation

- [ ] Policy, observer, controller and final-approver keys pre-exist the run and
  are independently pinned.
- [ ] No run-root key is accepted.
- [ ] Supervisor cannot sign observer/controller/reviewer claims.
- [ ] Controller cannot create the observer chain or final approval.
- [ ] Reviewer identity differs from every producer/store/ledger identity.
- [ ] Rotation requires old/new cross-signature and reviewer approval.

### 6.3 Real mutation quality

- [ ] All 39 mutation IDs exist.
- [ ] Every mutation changes real source, bytes, privileged state, process,
  namespace, artifact or persistent ledger.
- [ ] expectedGate equals observedFailedGate.
- [ ] Earlier guard neutralizations are declared and do not disable the target
  detector.
- [ ] Source restoration is byte-exact and Git-clean.
- [ ] Privileged-state restoration is externally verified.
- [ ] No boolean flip, final-decision mock or assertion-only mutation receives
  credit.

### 6.4 Observer coverage

- [ ] Observer service signs readiness before durable nonce reservation.
- [ ] Complete per-interface capture set signs readiness after namespaces exist
  and before barrier release.
- [ ] Every interface and direction is covered.
- [ ] Namespace inode, process, cgroup, UID/GID, capabilities, binary, runtime
  and config are bound.
- [ ] Raw metadata logs are content-addressed and resolved.
- [ ] Per-observer/per-interface distributions are retained.
- [ ] Timeline uses a signed monotonic source.
- [ ] PACKET_STATISTICS is available for every capture socket.
- [ ] Effective buffer size is recorded.
- [ ] Kernel drops equal zero.
- [ ] Unclassified events equal zero.
- [ ] Shutdown completeness is signed.

### 6.5 Network and runtime ownership

- [ ] Outer enforcement is not merely a table inside a rootless-owned namespace.
- [ ] Rootless runtime owner edit challenge is real.
- [ ] Namespace replacement is detected at final rebind and continuously.
- [ ] OCI spec, image, UID/GID maps, capabilities, mounts, devices, cgroup,
  namespaces, FDs and sockets resolve from bytes/state.
- [ ] netavark, aardvark, slirp and pasta are bound or explicitly proven absent.
- [ ] There is no unmanaged interface, default route, Windows/provider route,
  real FQDN/IP, DNS bypass, IPv6 bypass, metadata route or host gateway.

### 6.6 Rollback and cleanup completeness

- [ ] External before snapshot precedes run objects.
- [ ] Every named and anonymous namespace is inventoried.
- [ ] Every ruleset/interface/route/process/cgroup/filesystem/Podman object is
  included.
- [ ] Observer, signer, key and temp-root inventories are included.
- [ ] Every deletion has a successful signed acknowledgment and absent-after
  readback.
- [ ] Deletion failures are fatal.
- [ ] External after snapshot is equivalent to before within the declared
  boundary.
- [ ] Windows inventory exists or the claim is explicitly narrowed without
  leaving a possible egress path.
- [ ] PASS is absent until final cleanup verification.

### 6.7 Durable replay

- [ ] Nonce reservation is transactional and persistent.
- [ ] Unique active lease prevents concurrent runs.
- [ ] RESERVED cannot return to ISSUED.
- [ ] Crash or boot change recovers only to consumed fail.
- [ ] Append sequence and prior-event hash verify.
- [ ] Ledger unavailability/corruption fails closed.
- [ ] Replay after process/service restart is rejected.
- [ ] No Production/shared database is used.

### 6.8 Evidence and content safety

- [ ] Resolver manifest lists all 45 artifact kinds.
- [ ] Every artifact path is safe and every byte/hash/size/schema/signer is
  verified.
- [ ] Store is create-only, fsynced and immutable for the run.
- [ ] Hash-chain root and independent review bundle resolve.
- [ ] Raw prompts, outputs, bodies, headers, credentials, client data and
  environment values are absent.
- [ ] Fake canaries do not enter durable evidence.

### 6.9 Protected repositories and authorization

- [ ] Work was limited to the named Engineering Factory worktree and minimum
  Brain checkpoint.
- [ ] package-lock.json is unchanged.
- [ ] Protected product worktrees are unchanged.
- [ ] No WSL/container/firewall/network/database/build/test/runner command ran
  during design.
- [ ] No install, elevation, push, Preview, Production, deployment or migration
  occurred.
- [ ] The exact future authorization gates A-D are preserved.
- [ ] Design completion is not presented as execution GO.

## 7. Residual unknowns requiring later proof

1. Whether the current host can provide a truly controller-owned outer
   enforcement namespace that the rootless runtime owner cannot bypass.
2. Whether a pre-anchored observer signer can be isolated from the controller
   while still binding the exact capture process and namespace set.
3. Whether complete interface capture with PACKET_STATISTICS yields zero drops
   under the bounded mutation load.
4. Whether Windows network state must be inside the proof boundary to exclude
   every WSL escape route.
5. Which concrete local immutable-store mechanism satisfies create-only,
   fsync, resolution and independent-review requirements.
6. Which final signature algorithms and key-custody mechanism the independent
   reviewer will accept.
7. Whether all 39 mutations can be executed without creating a restoration
   risk unacceptable on the current host.

These unknowns do not block review of the design. They do block every
implementation-readiness, rehearsal and execution claim until proven.

## 8. Final design verdict

DESIGN_READY_FOR_INDEPENDENT_REVIEW

This is not an execution GO.

- executionAuthorized:false
- syntheticFixtureExecutionAuthorized:false
- realCandidateExecutionAuthorized:false
- modelExecutionAuthorized:false
- providerExecutionAuthorized:false
- credentialsAuthorized:false
- realCandidateInvocations:0
- providerCalls:0
