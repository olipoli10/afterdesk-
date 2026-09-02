# Contract: Unified Intent Routing

R18 results may include an optional `routing` projection using the R36C client-safe schema. Existing consumers remain valid. New refusal reasons distinguish provider-required, human-support, routing-clarification and policy-refused outcomes.

All projections keep `providerExecutionAuthorized=false` and `externalDispatchPerformed=false`.
