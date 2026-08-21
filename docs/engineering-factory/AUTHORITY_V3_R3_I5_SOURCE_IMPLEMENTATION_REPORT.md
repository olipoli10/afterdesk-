# Authority V3 R3 — I5 source-only implementation report

Date: 2026-08-21  
Lane: `C:\dev\nightlexicon-engineering-factory`  
Branch: `codex/engineering-factory-devbench`  
Starting commit: `eb6d913b92721102b3e924ecebf626b2cc727b0c`

## Verdict

I5 is complete as a source-only release candidate. The six granted components are implemented and joined by one fail-closed integration boundary. This is not authority for I6, I7, I8, native execution, a real candidate, or a provider call.

The literal ceiling remains:

- `sourceOnly: true`;
- `executionAuthorized: false`;
- `providerCallsAuthorized: false`;
- `realCandidateAuthorized: false`;
- zero provider calls;
- zero real candidate invocations.

## Implemented source grants

1. Windows Outer-Deny source: exact six-layer WFP/Hyper-V readback contract, persistent boot block, stopped WSL precondition, and zero allow rules.
2. WSL Controller source: five nftables base chains with priority `-300` and drop policy, network namespace without an uplink, and only the declared synthetic relay/DNS/provider tuples.
3. Observer source: producer and acceptor role separation, capture before link-up, exact interface-by-direction capture set, and complete packet statistics.
4. Signer source: observer, signer, and resolver separation; signing remains a later runtime act and requires complete, lossless packet evidence.
5. Evidence Broker source: NTFS volume/root handle and file identity binding, path confinement, link/reparse/stream checks, exact owner/DACL/SACL, create-only durable state, and read-only resolver handle.
6. Cleanup Verifier source: recomputation from raw inventories, exact deletion acknowledgments, and independent classification of Windows drift, process/cgroup residue, temporary-artifact leaks, and other residue.

The integration envelope additionally requires one subject binding across all components: run ID, generation, nonce, machine ID, Windows boot ID, and WSL boot ID. Role bindings must remain distinct by role, identity ID, OS identity, binary/config hash, key ID, and SPKI hash.

## RED-before-GREEN

Each component test was written and executed before its implementation module existed. Each first run failed on the missing module. After implementation, the seven I5 test files pass 53/53.

The adjacent I1-I5 validation passes:

- 10 files;
- 93/93 tests;
- TypeScript: pass;
- ESLint: zero errors, two pre-existing warnings in `src/lib/engineering-factory/bakeoff.ts`;
- `git diff --check`: pass.

## Named source mutations

Every mutation compiled, failed on the named guard, and was restored to its pre-mutation SHA-256 before the next mutation.

| Mutation | Guard that failed |
|---|---|
| `i5-source-windows-outer-deny-bypass` | `refuses missing IPv6 transport deny` |
| `i5-source-wsl-firewall-policy-bypass` | `refuses an accept-policy base chain` |
| `i5-source-observer-capture-set-bypass` | `refuses one missing direction` |
| `i5-source-signer-packet-loss-bypass` | `refuses one kernel drop` |
| `i5-source-broker-create-only-bypass` | `refuses state skipping and any replacement of an existing final name` |
| `i5-source-cleanup-false-equivalence` | `refuses false equivalence and a missing deletion acknowledgment` |
| `i5-source-stale-evidence-replay` | `refuses stale evidence from another subject binding` |
| `i5-source-execution-authority-bypass` | `refuses execution authorization in an I5 envelope` |
| `i5-source-role-collapse` | `rejects producer and acceptor identity collapse` |
| `i5-source-ceiling-execution-true` | Windows source plan/readback ceiling assertions |
| `i5-source-provider-call-reachable` | `refuses a provider call in an I5 envelope` |
| `i5-source-real-candidate-reachable` | `refuses a real candidate invocation in an I5 envelope` |

Post-restoration hashes used as the pristine anchors:

- common: `AA98221DE187C1112C25CF080A421F6F90C114E2AA26C87FDD6B4E0C66C98E37`;
- Windows: `78B4B4F6E7FD246DF4ECB961F205973877E67CA63C2F6529932FA9B1C3285AB1`;
- WSL: `3E4A708146232EF0C9E89062597CA710F7C04AFF503651B08EAFA7709EFA77D4`;
- observer: `DE284AEE61599F9520514A65864D7A3BD360A856BD88EF9B5D05B82109EAD548`;
- signer: `729585093EAB989FED5F0D5D0879F12200204DB291FC3DF9C6157523722832A5`;
- evidence broker: `F898DAA2E68677146E9CABBEEC686CFB60BE50387D8014957B49139C6067A38B`;
- cleanup verifier: `326CDE68E23222A290403B9C94CE809E8718875B288D861CA79C909E884AA2E2`;
- integration: `8C5AC9917DD8466D256961B98C6D7DFDE660B151D77A42425606F4EBFB45CC0A`.

## Final validation

- Full test suite: 83 files passed, 1 skipped; 1,386 tests passed, 1 skipped.
- TypeScript: pass.
- ESLint: zero errors, two historical warnings unchanged.
- Lockfile SHA-256: `0B01B24159591440E08F8F78FAF3C6E17EF5CE293304B773651F69EC7F60A7CD`, identical to preflight.
- No candidate invocation, provider call, secret, migration, database operation, native control, Preview, Production, or rollout.

## Build decision

`npm run build` was not executed. In this repository it is defined as `prisma migrate deploy && next build`. The I5 mandate did not authorize a database, migration, or disposable PostgreSQL target. Running it would therefore cross the explicit safety boundary. This is a recorded limitation, not a build pass.

## Residual boundary

I5 proves only that the source contracts and their integration reject the modeled control violations. It does not prove that Windows WFP, Hyper-V, WSL, nftables, packet capture, signing, NTFS handles, cleanup, or rollback work on the host. Those are separate, explicitly gated later increments. `executionAuthorized` remains false.
