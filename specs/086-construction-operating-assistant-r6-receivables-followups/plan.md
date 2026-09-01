# Plan

1. Add forward-only receivable/event/follow-up persistence.
2. Add strict closed-world contracts and transactional services.
3. Reuse `ConstructionAction` for approval-gated prepared communication.
4. Add owner/office/field role projections.
5. Prove balance math, replay, concurrency, restart and zero transport on
   disposable PostgreSQL.
6. Run Construction R0-R6, HumanWorkUnit, lint, typecheck and migration gates.

No dependency, package-lock, provider or external transport change.
