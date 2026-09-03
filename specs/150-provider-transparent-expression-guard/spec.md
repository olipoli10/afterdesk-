# R37AB — Provider transparent expression guard

## Problem

TypeScript can wrap the same loader or `createRequire` factory capability in `as`, `satisfies`, type assertions and non-null expressions. These wrappers do not change runtime behavior, but the current static boundary only unwraps parentheses.

## Contract

- Parentheses, `as`, `satisfies`, type assertions and non-null expressions are transparent for tracked loader and factory classification.
- Computed targets invoked through wrapped factories or loaders yield `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal targets remain visible to the transitive graph.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED demonstrates concrete `as`, `satisfies`, type-assertion and non-null bypasses against committed R37AA.
- A single bounded unwrapping helper closes all transparent wrapper forms.
- Targeted tests, real provider-boundary inventory, full tests, lint, typecheck and Webpack build pass.
- Exact diff security review completes without unresolved findings.
