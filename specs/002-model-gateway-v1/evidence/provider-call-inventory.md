# Existing Provider-Bound Call Inventory

This is the pre-gateway inventory. It records current behaviour; it is not a migration or vendor-selection decision.

| Call surface | Provider/model path | Retry authority | Usage/spend authority | Privacy boundary | Caller-visible failure semantics |
|---|---|---|---|---|---|
| Classification (`ai-work-engine/classify.ts`) | Anthropic Messages, exact `claude-sonnet-5`, structured JSON | SDK `maxRetries: 0`; durable `AiOperation` claim owns a later attempt | Account hold before call; `AiUsage` appended even for unusable billed responses | Brief, attachment manifest and category facts; no file bytes | Returns `StageResult`; refusal/max tokens/missing text/bad JSON/Zod failure become a failed classification stage and manual pricing path |
| Plan generation (`ai-work-engine/plan.ts`) | Anthropic Messages, model selected from existing settings | SDK `maxRetries: 0`; durable operation owns retry | Same account hold + usage path | Classification, bounded task facts, attachment manifest | Failed stage stops pipeline without changing existing caller contract |
| Critique (`ai-work-engine/critique.ts`) | Anthropic Messages, pinned critique model | SDK `maxRetries: 0`; durable operation owns retry | Same account hold + usage path | Plan/classification facts | Optional stage; failure preserves prior successful facts |
| Execution research/extract/fetch primitives | Anthropic Messages and approved tool surfaces | Explicit workflow attempt policy; SDK retries disabled at model boundary | Workflow budget hold plus account-level hold; invocation evidence | Primitive-specific minimized inputs; file/content access governed by runtime | Normalized provider error controls pause/retry/manual fallback |
| Worker assistant (`assistant-ai.ts`) | Anthropic Messages, structured JSON | SDK `maxRetries: 0` | Caller reserves and settles account spend | Scrubbed worker conversation under fixed safety prompt | Never throws for provider failure; safe operator-escalation response |
| Closed-job analysis (`closed-job-analysis.ts`) | Anthropic Messages, admin-only analysis | Client configured without hidden retry | Account-spend boundary in admin action | Aggregated closed-job statistics, not client raw work | Returns a zero-usage/fallback analysis rather than blocking admin UI |
| General AI helper (`ai.ts`) | Anthropic Messages and optional web search | SDK retry disabled | Call-site reservation/usage contracts | Call-specific prompt; existing safe-content constraints | Existing helper result/failure contract remains unchanged |
| Embeddings | Voyage exact embedding client | No hidden orchestration fallback | Separate provider ceiling and measured usage | Bounded text embedding input | Disabled/fail-closed when rate or provider capability is not configured |

## Classification caller contract frozen for the first migration

- The deterministic operation identity remains `engine:{taskId}:{runKey}:classification`.
- One claimed durable attempt takes one account reservation before the provider POST.
- The prompt, `claude-sonnet-5` pin, 4,000 output-token ceiling, structured-output schema, usage extraction and `StageResult` mapping are frozen by `test/fixtures/model-gateway/classification-baseline.ts`.
- This T001–T020 block creates no provider adapter that can perform a real external call and enables no rollout.
