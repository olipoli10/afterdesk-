# R37AT — Provider module namespace destructuring declaration guard

## Objective

Prevent direct or computed `createRequire` destructuring declarations from a tracked `node:module` namespace from hiding a dynamic module load.

## Acceptance

- `const { createRequire: makeRequire } = moduleApi` tracks the factory.
- `const { ["createRequire"]: makeRequire } = moduleApi` tracks the factory.
- Other namespace properties are not classified as `createRequire`.
- Existing direct-require declaration and assignment protections remain green.
- No inspected source executes and no provider or external transport is used.
