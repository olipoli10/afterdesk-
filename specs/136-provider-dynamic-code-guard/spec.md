# R37N Provider Dynamic Code Guard

## Purpose

Prevent public-reachable runtime code from hiding provider execution or bypassing the static module boundary through dynamic code generation.

## Requirements

- Reuse the R37L TypeScript AST and public module graph.
- Detect direct `eval`, `Function`, `new Function`, and Node VM execution calls.
- Report the public entrypoint, exact reachable chain, execution module and execution kind.
- Ignore unreachable private implementation modules.
- Preserve R37K-R37M route, transport, secret, graph and computed-load guards.
- Run against the actual source tree with zero public-reachable dynamic code execution.
- No provider, credential, network, customer data, dependency, lockfile, Prisma schema or migration is allowed.

## Acceptance

- RED proves reachable `eval`, `new Function` and VM execution are not reported before the guard exists.
- The guard returns exact deterministic paths and execution kinds.
- The actual public source graph contains zero dynamic code execution.
- Focused, full local, typecheck, lint and exact security gates pass.
