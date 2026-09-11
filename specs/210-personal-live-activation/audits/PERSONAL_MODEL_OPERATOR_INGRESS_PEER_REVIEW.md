# B1/B2 operator ingress — bounded local peer review

2026-09-11. Verdict: APPROVE for the local slices, no concrete defect reproduced.
Read both complete modules, their author tests, and the ingress plan including B1
and B2 implementation notes. Engineering code-review skill used. No source edits.

Exact reviewed SHA-256:

- operator-ingress-contract.ts:
  `ab517f88c3748d8460343811b1945eda74c3ef1a98418e79ec9f689e131a0f1e`;
- operator-ingress.ts:
  `736b681619ccf577fecf476c5dbc19ab820fe36b23af8e9021dc4e0834c0e6b5`;
- test/personal-model-operator-ingress-review.test.ts:
  `49e712228054180ce1abf744dfcfa741f66453cf1ada6a3caec7be7b909b95ef`.

Fresh peer command `node node_modules/vitest/vitest.mjs run
test/personal-model-operator-ingress-review.test.ts`: **5/5 PASS at 22:57:06**, exit0.
Scoped ESLint exit0. No reviewer RED or production correction in this review.

Tests use real B1/artifact producers and explicit simulated transactions/Stage A
effects: expiry during TX1/TX2 commit acknowledgement, first DB-query latency
consuming TTL before claim, expired original receipt versus separately registered
historical read, and actor/key mutation after claim without adoption or secret
archive. No SQL, connection, provider, real session or deployment was exercised.

SQL owner/grant joins and lock order were read, not executed by this reviewer.
Claim PK/fingerprint and full readback prevent adopting an existing claim as the
private successful-inserter continuation. A provisional callback result is not a
known commit; publication identity is registered only after transaction resolution.
Historical false flags describe setup, not current runtime activation or renewed
review eligibility. Full archive remains required; audit storage is not DB-immutable.

The URL guard checks fixed host/database/role and sslmode=require; it permits but
does not require sslaccept=strict. This review did not establish the installed
engine's default certificate behavior and makes no TLS verification claim. Actual
source/target/transport evidence remains the controller's separate receipt, not
an assertion supplied to these functions. No current session authentication is
proved by the typed actor argument; the future route must supply verified session
identity and preserve its independent Origin/deadline/disclosure gates.

Controller separately reported 19 native cases passing and server stopped, plus
build/OFF HTTP checks. Those are controller evidence, not fresh peer executions.
No root suite, typecheck, native test, credential access, external request,
deployment or activation was performed by this reviewer.
