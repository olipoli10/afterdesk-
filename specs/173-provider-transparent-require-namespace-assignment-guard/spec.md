# R37AY — Provider transparent require namespace assignment guard

## Objective

Prevent runtime-transparent wrappers around `require("node:module")` in identifier assignments from hiding module namespace capability.

## Acceptance

- Parenthesized and TypeScript assertion wrappers around exact node:module require calls track the assigned namespace.
- Direct createRequire access through that assigned namespace remains fail-closed.
- Wrapped require calls for unrelated modules are not classified.
- Existing declaration and destructuring protections remain green.
- No inspected source executes and no provider or external transport is used.
