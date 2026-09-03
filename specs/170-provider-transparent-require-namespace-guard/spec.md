# R37AV — Provider transparent require namespace guard

## Objective

Prevent runtime-transparent wrappers around a `require("node:module")` namespace initializer from hiding `createRequire` dynamic module loads.

## Acceptance

- Parenthesized and TypeScript assertion wrappers around exact `node:module` or `module` require calls track the namespace.
- Direct `createRequire` access through the tracked namespace remains fail-closed.
- Wrapped require calls for unrelated modules are not classified as module namespaces.
- Existing CommonJS and import-equals namespace protections remain green.
- No inspected source executes and no provider or external transport is used.
