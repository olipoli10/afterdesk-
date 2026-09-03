# R37BA — Provider transparent loader alias guard

## Objective

Prevent runtime-transparent wrappers around tracked require loaders from breaking loader capability propagation in declarations and assignments.

## Acceptance

- A transparent wrapper around `require` in a variable declaration retains loader capability.
- A transparent wrapper around a tracked loader in an assignment retains loader capability.
- Unrelated wrapped identifiers are not classified as loaders.
- Aliased require namespace protections remain green.
- No inspected source executes and no provider or external transport is used.
