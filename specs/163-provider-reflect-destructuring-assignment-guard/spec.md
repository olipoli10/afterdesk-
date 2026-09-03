# R37AO — Provider Reflect destructuring assignment guard

## Objective

Prevent an `apply` property assigned through an object destructuring assignment from global `Reflect` or a tracked namespace alias from hiding a tracked dynamic module load.

## Acceptance

- `({ apply: invoke } = Reflect)` and shorthand `({ apply } = reflector)` aliases are tracked.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- Destructuring assignment from an unrelated object is not classified as a module load.
- No inspected source executes and no provider or external transport is used.
