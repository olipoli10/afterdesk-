# Contract: One corrected OpenRouter retest

## Input authority

- exactly one campaign;
- two fixed model IDs and three fixed synthetic cases;
- corrected strict-ZDR request version;
- one ephemeral local credential;
- no retry;
- at most 5 USD application exposure and less than 10 CAD proven exposure.

## Request invariants

- `max_completion_tokens: 512`;
- strict JSON schema response;
- `allow_fallbacks: false`;
- `require_parameters: true`;
- `data_collection: deny`;
- `zdr: true`;
- no `max_tokens`, `temperature`, tools or alternate models.

## Verdict

`OPENROUTER_SANDBOX_OBSERVED_PASS` requires all six canonical observations, all six oracle passes, zero failures, revoked grants and disabled lane. Every other observed campaign result is `REWORK`.

## Forbidden effects

Client/prospect data, SMS, calls, email, calendar/payment writes, deployment, Preview, Production, credential persistence, report overwrite and a second retest are forbidden.
