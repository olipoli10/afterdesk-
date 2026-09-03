# R37S GREEN evidence

- Second-generation `require` aliases are propagated through declarations and assignments.
- Aliased `createRequire` factories and their returned loaders are propagated.
- Computed loads fail with `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal loads retain transitive provider reachability.
- Focused result: 4 tests passed.
- Provider boundary result: 552 modules, 0 violations.
- Typecheck and `git diff --check` passed.
