# Native isolation preflight v1

**Status:** CODE + TEST + READ-ONLY HOST EVIDENCE / control review required

**Date:** 2026-08-20

## Purpose

`npm run devbench:native-isolation:preflight` inventories only the host facts
needed by `ADR_NATIVE_ISOLATION_BACKEND_V1.md`. It does not install software,
enable Windows features, request elevation, create a VM/container, call a
provider or invoke a candidate.

The evaluator is pure and fail-closed. Even an inventory with functional WSL
and a container runtime yields `NATIVE_ISOLATION_CONTROL_REVIEW_REQUIRED`, not
execution readiness. Software presence is not control evidence.

## Current result

After the separately authorized setup spike, the current host returns exit
code 1 with:

```text
status: NATIVE_ISOLATION_CONTROL_REVIEW_REQUIRED
recommendedBackendCandidate: wsl2-hardened-linux-container
decisionStatus: PROPOSED_FOR_SETUP_REVIEW
blockers:
  - control_evidence_not_reviewed
executionAuthorized: false
realCandidateInvocations: 0
providerCalls: 0
osMutationPerformed: false
elevationRequested: false
```

The inventory now observes functional WSL2 and rootless Podman inside Debian.
It still refuses execution because installed software and synthetic evidence
do not replace the independent control review. The complete JSON contains only OS/runtime inventory, named blockers, rejected
backend reasons and the required control list. It contains no prompts, outputs,
credentials, client data, environment values or command output.

## Fail-closed rules

- Windows Home plus a present hypervisor is not admitted as Hyper-V.
- A present `wsl.exe` with a failing status is not called installed WSL.
- Bare WSL is never accepted as the hostile-code boundary.
- WSL plus Docker/Podman still requires separate control evidence.
- The script has no installation, elevation, candidate, container-run or
  provider command.
- Every report records zero candidate/provider calls and false authorization.

This preflight is a decision aid only. The setup evidence is recorded in
`NATIVE_ISOLATION_CONTROL_EVIDENCE_V1.md`; it does not change the execution
authority optimistically.

## RED and mutation evidence

The initial targeted suite failed before implementation because the preflight
module did not exist. Five compiling mutations then broke the named control
they were intended to protect:

| Mutation | Failure proved |
|---|---|
| `windows-home-hyperv-admission` | Windows Home was misclassified as an admissible Hyper-V/Sandbox host |
| `bare-wsl2-admission` | WSL without a container runtime advanced to control review |
| `installed-tools-execution-authorization` | installed WSL plus Docker incorrectly authorized execution before control review |
| `preflight-host-install-command` | an installation command entered the read-only preflight source |
| `preflight-native-candidate-launch` | a native candidate launch command entered the preflight source |

The module SHA-256 before and after its mutations is
`a9cf364b82220ff2b2215d695fd2be7dedcd858a1c835f5aa15971f7a4aa8d14`.
The script SHA-256 before and after its mutations is
`6ebb94ee45fc9eca35cacdb2e7a72423313740d7ce0d8a9266174ae06fa15fed`.
Both were restored byte-exactly and the pristine targeted suite returned 7/7.
