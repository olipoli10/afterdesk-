# R37T GREEN evidence

- CommonJS `node:module` and `module` namespace declarations are recognized.
- Namespace assignments are recognized.
- `namespace.createRequire(...)` produces a tracked loader.
- Computed loads fail with `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal loads retain transitive provider reachability.
- Focused R37S/R37T result: 7 tests passed.
- Provider boundary: 552 modules, 0 violations.
- Typecheck and `git diff --check` passed.
