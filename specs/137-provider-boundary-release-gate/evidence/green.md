# R37O implementation evidence

## Unified guard

- Actual source inventory: 552 TypeScript modules.
- Result: `R37O_PROVIDER_BOUNDARY_PASS`, zero violations.
- The release gate composes direct public exposure, provider-runtime network/secret/dispatch capability, transitive execution reachability, unresolved computed module loading and dynamic code execution.
- The versioned build pipeline executes `npm run validate:provider-boundary` before any Next.js build command while preserving the historical `package.json` build entrypoint.

## Proportional mutations

One deterministic fixture contains four independently classified violations. The validator returns, in stable family order:

1. `R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED`
2. `R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED`
3. `R37O_UNRESOLVED_DYNAMIC_MODULE`
4. `R37O_DYNAMIC_CODE_EXECUTION`

The safe fixture returns zero violations. No application source was mutated for this proof.

## Validation

- R37O plus historical build-pipeline tests: 14 passed.
- R37K-R37O focused guard set: 18 passed.
- Full local suite: 2,092 passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing unused-variable warning in R34.
- Preview-local Next.js Webpack build: passed, 111 routes; the provider boundary command executed first.
- `git diff --check`: passed.
- Package lock before/after SHA-256: `F418E864DC3357F341FC688F2BD345CF6B7EB69F59BA6E413839367968ACF6B5`.
- Provider calls, credentials, customer data, external transport and external writes: zero.

Two earlier local build attempts correctly failed after the R37O gate had passed: first because the synthetic auth build value was absent, then because local-disk storage is forbidden under a production-mode compilation. The successful proportional build used preview-local mode, disabled storage and a synthetic non-credential auth value.
