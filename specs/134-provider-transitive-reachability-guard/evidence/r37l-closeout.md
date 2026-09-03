# R37L closeout

## Result

A deterministic TypeScript module graph now prevents public routes, server actions, jobs and workers from reaching sealed R37A/R37B/R37C/R37F provider-execution modules indirectly through neutral facades, barrels, renamed exports, relative paths, aliases, dynamic imports, `require` calls or TypeScript import-equals declarations. The actual source graph contains zero forbidden paths.

## Security verification

- Initial semantic scan attempt `7c9930ad-78ec-4fa6-b70c-7e5e23ab237b` was terminated after a confirmed Windows path-length failure prevented artifact creation; the exact range was moved unchanged to a short detached worktree.
- Exact initial scan: `bbd21adc-83fa-47a2-bf0d-89db0fa19f52`.
- Confirmed low-severity finding: multiline static imports could bypass the line-bounded regex parser.
- Remediation: replaced regex parsing with the installed TypeScript AST and added multiline plus import-equals mutations.
- Exact remediation scan: `355e7c3c-92c2-4257-b53d-cdf17f09ee6d`.
- Remediation result: complete, zero findings.

## Validation

- Focused R37L, R37K and URL-safety gates: 57/57 passed.
- Full unit suite: 2,078 passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing R34 unused-variable warning.
- No Prisma schema, migration, dependency, lockfile, provider, credential, network, external write, push, Preview, Production or deployment change.

## Git

- Initial graph guard: `70f219b40d4c784445f865150504e7936970d498`.
- Parser remediation: `936eff0c21e787de2f5defa3d91a9741dcaa8ae4`.
- Remediation tree: `d12f8f335247b14bc4408d14b962d42fd56c07c9`.
