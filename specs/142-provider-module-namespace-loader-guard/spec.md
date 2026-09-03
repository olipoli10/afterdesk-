# R37T Provider Module Namespace Loader Guard

## Purpose

Prevent CommonJS loading of `node:module` or `module` from hiding a `createRequire`-produced loader behind a namespace object.

## Requirements

- Recognize a namespace assigned from literal `require("node:module")` or `require("module")`.
- Recognize `namespace.createRequire(...)` as a loader factory.
- Reject computed loads through the returned loader.
- Resolve literal loads through the existing graph.
- Preserve deterministic local-only release refusal.

## Acceptance

- RED proves the CommonJS module namespace bypass.
- Focused, full, build and exact security gates pass.
