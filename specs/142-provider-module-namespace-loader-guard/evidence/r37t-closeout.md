# R37T closeout

## Result

CommonJS `node:module` and `module` namespace declarations and assignments now produce tracked `createRequire` loaders. Computed targets fail closed and literal targets remain visible to transitive provider analysis.

## Validation

- Focused R37S/R37T: 7/7 passed.
- Full suite: 161 files passed, 2 skipped; 2,116 tests passed, 2 skipped.
- Typecheck: passed.
- Lint: 0 errors; one pre-existing R34 warning.
- Provider boundary: 552 modules, 0 violations.
- Next.js Webpack build: 111/111 routes with synthetic local-only build values.
- Exact security diff scan `9b4aff93-8725-426d-91d3-af2c20caa539`: complete coverage, zero findings.
- Product commit: `71ba8a49ecf94d58b660b826574eca3d43f70fc9`.
- Product tree: `615175c292294393ce62fa0b65263c380f3d41cb`.

No provider, credential, customer data, external transport, external write, push, Preview, Production, deployment or store action was used.
