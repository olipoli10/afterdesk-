# Trial transport semantics — bounded peer review

2026-09-10, `C:/dev/endvera-astra-r03`. Reviewer owns only this audit and `test/personal-pilot-trial-transport-review.test.ts`.

## Verdict

**GREEN for the reviewed local delta and the 11 synthetic peer tests, after the receipt-order defect below was corrected.** No database, credential, real child process, network or Prisma execution occurred in this review. This does not retroactively turn the original real preflight refusal into success. The connector diagnostic remains a separate observation, not the missing stdout of that execution.

Read fully: accepted `PILOT_TRIAL_TRANSPORT_SEMANTICS_PLAN.md`, runner/bridge diffs and changed author tests. Existing runner and bridge implementations were already reviewed in full in the preceding audits. The engineering code-review skill was used for this bounded review.

Final reviewed hashes:

- Runner: `785d642111fb21b8b17f43e0ff029b9afcacf6e923ce8249ee4950074b85d0b7`.
- Bridge: `99e45ea5495de55de831313f437047b0fb4dca8a757395763ca134a7c8762498`.
- Peer test: `a507525e448aebf0b8b3b24d54a3f7e79356b0e8edff925dc424b9b0e57345c0`.

## Actual peer RED → GREEN

**19:43:13 — 10 PASS / 1 FAIL.** The real `runPilotTrialPrisma` implementation, using a mocked successful child, produced a valid receipt whose exact serialization was rejected by the real `validatePilotTrialBridgeReceipt`. Runner inserted `clientTransportPolicy` before `target/history`; bridge reconstructed it after `history` and correctly applied its canonical JSON equality check. This was an actual producer/consumer contract mismatch, not a native execution failure.

Main moved only the runner property's insertion position after `history`; author and peer re-read it. No bridge equality guard or peer oracle was weakened. **19:44:26 — 11/11 PASS** on the same tests. The positive case passes the exact serialized runner result to the bridge parser, without reordering or reconstructing the fixture receipt.

Author separately reported three TLS-semantic RED cases at 19:42:10 before correcting boolean observation handling. Main separately reported the bridge's one RED at 19:38:18 then 76 PASS. Those are not claimed as peer reproductions here.

## Tested and reviewed boundaries

- Pure history preserves `backendConnectionSslObserved:false`, keeps provenance/data-preservation false, and never emits a client policy. Extra caller `tlsVerified` is rejected.
- Only the controlled runner success path adds the fixed `PRISMA_REQUIRE_TLS_STRICT_CERT` policy after canonical URL, source/runtime/client checks, closed environment, successful child, complete history validation and staged-input verification. The policy is source-bound configuration, **not observed negotiated cipher/certificate details**.
- Weakened `sslmode=prefer`, `sslmode=disable` and `sslaccept=accept_invalid_certs` produce zero probe invocations and no success policy in failure receipts.
- A failed child returning plausible history cannot produce policy/success. One invocation only; raw sentinel output is absent from receipts.
- An external thrown object with getters on message/stack/code/diagnostic/toString cannot forge the diagnostic classification. Getters are never called; the actual error receives fixed `LOCAL_VALIDATION_REFUSED`. Both diagnostic WeakMaps are private; CLI looks up the actual error object rather than accepting a caller's diagnostic property.
- Real bridge parser rejects provider-provenance promotion, nested policy injection, failed child status and foreign target, even when the expected policy literal is present. A structurally valid supplied receipt is still only a parsed value; trust comes from the actual pinned child pipeline, not the public pure parser.
- Existing query, history hashes/order, owner/database/role/version/read-only checks, no-retry and migration-hard-refusal remain in place. Backend SSL must be an actual boolean; false is retained rather than changed to true or presented as client TLS proof.

## Checks and limitations

- Peer command: `node node_modules/vitest/vitest.mjs run test/personal-pilot-trial-transport-review.test.ts` — final 11/11 PASS.
- Peer ESLint exit 0.
- Main reports **194 combined PASS**, run started 19:44:11, including these 11 peer cases.
- Shared author TypeScript session 63250 included peer11 and reported one unrelated added-state test tuple diagnostic, no runner/bridge/peer diagnostic. That separate owner corrected it; main's fresh session 75480 remains pending at this publication. This audit does not label the global typecheck PASS prematurely.
- Filesystem stages are an in-memory simulation, child/source processes are mocked, and input uses an explicitly synthetic sentinel. These tests are not TLS/network, provider identity, OS isolation or data-preservation proof.

A fresh separately authorized controlled preflight is required for a new real result. No migration authority is added by this correction. No new TLS proxy/test platform was introduced or requested.
