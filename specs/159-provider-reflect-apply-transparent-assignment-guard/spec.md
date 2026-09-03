# R37AK — Provider Reflect.apply transparent assignment guard

## Objective

Prevent transparent syntax wrappers around a recognized `Reflect.apply` alias on the right side of an assignment from hiding a tracked dynamic module load.

## Acceptance

- Parenthesized and TypeScript transparent wrappers around assigned tracked `Reflect.apply` aliases remain tracked.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- An unrelated wrapped assignment is not classified as a module load.
- No inspected source executes and no provider or external transport is used.
