# R37Q Provider Loader Alias Guard

## Purpose

Fail closed when public-reachable code hides dynamic CommonJS loading behind a renamed `require` reference or a loader returned by Node `createRequire`.

## Requirements

- Detect aliases assigned directly from `require`.
- Detect loaders returned by `createRequire`, including aliased `node:module` imports.
- Classify calls through those loaders as unresolved dynamic modules unless their target is a string literal that the graph can resolve.
- Preserve exact public entrypoint and graph-path evidence.
- Keep zero-provider, zero-credential and zero-transport authority.

## Acceptance

- RED proves `createRequire(...); load(variable)` is currently missed.
- Direct require aliases, aliased createRequire imports and transitive public chains fail closed.
- Literal loads remain graph-resolvable without false unresolved classifications.
- Focused, full, typecheck, lint, build and exact security gates pass.
