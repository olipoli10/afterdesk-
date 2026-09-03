# R37AC — Provider indirect loader call guard

## Problem

Tracked CommonJS loaders remain callable through `Function.prototype.call` and `apply`. The current boundary recognizes direct call targets only, so these equivalent invocation forms can hide computed provider-capable module loads.

## Contract

- `.call(thisArg, moduleTarget)` on a tracked loader is classified as a module load.
- `.apply(thisArg, [moduleTarget])` on a tracked loader is classified when the argument array is statically inspectable.
- Computed targets yield `R37O_UNRESOLVED_DYNAMIC_MODULE`; literal targets remain in the transitive graph.
- Unsupported or computed apply argument containers fail closed.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves indirect calls evade committed R37AB.
- Targeted and real source provider-boundary tests pass after a bounded AST correction.
- Full tests, lint, typecheck and Webpack build pass.
- Exact diff security review completes without unresolved findings.
