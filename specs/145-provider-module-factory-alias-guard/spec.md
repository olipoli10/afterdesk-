# R37W — Provider module factory alias guard

## Objective

Prevent a public-reachable module from extracting `createRequire` from a tracked module namespace and hiding the factory behind an identifier alias.

## Required behavior

- `const factory = moduleApi.createRequire` and `const factory = moduleApi["createRequire"]` produce tracked factory identifiers.
- Loaders created from those identifiers retain computed-target refusal and literal-target reachability.
- No provider, credential, network, external write, customer data or deployment is used.

