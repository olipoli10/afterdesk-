# ADR: Independent candidate runner boundary

**Status:** Selected / synthetic control proof complete / native execution blocked
**Date:** 2026-08-20  
**Deciders:** Control Tower plus an independent security/privacy reviewer

## Context

DevBench V2 has a frozen 32-slot counterbalanced plan and rehearsed Git
mechanics. A real coding candidate requires provider egress and write access to
a frozen case, while the product repository must remain unable to expose
credentials, unrelated files, raw model text or client data. The current
PowerShell wrappers are convenience launchers, not isolation controls.

## Decision

Use a separate, deny-by-default candidate-runner supervisor outside the product
runtime. The repository may produce a review-ready evidence request, but it
must not launch the candidate itself. The supervisor receives an isolated
candidate bundle, a frozen invocation profile and scoped benchmark credentials;
it returns only privacy-checked measured evidence and the case-local Git result.

Candidate execution remains blocked until the supervisor and its network/data
controls are independently reviewed.

## Options considered

### A. Run the current local wrappers directly

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Evidence quality | Low |
| Secret/file isolation | Unproven |
| Candidate parity | Broken |
| Decision | Rejected |

The scripts inherit the environment, expose prompts in process arguments, rely
on a linked worktree and do not enforce egress or result projection.

### B. Add more flags to the current wrappers

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Evidence quality | Medium at best |
| Secret/file isolation | Still not OS-enforced |
| Candidate parity | Fragile |
| Decision | Rejected as the final boundary |

Flags can disable session persistence, tools or telemetry, but cannot prove
that inherited credentials, filesystem traversal, child processes and network
escape are blocked.

### C. External isolated supervisor with an egress proxy

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Evidence quality | High when independently tested |
| Secret/file isolation | Enforceable |
| Candidate parity | Explicit profile per candidate |
| Decision | Selected, not yet implemented |

The supervisor must own process creation, environment construction, filesystem
boundary, egress, time/output caps and destruction of raw output. Vendor CLIs
remain replaceable artifacts behind the same evidence contract.

## Consequences

- The V2 benchmark cannot start from the current repository or wrappers.
- Exact local fingerprints remain useful but are not authorization.
- The frozen plan needs a reviewed distinction between provider control-plane
  egress and candidate tool/network access before measured results can claim
  `networkAccess: none` honestly.
- A provider account's verified retention setting becomes part of the candidate
  configuration, not a generic vendor claim.
- The first independent-runner milestone is a synthetic no-provider control
  proof. That proof now exists in `SYNTHETIC_ISOLATED_RUNNER_V1.md`, using Node
  26's Permission Model with both participant profiles kept
  capability-identical. It is not the selected production boundary: Node
  documents the feature as a seat belt for trusted code, not a security
  mechanism for malicious code. A real provider call remains blocked until an
  OS-isolated supervisor and its controls are independently reviewed.

## Action items

1. **Complete:** define the synthetic bundle and invocation profile.
2. **Complete:** implement a provider-free deterministic synthetic candidate.
3. **Complete for the Node synthetic profile only:** exercise environment,
   filesystem, network, process, worker, input and result controls with named
   mutations.
4. Implement and independently review an OS isolation backend for native CLIs.
5. Freeze dedicated benchmark accounts and retention controls.
6. Only after those controls are approved, create an `APPROVED` authority.

The backend decision is now narrowed by
`ADR_NATIVE_ISOLATION_BACKEND_V1.md`. On the current Windows 11 Home host, the
recommended candidate is WSL2 plus a hardened Linux container. The read-only
preflight reports setup required; it installs nothing and does not authorize
candidate execution. A dedicated Hyper-V VM remains the stronger deferred
Windows-native option if the host edition and parity requirement change.
