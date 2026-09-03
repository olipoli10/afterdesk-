# R37U Provider Module Namespace Alias Propagation Guard

## Purpose

Prevent a recognized CommonJS `node:module` namespace from being copied into another identifier to evade `createRequire` loader tracking.

## Requirements

- Propagate known module namespace capability through declarations and assignments.
- Recognize `aliasedNamespace.createRequire(...)` as a loader factory.
- Reject computed loads through the returned loader.
- Resolve literal loads through the existing graph.
- Preserve deterministic local-only release refusal.

## Acceptance

- RED proves the module namespace alias bypass.
- Focused, full, build and exact security gates pass.
