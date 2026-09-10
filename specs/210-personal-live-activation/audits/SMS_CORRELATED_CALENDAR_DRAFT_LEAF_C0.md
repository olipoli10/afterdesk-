# C0 — exact calendar draft schema leaf

Date: 2026-09-10. Baseline: parent commit `bf4f2251`. This is an import-graph preparation slice only; no approval caller, executor behavior, SQL, recovery, route or activation is added.

## Change and reason

The exact existing `personalCalendarDraftSchema` declaration is moved into `src/server/personal-assistant/calendar-draft-contract.ts`, whose sole dependency is Zod. `calendar-actions.ts` imports and re-exports that same schema object. The schema-only imports in correlated-calendar-projection, correlated-calendar-proof and calendar-confirmation-authority now use the leaf.

The proposed later calendar-actions → approval gate → projection path would otherwise close a top-level initialization cycle. Removing only the direct projection import is insufficient: projection also reaches the schema through receipt subject → correlated proof, and through receipt subject → temporal authority → confirmation authority. All three schema-only paths are changed here. Mixed consumers retain the compatible legacy re-export.

This is not a reproduction of an existing runtime failure: the future approval gate is not implemented in C0. Real module imports exercise the current graph in four starting orders without `vi.mock` preloading. Vitest retains its normal `server-only` alias. Module loading can initialize existing transitive dependencies such as Prisma; no domain function, database query or provider operation is called by these import tests.

## Exactness checks

An external read-only comparison against `git show bf4f2251:<path>` normalized CRLF to LF. The calendar-actions body beginning at `const storedSchema` is identical, SHA-256 `3745ad8fc50140814f0cb5f4f2c7cf7b08d3da45a7b0ceafd93f3d04928440d3`.

For each of the three consumers, replacing only the new leaf import path with its previous actions path reproduces the entire baseline file exactly. No query, ordering, authority check, fingerprint or executor expression changed. These checks are audit evidence, not permanent full-file hash tests that would block later authorized implementation.

The new 31-case test verifies actual re-export object identity, four real import orders, all three schema-only imports, exact old declaration, 22 parse-result comparisons against the prior Zod grammar, and input preservation. Unicode trimming/UTF-16 limits, offsets, date precision, strict extra fields and malformed inputs retain their previous behavior. Reverse intervals and invalid IANA names remain accepted by this grammar exactly as before; downstream checks retain responsibility for rejecting them. No new authority is implied by parsing.

Existing mocks using `importOriginal` retain their legacy export and effect spies; no existing mock or assertion was edited.

## Fresh validation

- First isolated new test: 31/31 PASS at 14:20:01 local, 1.12 seconds.
- Expanded ten-file suite: 232/232 PASS at 14:23:26 local, 4.21 seconds. Includes the new leaf tests, proof and peer proof tests, projection and peer projection tests, producer boundary, calendar write fencing, confirmation bridge/preparation, and personal-intent review consumer.
- Root TypeScript `--noEmit --pretty false`: exit 0.
- Scoped ESLint on the five source files and new test: exit 0.

No full-root test, native PostgreSQL run, migration, generation, server, provider request or credential inspection was performed by this slice. Parent owns the independent reread and any broader validation. These results do not demonstrate typed approval execution or real calendar writes.

## Frozen file fingerprints

| File | SHA-256 |
| --- | --- |
| calendar-draft-contract.ts | `6c60aa6de8e2c762a619c6b9b27f85f8ba1f731d6d07ca035a0215361fd4c005` |
| calendar-actions.ts | `25a5ec3875098c08e08a830e00cf89014f9fb09b200e52b21d0783ef1db67e8f` |
| calendar-confirmation-authority.ts | `9e6efe549f24c602548645e872ec7fcc144917c0cec4b4df008907172b8e1233` |
| correlated-calendar-proof.ts | `3be07dc4027dea326843d207f041e701ece92cd33305f8a6a3b4afa6f7f4ab61` |
| correlated-calendar-projection.ts | `98337a5def0d482529fb0ba4f7fda629caf8ba89a37ecb2e365c0ba227edbbe6` |
| calendar-draft-contract-leaf.test.ts | `205c0ad987a01ac33e8a85790c6e9fed47d75300568cf1e8d9be64955d0997d4` |

Status: C0 implementation and focused validation complete, awaiting parent review. C1 recovery work is independently owned and is not certified by this audit.
