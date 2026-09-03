# R37AX — Provider transparent require destructuring assignment guard

## Objective

Prevent runtime-transparent wrappers around `require("node:module")` in object destructuring assignments from hiding assigned `createRequire` factories.

## Acceptance

- Parenthesized and TypeScript assertion wrappers around exact node:module require calls retain assigned createRequire capability.
- Direct and computed createRequire property names remain fail-closed when invoked as dynamic loaders.
- Wrapped require calls for unrelated modules are not classified.
- Existing declaration destructuring protections remain green.
- No inspected source executes and no provider or external transport is used.
