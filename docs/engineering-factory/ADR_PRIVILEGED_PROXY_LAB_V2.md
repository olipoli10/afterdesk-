# ADR: Privileged provider-free Proxy Lab v2

Implementation: `0f262fb682d36446ab80cd1010ea1cbb0d64a6d8`

Date: 2026-08-20

Status: accepted for the next synthetic milestone only

Starting code baseline: `0abe99f8e0d905533439f0f5f952f5273c5b8a22`

## Decision

The provider-free lab now has a separately controlled WSL root boundary. A
Windows TypeScript runner starts a UID 0 supervisor in the dedicated Debian
WSL2 distro. The supervisor enters only the exact rootless Podman network
namespaces for the synthetic relay and hostile fixture, applies unique nftables
tables, starts root-owned `AF_PACKET` metadata observers outside the containers
and their cgroups, and refuses final evidence unless rollback returns the host
boundary to its exact pre-run fingerprint.

This closes `NO_GO_ROOT_OWNED_FIREWALL_PROOF_MISSING` for a deterministic,
provider-free synthetic run. The decision is
`GO_NEXT_SYNTHETIC_MILESTONE_ONLY`. It is not real-candidate authority:
`executionAuthorized:false`, real candidate invocations 0 and provider calls 0
are structural fields in both Authority V2 layers.

## Boundary actually exercised

```text
deterministic hostile fixture (rootless Podman, uid 65532, cap-drop ALL)
  -> exact 10.241.0.2:8443 relay route only
  -> relay exact 10.242.0.53:5353 fake DNS route
  -> relay exact signed 10.242.0.10:9443-9446 fake-provider route
```

Before the candidate leaves its start barrier, WSL root applies an `inet` table
with input and output base chains whose policy is drop. Candidate output has one
allow: source `10.241.0.10` to `10.241.0.2` TCP port 8443 with exact conntrack
state. The reply rule is equally exact. No other destination, protocol, IPv6
path, loopback, metadata address, host gateway, DNS port, ICMP or arbitrary
port has an allow.

The relay receives a separate drop-policy table. Its only new input is the
exact candidate route. Its only new outputs are the exact fake DNS destination
and the exact fake-provider IP and scenario-specific signed port. Return rules
bind source address, source port and established state. No broad accept or
wildcard interface rule is installed.

The untrusted fixture cannot edit the tables: its effective capability mask is
zero. The root controller is not part of the container process tree. All tables
are named `ef_priv_<run>_<role>` and removed by exact name; the controller never
flushes or replaces a host ruleset.

## Independent observer

The fingerprinted Python standard-library observer is started by the root
supervisor. It joins only the target network namespace and remains a UID 0 host
process outside the rootless cgroup. `AF_PACKET` frames are reduced to sequence,
pre/post-kill time class, direction, interface/namespace class, protocol,
source/destination class, ports, frame byte count and fixed disposition.

It never serializes packet bytes, application data, HTTP fields, query strings,
credentials, prompts, outputs or client data. Raw metadata exists only under the
root-owned disposable run root and is removed after hashing and aggregation.

## Kill switch and rollback

The kill switch preserves the output chain's drop policy, flushes only the
exact candidate output chain, installs an explicit counted drop, and only then
creates the post-block time marker. The final run observed the candidate still
alive, five post-block attempts counted as drops and zero candidate packets
arriving at the relay after the marker. Only then did the controller issue an
exact Podman cgroup kill.

The controller snapshots stateless nftables, iptables v4/v6, interfaces,
routes, named namespaces, relevant rootful/rootless `ef-*` Podman inventory,
observer processes and WSL state. Exit, error, timeout, `SIGINT` and `SIGTERM`
all enter the same exact-resource rollback. A proof is quarantined if any
component differs after cleanup.

## Authority V2 binding

The relay consumes its short-lived, content-addressed Authority V2 route bundle
before execution. The post-run privileged Authority V2 approval adds a second,
synthetic-only layer binding the route Authority hash and historical admission
time; firewall/controller hashes; observer configuration/binary/runtime/packet
hashes; equal before/after state; cleanup and kill-switch hashes; and run ID,
nonce, expiry, anti-replay and HMAC.

The completed payload is also signed with an ephemeral RSA private key retained
only by the root controller. The public key and detached signature are
content-addressed. The private key is deleted before evidence leaves root, then
the disposable root is removed.

Route expiry is not weakened for post-run approval. The verifier checks the
signed historical instant at which route Authority was admitted, then checks
the fresh post-run approval's current lifetime and replay ledger.

## Limits

This proves deterministic synthetic fixtures and local fake services only. It
does not prove Codex, Claude, any model/native third-party candidate, Windows
Firewall, a real provider/account/credential boundary, Production, Preview,
multi-tenant isolation or a durable approval service. A future real-candidate
gate requires a separate mandate and cannot infer authorization from this ADR.
