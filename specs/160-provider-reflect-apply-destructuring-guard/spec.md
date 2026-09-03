# R37AL — Provider Reflect.apply destructuring guard

## Objective

Prevent an `apply` property destructured from the global `Reflect` object from hiding a tracked dynamic module load.

## Acceptance

- `{ apply: invoke } = Reflect` and shorthand `{ apply } = Reflect` aliases are tracked.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- Destructuring `apply` from an unrelated object is not classified as a module load.
- No inspected source executes and no provider or external transport is used.
