# R37Z — Provider parenthesized loader factory guard

## Problem

The provider-boundary validator tracks `createRequire` factories only when the factory expression is exposed directly. A parenthesized factory call can preserve the same runtime capability while changing the TypeScript AST shape, allowing a computed module target to avoid fail-closed classification.

## Contract

- Parentheses around a tracked namespace `createRequire` factory do not erase factory capability.
- Parentheses around a tracked extracted factory do not erase factory capability.
- A loader produced by either form remains tracked.
- A computed target loaded through that loader yields `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal targets remain available to the transitive module graph.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves both parenthesized forms evade the current guard.
- Targeted tests pass after the bounded AST correction.
- The real provider-boundary inventory reports zero violations.
- Full tests, lint, typecheck and Next.js Webpack build pass.
- Exact diff security review completes with no unresolved finding.
