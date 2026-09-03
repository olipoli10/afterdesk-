# R37AQ — Provider computed createRequire destructuring guard

## Objective

Prevent a string-literal computed `createRequire` property in a `node:module` destructuring declaration from hiding a tracked dynamic module load.

## Acceptance

- `{ ["createRequire"]: makeRequire } = require("node:module")` tracks the extracted factory.
- A loader created from that factory remains fail-closed for a nonliteral target.
- Other computed property names are not classified as `createRequire`.
- Existing direct, aliased, assigned, Reflect and provider-boundary protections remain green.
- No inspected source executes and no provider or external transport is used.
