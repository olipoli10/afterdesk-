# R37 Corrected OpenRouter Retest Closeout

- Campaign: `r37-corrected-openrouter-9d0ef2a8-00ac-4e17-bbdf-ae42efd54d8a`
- Evidence label: `OBSERVED_PROVIDER_SYNTHETIC_INPUT`
- Verdict: `REWORK`
- Expected calls: 6
- Dispatched calls: 1
- Canonical observations: 1
- Replayed dispatches: 0
- Settled spend: 2485 micro-USD (0.002485 USD)
- Model/case reached: `openai/gpt-5.4` / `INVOICE_READINESS`
- Oracle result: failed
- Failure codes: `R37_CAPABILITY_NOT_ALLOWED_FOR_CASE`, `R37_REQUIRED_LIMITATION_MISSING`
- Retry: none; the one-campaign authority is consumed
- Original R37 report SHA-256: `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3` (unchanged)
- Credential value inspected or persisted: no
- Grants revoked: yes
- Provider lane disabled: yes
- Disposable PostgreSQL server: removed and absent from `prisma dev ls`
- External communication, external tool write, deployment, Preview or Production: none

## Adjudication

The corrected request reached OpenRouter and produced a parseable grounded response with no invented fact. The accepted oracle nevertheless refused the observation because the model selected `ANSWER_FROM_STATE` for a case whose capability contract did not allow it and omitted a required limitation. The campaign stopped on that first failed oracle exactly as required. This result remains `REWORK`; no correction or second retest can convert it to PASS inside this campaign.

## Next decision

Choose later whether to authorize a new bounded local correction and separately sealed provider retest, or to defer provider work. R38 founder observation is not admitted by this closeout.
