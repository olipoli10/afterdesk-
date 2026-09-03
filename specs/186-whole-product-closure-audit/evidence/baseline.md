# Baseline

The first closure pass exposed two stale derived artifacts after R36T:

- `validate-endvera-market-readiness.mjs` refused the old release-definition hash.
- `validate-endvera-release-package.mjs` refused the old manifest input hash.

The existing whole-product readiness validator still passed, but its provider module count represented the earlier 558-module snapshot. The current provider-boundary command observes 559 modules and zero violations.
