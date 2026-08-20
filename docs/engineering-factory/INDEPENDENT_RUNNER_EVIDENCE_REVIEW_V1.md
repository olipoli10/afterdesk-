# Independent Runner Evidence Review v1

**Status:** REVIEW BLOCKED / LOCAL ONLY  
**Date:** 2026-08-20  
**Scope:** exact local Codex and Claude runner artifacts prepared for the
counterbalanced 32-slot DevBench V2 plan. No candidate or provider call ran.

## Decision

Candidate execution remains **NO-GO**. Exact local artifacts can be identified,
but the current wrappers do not enforce the environmental, filesystem, network,
input or result boundaries declared by Candidate Execution Boundary v1. The
ignored authority file must remain `DRAFT`.

This review is evidence about why execution is blocked. It is not the missing
independent approval and cannot be used as an approval reference.

## Exact observed artifacts

Versions were read locally with `--version`; no model request was made.

### Codex

- CLI version: `codex-cli 0.148.0`.
- external wrapper SHA-256:
  `725c803b55d26aef61affb80c1c6e5a531cffc670ab3d109b3bcb0e96b3cac00`.
- npm launcher SHA-256:
  `c54db6755e710c39703f7c37512f9e35ed41042d8080558d2b84b8d2694323c3`.
- JavaScript bootstrap SHA-256:
  `134063e133f0b4244fa3b251acf973d4fe4b4aeeacbdc135211bf480f59f1477`.
- native executable SHA-256:
  `2ad2cf8a732da68b8f141634f92db1a03016c5faf533a7225fbc0fb740130410`.
- canonical ordered chain fingerprint:
  `ddf37445e20684e9e3c1cfe9068770e157d0c0794713afce138131f0809685c6`.
- Windows Authenticode status: valid; signer `OpenAI OpCo, LLC`.

The authority schema binds one wrapper fingerprint and one executable
fingerprint. It does not currently bind Codex's intermediate npm launcher and
JavaScript bootstrap. The chain fingerprint above is review evidence only; the
schema cannot enforce it yet.

### Claude

- CLI version: `2.1.232 (Claude Code)`.
- external wrapper SHA-256:
  `b8d6a9036a5066f9299989cd4132f5846f3941fbc0e16c10ecfcad95a2fe5377`.
- native executable SHA-256:
  `ec9e32479bc887809003c91384c6c3a26e7691856d1916f72f6f6d21800f3bd6`.
- canonical ordered chain fingerprint:
  `bf7630c32c44fc3c2532dd252bf60c05c1f70c87c3ccc965c92c5fb4b5778bd9`.
- Windows Authenticode status: valid; signer `Anthropic, PBC`.

Anthropic documents a separately signed release-manifest procedure. This run
verified the installed Windows signature locally but did not download and GPG-
verify the release manifest, so supply-chain proof remains partial.

## Control findings

| Boundary | Evidence | Verdict |
|---|---|---|
| Exact artifact identity | Local SHA-256 and valid Windows signatures recorded above | PARTIAL PASS |
| Exact invocation identity | Both wrappers accept runtime parameters not bound by the frozen candidate declaration | FAIL |
| Environment projection | Neither wrapper clears the inherited environment or constructs a name allowlist | FAIL |
| Input projection | Both wrappers place the complete candidate prompt in the process command line | FAIL |
| Filesystem isolation | A detached Git worktree still points through `.git` to shared repository metadata; no OS boundary blocks traversal | FAIL |
| Candidate parity | Claude is launched with `--tools ""` and `plan`; Codex can receive a variable sandbox, whose default is read-only | FAIL |
| Provider egress | No deny-by-default OS firewall/proxy policy is installed or evidenced | FAIL |
| Non-provider traffic | Claude telemetry, error reporting, update checks, connectors and artifacts are not explicitly disabled by the wrapper | FAIL |
| Session persistence | Codex uses `--ephemeral`; Claude uses `--no-session-persistence` | PASS, CLI declaration only |
| Result projection | Raw CLI stdout is inherited by the parent console instead of being discarded and reduced to privacy-checked measured evidence | FAIL |
| Provider data boundary | Official general policies found; actual authenticated account/project retention controls were not proven | FAIL |
| Independent review | No reviewer other than the implementing agent has approved the operating controls | MISSING |

