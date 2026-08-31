# CH-002 — Disposable environment and preflight

- Prisma Dev database `endvera-construction-v1-r2` runs only on local port 51282.
- All 34 forward migrations applied; no `prisma db push`.
- Synthetic verified CLIENT account created at `olivier.r2@example.invalid`.
- Construction workspace count remained zero: the dry run did not perform Olivier's first action.
- Product login and guide each returned HTTP 200 on loopback.
- Login was exercised with the synthetic account and reached `/client/projects`.
- Founder observation remained absent and cannot be synthesized by the harness.
- No product source, schema, migration, dependency or package-lock changed.
- 27 targeted contract/product/mutation tests passed.
- 13 compiled/in-memory mutation variants were killed; fixture and contract SHA-256 remained byte-identical.
- No provider or external transport was invoked.

Result: **CH-002 DONE; REAL FOUNDER SESSION READY**.
