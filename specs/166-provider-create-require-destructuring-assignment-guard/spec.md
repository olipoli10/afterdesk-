# R37AR — Provider createRequire destructuring assignment guard

## Objective

Prevent a direct or computed `createRequire` property in a `node:module` destructuring assignment from hiding a tracked dynamic module load.

## Acceptance

- `({ createRequire: makeRequire } = require("node:module"))` tracks the assigned factory.
- `({ ["createRequire"]: makeRequire } = require("node:module"))` tracks the assigned factory.
- A loader created from either factory remains fail-closed for a nonliteral target.
- Other assigned module properties are not classified as `createRequire`.
- Existing declaration, alias, Reflect and provider-boundary protections remain green.
- No inspected source executes and no provider or external transport is used.
