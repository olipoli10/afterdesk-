# ADR: Native isolation backend for Engineering Factory candidates

**Status:** Setup candidate installed / synthetic controls proved / execution blocked

**Date:** 2026-08-20

**Decision owner:** Control Tower plus an independent security/privacy reviewer

## Decision

Use a hardened rootless Linux container inside WSL2 as the **installed backend
candidate under control review** on the present Windows 11 Home host. The
separately authorized setup spike is recorded in
`NATIVE_ISOLATION_CONTROL_EVIDENCE_V1.md`. Installation and synthetic proof do
not adopt the runtime for real candidates and do not authorize execution.

The repository preflight can inventory the host and name missing controls. It
can never prove those controls merely because `wsl`, Docker or Podman exists.
After installation, a separate control-evidence review must still demonstrate
the complete boundary before any native candidate invocation is considered.

The stronger Windows-native parity option is a dedicated Hyper-V generation-2
VM on Windows Pro or Enterprise. It is not selected for the present host
because Microsoft does not expose the Hyper-V role on Windows Home and enabling
it is an administrative, rebooting host change. That option can be reconsidered
if native Windows CLI parity becomes a measured requirement worth the edition,
guest and operational cost.

## Current host evidence

The read-only preflight observed:

| Signal | Observation |
|---|---|
| OS | Microsoft Windows 11 Home, version/build 10.0.26200 / 26200, 64-bit |
| Hypervisor | Present, but the Hyper-V management role/service is unavailable |
| WSL command | Present, but `wsl --status` exits 50 because WSL is not installed |
| Container runtime | Docker absent; Podman absent |
| Windows Sandbox | Launcher absent |
| Candidate/provider activity | 0 native candidates; 0 provider calls |
| Host mutation | None; no elevation, feature enablement, install or restart |

The result is `NATIVE_ISOLATION_SETUP_REQUIRED`. `HypervisorPresent=true` is
hardware/host evidence only; it is not evidence that a usable Hyper-V boundary
exists.

## Required control contract

A later setup and review must prove all of these controls together:

1. Copy only the frozen candidate bundle into a disposable workspace; never
   mount the repository, `.git`, user profile or unrelated host paths.
2. Never expose a container runtime socket to candidate code.
3. Use a read-only root with bounded ephemeral `tmpfs` locations.
4. Run as a non-root user, drop all capabilities, forbid privilege escalation
   and retain the runtime's default seccomp policy or a stricter reviewed one.
5. Bound CPU, memory, process count, raw output and wall-clock duration.
6. Use no network for synthetic/control runs.
7. For a separately authorized provider run, allow egress only through an
   independently controlled proxy with exact destinations and denial evidence;
   the candidate never receives general network access.
8. Pass complete task input over stdin or a protected pipe, never process
   arguments; project only allowlisted environment values.
9. Destroy raw stdout/stderr and the disposable workspace before persisting
   privacy-checked metadata.
10. Prove the boundary with named compiling mutations and an independent
    review before changing the execution authority from DRAFT.

Installed software, a successful image start or a green repository preflight
is insufficient evidence for any of these controls.

## Options considered

### A. WSL2 plus hardened Linux container — installed setup candidate

This is the lowest-friction route available on Windows Home for Linux-native
candidate CLIs. WSL alone is not the boundary: Windows drives are mounted under
`/mnt` by default and Windows/Linux interoperability is intentionally broad.
The container must therefore receive only copied bundle bytes and no host
mounts. Docker networking is also enabled by default, so `network none` or a
separately reviewed proxy-only network must be explicit.

**Decision:** installed and synthetically proved; independent review and
proxy-only egress evidence remain absent; not adopted for real candidates.

### B. Dedicated Hyper-V VM — strongest Windows-native alternative

A dedicated VM can provide a separate kernel and an internal/private virtual
switch. It is the preferred alternative if Windows-native candidate parity is
required. Windows Home cannot host the supported Hyper-V role, and enabling the
role on a supported edition requires administrator authority and a restart.

**Decision:** deferred; requires an edition/admin/cost decision outside this
local task.

### C. Windows Sandbox

Windows Sandbox is disposable and uses hypervisor isolation, but Windows Home
is unsupported on this host. Its networking is enabled by default, clipboard
sharing is enabled by default, and mapped folders can expose host data. A
disabled-network synthetic run could be useful, but the product also needs a
precise proxy-only provider-egress story rather than a coarse on/off switch.

**Decision:** rejected as the selected provider-capable backend.

### D. Bare WSL2

WSL deliberately supports host filesystem and process interoperability. Those
features are useful for development but do not establish the hostile-code
boundary required by this ADR.

**Decision:** rejected without the hardened container layer.

### E. Node Permission Model or wrapper flags

The existing synthetic runner demonstrates valuable defense-in-depth controls.
Node documents its Permission Model as a seat belt rather than a malicious-code
security boundary. CLI flags and environment filtering similarly cannot create
kernel isolation.

**Decision:** retained only as defense in depth and synthetic evidence.

## Authoritative technical references

- Microsoft, Windows Sandbox overview and supported editions:
  <https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/>
- Microsoft, `.wsb` security settings and defaults:
  <https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file>
- Microsoft, Hyper-V installation/edition requirements:
  <https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/install-hyper-v>
- Microsoft, Hyper-V switch isolation:
  <https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/features-terminology>
- Microsoft, WSL filesystem/process interoperability:
  <https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop>
- Docker, container run controls and mount/security implications:
  <https://docs.docker.com/engine/containers/run/>
- Docker, no-network driver:
  <https://docs.docker.com/engine/network/drivers/none/>
- Docker, Engine security and rootless mode:
  <https://docs.docker.com/engine/security/>
- Node.js, Permission Model limitations:
  <https://nodejs.org/api/permissions.html>

## Consequences and next gate

- The separately authorized setup installed WSL2, Debian and rootless Podman;
  it requested elevation for WSL installation but required no Windows reboot.
- The setup spike finished with provider-free synthetic control evidence. It
  did not run Codex, Claude, a benchmark candidate or a provider.
- A second independent control review and a separate proxy-only egress design
  are still required.
- Native candidate execution remains blocked until the Candidate Execution
  Boundary references approved control evidence and its independent review.
