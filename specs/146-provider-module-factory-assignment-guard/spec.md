# R37X — Provider module factory assignment guard

## Objective

Track `createRequire` factories assigned from a known module namespace after declaration so reassignment cannot hide a computed provider module load.

## Acceptance

- Property and string-literal element access assignments create tracked factory identifiers.
- Computed targets fail closed and literal targets remain visible.
- All work remains local with zero provider or external transport.

