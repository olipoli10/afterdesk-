# R37L Provider Transitive Reachability Guard

## Purpose

Prevent a public route, server action, job or worker from reaching sealed R37 provider-execution internals indirectly through a neutral facade, barrel export or renamed symbol.

## Requirements

- Build a deterministic internal TypeScript module graph from the actual source tree.
- Recognize aliased and relative static imports, side-effect imports, dynamic imports and `require` calls.
- Resolve `.ts`, `.tsx`, and `index` module forms without executing source.
- Report the complete public-entrypoint-to-provider path when any execution module is reachable.
- Follow renamed exports and neutral intermediary module names by graph edge, not symbol spelling.
- Fail closed on malformed source inventory and remain deterministic across path separators.
- Preserve the R37K direct-source, transport, secret and dispatch guards.
- No provider, credential, network, customer data, dependency, lockfile, Prisma schema or migration is allowed.

## Acceptance

- RED proves a neutral two-hop facade reaches an R37F execution module without being detected by R37K.
- The new graph guard reports the exact route-to-facade-to-execution chain.
- Direct dynamic, relative and `require` paths remain detected.
- The actual source tree contains zero public-to-provider execution paths.
- Focused, full local, typecheck, lint and exact security gates pass.
