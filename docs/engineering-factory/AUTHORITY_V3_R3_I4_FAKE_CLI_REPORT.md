# Authority V3 R3 — I4 deterministic fake CLI report

Status: `COMPLETE LOCAL SYNTHETIC ONLY`

Authority: `executionAuthorized:false`

## Decision

I4 proves only that a committed deterministic fake process can be launched and supervised through a bounded local protocol. It does not authorize a Codex, Claude, model, provider, relay, WSL, container, firewall, Preview, Production, or real-candidate execution.

The next privileged/native stage remains separately gated.

## Implemented surface

- Exact ten-token logical argv contract with strict order and a UUID v4 run identifier.
- Length-prefixed `u32be` frames containing canonical UTF-8 JSON and one exact trailing LF.
- Duplicate-key rejection before JSON parsing, I-JSON safe-integer restriction, frame size and aggregate-byte limits, sequential frame numbers, and a SHA-256 prior-frame chain.
- Fixed terminal-cause precedence: violation, cancellation, timeout, exit, then framing.
- Disposable per-run root with device/inode/mode identity rechecked immediately before launch and recursive cleanup in `finally`.
- Concurrent stdout and stderr drains attached before stdin is written.
- Bounded combined output, zero stderr on success, exact output-state sequence, one terminal frame, closed-pipe verification, and an overall deadline that kills the child.
- A pinned committed `.mjs` fake candidate launched by the current Node executable under the Node Permission Model with filesystem read access only to that entrypoint and no network grant.
- Synthetic requests and synthetic results only. Raw streams are validated in memory and discarded; the proof contains classifications and counts, not content.

## Measured proof boundary

The successful proof explicitly records:

- provider calls: `0`;
- real candidate invocations: `0`;
- deterministic fake invocations: `1`;
- child processes remaining: `0`;
- ephemeral root removed: `true`;
- network probe denied: `true`;
- concurrent drains started before input: `true`.

## Windows and isolation limitations

This is an unprivileged Node harness, not an OS security boundary.

Windows injects eleven runtime bootstrap variables into the child environment even when `CreateProcess` receives an otherwise minimized block. The supervisor supplies synthetic values for those names, and the pinned runtime shim removes them before validating the exact ten-variable logical environment. Therefore I4 proves the logical fake-candidate contract on this host; it does not prove the future physical Linux `/ef` environment is exact.

The relay host and port are inert logical values. Network authority is deliberately absent, no relay is contacted, and no egress claim beyond the denied synthetic loopback probe is made.

The disposable root is a Windows temporary directory protected by before/after device, inode, and mode identity checks. It is not a mounted `/ef`, `openat2`, a rootless container, or a privileged firewall implementation. Those belong to later separately authorized stages.

Node's Permission Model is defense in depth for this deterministic fake only. It is not presented as protection against malicious native code.

## Named mutation evidence

Each mutation compiled, failed by its named test, and was restored byte-exactly before the final run:

1. `i4-exact-argv-bypass` — extra/reordered argv became admissible.
2. `i4-duplicate-key-preparse-bypass` — duplicate-key classification was lost before JSON parse.
3. `i4-lf-terminator-bypass` — a non-LF terminator was accepted.
4. `i4-root-replacement-bypass` — a replaced disposable root was allowed to launch.
5. `i4-network-grant-bypass` — the fake child received network authority.
6. `i4-descendant-pipe-leak-bypass` — the dedicated descendant-held-pipe refusal was bypassed.
7. `i4-backpressure-bypass` — raw bytes escaped the aggregate limit and reached another parser error.
8. `i4-timeout-bypass` — a deadline kill lost the authoritative timeout classification.

Pristine source SHA-256 values after restoration:

- protocol: `0efcccb4fa06c82956cdb1b0ba54c80699c1d0a45d78311d5af2b969f2f93052`;
- harness: `03f748140ca8d16d09f8133cadb4c54e3c632674feef6a811debb86998132777`;
- fake candidate: `59b802217454889243c79adb06691eb63aca4e3daca807c4be48fd78d1d39082`.

## Validation

- Targeted I4 suite: 12/12 pass.
- Adjacent I3 + I4 suites: 26/26 pass.
- Complete repository suite: 76 files pass, 1 skipped; 1,333 tests pass, 1 skipped.
- Authority V3 R3 static validator: `AUTHORITY_V3_R3_STATIC_DESIGN_VALID`, `executionAuthorized:false`, provider calls `0`, real candidate invocations `0`.
- TypeScript: pass.
- ESLint: 0 errors; two pre-existing warnings remain in `src/lib/engineering-factory/bakeoff.ts`.
- `git diff --check`: pass.
- Lockfile: unchanged.

Final branch and Brain identifiers are recorded in their checkpoint commits after this report is committed.
