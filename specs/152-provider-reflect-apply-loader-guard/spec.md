# R37AD — Provider Reflect.apply loader guard

## Problem

Tracked CommonJS loaders remain invocable through `Reflect.apply(loader, thisArg, [moduleTarget])`. R37AC recognizes loader-owned `.call` and `.apply`, but this equivalent reflective form can still hide a computed provider-capable module load.

## Contract

- `Reflect.apply(loader, thisArg, [moduleTarget])` is classified as a module load when `loader` is `require` or a tracked require/createRequire alias.
- A computed target yields `R37O_UNRESOLVED_DYNAMIC_MODULE`; a literal target remains in the transitive graph.
- A nonliteral or unsupported argument container fails closed.
- Unrelated `Reflect.apply` calls do not become module loads.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves reflective loader calls evade committed R37AC.
- Targeted and real-source provider-boundary tests pass after a bounded AST correction.
- Full tests, lint, typecheck and Webpack build pass proportionally.
- Exact diff security review completes without unresolved findings.
