# Isolated PG18 trial runner — local implementation, no execution yet

Purpose: prepare the real Prisma migration executor for the already-created
isolated trial T, not re-run the legacy bootstrap or forge migration history.
Product100CAD mandate covers dedicated backend setup. This step only writes and
tests local code; actual credential retrieval/SQL execution waits until controller
has reviewed the final runner and aggregate preservation evidence.

Exact single target: projectwithered-mud-08129552, branchbr-holy-brook-ax7k68oh,
endpointep-crimson-violet-axmmwtjw, database neondb, role neondb_owner,
hostname ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech, direct TLS only.
Pilot/main/A endpoints are expressly forbidden. No arbitrary override or default
branch/hostname. Managed metadata identities are checked by controller separately;
host/string validation is not provider provenance.

Implement a narrow helper/runner consuming a single bounded credential envelope
from noninteractive stdin, never CLI arguments, log, prompt or committed file.
No echo/PTY. Reject extra fields, newline/size/protocol/path/host/query ambiguity;
keep secret in memory and child environment only. Do not fetch credentials in
the runner. No shell interpolation, plaintext saved connection files or env dumps.
Untrusted errors/output must not escape as secrets. Closed error codes and
explicit uncertain outcome on failed migration; never auto-retry/resolve/reset.

Require explicit controller expected sourceHEAD and migration catalogSHA; validate
current source binding and all exact79 migration bytes before admitting secret,
and recheck before executor invocation. Existing user edits must not be staged,
discarded or silently admitted; a later clean inspected checkout can be used.
Use installed actual pinned Prisma CLI/config and an owned isolated staging dir
containing the unchanged ordered migrations; do not regenerate shared Prisma or
mutate shared node_modules. Exact history/checksum prefix70 validation belongs to
preflight, and after79 to postflight. PostgreSQL18 actual identity must be checked.

Prefer two explicit modes: read-only target preflight and one migration attempt.
Migration mode requires reviewed plan/evidence inputs, never treats local flags
as authorization. Preflight first; existing metadata capture may be stale. Record
private bounded receipt for stage/exit/deadline without URL/password/raw logs.
No deployment, workers, external transport, providerflag activation or new branch.
The eventual execution controller guarantees only this endpoint resumes/suspends.

Tests mock process/transport for all secret sentinel and exacttarget refusals,
deadlines/output suppression/no repeat, staleHEAD/catalog, environment allowlist,
real Prisma CLI selection and phase separation. No network/real DB/credential
lookup in tests. A separate agent/main reviews critical runner before use. If
the planned credential handoff cannot avoid exposure, stop this lane and retain
an exact blocker while other authorized work continues. Do not claim migration
or data preservation from the runner's existence or mocked tests.