## Provider data-boundary review

### OpenAI

Official OpenAI API documentation says API data is not used for training by
default unless the customer opts in. Default abuse-monitoring logs can include
prompts and responses and are retained for up to 30 days. Zero Data Retention
and Modified Abuse Monitoring require prior approval and have endpoint-specific
limits.

Source: <https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint>

That API documentation does **not** prove which account type, endpoint,
retention control or project the locally authenticated Codex CLI would use.
`--ignore-user-config` still leaves authentication outside this wrapper's
declared evidence. Therefore the installed CLI cannot inherit an API-level ZDR
claim from this general page.

### Anthropic

Anthropic documents that commercial Claude Code usage is not used to train
generative models by default unless the customer opts in. It also documents
that Claude Code sends prompts and model outputs over the network, and that a
zero-data-retention organization API key can avoid server-side transcript
retention. The current wrapper does not prove it authenticates with such an
organization or key.

Sources:

- <https://code.claude.com/docs/fr/data-usage>
- <https://code.claude.com/docs/en/corporate-proxy>

Anthropic's network documentation also lists authentication, API, connector,
update, artifact and telemetry hosts. The wrapper does not disable the optional
traffic or force all traffic through an allowlisted proxy. General vendor
documentation is therefore insufficient provider-boundary evidence for this
run.

## Required architecture before a candidate can run

1. Build an **isolated candidate bundle**, not a linked Git worktree. It contains
   only the frozen seed, challenge, test oracle and allowed repository files,
   with a private `.git` directory or no Git metadata linking to another tree.
2. Launch through a small supervisor that creates a **fresh child environment**.
   The child receives only reviewed variable names. Values come from a scoped,
   benchmark-only credential broker and are never printed or persisted.
3. Pass the challenge over **stdin or a protected pipe**, never as a command-line
   argument.
4. Freeze the complete invocation profile: executable chain, wrapper, model,
   effort, file/shell/tool permissions, workspace mode, time cap, output cap,
   update behavior and telemetry behavior.
5. Apply a deny-by-default **OS/proxy egress policy** to the candidate process
   tree. Allow only independently reviewed provider/auth endpoints. Block DNS
   bypass, direct IP egress, loopback proxy escape and child-process escape.
6. Disable nonessential telemetry, connectors, artifact services, update checks
   and external tools. Provider-required control-plane traffic must be named in
   the evidence rather than silently grouped with model traffic.
7. Capture stdout/stderr in a private ephemeral buffer. The only durable output
   is the existing privacy-checked measured-run envelope plus the candidate Git
   diff and test evidence; raw model text is destroyed after validation.
8. Use dedicated benchmark identities with explicit spend ceilings and verified
   retention settings. Personal ChatGPT/Claude subscriptions or unverified
   inherited authentication are inadmissible.
9. Have a reviewer independent from the implementation reproduce the hashes,
   inspect the OS policy, verify account controls, mutation-test fail-closed
   behavior and sign an opaque approval reference.

## Required RED tests for the future supervisor

- inherited canary environment names never enter the child process;
- a prompt canary never appears in process arguments, event logs or durable
  output;
- the candidate cannot read the parent repository, sibling worktrees, user
  profile, SSH keys, cloud configuration or `.env` files;
- an unallowlisted hostname, literal IP, alternate DNS path and spawned child
  process cannot reach the network;
- telemetry, connector, artifact and update endpoints are blocked;
- changing any executable, bootstrap, wrapper or invocation field invalidates
  readiness;
- raw stdout containing a seeded sensitive marker cannot enter measured-run
  evidence;
- Codex and Claude receive equivalent file, shell, network, time, output and
  intervention capabilities;
- the runner fails before provider contact if any evidence or account-control
  proof is missing.

## Stop condition

Do not repair these wrappers into a real launcher inside the product repository.
The missing control is an external OS-enforced runner. Candidate Execution
Boundary v1 should continue to refuse until that runner exists, its provider
accounts are verified and a separate reviewer approves the evidence.

