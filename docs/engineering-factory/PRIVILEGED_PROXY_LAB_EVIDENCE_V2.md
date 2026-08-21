# Privileged provider-free Proxy Lab v2 - local evidence

Date: 2026-08-20 (America/Toronto)

Starting SHA: `0abe99f8e0d905533439f0f5f952f5273c5b8a22`

Implementation commit: `0f262fb682d36446ab80cd1010ea1cbb0d64a6d8`

Final retained run: `78cbf79a-7d0d-4500-ba1b-6bd70be56f5a`

Verdict: `GO_NEXT_SYNTHETIC_MILESTONE_ONLY`

## Non-negotiable result

- `executionAuthorized:false`
- `realCandidateInvocations:0`
- `providerCalls:0`
- no real model, provider SDK/endpoint/account/credential, prompt, output,
  client data, deployment, migration, push or package installation was used;
- this proof does not authorize any real candidate.

## Retained content-free evidence

The raw local bundle is retained under
`.scratch/engineering-factory/privileged-proxy-lab-v2-final4/` and ignored by
Git. This report records its durable content hashes.

| Evidence | SHA-256 |
|---|---|
| Evidence wrapper file | `BAE94471FDD4C24F150BAECA6948A40F83184C62C8DED41784438CB7DE4990E4` |
| Wrapper internal integrity | `e5dd43f0b44b429434d71f00e0bef107c0449acb5be85c633b42b3ca1ed710d1` |
| Privileged Authority V2 | `8BC8EE79F098C829CD5CFBFDA7819C14B786D76760FBEAA00528B418A7D3C477` |
| Pre-run route Authority V2 | `A9E06373AEF98A3593ABCBA96451BB98799A5D11413586C1B9229ED114ED027C` |
| Aggregate root-firewall rulesets | `4f15f57a0b66d56ac1168c5b39541fac4f80972b8d3356bb3f8dbe9a84f906ea` |
| Root controller identity | `ac427640dd3acda80c3854b3b550fc4b3c11d69b44e0dcea7bb4a5c54461d153` |
| Observer configuration | `8fee4d206d48a4fd22ada018ddcc461d46883b0cd8c42822839b2be1db3ffaa4` |
| Packet metadata evidence | `80dfa14fb9968c5d7aa4efb1e44468d59e01b9d0c462c06b94cf13d6d3d7aa38` |
| Before/after composite state | `7b9f89fddfa0b3e6eb550ce7a1a06e0f37e57cb3490c50e626fc2d00088893ca` |
| Cleanup attestation | `2709ff72640e25c5983d9a3ddda04ef496bd5af4be80831fd62b476137646816` |
| Kill-switch proof | `c0bd9b10e71ff2b70a898ce2f57d1b7e37be5ab35cf9601140d0a51c40018b49` |
| Mutation source before/after | `e17322b3e238ea870382e42c4983fdd3ca606528f321d0de7e8caf1710dc39b6` |

The canary/secret/header scan returned no match across the retained bundle.

## Observed packet/control result

- 35 independently fingerprinted role/scenario rulesets;
- 1,072 metadata-only frame observations;
- 170 candidate-to-exact-relay arrivals;
- 69 relay-to-exact-fake-provider egress observations;
- 0 successful candidate packets to any other destination;
- 16/16 adversarial relay scenarios refused with their exact existing reason;
- the rootless hostile fixture reported every candidate boundary true;
- kill switch: candidate alive after block, drop delta 5, successful relay
  arrivals after block 0;
- both Authority V2 layers verified;
- cleanup composite before and after hashes equal.

Frame counts are not connection counts or statistical evidence. They corroborate
the exact deterministic paths exercised.

## Before/after component fingerprints

| Component | SHA-256 before = after |
|---|---|
| stateless nftables | `25031f48ac983f28f142a187c6f985da16092b633cde83f3e0eae47884534f7f` |
| iptables IPv4 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| iptables IPv6 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| interfaces | `8a906c28be220e153213814d5f23f41a5b9dde4847035db3fe90eb96cf58d7b1` |
| IPv4 routes | `cebd3741c69057e651c8b86740b774d06f50efbb3d7517d8a46c40fb0fb1480f` |
| IPv6 routes | `ab19c058173e77d2d0de01e4d4facab53225b54299fff8cb7ff8d93c2c471ced` |
| named namespaces / relevant Podman inventories, including secrets | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| observer-process inventory | `3890c1bb54c2e0e2919f2327f0b406d44ac1d04346f745d630dcd1ffd45e3a94` |
| WSL state | `76cef72aebcff02a11ef70f9ae61fe086a41e1a96d9ae30a46cc4dcd1f15ffc5` |

Final live inventory found no `ef-*` container, network, volume, secret, image,
privileged table, observer process or `/var/tmp/ef-privileged-*` root.

## RED to GREEN

The focused suite began RED because the privileged Authority module, controller,
observer and runner did not exist. Real privileged rehearsals then refused:

1. rootless inventory from an inaccessible inherited `/root` cwd;
2. invalid nft verdict/comment ordering;
3. the root barrier variable absent from the hostile-fixture allowlist;
4. a process-level `SIGTERM` that did not converge Podman state;
5. a post-kill marker created before the nft block completed;
6. post-run verification of an already expired pre-run route Authority.

Every failure rolled back to the observed baseline. The accepted controls are
an exact rootless cwd, compiling nft syntax, one allowlisted barrier variable,
cgroup `KILL` after the block proof, a post-apply marker, and a signed historical
route-verification instant plus fresh post-run expiry.

## Named mutations

The root controller exercised all 18 mutations in-memory against the pristine
observed control record. Each produced exactly its own named gate; source before
and after remained `e17322b3...dc39b6`.

1. `root-firewall-table-missing`
2. `root-firewall-default-accept`
3. `root-firewall-direct-provider-bypass`
4. `root-firewall-dns-bypass`
5. `root-firewall-ipv6-bypass`
6. `root-firewall-metadata-bypass`
7. `root-firewall-host-gateway-bypass`
8. `root-firewall-candidate-can-edit`
9. `observer-inside-rootless-runtime`
10. `observer-packet-evidence-omitted`
11. `observer-content-capture-enabled`
12. `observer-evidence-hash-mismatch`
13. `authority-firewall-hash-unbound`
14. `authority-observer-hash-unbound`
15. `authority-before-after-drift-ignored`
16. `kill-switch-terminates-before-block`
17. `rollback-rule-leak-accepted`
18. `cleanup-observer-process-leak`

Authority unit tests separately mutated content-addressed evidence, controller
keys, expiry, replay and synthetic-only fields and observed fail closed.

## Validation at evidence capture

- privileged hostile matrix: PASS in 107.4 seconds;
- focused privileged/source/Authority gates: 3 files / 19 tests PASS;
- closing targeted Authority/source/rootless matrix: 5 files PASS, 1 opt-in
  privileged integration file skipped, 26 tests PASS, 1 skipped;
- full safe suite on the committed implementation: 73 files PASS, 1 opt-in
  privileged integration file skipped, 1,293 tests PASS, 1 skipped;
- TypeScript PASS; ESLint quiet PASS;
- `git diff --check` PASS; final live `ef-*` inventory empty;
- package lock remained
  `0B01B24159591440E08F8F78FAF3C6E17EF5CE293304B773651F69EC7F60A7CD`.

The repository `build` script begins with `prisma migrate deploy`; it was not
run because this mandate forbids migrations. Direct `next build` was also not
used because the existing production build requires four R2 production
variables. No fake production secret was introduced to manufacture a green
build.
