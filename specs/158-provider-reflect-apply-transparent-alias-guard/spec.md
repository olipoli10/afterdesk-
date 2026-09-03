# R37AJ — Provider Reflect.apply transparent alias guard

## Objective

Prevent transparent syntax wrappers around a recognized `Reflect.apply` alias from hiding a tracked dynamic module load.

## Acceptance

- Parenthesized and TypeScript transparent wrappers around tracked `Reflect.apply` aliases remain tracked.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- An unrelated wrapped alias is not classified as a module load.
- No inspected source executes and no provider or external transport is used.
