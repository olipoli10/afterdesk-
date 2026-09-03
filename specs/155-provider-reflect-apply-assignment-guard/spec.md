# R37AG — Provider Reflect.apply assignment guard

## Problem

R37AF tracks Reflect.apply aliases created by variable initialization, but an assignment such as `invoke = Reflect.apply` can still hide the same computed provider-capable module load.

## Contract

- Identifiers assigned from `Reflect.apply` or `Reflect["apply"]` are tracked as reflective invocation capabilities.
- Calling an assigned Reflect.apply alias classifies `require` and tracked require/createRequire loaders supplied as the first argument.
- Computed module targets in the third array argument yield `R37O_UNRESOLVED_DYNAMIC_MODULE`; literal targets remain in the transitive graph.
- Unrelated assignments remain outside this bounded release.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves direct and element-access Reflect.apply assignments evade committed R37AF.
- Targeted and provider-boundary tests pass after a bounded AST correction.
- Exact security review completes proportionally.
