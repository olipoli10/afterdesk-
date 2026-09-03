# R37AF — Provider Reflect.apply alias guard

## Problem

R37AE recognizes direct `Reflect.apply(loader, ...)` calls, but an extracted alias such as `const invoke = Reflect.apply` can still hide the same computed provider-capable module load.

## Contract

- Identifiers initialized from `Reflect.apply` or `Reflect["apply"]` are tracked as reflective invocation capabilities.
- Calling a tracked Reflect.apply alias classifies `require` and tracked require/createRequire loaders supplied as the first argument.
- Computed module targets in the third array argument yield `R37O_UNRESOLVED_DYNAMIC_MODULE`; literal targets remain in the transitive graph.
- Unrelated aliases remain outside this bounded release.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves direct and element-access Reflect.apply aliases evade committed R37AE.
- Targeted and provider-boundary tests pass after a bounded AST correction.
- Exact security review completes proportionally.
