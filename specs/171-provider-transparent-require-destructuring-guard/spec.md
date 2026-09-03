# R37AW — Provider transparent require destructuring guard

## Objective

Prevent runtime-transparent wrappers around `require("node:module")` in object binding declarations from hiding extracted `createRequire` factories.

## Acceptance

- Parenthesized and TypeScript assertion wrappers around exact node:module require calls retain destructured createRequire capability.
- Direct and computed createRequire binding names remain fail-closed when invoked as dynamic loaders.
- Wrapped require calls for unrelated modules are not classified.
- Existing namespace and import-equals protections remain green.
- No inspected source executes and no provider or external transport is used.
