# R37S Provider Loader Alias Propagation Guard

## Purpose

Prevent one loader alias from being copied into another identifier to evade R37Q/R37R tracking.

## Requirements

- Propagate known loader and createRequire-factory capability through variable declarations and assignments.
- Reject computed loads through any propagated alias.
- Resolve literal loads through the existing graph.
- Preserve deterministic, local-only release refusal.

## Acceptance

- RED proves second-generation loader aliases are missed.
- Focused, full, build and exact security gates pass.
