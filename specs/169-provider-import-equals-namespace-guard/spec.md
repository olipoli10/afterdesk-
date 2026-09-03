# R37AU — Provider import-equals namespace guard

## Objective

Prevent a TypeScript `import moduleApi = require("node:module")` namespace from hiding `createRequire` dynamic module loads.

## Acceptance

- An exact `node:module` or `module` import-equals binding tracks the namespace.
- Direct and static computed `createRequire` access through that namespace remains fail-closed.
- Import-equals bindings for other modules are not classified as module namespaces.
- Existing ES import and CommonJS namespace protections remain green.
- No inspected source executes and no provider or external transport is used.
