# R37AM — Provider Reflect namespace alias guard

## Objective

Prevent an identifier alias of the global `Reflect` object from hiding reflective invocation of a tracked dynamic module loader.

## Acceptance

- Direct and transparent identifier aliases of global `Reflect` are tracked.
- `.apply`, `["apply"]`, and destructured `apply` from a tracked Reflect alias retain capability.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- Unrelated object aliases are not classified as module loads.
- No inspected source executes and no provider or external transport is used.
