# Implementation Plan: R37 OpenRouter Provider Sandbox

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-04 | **Spec**: [spec.md](spec.md)

## Summary

Extend the existing provider-neutral R37A-R37BA foundation with one private CLI-only OpenRouter transport and one bounded campaign runner. The runner validates exact founder authority, synthetic cases, current model/privacy evidence, a 5 USD local/key cap safely below 10 CAD, credential presence without logging it, durable reserve-before-dispatch, strict response normalization, deterministic output verification, replay refusal, revocation and cleanup. It performs no public route, customer communication or deployment.

## Technical Context

**Language/Version**: repository TypeScript/Node runtime plus PowerShell orchestration

**Primary Dependencies**: built-in `fetch`, Zod, Prisma and existing R36B/R37A-R37BA modules; no new dependency

**Storage**: existing provider activation/spend ledger in a fresh disposable PostgreSQL database plus ignored run-scoped `.scratch` evidence and bounded committed closeout evidence

**Testing**: unit tests with injected transport/secret resolver, real PostgreSQL integration tests for reservation/replay/revocation, mutation tests, provider-boundary gate and one optional observed runner when the local key exists

**Target Platform**: local Windows/PowerShell; OpenRouter HTTPS only

**Project Type**: private provider sandbox harness, not an application feature or public endpoint

**Performance Goals**: 30-second maximum per request; at most six provider calls; at most 100,000 micro-USD reserved per call

**Constraints**: synthetic only; exact two-model/three-case matrix; no SMS/call/email/customer/provider other than OpenRouter; no dependency/schema/lockfile/public-route/push/deployment changes

**Scale/Scope**: one transport, one oracle, one campaign runner, one validator and one observed report

## Constitution Check

*GATE: PASS before Phase 0 and PASS after design.*

- **I — Owned outcome**: PASS. The campaign owns prepare, call, verify, reconcile, revoke and cleanup.
- **II — Closed world**: PASS. Exact host, path, models, cases, schema and capability allowlists; unknown values refuse.
- **III — Authorization/privacy/money**: PASS. Explicit founder authority, process-local secret, ZDR/data-denial, durable reserve/settle and lower USD cap.
- **IV — Durable/replay-safe**: PASS by design. Existing idempotent ledger is reused; an existing reservation is never redispatched.
- **V — Verification separate from call**: PASS. HTTP success, schema validity, oracle validity and recommendation are separate states.
- **VI — Evidence-led economics**: PASS. Cost/latency are observed; customer value and adoption remain unknown.
- **VII — Incremental/proportionate**: PASS. No schema/dependency/public product surface; security, money, concurrency and recovery get unit plus PostgreSQL tests.

## Project Structure

```text
specs/192-openrouter-provider-sandbox/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── goal.md
├── LONG_RUN_PROGRAM.json
├── analyze.md
├── checklists/requirements.md
├── contracts/openrouter-provider-sandbox.md
├── scripts/validate-r37-openrouter-sandbox.ps1
└── evidence/
    ├── red.md
    ├── mutations.md
    ├── credential-free-preflight.json
    ├── observed-provider-report.json
    └── closeout.md

src/lib/construction-operating-assistant-r37/
├── contracts.ts
├── cases.ts
├── oracle.ts
└── transport.ts

src/server/construction-operating-assistant-r37/
└── campaign.ts

scripts/run-r37-openrouter-sandbox.ts
test/construction-operating-assistant-r37-openrouter-sandbox.test.ts
test/integration/construction-operating-assistant-r37-openrouter-sandbox.itest.ts
```

**Structure Decision**: R37 is deliberately unreachable from `src/app`, `src/server/actions`, jobs and workers. Only the explicit local runner can import it. Existing provider-boundary analysis is amended to allow network/secret access in exactly the private R37 transport while continuing to reject any public or transitive reachability.

## Delivery Phases

### Phase 0 — Authority, evidence and RED

- Freeze official OpenRouter routing/privacy/usage/model evidence and Bank of Canada conversion evidence.
- Freeze two exact model bindings and three equal synthetic cases.
- Write RED for missing key, structural secret escape, wrong host/path/model, weaker privacy, fallback, over-budget, replay redispatch and fixture-as-observed fraud. The validator never reads the credential value to search for it.

### Phase 1 — Pure contracts, transport and oracle

- Add strict manifest, request, response, cost and report schemas.
- Build an injected transport whose production implementation resolves the key only at the final boundary and uses an abort timeout plus capped response body.
- Convert OpenRouter usage cost upward to micro-USD and validate returned exact model/text-only content.
- Build deterministic case oracles and recommendation rules.

### Phase 2 — Durable campaign and private runner

- Seed only a disposable synthetic ADMIN/owner/workspace.
- Enable the global lane, prepare/activate one exact grant per model, reserve each attempt, dispatch once, write run-local evidence before settlement, settle/release, then revoke and disable in `finally`.
- Refuse any existing reservation rather than risk a second charge after ambiguous process loss.
- Never accept the credential as an argument or persist it.

### Phase 3 — Local gates and observed execution

- Run credential-free unit, boundary, mutation and PostgreSQL tests.
- Produce a machine preflight that must say either `READY_FOR_LOCAL_CREDENTIAL` or fail.
- If `R37_OPENROUTER_CONTROLLER_API_KEY` is present, run the observed matrix once and seal the report; otherwise stop only after all possible work at `CREDENTIAL_REQUIRED`.

### Phase 4 — Closeout

- Validate report/ledger/cost/call reconciliation, structural secret-boundary tests, forbidden credential/header fields, revocation, lane disabled and disposable DB cleanup without reading the credential value.
- Run proportional lint/typecheck/targeted/full tests as required by changed security/money boundaries.
- Complete the long-run manifest, commit locally, checkpoint Brain factually and keep R38-R40 gated.

## Validation Gates

1. Spec/contract validator and mutation matrix.
2. R37 unit tests, provider-boundary gate and secret scan.
3. Fresh disposable PostgreSQL integration for budget, replay, concurrency, failure and revocation.
4. Observed OpenRouter report validation only when the local key is present.
5. Lint, typecheck, full serialized tests and `git diff --check` because a provider/money boundary changes.
6. No Next.js build unless executable Web source changes; no Web surface is planned.

## Rollback

Revoke both campaign grants, set the singleton provider lane to `DISABLED`, delete only the campaign-owned disposable database and ignored run scratch, remove the private R37 runner/transport if reverting code, and restore the prior provider-boundary policy. Historical ledger/report evidence is never rewritten.

## Complexity Tracking

The only new external boundary is justified by explicit R37 authority. No public route, schema, dependency or automatic consumer is introduced. Two models are tested because one strong/one efficient route is the smallest matrix that can inform the routing policy; the gateway remains OpenRouter-only.
