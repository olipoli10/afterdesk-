# R37AS — Provider module namespace destructuring assignment guard

## Objective

Prevent direct or computed `createRequire` destructuring assignments from a tracked `node:module` namespace from hiding a dynamic module load.

## Acceptance

- `({ createRequire: makeRequire } = moduleApi)` tracks the assigned factory.
- `({ ["createRequire"]: makeRequire } = moduleApi)` tracks the assigned factory.
- Other assigned namespace properties are not classified as `createRequire`.
- Existing direct-require assignment and provider-boundary protections remain green.
- No inspected source executes and no provider or external transport is used.
