# Implementation Plan: R28 Organization Authority Policies

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android client with the existing durable outbox.
- R10/R11 provide exact inspection/decisions; R16 provides role capability;
  R17 provides stable retry; R23-R27 provide connector action boundaries.
- No dependency, provider SDK, credential, network path or external dispatcher.

## Architecture

1. Define a closed action registry with version, risk, reversibility,
   external-effect capability, required role and data-classification reach.
2. Define versioned policy sets and deterministic rule precedence with the
   strictest applicable outcome winning.
3. Add forward-only policy-set, rule, evaluation, decision and refusal
   persistence with workspace locks and immutable history.
4. Implement owner-only draft, activation, supersession and revocation using
   exact version and command identity.
5. Implement a server-only point-of-use evaluator that reloads membership,
   resource scope, active policy and action definition before deciding.
6. Reuse exact decision semantics for `APPROVAL_REQUIRED`; never allow a
   prohibited evaluation to enter the approval path.
7. Expose a protected API and shared role-safe mobile policy cockpit with
   restart-safe commands.
8. Prove default deny, precedence, ceilings, stale/refusal, replay,
   concurrency, restart, tenancy, role minimization and zero external effect.

## Constitution Check

- **Closed world**: PASS — only versioned registered actions are evaluable.
- **Authority**: PASS — point-of-use identity, role, tenant and policy reload.
- **Fail closed**: PASS — missing, unknown, conflicting and incomplete inputs prohibit.
- **Financial safety**: PASS — integer minor-unit ceilings; missing ceiling prohibits.
- **Immutable contracts**: PASS — active policy versions are never edited in place.
- **Exact decisions**: PASS — evaluation, policy, payload and version bind approval.
- **Role safety**: PASS — field projection omits rules, ceilings and sensitive context.
- **External effects**: PASS — R28 has no dispatch, provider, spend or external write.

## Validation

- R28 unit and disposable-PostgreSQL integration plus relevant R10/R11/R16/R17 regressions;
- Prisma format/validate/generate and fresh forward-only migration chain;
- full mobile tests, lint, typecheck, Expo Doctor and local iOS/Android/Web export;
- root lint/typecheck, Next.js Webpack build, Spec Kit analysis, diff/audit/lockfile review;
- zero provider endpoint, OAuth, credential, network, spend or external-effect proof.

## Delivery and continuation

Commit specification, implementation and closeout coherently. Mark R28 DONE and
promote R29 Provenance UX in the same transition. Do not push, deploy, preview,
publish or stop while authorized roadmap work remains.
