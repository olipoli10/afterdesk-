# R37M Provider Computed Import Guard

## Purpose

Fail closed when any module reachable from a public application entrypoint contains a computed dynamic `import()` or computed `require()` whose destination cannot be proven by the R37L module graph.

## Requirements

- Reuse the TypeScript AST and deterministic graph from R37L.
- Distinguish literal dynamic imports from computed dynamic imports.
- Report the public entrypoint, exact reachable module chain, unresolved module and call kind.
- Ignore unreachable internal computed imports so the boundary stays scoped to public runtime reachability.
- Preserve literal imports, static imports, exports and import-equals resolution.
- Run against the actual source tree and fail if any public-reachable unresolved module load exists.
- No provider, credential, network, customer data, dependency, lockfile, Prisma schema or migration is allowed.

## Acceptance

- RED proves a public route through a neutral facade with `import(target)` is not rejected by R37L.
- RED proves a public worker through a neutral facade with `require(target)` is not rejected by R37L.
- The new guard returns exact deterministic chains for both computed forms.
- The actual public source graph has zero unresolved dynamic module loads.
- R37K, R37L and full local gates remain green.
