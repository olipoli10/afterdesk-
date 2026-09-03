# R37AI — Provider Reflect.apply assignment propagation guard

## Objective

Prevent assignment propagation of a recognized `Reflect.apply` capability from hiding a tracked dynamic module load.

## Acceptance

- An identifier assigned from a tracked `Reflect.apply` alias remains tracked.
- Direct and element-access originating aliases are covered.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- An unrelated identifier assignment is not classified as a module load.
- No inspected source executes and no provider or external transport is used.
