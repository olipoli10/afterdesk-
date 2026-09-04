# Contract: R37 OpenRouter Provider Sandbox

## Exact authority

- Gateway: OpenRouter only.
- Input: three versioned synthetic construction-assistant cases only.
- Models: `openai/gpt-5.4`, `openai/gpt-5.4-mini`.
- Calls: at most six total, exactly one per model/case identity.
- Founder cost ceiling: 10 CAD.
- Application and dedicated-key ceiling: 5 USD; each attempt reserves 0.10 USD maximum.
- Effects: no customer/prospect data, SMS, call, email, tool, connector, write, deployment, push, Preview or Production.

## Request

```json
{
  "model": "<exact allowlisted model>",
  "messages": [
    {"role":"system","content":"<versioned controller contract>"},
    {"role":"user","content":"<ordered synthetic facts and task>"}
  ],
  "max_tokens": 512,
  "stream": false,
  "response_format": {"type":"json_schema","json_schema":{"name":"endvera_controller_result_v1","strict":true,"schema":"<closed schema>"}},
  "provider": {
    "allow_fallbacks": false,
    "require_parameters": true,
    "data_collection": "deny",
    "zdr": true
  }
}
```

No `models`, `plugins`, `tools`, `web_search`, `user`, real contact or unbounded project state field is allowed.

## Response

One success response must have one choice, exact returned model, text content, finish reason `stop`, numeric token counts and finite non-negative `usage.cost`. The content must parse as:

```json
{
  "answer": "bounded string",
  "citedFactIds": ["F-001"],
  "proposedCapability": "ANSWER_FROM_STATE | PREPARE_COMMUNICATION | CLARIFY | REFUSE",
  "limitations": ["bounded string"]
}
```

Unknown fields, tool calls, a second choice, missing usage/cost, model drift, unsupported capability or uncited factual claims fail.

## Replay and recovery

- Reserve before dispatch using a stable model/case idempotency key.
- If reservation reports replay, do not call OpenRouter.
- Write ignored run evidence before settlement.
- Settle upward-rounded provider cost once; release on definite pre-dispatch failure.
- A crash after reservation is ambiguous and requires manual adjudication; it never retries automatically.

## Secret boundary

Only the final private transport resolves `R37_OPENROUTER_CONTROLLER_API_KEY`. The key is not accepted by CLI, returned to callers, printed, serialized, fingerprinted or persisted. Reports contain `credentialPresent: true|false`, never the value. Validators may test only presence and forbidden structural fields; they never read the value for comparison or scanning.

## Verdicts

- `OPENROUTER_SANDBOX_OBSERVED_PASS`: six real OpenRouter responses, all contract/oracle gates pass, ledger reconciles, total below both ceilings, grants revoked and lane disabled.
- `REWORK`: at least one attempted provider observation fails or the matrix is incomplete after dispatch began.
- `CREDENTIAL_REQUIRED`: all credential-free preparation passes but no local key exists; not a final provider verdict.
