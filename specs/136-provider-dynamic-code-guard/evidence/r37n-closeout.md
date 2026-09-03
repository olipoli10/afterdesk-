# R37N closeout

## Result

Public-reachable modules now fail closed on `eval`, `Function` and Node VM capabilities. Detection covers direct calls, property and element access, parenthesized indirect eval, intrinsic references and aliased `node:vm` imports. Every result retains the public entrypoint and exact module path; unreachable private modules do not create false reachability.

## Security verification

- Initial scan: `e4cd571f-f768-4981-ba99-1f6b881a4a85`.
- Confirmed low-severity finding: immediate callee-name matching missed indirect eval and aliased Node VM functions.
- Remediation: classify dangerous intrinsic references and VM module capability independently of local call spelling.
- Remediation scan: `c9a57723-3db6-46f9-aac5-f314aa2592ce`, complete with zero findings.

## Validation

- Focused R37K-R37N plus URL safety: 68/68 passed.
- Full unit suite: 2,089 passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing R34 unused-variable warning.
- No Prisma schema, migration, dependency, lockfile, provider, credential, network, external write, push, Preview, Production or deployment change.

## Git

- Initial implementation: `d7e35044319c90051c349a937df4c050085f6876`.
- Remediation: `f782d14fd69ff323d20c8d9910e0cd23ef5510c5`.
- Remediation tree: `73cf585be60bb3a518a6caf8ea756db5360e5f8a`.
