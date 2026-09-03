# R37U GREEN evidence

- Known CommonJS module namespace capability propagates through declarations and assignments.
- Aliased namespace `createRequire` calls produce tracked loaders.
- Computed loads fail with `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal loads retain transitive provider reachability.
- Focused R37T/R37U result: 6 tests passed.
- Provider boundary: 552 modules, 0 violations.
- Typecheck and `git diff --check` passed.
