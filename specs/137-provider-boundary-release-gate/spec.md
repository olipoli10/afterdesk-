# R37O Provider Boundary Release Gate

## Purpose

Turn R37K-R37N into one deterministic release command that validates the actual source tree and runs automatically before a production build can begin.

## Requirements

- Compose direct public-import, provider-runtime, transitive reachability, computed-load and dynamic-code guards.
- Return stable violation codes with exact paths or graph chains.
- Read the actual local `src` tree without executing application modules.
- Exit non-zero on any violation and print no source contents, credentials or environment values.
- Add a dedicated package command and make the existing versioned build pipeline execute it before any planned build command.
- Preserve the existing build implementation after the guard succeeds.
- Do not change package-lock or add any dependency.
- No provider, credential, network, customer data, Prisma schema or migration is allowed.

## Acceptance

- RED proves the unified validator does not yet exist.
- Mutations for each guard family return their exact failure codes.
- The actual source tree passes the standalone command.
- Package-lock is byte-identical.
- Focused, full local, typecheck, lint and exact security gates pass.
