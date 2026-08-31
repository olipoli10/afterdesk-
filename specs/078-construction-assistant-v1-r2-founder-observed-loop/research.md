# Research decisions

## Decision: one local observation form, not chat confirmations

**Rationale**: Olivier must provide real judgment, but repeated `GO` prompts are process waste. A local form records the entire observation in one session and lets the Controller continue automatically after submission.

**Alternatives considered**: repeated chat questions; rejected because they fragment the test and inflate founder wait.

## Decision: equal-input stateless control

**Rationale**: the test must isolate persistent operational management rather than compare ENDVERA with an artificially weak summary. The control receives identical ordered inputs but has no retained canonical state, audit, idempotency or exact approval mechanism.

**Alternatives considered**: live ChatGPT call; rejected because no provider authority exists and it would introduce model/version variability.

## Decision: reuse immutable V1 attestation unless source changes

**Rationale**: ADR-048 requires proportional validation. Repeating 1,163 tests and a full build adds no evidence when product source and dependency hashes remain exact.

**Alternatives considered**: unconditional second full build; rejected as duplicate evidence.

## Decision: test-only synthetic account and database

**Rationale**: this proves the actual authenticated portal while keeping credentials, customer data and shared databases out of scope.

**Alternatives considered**: bypassing authentication in product code; rejected because it would test a different product boundary.
