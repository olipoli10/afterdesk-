# R37AE — Provider Reflect element-access loader guard

## Problem

R37AD recognizes `Reflect.apply(loader, ...)`, but the runtime-equivalent string-literal element access `Reflect["apply"](loader, ...)` can still hide a computed provider-capable module load.

## Contract

- `Reflect["apply"](loader, thisArg, [moduleTarget])` is classified when `loader` is `require` or a tracked require/createRequire alias.
- Computed targets yield `R37O_UNRESOLVED_DYNAMIC_MODULE`; literal targets remain in the transitive graph.
- Unsupported argument containers fail closed.
- Computed Reflect member names and unrelated reflective calls remain outside this bounded release.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves string-literal Reflect element access evades committed R37AD.
- Targeted and provider-boundary tests pass after a bounded AST correction.
- Full release gates and exact security review complete proportionally.
