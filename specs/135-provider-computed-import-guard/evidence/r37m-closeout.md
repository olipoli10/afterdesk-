# R37M closeout

## Result

Every computed `import(expression)` or `require(expression)` reachable from a public route, server action, job or worker now fails closed with the exact public entrypoint, reachable module chain, unresolved module and call kind. Literal module loads retain normal R37L resolution, unreachable private implementation details do not create noise, and the actual public source graph contains zero unresolved dynamic loads.

## Validation

- Focused R37K-R37M plus URL safety: 61/61 passed.
- Full unit suite: 2,082 passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing R34 unused-variable warning.
- Exact security scan: `30aaddfc-e4df-40f7-8962-8109b3c3b43a`, complete with zero findings.
- No Prisma schema, migration, dependency, lockfile, provider, credential, network, external write, push, Preview, Production or deployment change.

## Git

- Implementation: `6477a12b7bd3750d91a394208fb7c8aeaea88b32`.
- Implementation tree: `af0f7b00b5b509ccab792935b2f0f3bb21d2e901`.
