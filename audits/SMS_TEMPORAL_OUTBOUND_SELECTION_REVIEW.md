# Temporal outbound candidate selection — independent review

2026-09-10. Read plan, complete selector, temporal authoritative loader and15
author cases. No production edit, DB or provider run by this reviewer.

**GREEN for the bounded scheduling filter**, not sending authority. Fresh
10:35:51:35/35 PASS (reviewer4, temporal15, legacy16), plus scoped reviewer lint.
The independent cases exercise switch/deadline changes after transaction callback
completion, copied immutable result primitives and distinct confirmation gating.

Global absence of a question attachment gates ordinary fallback; absence cannot
be manufactured by filtering on a foreign owner. The temporal eligibility branch
stays within the ordinary reply branch, while confirmation retains its distinct
key. Exact question/source/wire/review and actor/epoch/grant predicates precede
ORDER BY/LIMIT. JSON scalar comparisons avoid unsafe timestamp/integer casts.
Selection reads no credential content and performs no domain mutation.

No critical source defect reproduced in the reviewed scope. Native selection
with an invalid oldest question ahead of a valid ordinary message remains required;
these SQL-string/mocked tests do not prove PostgreSQL evaluation or fairness.

Explicit limit: this is not the complete current model-authority fingerprint.
Changing credentialRef or externalAccountKeyHash without changing account version
can still leave a candidate hint which the locked send gate refuses. The author
has separately raised this with the controller. No unreviewed fingerprint
extension is covered by this verdict. Historical fields, final locked admission,
budget and provider checks remain authoritative.

## Native fixture and recorded result review

Read the nine controller-added selector cases: eligible, STORE/BRIDGE OFF,
expired, terminal, revoked Google/model grant, identity revision and owner
revision. The question is asserted genuinely older than the ordinary reply;
LIMIT1 returns that question only in the positive case and the ordinary reply
in all eight invalid cases. Full registry/budget/operation snapshots stay equal.
The fixture's distinct synthetic account IDs isolate each case's candidate pool;
this is not a global production-account fairness benchmark.

Independently read the controller's recorded result/output at
specs/210-personal-live-activation/evidence/postgres-native-1789051188863:
45/45 tests, exit0, completed2026-09-10T14:40:24.943Z and explicit
PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED. This is native PostgreSQL with fake
provider/model fixtures, not live SMS. Reviewer did not execute the server.
