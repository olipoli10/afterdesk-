# R37AN — Provider Reflect namespace assignment guard

## Objective

Prevent an identifier assigned from the global `Reflect` object or a tracked Reflect namespace alias from hiding reflective invocation of a tracked dynamic module loader.

## Acceptance

- Direct and transparent assignments from global `Reflect` are tracked.
- Assignment propagation from a tracked Reflect namespace alias is tracked.
- `.apply`, `["apply"]`, and destructured `apply` remain effective after assignment.
- Unrelated object assignments are not classified as module loads.
- No inspected source executes and no provider or external transport is used.
