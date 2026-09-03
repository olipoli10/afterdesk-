# R37R Provider Loader Reassignment Guard

## Purpose

Prevent reassignment and destructuring forms from hiding CommonJS loader capability from R37Q.

## Requirements

- Track identifier assignments from `require`.
- Track `createRequire` extracted by CommonJS object destructuring.
- Track loader identifiers assigned from those factories.
- Reject computed loads and resolve literal loads through the existing graph.
- Preserve zero external authority and deterministic evidence.

## Acceptance

- RED proves reassigned `require` and destructured `createRequire` are missed.
- Focused mutations, actual-source gate and proportional validation pass.
- Exact security verification completes before closeout.
