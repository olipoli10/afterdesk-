# R37S closeout

## Result

Second-generation `require` loaders and `createRequire` factories now propagate through variable declarations and assignments. Computed targets fail closed and literal targets remain visible to the transitive provider graph.

## Validation

- Focused R37S: 4/4 passed.
- Full suite: 160 files passed, 2 skipped; 2,113 tests passed, 2 skipped.
- Typecheck: passed.
- Lint: 0 errors; one pre-existing R34 warning.
- Provider boundary: 552 modules, 0 violations.
- Next.js Webpack build: 111/111 routes with synthetic local-only build values.
- Exact security diff scan `d1d5e914-b6bc-4c04-85a4-80bc9aaaf4a3`: complete coverage, zero findings.
- Product commit: `2d900a7bf399373e5579c1caf9d5365889796a39`.
- Product tree: `4077cf81dcad969db286e54ab941f3df6598b646`.

No provider, credential, customer data, external transport, external write, push, Preview, Production, deployment or store action was used.
