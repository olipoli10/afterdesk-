# R37J plan

1. Freeze the exact R37I implementation and security finding as the base.
2. Add deterministic PostgreSQL tests for expiry after R37F storage and for post-storage ceiling rejection.
3. Prove RED against the committed R37I code.
4. Clear canonical evidence only in exact-state, exact-token failure transitions.
5. Run focused provider-control tests and the proportional full local gates.
6. Record the finding closure, commit locally and advance the autonomous queue.

Stop only if the fix requires provider access, external transport, a schema change, a dependency change or authority beyond local synthetic work.
