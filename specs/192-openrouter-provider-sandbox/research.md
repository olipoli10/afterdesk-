# Research: R37 OpenRouter Provider Sandbox

All provider facts below are documentation evidence reviewed 2026-09-04. They are `INFERRED` until the exact request/account/model combination is observed by this campaign.

## OpenRouter is the sole gateway

- **Decision**: Call only `https://openrouter.ai/api/v1/chat/completions` through the private R37 runner.
- **Evidence**: OpenRouter documents an OpenAI-compatible chat-completions API and Bearer API-key authentication.
- **Rejected**: direct OpenAI/Anthropic calls, Perplexity, `auto`, model arrays and provider-side model fallback. They are outside authority or blur which model produced the result.

## ENDVERA owns routing and privacy parameters

- **Decision**: One exact model per request, `allow_fallbacks=false`, `require_parameters=true`, `data_collection="deny"`, `zdr=true`.
- **Evidence**: [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) and [Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr), reviewed 2026-09-04.
- **Caveat**: OpenRouter says in-memory prompt caching can still be treated as ZDR. This sandbox contains synthetic data only and does not generalize to customer privacy approval.

## Prompt retention and metadata are separate

- **Decision**: Require ZDR and data-collection denial while recording that OpenRouter retains request metadata such as token counts/latency.
- **Evidence**: [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection) says prompt/response retention is opt-in, while request metadata is retained; upstream providers have their own policies.
- **Consequence**: R37 proves only synthetic-data handling. It cannot authorize customer content.

## Two exact controller candidates

- **Decision**: Equal-input comparison of `openai/gpt-5.4` and `openai/gpt-5.4-mini`.
- **Evidence**: Official model pages reviewed 2026-09-04 list GPT-5.4 at USD 2.50/M input and 15/M output, and GPT-5.4 Mini at USD 0.75/M input and 4.50/M output. Both advertise structured output support.
- **Reason**: one stronger and one lower-cost controller candidate can establish whether the cheaper route meets the same deterministic contract. This is not a global benchmark.

## Usage and cost

- **Decision**: Require the non-streaming response `usage` object and `usage.cost`; round cost upward to integer micro-USD.
- **Evidence**: [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting) says usage and cost are included automatically in responses.
- **Rejected**: estimating actual cost only from tokens. Pricing drift and upstream details make provider-reported cost the settlement basis.

## Spend ceiling conversion

- **Decision**: Founder ceiling remains 10 CAD; the local runner and dedicated API key use a lower 5 USD ceiling. Each of the six attempts reserves at most 100,000 micro-USD.
- **Evidence**: Bank of Canada daily rate for 2026-09-03 is 1 USD = 1.3789 CAD. Therefore 5 USD = 6.8945 CAD, leaving 3.1055 CAD of margin.
- **Fail-closed rule**: observed execution refuses if this evidence is older than seven days or if the sealed rate makes 5 USD greater than or equal to 10 CAD.

## Provider-side guardrails

- **Decision**: Olivier should create a dedicated OpenRouter key with a 5 USD limit. The application independently enforces the same or stricter limit.
- **Evidence**: OpenRouter documents per-key budgets and layered guardrails; the lower applicable limit wins.
- **Unknown**: availability of every guardrail feature on Olivier's exact account. Application enforcement does not depend on it.

## Credential custody

- **Decision**: `R37_OPENROUTER_CONTROLLER_API_KEY` exists only in the local runner process. It is never a CLI option and `.env*` is already ignored.
- **Rejected**: key pasted in chat, source, committed `.env`, PowerShell history argument, report, command output, hash input or browser automation.

## Honest verdict

- `OPENROUTER_SANDBOX_OBSERVED_PASS` means the exact six synthetic calls passed their technical gates under budget.
- `REWORK` means at least one real attempted case/model failed or evidence was incomplete.
- `CREDENTIAL_REQUIRED` is a prepared state, not a verdict and not a request for another GO.
- Provider adoption, customer value, real-test readiness and Verified-E2E remain separate.
