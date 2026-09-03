# R37V — Provider module element-access loader guard

## Objective

Prevent a public-reachable module from hiding `createRequire` behind string-literal element access on a tracked `node:module` or `module` namespace.

## Required behavior

- `moduleApi["createRequire"](...)` has the same security meaning as `moduleApi.createRequire(...)`.
- Computed loader targets fail closed with `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal loader targets remain visible to transitive provider reachability.
- No provider, credential, network, external write, customer data or deployment is used.

## Acceptance

- A focused RED proves the current blind spot.
- The smallest analyzer change closes it without weakening existing gates.
- Targeted tests, provider-boundary validation, typecheck and exact security verification pass.

