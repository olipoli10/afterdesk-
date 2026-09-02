# Research: Provider Sandbox Preflight R36B

Provider claims are documentation-derived and `INFERRED` for ENDVERA until R37 observes the exact endpoint, account and model combination.

## Perplexity Search is retrieval, not the global brain

- **Decision**: Evaluate Perplexity Search for ranked public Web evidence. ENDVERA's controller retains intent, policy, synthesis and action choice.
- **Evidence**: [Search API](https://docs.perplexity.ai/api-reference/search-post), [Search quickstart](https://docs.perplexity.ai/docs/search/quickstart), [People Search](https://docs.perplexity.ai/docs/search/filters/people-search), reviewed 2026-09-02.
- **Rejected**: One provider agent as universal brain. It would conflate retrieval, reasoning and authorization.

## ENDVERA owns exact model selection and fallback

- **Decision**: OpenRouter is an aggregation transport candidate. ENDVERA selects a closed model profile; provider-side model fallback stays disabled.
- **Evidence**: [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [Model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks), reviewed 2026-09-02.
- **Rejected**: `auto` routing or a user-facing selector. Neither proves the strongest model handled the job.

## Privacy is an exact request invariant

- **Decision**: A future OpenRouter request must require supported parameters, deny data collection and require ZDR. R37 re-evidences exact endpoint/model eligibility.
- **Evidence**: [Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr), [Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging), reviewed 2026-09-02.
- **Caveat**: OpenRouter treats in-memory prompt caching as non-retention; ENDVERA records that definition rather than silently equating it with no processing.

## Gateway and direct-provider routes stay separate

- **Decision**: Compare an OpenRouter candidate and a direct-controller control using equal inputs and ceilings.
- **Reason**: Gateway convenience, routing and model quality are distinct variables.

## No best-model claim before observation

- **Decision**: R36B returns only `NO_PROVIDER_SELECTION`. R37 freezes exact model IDs, prices and privacy evidence before an equal-input campaign.
- **Unknowns**: exact IDs, account eligibility, latency, failure behavior, source quality, cost and customer outcome impact.
