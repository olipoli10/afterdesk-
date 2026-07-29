# Migration baseline — read before deploying

The project still uses `prisma db push` locally. That is fine while the
database is disposable, but it **must** change before two things happen:

1. the ledger table holds a single row, and
2. the app is deployed anywhere real.

`prisma db push` cannot express `GRANT` / `REVOKE` or triggers, and a later
push silently drops anything added by hand — including the append-only
protections the public ledger depends on.

## Why it is not switched yet

`npx prisma dev` (the local Postgres) is a proxy. It exposes only a pooled
port, and the migration engine uses named prepared statements, which a
transaction pooler breaks:

```
Error: ERROR: prepared statement "s3" already exists
```

There is no true direct port to point `DIRECT_URL` at locally. This is an
environment limitation, not a schema problem.

## What to do on the move to Neon

`0_init.sql` in this folder is a valid full-schema baseline generated with
`prisma migrate diff --from-empty`. On Neon (which gives a real direct URL):

```bash
# 1. Point DIRECT_URL at the Neon *unpooled* connection string
# 2. Recreate the migrations folder from this baseline
mkdir -p prisma/migrations/0_init && cp prisma/baseline/0_init.sql prisma/migrations/0_init/migration.sql

# 3. Mark it applied against the already-provisioned database
npx prisma migrate resolve --applied 0_init

# 4. From here on, schema changes go through:
npx prisma migrate dev --name <what_changed>
```

Then, in the same commit:

- delete the `db:push` script from `package.json` — left there, someone runs
  it and Prisma's drift resolution drops and recreates the ledger table,
  taking the triggers with it;
- add the ledger protection SQL as its own migration (non-owner app role with
  `INSERT`/`SELECT` only, `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE`
  triggers, hash chain assigned inside a `BEFORE INSERT` trigger);
- keep an idempotent copy of that SQL and re-apply it from CI after every
  deploy, so a reset can never leave production unprotected.
