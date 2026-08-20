# Executor Rehearsal — local only

This rehearsal proves the mechanics required before a measured candidate trial.
It is not a candidate run, a provider integration, a benchmark result, or an
adoption decision.

## What it verifies

For every slot in the approved V2 counterbalanced plan, the executor:

1. creates a new detached Git worktree inside the ignored local scratch area;
2. verifies that its `HEAD` equals the case-specific frozen seed;
3. rejects any tracked change before a packet is emitted;
4. reads the exact frozen challenge document only to calculate a SHA-256
   fingerprint;
5. reports only safe metadata: case, seed, candidate label, packet fingerprint,
   document path and document hash; and
6. removes the worktree only after re-verifying its exact seed and clean state.

The executor has no method for starting a candidate, provider, launcher,
database, network call, or shell command supplied by a candidate. A mismatch is
fail-closed; an unexpected worktree is preserved rather than forcibly removed.

## Local command

The configuration manifest stays ignored and needs `APPROVED` status.

```powershell
npm run devbench:dry-run:rehearse -- .scratch/engineering-factory/dry-run-trial-config/dry-run-trial-config.json 32
```

The numeric argument is the number of scheduled slots to rehearse. The normal
release rehearsal is all 32 slots. Its output must report:

- `DRY_RUN_EXECUTOR_REHEARSAL_COMPLETE`
- `candidateInvocations: 0`
- `providerCalls: 0`
- `slotsRehearsed: 32`
- `cleanup: "removed"` for every slot.

## Deliberate boundary

The V2 plan declares candidate execution as `networkAccess: "none"`, while an
actual model CLI necessarily needs its own authenticated egress. This rehearsal
does not solve or silently weaken that contradiction. A real A/B run remains
blocked until a separately reviewed design proves that model egress is isolated
from the frozen task checkout and cannot expose task data, secrets, or candidate
outputs outside the approved evidence envelope.
