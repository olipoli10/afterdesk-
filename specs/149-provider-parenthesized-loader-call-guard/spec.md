# R37AA — Provider parenthesized loader call guard

## Problem

The provider-boundary validator recognizes tracked loaders only when the call target is a direct identifier. Parenthesizing the same loader changes the AST call target while preserving runtime behavior, so a computed module target can avoid fail-closed classification.

## Contract

- Parentheses around a tracked `require` alias or `createRequire` loader do not erase loader capability.
- Computed targets invoked through either wrapped loader yield `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- Literal targets remain part of the transitive module graph.
- No provider, credential, transport, external write, deployment, Preview, Production or push is introduced.

## Acceptance

- RED proves both parenthesized loader-call forms evade the committed R37Z guard.
- Targeted tests and the real provider-boundary inventory pass after the bounded AST correction.
- Full tests, lint, typecheck and Next.js Webpack build pass.
- Exact diff security review completes with no unresolved finding.
