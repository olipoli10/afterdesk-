# R37AZ — Provider aliased require namespace guard

## Objective

Prevent tracked aliases of `require` from hiding CommonJS node:module namespace capability in declarations and assignments.

## Acceptance

- A module namespace produced by a tracked require alias is recognized in a declaration.
- A module namespace produced by a tracked require alias is recognized in an assignment.
- Calls for unrelated modules are not classified as node:module namespaces.
- Transparent wrapper and destructuring protections remain green.
- No inspected source executes and no provider or external transport is used.
