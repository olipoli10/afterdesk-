# R37AH — Provider Reflect.apply alias propagation guard

## Objective

Prevent a propagated alias of a recognized `Reflect.apply` capability from hiding a tracked dynamic module load.

## Acceptance

- A variable declaration initialized from a tracked `Reflect.apply` alias remains tracked.
- Both direct and element-access originating aliases are covered.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- An unrelated identifier alias is not classified as a module load.
- No inspected source executes and no provider or external transport is used.
