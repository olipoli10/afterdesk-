# Native isolation control evidence v1

**Status:** SETUP COMPLETE / SYNTHETIC CONTROLS PROVED / NATIVE CANDIDATES BLOCKED

**Date:** 2026-08-20

## Scope and authority

The founder separately authorized a provider-free setup spike on the current
Windows 11 Home host. The spike installed WSL2, Debian and a rootless Podman
runtime, then ran one deterministic synthetic control script. It did not run
Codex, Claude, a model provider, a benchmark candidate or client data.

The successful synthetic proof does **not** approve native candidate execution.
The Candidate Execution Boundary remains DRAFT, `executionAuthorized` remains
false and provider egress remains unimplemented.

## Installed host state

| Layer | Observed state |
|---|---|
| Windows | Windows 11 Home 10.0.26200 |
| WSL | 2.7.12.0, default version 2 |
| Linux | Debian GNU/Linux 13 (trixie), kernel 6.18.33.2-microsoft-standard-WSL2 |
| Linux user | `efrunner`, UID/GID 1000, password locked |
| Container runtime | Podman 5.4.2, rootless, cgroups v2, `crun` 1.21 |
| OCI security | seccomp enabled with `/usr/share/containers/seccomp.json` |
| Rootless storage | `/home/efrunner/.local/share/containers/storage` |
| Runtime socket | user socket disabled, masked and absent |
| Synthetic image | `docker.io/library/alpine@sha256:f27cad9117495d32d067133afff942cb2dc745dfe9163e949f6bfe8a6a245339` |

`/etc/wsl.conf` makes `efrunner` the default user, enables systemd, disables
Windows drive automounting, disables Windows executable interoperability and
prevents the Windows PATH from being appended. After `wsl --shutdown`, the
live checks observed no `/mnt/c` mount, no `cmd.exe` and no Windows path entry.

## Synthetic boundary that was proved

The local supervisor copies only
`tools/engineering-factory/native-runner/synthetic-control.sh` over stdin into
a random directory beneath
`/home/efrunner/.local/share/endvera-native-isolation/`. It never mounts the
Windows repository, `.git`, the Windows profile or a container socket.

The container invocation is fixed and uses:

- a digest-pinned image and `--pull=never`;
- `--network=none` and `--http-proxy=false`;
- a read-only root filesystem;
- one bounded 16 MiB `tmpfs` with `noexec,nosuid,nodev`;
- UID/GID 65532, `--cap-drop=ALL` and `no-new-privileges`;
- the runtime default seccomp profile;
- 256 MiB memory, 0.5 CPU and 64 PID limits;
- a read-only, `nodev,nosuid,noexec` bundle mount;
- a fresh, exact environment allowlist;
- complete input over stdin only;
- a 10 second supervisor timeout and 64 KiB combined raw-stream limit;
- `--log-driver=none` and no exposed runtime socket.

The observed control result was:

```text
status: NATIVE_SYNTHETIC_CONTROL_PROVED
rootless: true
container uid: 65532
effective capabilities: 0000000000000000
NoNewPrivs: 1
seccomp: 2
network interfaces: lo
memory.max: 268435456
pids.max: 64
cpu.max: 50000 100000
raw stream bytes: 442
ephemeral workspace removed: true
real candidate invocations: 0
provider calls: 0
execution authority: DRAFT
execution authorized: false
```

The evidence artifact is create-only, contains only privacy-reviewed control
metadata and has a SHA-256 integrity envelope. Raw stdout/stderr references are
discarded before evidence construction. The copied bundle and its random WSL
workspace are removed before the durable metadata is returned.

## Fail-closed proof

The first targeted test was RED because the native control contract did not
exist. The first three real synthetic attempts also refused safely:

1. the non-root UID could not traverse an over-restricted copied directory;
2. a non-portable BusyBox interface probe returned no network evidence;
3. Podman stdin was not opened, so the input digest did not match.

Each issue was corrected without weakening the boundary. Later evidence was
accepted only after every mandatory observation was present.

The unit guard rejects bridged networking, root UID, any effective capability,
missing `NoNewPrivs`, missing seccomp, a runtime socket, writable root, missing
resource limits, argument input, retained raw streams, retained workspaces,
real candidate invocations and provider calls.

Six compiling named mutations were caught by those exact guards and restored
byte-exactly (`native-isolation-control.ts` SHA-256
`4cba93e6127d09097cbcc6efd83548b86f4d0f2eabf181b2f4a5f387c51e4800`):

| Mutation | Refusal proved |
|---|---|
| `native-network-none-bypass` | bridged networking cannot replace `network=none` |
| `native-runtime-socket-exposure` | a Podman/Docker socket mount is rejected |
| `native-root-privilege-admission` | container UID 0 is rejected |
| `native-resource-limits-bypass` | the 256 MiB memory bound cannot be removed |
| `native-raw-output-persistence` | retained raw streams cannot yield evidence |
| `native-input-argument-exposure` | argument transport cannot replace stdin |

## What remains deliberately unproved

- No exact-destination proxy or provider-egress policy exists.
- No provider data-boundary review has been attached.
- No native Codex or Claude wrapper has been run inside the container.
- No benchmark, cost, quality, speed or model-selection result exists.
- WSL2 shares the Windows host kernel boundary through virtualization; this is
  not equivalent to the deferred dedicated Hyper-V VM option.
- AppArmor is unavailable in the observed WSL runtime. The proof relies on
  rootless user namespaces, seccomp, no capabilities, no-new-privileges,
  read-only filesystems, no network and resource bounds together.

The next gate is an independent review of this evidence and, separately, a
proxy-only egress design. Neither may silently change the DRAFT execution
authority. This spike stops before any native candidate execution.
