# Provider-free Proxy Lab v1 - local evidence

Verdict: **NO-GO for the next real-candidate milestone**.

Synthetic control result: `PROVIDER_FREE_PROXY_LAB_PROVED_WITH_PRIVILEGED_GAP`.

Code commit under proof: `3bfbebb`.

Starting repository commit: `341609dc42df7483e088deb93509328c882c129a`.

## RED to GREEN record

- Authority V2 began RED because the module did not exist. The focused suite
  became GREEN at 5/5 after content-addressed authority, HMAC, expiry, replay,
  kill-switch and synthetic-only checks were implemented.
- The real proxy-lab integration began RED because no runner existed. After
  topology, relay, fake DNS/provider, credential, audit and cleanup controls
  were implemented, the complete local matrix passed: 1 executed integration
  test, 1 filtered static test, 267.92 seconds for the integration test and
  268.18 seconds total.
- The pristine R1-R8 source gates and Authority V2 suite subsequently passed
  together: 13/13.

## Named mutation record

Every mutation compiled or loaded far enough to fail its named gate. The
production file was then restored with the inverse patch and its SHA-256 was
checked byte-for-byte before the pristine GREEN replay.

| Ring | Mutation executed | Named RED gate |
| --- | --- | --- |
| R0 | admitted `executionAuthorized:true` in the synthetic authority | real-candidate structural refusal |
| R1 | added a Windows drive bind mount to the candidate | host mounts and symlink escapes |
| R2 | replaced capability drop with `NET_RAW` | privilege and process containment |
| R3 | removed `--internal` from the run networks | proxy-only topology |
| R4 | re-enabled candidate IPv6 | DNS/IP/IPv6 containment |
| R5 | disabled exact TLS SNI binding | HTTPS/SNI/TLS and redirect semantics |
| R6 | replaced trusted canary injection with a candidate-controlled value | credential boundary |
| R7 | re-enabled inherited runtime proxy configuration for the candidate | proxy/bootstrap/pull isolation |
| R8 | replaced the audit HMAC with an unsigned digest | limits/audit/kill-switch evidence |

Byte-exact restoration fingerprints captured after R0-R8 and before a later
lint-only refactor in Authority V2:

- supervisor: `0741F793E90313A6004C6C5F4558656C6F97921AD5173D5E0F7E8AD23DEF8E8A`;
- relay: `37C76547574EB36B888C4D3327B388EA3A8D41F86AA35F17B14AD6F4D04B2E24`;
- Authority V2: `986D8D6565019C242B495AB22071301C35300795CD71A7D3B18654A3BB187B9E`.

The Authority V2 fingerprint changed only after restoration because an
ESLint-only unused-binding refactor was applied; its focused suite and
typecheck were replayed GREEN after that refactor.

## What the local run proved

- Real local rootless-container network namespaces had no default route and no
  candidate DNS. The candidate reached the fixed relay only; the relay alone
  reached the fake provider network.
- All 16 hostile DNS/TLS/HTTP/provider profiles failed closed with their named
  reason, while the one exact signed fake route succeeded.
- The fake canary remained in trusted secret mounts. Persisted evidence and
  audit events were scanned for canary and authentication-header leakage.
- The orphan process tree was killed, waited, removed and checked for surviving
  PIDs.
- Cleanup removed run-labelled containers, networks, volumes, secrets, images
  and staging root before create-only evidence could be accepted.
- The evidence envelope reports `executionAuthorized:false`,
  `realCandidateInvocations:0`, `providerCalls:0` and
  `rootOwnedFirewallProved:false`.

## What remains unproved

- No root-owned firewall or independent host-side packet capture/observer
  proved every packet was denied except the relay tuple.
- Rootless runtime ownership means the current topology cannot satisfy that
  stronger independent-control requirement by itself.
- No real candidate, provider, key, account, OAuth session, prompt, output,
  client data or attachment was used. Consequently this evidence says nothing
  about safe execution of Codex, Claude or another real tool.

## Required next prerequisite

Obtain separate authorization for a privileged or externally controlled lab
boundary. Bind its root-owned deny-by-default firewall rules and independent
packet evidence into Authority V2, repeat the full matrix from a pristine
commit, and retain NO-GO unless that evidence is content-addressed, signed and
independently reviewable.

No real candidate execution is authorized.
