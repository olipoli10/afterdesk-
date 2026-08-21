# ADR: Provider-free Proxy Lab v1

Status: accepted as a local synthetic control milestone; **NO-GO for any real candidate**.

Code baseline: `3bfbebb` (`feat(engineering-factory): add provider-free proxy lab`).

## Decision

The first proxy lab is an entirely local WSL2/rootless-Podman experiment. It
may execute only the committed deterministic hostile-candidate fixture against
the committed relay, fake DNS and fake TLS provider. Authority V2 structurally
requires `executionAuthorized:false`, zero real candidate invocations and zero
provider calls.

This milestone does not approve Codex, Claude, a provider SDK, a provider key,
or any network path outside the disposable synthetic topology.

## Control topology

The supervisor creates two run-scoped Podman networks with `--internal`,
`--disable-dns` and `no_default_route=1`:

- the candidate network contains only the hostile fixture and the relay's
  fixed candidate-side address;
- the provider network contains the relay's trusted-side address, fake DNS and
  fake TLS provider;
- only the relay is attached to both networks;
- the candidate starts without mounts, inherited proxy configuration, DNS,
  hosts injection, IPv6, capabilities, writeable root, ambient credentials or
  runtime pull access.

The relay accepts only the signed `routeId`. It rejects CONNECT, absolute or
ambiguous targets, query strings, userinfo, upgrades, redirects, wrong method,
wrong path and candidate-selected upstreams. It reconstructs the HTTPS request
from signed policy and verifies the locally generated CA, exact SNI, fake DNS
answer and signed upstream IPv4 address.

## Authority and credential boundary

Authority V2 uses canonical, content-addressed local attestations for policy,
manifest and runtime chain. The trusted boundary verifies all hashes, expiry,
run nonce, replay ledger, HMAC, kill switch, exact route and synthetic-only
scope. Missing, malformed, stale, replayed, unsigned, mismatched or
unresolvable evidence fails closed.

The fake canary credential is created in trusted supervisor memory and mounted
as a Podman secret only into the relay and fake provider. Candidate-supplied
authentication headers are parsed but never forwarded. The relay constructs a
new upstream request and injects the fake canary. Reflections and hostile error
bodies produce generic refusals; raw bodies and exception text are not audited.

## Audit and cleanup

The relay audit is append-only, sequenced, hash-chained and HMAC-signed. Its
fixed schema stores identifiers and hashes, the approved fake FQDN, decision,
reason, status class, byte counts, duration, remaining quota and classified IP
result hash. It excludes headers, bodies, query strings, cookies, credentials,
prompts, outputs and raw stdout/stderr.

On failure or completion, the supervisor kills and removes the full container
set, networks, volumes, secrets, images and disposable staging root. A
deliberate orphan fixture proves kill/wait/remove and verifies every captured
PID is gone. Evidence is create-only and is refused when cleanup cannot be
verified.

## Proved adversarial profiles

The real local integration gate exercises the candidate topology and the fake
services, rather than only a mocked policy predicate. It covers direct IP and
subprocess sockets, alternate DNS UDP/TCP 53, DoH, DoT, IPv6, raw sockets,
gateway/loopback/link-local/metadata targets, inherited proxies, package and
telemetry paths, Unix/WSL sockets, mount reads, symlink escape and orphaned
children. The trusted side covers DNS rebinding, multiple/private answers,
CNAME, TTL zero, AAAA, IPv4-mapped IPv6, NAT64 metadata tails, wrong SAN,
untrusted CA, expired TLS, redirect, slow/oversize response, credential
reflection and hostile error bodies.

## Explicit proof limit

Rootless Podman's actual internal/no-default-route network was exercised, but
the current already-installed environment cannot provide a root-owned firewall
or independent host-side packet observer that remains outside candidate and
rootless-runtime control. Constructing that evidence requires a separately
authorized privileged setup or externally controlled host/VM. No elevation,
installation or Windows feature change was attempted.

Therefore the local milestone verdict is:

`NO_GO_ROOT_OWNED_FIREWALL_PROOF_MISSING`

Passing this lab must never be interpreted as authorization to execute a real
candidate. A future milestone must first bind an independently observed,
root-owned deny-by-default egress policy to the signed run authority and repeat
the full hostile matrix.
