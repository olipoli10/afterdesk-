# R37P implementation evidence

- Supported executable source extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`.
- Extensionless alias and relative imports resolve across all supported extensions and index modules.
- Explicit JavaScript specifiers can resolve their TypeScript implementation counterpart.
- JavaScript and JSX sources use their matching TypeScript compiler script kinds.
- Focused R37P mutations: 11 passed.
- R37L/R37O/R37P focused set: 17 passed before the final index mutation was added; final R37P suite passed 11/11.
- Actual source gate: 552 modules, zero violations.
- Full suite: 2,103 passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing R34 warning.
- Preview-local Webpack build: passed, 111 routes, mandatory provider boundary command ran first.
- Package-lock SHA-256: `F418E864DC3357F341FC688F2BD345CF6B7EB69F59BA6E413839367968ACF6B5`, unchanged.
- Provider, credential, customer data, external transport, external write, push, Preview deployment and Production: zero.
