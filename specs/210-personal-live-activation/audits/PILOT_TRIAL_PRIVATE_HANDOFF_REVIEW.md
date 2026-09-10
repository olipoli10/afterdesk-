# Trial private handoff — bounded peer review

2026-09-10, worktree `C:/dev/endvera-astra-r03`.

**Verdict: GREEN for the frozen implementation and synthetic transport tests.** No new concrete defect was reproduced in this peer review. This is not authorization to retrieve a credential, invoke the real bridge/Prisma, migrate, or connect to a provider. The separately authorized controller still owns the physical non-secret TTY rehearsal and any subsequent operation.

Read completely: `PILOT_TRIAL_PRIVATE_HANDOFF_PLAN.md`, `deployment/pilot-trial-private-bridge.mjs`, and all 61 author tests. The engineering code-review skill guided a bounded transport review. No production changes were made by this reviewer.

Reviewed source SHA-256: `7239b7d0dfbd39310968b4459c76885170e5a38e44b6db40673397117f8187b3`.

Peer test SHA-256: `3dab2ebd6c494dc47547dff69a9e13f3162e183c005eed8e13f5793e81460577`.

## Evidence

- Peer owns only `test/personal-pilot-trial-private-bridge-review.test.ts` and this audit.
- Peer **8/8 PASS at 19:19:40**; combined **69/69 PASS at 19:19:59** (61 author + 8 peer), using `node node_modules/vitest/vitest.mjs run test/personal-pilot-trial-private-bridge-review.test.ts test/personal-pilot-trial-private-bridge.test.ts`.
- Peer scoped ESLint exit 0.
- Fresh `tsc --noEmit --pretty false`, session 7824: exit 0, including the eight peer tests.
- Every child and source-check process is mocked in the peer tests. Node/CLI byte reads are synthetic fixtures. Ordinary local source files are read only to build the mocked source comparison. No process Prisma, real TTY, credentials, network, SQL or remote service was exercised.

The eight independent test oracles cover:

1. A fragmented frame with EOT arriving in a separate chunk; exact copied bytes, unchanged producer buffer, listener removal.
2. Ingress rejection at the exact 45-second monotone boundary even without timer delivery.
3. READY output failure causes fixed refusal and ingress cleanup, without echoing the underlying error.
4. Fragmented valid child receipt is insufficient until close; READY observes raw mode, VERIFIED observes restored mode; only one stdin frame/EOF and one child invocation.
5. A valid stdout receipt followed by stderr before close is refused, not partially accepted.
6. A valid receipt with close at the exact 65-second monotone boundary is refused even without timer delivery.
7. The 257th tiny output chunk exceeds the independent count bound; later valid output/close cannot replace refusal.
8. Two individually valid receipts do not become a valid aggregate output.

## Existing author RED history — not attributed to peer

Author reported **19:11:43: 59 PASS / 2 FAIL**: restoration throwing or leaving `isRaw` true previously allowed a success announcement. Author corrected restoration ordering and required `isRaw === false` before success, then reported **61/61 PASS at 19:12:09**. This peer read that exact fix and retained the author's two tests unchanged. The additional peer success-path oracle directly checks terminal state at the moment VERIFIED is emitted.

## Reviewed boundaries and limits

- Fixed five source pins; source/runtime bytes before READY and again after the frame; no target, executable or mode override. Child mode is exactly `PREFLIGHT_70`. The runner's migration hard refusal remains separate and unchanged.
- Raw mode must be confirmed before READY. Ingress is bounded by bytes, chunks and time; controls and suffix/second frames in the admitted chunk are rejected. Input is paused and listeners detached after a frame. The guarantee concerns the one admitted frame, not arbitrary future writes from an unrelated producer after termination.
- Frame goes only to the one spawned child's pipe with EOF, not command arguments. Child environment is allowlisted. Captured output is bounded, strict successful receipt pins are validated, raw stdout/stderr is never forwarded, and all bridge outcomes use fixed text.
- Child timeout kills only the returned child, with bounded cleanup; failure cannot authorize retries. A bounded unconfirmed cleanup does not prove the process was actually terminated on an operating system.
- Source inspection, raw ingress and child execution have their own finite budgets. This review does not promise an absolute global wall-clock ceiling for blocking filesystem/OS behavior.
- Verified raw terminal restoration precedes success. Abrupt OS termination and physical console behavior are not simulated guarantees.
- Raw TTY is echo suppression, **not an end-to-end local vault**. Tool-service retention, connector audit, host process visibility and secure JavaScript memory erasure are not certified. No current credential was fetched, inspected, logged or stored here.

Physical non-secret rehearsal is still required before any secret handoff. A successful real preflight would prove only its real TLS/history checks, not data preservation, a backup, a migration, external readiness or execution authority.
