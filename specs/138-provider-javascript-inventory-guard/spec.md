# R37P Provider JavaScript Inventory Guard

## Purpose

Close the release-gate bypass where executable JavaScript-family modules can exist under `src` but the R37O CLI inventories only TypeScript files and the R37L graph does not resolve extensionless JavaScript modules.

## Requirements

- Inventory `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` source modules.
- Parse each module with the appropriate TypeScript compiler script kind.
- Resolve explicit, extensionless and index imports across the supported source extensions.
- Preserve deterministic direct, transitive, unresolved-module and dynamic-code classifications.
- Keep the mandatory pre-build gate, package-lock identity and zero-provider authority unchanged.
- Do not add dependencies, credentials, providers, customer data, transport or external writes.

## Acceptance

- RED proves an extensionless public JavaScript chain to R37F is currently missed.
- Focused mutations prove every supported executable source extension is inventoried.
- The actual source tree remains clean under the mandatory release gate.
- Focused, full local, typecheck, lint, build and exact security checks pass.
