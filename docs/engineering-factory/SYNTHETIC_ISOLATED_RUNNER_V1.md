# Synthetic isolated runner v1 — provider-free control proof

**Status:** CODE + TEST + SYNTHETIC / native candidate execution remains blocked

**Date:** 2026-08-20

**Scope:** local Engineering Factory evidence only

## Verdict

The repository now has a provider-free runner that exercises the same declared
Node capability profile for two synthetic participants named `Codex` and
`Claude`. The proof covers invocation construction, environment projection,
input transport, selected Node resource denials, output projection and
ephemeral cleanup. It invokes no model CLI and makes no provider call.

This is not a security boundary for untrusted native candidate code. Node's
official Permission Model documentation describes the feature as a seat belt
for trusted code, explicitly says malicious code can bypass it and recommends
operating-system isolation for hostile code. The durable evidence therefore
records the limitation
`synthetic-node-candidate-only-native-cli-not-approved`, and the Candidate
Execution Boundary remains DRAFT.

Primary reference:
<https://nodejs.org/api/permissions.html>

## Exact local contract

The supervisor creates one disposable root containing:

- a bundle directory with one deterministic fixture and no `.git` metadata;
- a result directory that is the only write grant;
- a parent canary that must not be readable;
- an outside-write canary path that must not be writable.

For each synthetic participant, it starts the local Node 26 executable with:

- `--permission` in enforce mode;
- read access only to the bundle;
- write access only to the result directory;
- no `--allow-net`, child-process, worker, addon, WASI or FFI grant;
- `--no-addons`, `--no-experimental-sqlite` and
  `--no-global-search-paths` as explicit bypass reductions;
- a fresh allowlisted environment rather than `process.env` inheritance;
- the complete synthetic input on stdin, never in process arguments;
- a 10-second process limit and a 64-KiB combined raw-stream cap.

The synthetic candidate deliberately attempts forbidden parent-file reads,
an alternate `node:sqlite` read, an outside write, loopback network access,
child-process creation and worker creation. It also writes the complete input
to stdout as a canary. The supervisor counts and discards those streams, parses
only the create-only structured result, then destroys the entire disposable
root before returning metadata.

Both profiles must have the same capability fingerprint. Durable evidence
contains only control booleans, runtime and source fingerprints, the bundle
manifest fingerprint, allowlisted environment names and zero-use counters. It
is create-only and protected by a SHA-256 integrity wrapper.

## RED evidence and named mutations

The first filesystem test exposed a real limitation: `node:fs` was denied but
`node:sqlite` could still open the parent canary. The runner now disables the
experimental SQLite builtin explicitly, matching Node's documented warning
that filesystem permission checks do not cover every alternate API.

Eight compiling mutations were run and restored byte-exactly:

| Mutation | Broken invariant observed |
|---|---|
| `synthetic-inherited-environment-leak` | inherited environment entered the child |
| `synthetic-network-escape` | loopback network became reachable |
| `synthetic-parent-filesystem-escape` | the parent canary became readable |
| `synthetic-sqlite-filesystem-bypass` | the alternate SQLite read bypass returned |
| `synthetic-child-process-escape` | child-process creation became possible |
| `synthetic-input-argument-leak` | the complete input entered process arguments |
| `synthetic-raw-stream-persistence` | raw input entered durable evidence |
| `synthetic-profile-parity-drift` | Codex and Claude capability profiles diverged |

Each mutation made its named guard fail. The source hashes before and after
restoration matched exactly. A later legitimate change added fingerprints of
the final runner and candidate sources to durable evidence and was re-tested.

## What the rehearsal proves

The local rehearsal writes one ignored metadata artifact under:

```text
.scratch/engineering-factory/synthetic-isolation/synthetic-isolation-evidence-v1.json
```

For the final source it proves:

- two synthetic participant invocations;
- zero real candidate invocations;
- two deterministic in-process fake-provider operations;
- zero provider calls;
- matching capability profiles;
- all tested controls true;
- no input or raw-stream canary in durable evidence;
- source and bundle fingerprints present;
- the disposable workspace removed before return.

## What remains blocked

This proof does not authorize or claim:

- execution of Codex, Claude or any other native model CLI;
- containment of malicious or arbitrary candidate code;
- an OS user, container, VM, Windows Sandbox or kernel egress boundary;
- protection against every Node/V8/OS bypass, symbolic-link escape or existing
  file descriptor;
- provider credentials, provider retention approval or real provider egress;
- a measured benchmark slot, model ranking, adoption, merge or rollout.

The next release gate is an operating-system isolation backend with independent
review. Until that exists and the exact artifacts are bound by an APPROVED
Candidate Execution Boundary file, execution preflight must continue to fail.

`ADR_NATIVE_ISOLATION_BACKEND_V1.md` now proposes WSL2 plus a hardened Linux
container as the setup path for this Windows 11 Home host. The accompanying
read-only preflight confirms that WSL and a container runtime are not currently
installed and keeps execution blocked. This is a backend decision and host
inventory only, not an extension of the synthetic proof.
